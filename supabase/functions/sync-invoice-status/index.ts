import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshTokenIfNeeded(supabase: any, connection: any) {
  const now = new Date();
  const expiresAt = new Date(connection.expires_at);

  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    console.log("Refreshing Xero token...");
    const clientId = Deno.env.get("XERO_CLIENT_ID")!;
    const clientSecret = Deno.env.get("XERO_CLIENT_SECRET")!;

    const response = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refresh_token,
      }),
    });

    if (!response.ok) throw new Error("Failed to refresh token");

    const tokens = await response.json();
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase
      .from("xero_connections")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: newExpiresAt,
      })
      .eq("id", connection.id);

    return tokens.access_token;
  }

  return connection.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub;
    const body = await req.json().catch(() => ({}));
    const { siteIds, customerId } = body;

    console.log("Sync invoice status request:", { siteIds, customerId });

    // Get Xero connection
    const { data: connection, error: connError } = await supabase
      .from("xero_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: "No Xero connection found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await refreshTokenIfNeeded(supabase, connection);

    // Get completed service reports that aren't yet marked as invoiced
    let reportsQuery = supabase
      .from("service_reports")
      .select("id, visit_id, report_number, site_id, invoiced")
      .eq("status", "completed")
      .eq("invoiced", false);

    if (siteIds && siteIds.length > 0) {
      reportsQuery = reportsQuery.in("site_id", siteIds);
    }

    const { data: reports, error: reportsError } = await reportsQuery;

    if (reportsError) {
      console.error("Error fetching reports:", reportsError);
      throw new Error("Failed to fetch reports");
    }

    if (!reports || reports.length === 0) {
      console.log("No uninvoiced reports found");
      return new Response(
        JSON.stringify({ matched: 0, total: 0, unmatchedInvoices: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${reports.length} uninvoiced reports to check`);

    // Get visit IDs and look up local xero_invoices records
    const visitIds = [...new Set(reports.map((r) => r.visit_id))];

    const { data: existingInvoices } = await supabase
      .from("xero_invoices")
      .select("visit_id, xero_invoice_number, status")
      .in("visit_id", visitIds);

    const localInvoiceMap = new Map<string, { number: string | null; status: string | null }>();
    if (existingInvoices) {
      existingInvoices.forEach((inv) => {
        localInvoiceMap.set(inv.visit_id, {
          number: inv.xero_invoice_number,
          status: inv.status,
        });
      });
    }

    // Mark reports that have local xero_invoices as invoiced first
    let matched = 0;
    const updatesFromLocal: { id: string; invoiceNumber: string | null }[] = [];

    for (const report of reports) {
      const localInv = localInvoiceMap.get(report.visit_id);
      if (localInv && (localInv.status === "AUTHORISED" || localInv.status === "PAID")) {
        updatesFromLocal.push({ id: report.id, invoiceNumber: localInv.number });
      }
    }

    for (const update of updatesFromLocal) {
      const { error } = await supabase
        .from("service_reports")
        .update({ invoiced: true, xero_invoice_number: update.invoiceNumber })
        .eq("id", update.id);
      if (!error) matched++;
    }

    console.log(`Matched ${matched} reports from local xero_invoices records`);

    // Now check Xero directly for remaining unmatched reports
    const remainingReports = reports.filter(
      (r) => !updatesFromLocal.find((u) => u.id === r.id)
    );

    // Collect all Xero invoices for unmatched reports to return to frontend
    const allUnmatchedXeroInvoices: any[] = [];

    if (remainingReports.length > 0) {
      const remainingSiteIds = [...new Set(remainingReports.map((r) => r.site_id))];

      // Get site info including names for broader matching
      const { data: sites } = await supabase
        .from("sites")
        .select("id, customer_id, name")
        .in("id", remainingSiteIds);

      const customerIds = [...new Set((sites || []).map((s) => s.customer_id).filter(Boolean))];

      const { data: customers } = await supabase
        .from("customers")
        .select("id, xero_contact_id")
        .in("id", customerIds);

      const customerContactMap = new Map<string, string>();
      (customers || []).forEach((c) => {
        if (c.xero_contact_id) customerContactMap.set(c.id, c.xero_contact_id);
      });

      const siteCustomerMap = new Map<string, string>();
      const siteNameMap = new Map<string, string>();
      (sites || []).forEach((s) => {
        if (s.customer_id) siteCustomerMap.set(s.id, s.customer_id);
        if (s.name) siteNameMap.set(s.id, s.name.toLowerCase().trim());
      });

      // Get service contract PO numbers for broader matching
      const { data: contracts } = await supabase
        .from("site_service_contracts")
        .select("site_id, po_number, service_type, unit_price")
        .in("site_id", remainingSiteIds);

      const sitePONumbers = new Map<string, string[]>();
      const siteContractPrices = new Map<string, number[]>();
      (contracts || []).forEach((c) => {
        if (c.po_number) {
          const existing = sitePONumbers.get(c.site_id) || [];
          existing.push(c.po_number.toLowerCase().trim());
          sitePONumbers.set(c.site_id, existing);
        }
        if (c.unit_price) {
          const existing = siteContractPrices.get(c.site_id) || [];
          existing.push(Number(c.unit_price));
          siteContractPrices.set(c.site_id, existing);
        }
      });

      // Fetch invoices from Xero for each unique contact
      const uniqueContactIds = [...new Set(customerContactMap.values())];

      for (const contactId of uniqueContactIds) {
        try {
          const whereClause = `Type=="ACCREC"&&(Status=="AUTHORISED"||Status=="PAID")&&Contact.ContactID==Guid("${contactId}")`;
          const xeroUrl = `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent(whereClause)}&order=DueDate`;

          console.log(`Fetching Xero invoices for contact ${contactId}`);

          const invoicesResponse = await fetch(xeroUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Xero-Tenant-Id": connection.tenant_id,
              Accept: "application/json",
            },
          });

          if (!invoicesResponse.ok) {
            console.error(`Failed to fetch invoices for contact ${contactId}`);
            continue;
          }

          const invoicesData = await invoicesResponse.json();
          const xeroInvoices = invoicesData.Invoices || [];

          console.log(`Found ${xeroInvoices.length} Xero invoices for contact ${contactId}`);

          // Build lookup maps for matching
          const xeroInvoiceByRef = new Map<string, any>();
          for (const inv of xeroInvoices) {
            if (inv.Reference) {
              xeroInvoiceByRef.set(inv.Reference.toLowerCase().trim(), inv);
            }
            if (inv.InvoiceNumber) {
              xeroInvoiceByRef.set(inv.InvoiceNumber.toLowerCase().trim(), inv);
            }
          }

          // Try to match remaining reports for this contact
          const matchedReportIds = new Set<string>();

          for (const report of remainingReports) {
            const custId = siteCustomerMap.get(report.site_id);
            if (!custId) continue;
            const repContactId = customerContactMap.get(custId);
            if (repContactId !== contactId) continue;

            let matchedInvoice: any = null;

            // Strategy 1: Match by report number against Reference/InvoiceNumber
            if (report.report_number) {
              const matchKey = report.report_number.toLowerCase().trim();
              matchedInvoice = xeroInvoiceByRef.get(matchKey);
            }

            // Strategy 2: Match by PO number from service contracts against Reference
            if (!matchedInvoice) {
              const poNumbers = sitePONumbers.get(report.site_id) || [];
              for (const po of poNumbers) {
                for (const inv of xeroInvoices) {
                  if (inv.Reference && inv.Reference.toLowerCase().trim().includes(po)) {
                    // Additional validation: check if amount matches a contract price
                    const prices = siteContractPrices.get(report.site_id) || [];
                    const invTotal = Number(inv.Total);
                    if (prices.some(p => Math.abs(p - invTotal) < 0.01)) {
                      matchedInvoice = inv;
                      console.log(`Matched report ${report.report_number} via PO ${po} + amount ${invTotal}`);
                      break;
                    }
                  }
                }
                if (matchedInvoice) break;
              }
            }

            // Strategy 3: Match by site name in Xero Reference + amount match
            if (!matchedInvoice) {
              const siteName = siteNameMap.get(report.site_id);
              if (siteName) {
                const prices = siteContractPrices.get(report.site_id) || [];
                for (const inv of xeroInvoices) {
                  const ref = (inv.Reference || "").toLowerCase().trim();
                  const invTotal = Number(inv.Total);
                  if (ref.includes(siteName) && prices.some(p => Math.abs(p - invTotal) < 0.01)) {
                    matchedInvoice = inv;
                    console.log(`Matched report ${report.report_number} via site name "${siteName}" + amount ${invTotal}`);
                    break;
                  }
                }
              }
            }

            if (matchedInvoice) {
              const { error } = await supabase
                .from("service_reports")
                .update({
                  invoiced: true,
                  xero_invoice_number: matchedInvoice.InvoiceNumber || null,
                })
                .eq("id", report.id);
              if (!error) {
                matched++;
                matchedReportIds.add(report.id);
                console.log(`Matched report ${report.report_number} to Xero invoice ${matchedInvoice.InvoiceNumber}`);
              }
            }
          }

          // Collect unmatched Xero invoices for this contact to return to frontend
          // Only include invoices that weren't matched to any report
          const matchedXeroIds = new Set<string>();
          // We need to track which Xero invoices were used
          for (const inv of xeroInvoices) {
            allUnmatchedXeroInvoices.push({
              invoiceId: inv.InvoiceID,
              invoiceNumber: inv.InvoiceNumber || "",
              reference: inv.Reference || "",
              total: Number(inv.Total) || 0,
              status: inv.Status,
              date: inv.DateString || "",
              contactId,
            });
          }
        } catch (err) {
          console.error(`Error checking Xero for contact ${contactId}:`, err);
        }
      }
    }

    console.log(`Total matched: ${matched} out of ${reports.length} reports`);

    // Return unmatched reports info and available Xero invoices for manual linking
    const unmatchedReports = remainingReports
      .filter((r) => !reports.find((rr) => rr.id === r.id && matched > 0))
      .map((r) => ({
        id: r.id,
        reportNumber: r.report_number,
        siteId: r.site_id,
        visitId: r.visit_id,
      }));

    return new Response(
      JSON.stringify({
        matched,
        total: reports.length,
        unmatchedInvoices: allUnmatchedXeroInvoices,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error syncing invoice status:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

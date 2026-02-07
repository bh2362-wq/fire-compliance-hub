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

function parseXeroDate(dateStr: string): string {
  if (!dateStr) return "";
  const match = dateStr.match(/\/Date\((\d+)([+-]\d{4})?\)\//);
  if (match) {
    const timestamp = parseInt(match[1], 10);
    return new Date(timestamp).toISOString();
  }
  return dateStr;
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

    // Parse request body
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
        JSON.stringify({ matched: 0, total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${reports.length} uninvoiced reports to check`);

    // Get visit IDs and look up which visits already have local xero_invoices records
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

    // Apply local matches
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

    if (remainingReports.length > 0) {
      // Get site IDs to look up customer xero_contact_ids
      const remainingSiteIds = [...new Set(remainingReports.map((r) => r.site_id))];

      const { data: sites } = await supabase
        .from("sites")
        .select("id, customer_id")
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
      (sites || []).forEach((s) => {
        if (s.customer_id) siteCustomerMap.set(s.id, s.customer_id);
      });

      // Fetch invoices from Xero for each unique contact
      const uniqueContactIds = [...new Set(customerContactMap.values())];

      for (const contactId of uniqueContactIds) {
        try {
          // Fetch AUTHORISED and PAID invoices for this contact
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

          // Build a set of Xero invoice references for matching
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
          for (const report of remainingReports) {
            const custId = siteCustomerMap.get(report.site_id);
            if (!custId) continue;
            const repContactId = customerContactMap.get(custId);
            if (repContactId !== contactId) continue;

            // Try matching by report number
            if (report.report_number) {
              const matchKey = report.report_number.toLowerCase().trim();
              const matchedInvoice = xeroInvoiceByRef.get(matchKey);
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
                  console.log(`Matched report ${report.report_number} to Xero invoice ${matchedInvoice.InvoiceNumber}`);
                }
              }
            }
          }
        } catch (err) {
          console.error(`Error checking Xero for contact ${contactId}:`, err);
        }
      }
    }

    console.log(`Total matched: ${matched} out of ${reports.length} reports`);

    return new Response(
      JSON.stringify({
        matched,
        total: reports.length,
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

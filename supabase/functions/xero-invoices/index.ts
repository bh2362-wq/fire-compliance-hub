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
        "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refresh_token,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to refresh token");
    }

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

// Parse Xero's /Date(timestamp)/ format to ISO string
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

    // Get user's Xero connection
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

    // Parse body params
    const body = await req.json().catch(() => ({}));
    const contactId = body.contactId || null;

    // Fetch both DRAFT and AUTHORISED invoices (outstanding)
    let whereClause = `Type=="ACCREC"&&(Status=="AUTHORISED"||Status=="DRAFT")`;
    if (contactId) {
      whereClause += `&&Contact.ContactID==Guid("${contactId}")`;
    }
    
    const xeroUrl = `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent(whereClause)}&order=DueDate`;
    
    console.log("Fetching invoices from Xero:", xeroUrl);

    const invoicesResponse = await fetch(xeroUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        "Accept": "application/json",
      },
    });

    if (!invoicesResponse.ok) {
      const errorText = await invoicesResponse.text();
      console.error("Failed to fetch invoices:", errorText);
      throw new Error("Failed to fetch invoices from Xero");
    }

    const invoicesData = await invoicesResponse.json();
    const invoices = invoicesData.Invoices || [];

    // Build contact balances from the fetched invoices (includes both DRAFT and AUTHORISED)
    // This ensures customers with only DRAFT invoices also appear
    const contactMap = new Map<string, { contactId: string; name: string; email: string; outstanding: number; overdue: number }>();
    
    for (const inv of invoices) {
      const cId = inv.Contact?.ContactID;
      if (!cId) continue;
      
      const existing = contactMap.get(cId) || {
        contactId: cId,
        name: inv.Contact?.Name || "",
        email: inv.Contact?.EmailAddress || "",
        outstanding: 0,
        overdue: 0,
      };
      
      existing.outstanding += inv.AmountDue || 0;
      
      const dueDateStr = parseXeroDate(inv.DueDate);
      const dueDate = new Date(dueDateStr);
      if (dueDate < now && (inv.AmountDue || 0) > 0 && inv.Status !== "DRAFT") {
        existing.overdue += inv.AmountDue || 0;
      }
      
      contactMap.set(cId, existing);
    }
    
    // Only include contacts that actually owe money (outstanding > 0)
    const contactsWithBalances = Array.from(contactMap.values()).filter(c => c.outstanding > 0);

    // Calculate summary - parse dates properly
    const now = new Date();
    const totalOutstanding = invoices.reduce((sum: number, inv: any) => sum + (inv.AmountDue || 0), 0);
    const overdueInvoices = invoices.filter((inv: any) => {
      const dueDateStr = parseXeroDate(inv.DueDate);
      const dueDate = new Date(dueDateStr);
      return dueDate < now && inv.AmountDue > 0;
    });
    const totalOverdue = overdueInvoices.reduce((sum: number, inv: any) => sum + (inv.AmountDue || 0), 0);

    return new Response(
      JSON.stringify({ 
        invoices: invoices.map((inv: any) => {
          const dueDateStr = parseXeroDate(inv.DueDate);
          const dateStr = parseXeroDate(inv.Date);
          const dueDate = new Date(dueDateStr);
          
          return {
            invoiceId: inv.InvoiceID,
            invoiceNumber: inv.InvoiceNumber,
            reference: inv.Reference,
            contactId: inv.Contact?.ContactID,
            contactName: inv.Contact?.Name,
            date: dateStr,
            dueDate: dueDateStr,
            status: inv.Status,
            total: inv.Total,
            amountDue: inv.AmountDue,
            amountPaid: inv.AmountPaid,
            currencyCode: inv.CurrencyCode,
            isOverdue: dueDate < now && inv.AmountDue > 0,
            lineItems: inv.Status === "DRAFT" ? (inv.LineItems || []).map((li: any) => ({
              description: li.Description || "",
              quantity: li.Quantity || 1,
              unitAmount: li.UnitAmount || 0,
              accountCode: li.AccountCode || "200",
            })) : undefined,
          };
        }),
        contactBalances: contactsWithBalances,
        summary: {
          totalOutstanding,
          totalOverdue,
          invoiceCount: invoices.length,
          overdueCount: overdueInvoices.length,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error fetching invoices:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

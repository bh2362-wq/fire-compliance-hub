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

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

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

    const body = await req.json().catch(() => ({}));
    const invoiceId = body.invoiceId;

    if (!invoiceId) {
      return new Response(
        JSON.stringify({ error: "invoiceId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const xeroUrl = `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`;

    const invoiceResponse = await fetch(xeroUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        Accept: "application/json",
      },
    });

    if (!invoiceResponse.ok) {
      const errorText = await invoiceResponse.text();
      console.error("Failed to fetch invoice detail:", errorText);
      throw new Error("Failed to fetch invoice from Xero");
    }

    const invoiceData = await invoiceResponse.json();
    const inv = invoiceData.Invoices?.[0];

    if (!inv) {
      return new Response(
        JSON.stringify({ error: "Invoice not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentTime = new Date();
    const dueDateStr = parseXeroDate(inv.DueDate);
    const dateStr = parseXeroDate(inv.Date);
    const dueDate = new Date(dueDateStr);

    return new Response(
      JSON.stringify({
        invoice: {
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
          isOverdue: dueDate < currentTime && inv.AmountDue > 0,
          lineItems: (inv.LineItems || []).map((li: any) => ({
            description: li.Description || "",
            quantity: li.Quantity || 1,
            unitAmount: li.UnitAmount || 0,
            accountCode: li.AccountCode || "200",
          })),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error fetching invoice detail:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

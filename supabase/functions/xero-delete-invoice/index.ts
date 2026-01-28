import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
    const body = await req.json();
    
    const { invoiceId } = body;

    if (!invoiceId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: invoiceId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // First, get the invoice to check its status
    console.log("Fetching invoice:", invoiceId);
    const getResponse = await fetch(
      `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Xero-Tenant-Id": connection.tenant_id,
          "Accept": "application/json",
        },
      }
    );

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      console.error("Failed to fetch invoice:", errorText);
      throw new Error(`Failed to fetch invoice: ${errorText}`);
    }

    const invoiceData = await getResponse.json();
    const invoice = invoiceData.Invoices?.[0];

    if (!invoice) {
      throw new Error("Invoice not found in Xero");
    }

    console.log("Invoice status:", invoice.Status, "AmountPaid:", invoice.AmountPaid);

    // Check if invoice can be deleted (must be DRAFT or AUTHORISED with no payments)
    if (invoice.Status === "PAID") {
      return new Response(
        JSON.stringify({ error: "Cannot delete a paid invoice" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invoice.AmountPaid > 0) {
      return new Response(
        JSON.stringify({ error: "Cannot delete an invoice with partial payments" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For DRAFT invoices, we can delete directly
    // For AUTHORISED invoices, we need to VOID them instead
    let deleteMethod: "DELETE" | "VOID" = "DELETE";
    
    if (invoice.Status === "AUTHORISED" || invoice.Status === "SUBMITTED") {
      // Void the invoice by updating its status
      console.log("Voiding AUTHORISED invoice...");
      
      const voidResponse = await fetch(
        `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Xero-Tenant-Id": connection.tenant_id,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            Invoices: [{
              InvoiceID: invoiceId,
              Status: "VOIDED",
            }],
          }),
        }
      );

      if (!voidResponse.ok) {
        const errorText = await voidResponse.text();
        console.error("Failed to void invoice:", errorText);
        throw new Error(`Failed to void invoice: ${errorText}`);
      }

      deleteMethod = "VOID";
      console.log("Invoice voided successfully");
    } else if (invoice.Status === "DRAFT") {
      // Delete the draft invoice
      console.log("Deleting DRAFT invoice...");
      
      const deleteResponse = await fetch(
        `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Xero-Tenant-Id": connection.tenant_id,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            Invoices: [{
              InvoiceID: invoiceId,
              Status: "DELETED",
            }],
          }),
        }
      );

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        console.error("Failed to delete invoice:", errorText);
        throw new Error(`Failed to delete invoice: ${errorText}`);
      }

      console.log("Invoice deleted successfully");
    } else {
      return new Response(
        JSON.stringify({ error: `Cannot delete invoice with status: ${invoice.Status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Remove from our local database
    const { error: deleteError } = await supabase
      .from("xero_invoices")
      .delete()
      .eq("xero_invoice_id", invoiceId);

    if (deleteError) {
      console.error("Failed to delete local invoice record:", deleteError);
      // Don't throw - the Xero deletion was successful
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        method: deleteMethod,
        message: deleteMethod === "VOID" 
          ? "Invoice voided successfully in Xero" 
          : "Invoice deleted successfully from Xero",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error deleting invoice:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

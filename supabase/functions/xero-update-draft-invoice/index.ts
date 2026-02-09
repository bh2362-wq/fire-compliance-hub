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
    
    const { invoiceId, contactId, contactName, lineItems, reference, dueDate, invoiceNumber } = body;

    if (!invoiceId || !lineItems?.length) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: invoiceId, lineItems" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate inputs
    if (typeof invoiceId !== "string" || invoiceId.length > 100) {
      return new Response(
        JSON.stringify({ error: "Invalid invoiceId" }),
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

    // First fetch the invoice to verify it's still a DRAFT
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
      throw new Error(`Failed to fetch invoice: ${errorText}`);
    }

    const invoiceData = await getResponse.json();
    const existingInvoice = invoiceData.Invoices?.[0];

    if (!existingInvoice) {
      throw new Error("Invoice not found in Xero");
    }

    if (existingInvoice.Status !== "DRAFT") {
      return new Response(
        JSON.stringify({ error: `Cannot edit invoice with status: ${existingInvoice.Status}. Only DRAFT invoices can be edited.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the update payload
    const updateData: any = {
      InvoiceID: invoiceId,
      LineItems: lineItems.map((item: any) => ({
        Description: item.description,
        Quantity: item.quantity || 1,
        UnitAmount: item.unitAmount,
        AccountCode: item.accountCode || "200",
      })),
      Reference: reference || "",
      DueDate: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    };

    if (contactId) {
      updateData.Contact = { ContactID: contactId };
    }

    if (invoiceNumber) {
      updateData.InvoiceNumber = invoiceNumber;
    }

    console.log("Updating draft invoice:", invoiceId);

    const updateResponse = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ Invoices: [updateData] }),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error("Failed to update invoice:", errorText);
      throw new Error(`Failed to update invoice: ${errorText}`);
    }

    const result = await updateResponse.json();
    const updatedInvoice = result.Invoices?.[0];

    if (!updatedInvoice) {
      throw new Error("No invoice returned from Xero after update");
    }

    console.log("Invoice updated:", updatedInvoice.InvoiceID, "Number:", updatedInvoice.InvoiceNumber);

    // Calculate total
    const total = lineItems.reduce((sum: number, item: any) => 
      sum + (item.unitAmount * (item.quantity || 1)), 0
    );

    // Update local record
    await supabase
      .from("xero_invoices")
      .update({
        xero_invoice_number: updatedInvoice.InvoiceNumber,
        contact_id: contactId || existingInvoice.Contact?.ContactID,
        contact_name: contactName || existingInvoice.Contact?.Name,
        total_amount: total,
      })
      .eq("xero_invoice_id", invoiceId);

    return new Response(
      JSON.stringify({ 
        success: true,
        invoice: {
          id: updatedInvoice.InvoiceID,
          number: updatedInvoice.InvoiceNumber,
          status: updatedInvoice.Status,
          total: updatedInvoice.Total,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error updating draft invoice:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

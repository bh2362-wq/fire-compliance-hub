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

async function getNextInvoiceNumber(accessToken: string, tenantId: string): Promise<string | null> {
  try {
    const MAX_PAGES_TO_SCAN = 5;
    let highestNumeric = 0;
    let fallbackLastNumber: string | null = null;

    for (let page = 1; page <= MAX_PAGES_TO_SCAN; page++) {
      // Include ALL statuses including VOIDED - we can't reuse voided invoice numbers
      const response = await fetch(
        `https://api.xero.com/api.xro/2.0/Invoices?Statuses=DRAFT,SUBMITTED,AUTHORISED,PAID,VOIDED&order=Date%20DESC&page=${page}`,
        {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Xero-Tenant-Id": tenantId,
            "Accept": "application/json",
          },
        }
      );

      if (!response.ok) {
        console.error("Failed to fetch invoices for numbering:", await response.text());
        return null;
      }

      const data = await response.json();
      const invoices = data.Invoices || [];
      if (invoices.length === 0) break;

      if (!fallbackLastNumber) {
        fallbackLastNumber = invoices[0]?.InvoiceNumber ?? null;
      }

      for (const invoice of invoices) {
        const num = invoice?.InvoiceNumber;
        if (!num) continue;
        // Only consider purely numeric invoices with 5 or fewer digits (your main series)
        if (/^\d{1,5}$/.test(num)) {
          const val = parseInt(num, 10);
          if (val > highestNumeric) highestNumeric = val;
        }
      }
    }

    if (highestNumeric > 0) {
      const suggested = String(highestNumeric + 1);
      console.log(`Highest numeric invoice found: ${highestNumeric}, suggesting: ${suggested}`);
      return suggested;
    }

    if (fallbackLastNumber) {
      const match = fallbackLastNumber.match(/^(.*?)(\d+)$/);
      if (match) {
        const prefix = match[1];
        const numericPart = parseInt(match[2], 10);
        const numLength = match[2].length;
        const suggested = `${prefix}${(numericPart + 1).toString().padStart(numLength, "0")}`;
        console.log(`No numeric invoices found; using format from ${fallbackLastNumber}, suggesting: ${suggested}`);
        return suggested;
      }
    }

    console.log("Could not determine next invoice number, letting Xero generate");
    return null;
  } catch (error) {
    console.error("Error fetching last invoice number:", error);
    return null;
  }
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
    
    const { visitId, contactId, contactName, lineItems, reference, dueDate, invoiceNumber } = body;

    if (!visitId || !contactId || !lineItems?.length) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: visitId, contactId, lineItems" }),
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

    // Use provided invoice number, or auto-generate, or let Xero handle it
    let finalInvoiceNumber = invoiceNumber;
    if (!finalInvoiceNumber) {
      finalInvoiceNumber = await getNextInvoiceNumber(accessToken, connection.tenant_id);
    }

    // Create invoice in Xero
    const invoiceData: any = {
      Type: "ACCREC",
      Contact: {
        ContactID: contactId,
      },
      LineItems: lineItems.map((item: any) => ({
        Description: item.description,
        Quantity: item.quantity || 1,
        UnitAmount: item.unitAmount,
        AccountCode: item.accountCode || "200", // Default sales account
      })),
      Reference: reference || "",
      DueDate: dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      Status: "DRAFT",
    };

    // Add the invoice number if we have one (user-provided or auto-generated)
    if (finalInvoiceNumber) {
      invoiceData.InvoiceNumber = finalInvoiceNumber;
    }

    console.log("Creating invoice:", JSON.stringify(invoiceData));

    const invoiceResponse = await fetch("https://api.xero.com/api.xro/2.0/Invoices", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ Invoices: [invoiceData] }),
    });

    if (!invoiceResponse.ok) {
      const errorText = await invoiceResponse.text();
      console.error("Failed to create invoice:", errorText);
      throw new Error(`Failed to create invoice: ${errorText}`);
    }

    const result = await invoiceResponse.json();
    const createdInvoice = result.Invoices?.[0];

    if (!createdInvoice) {
      throw new Error("No invoice returned from Xero");
    }

    console.log("Invoice created:", createdInvoice.InvoiceID, "Number:", createdInvoice.InvoiceNumber);

    // Drafts are not emailed - they will be emailed when approved/authorised
    const emailSent = false;

    // Calculate total
    const total = lineItems.reduce((sum: number, item: any) => 
      sum + (item.unitAmount * (item.quantity || 1)), 0
    );

    // Store invoice record in our database
    const { error: insertError } = await supabase
      .from("xero_invoices")
      .insert({
        visit_id: visitId,
        xero_invoice_id: createdInvoice.InvoiceID,
        xero_invoice_number: createdInvoice.InvoiceNumber,
        contact_id: contactId,
        contact_name: contactName,
        total_amount: total,
        status: createdInvoice.Status,
        created_by: userId,
      });

    if (insertError) {
      console.error("Failed to store invoice record:", insertError);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        invoice: {
          id: createdInvoice.InvoiceID,
          number: createdInvoice.InvoiceNumber,
          status: createdInvoice.Status,
          total: createdInvoice.Total,
        },
        emailSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error creating invoice:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

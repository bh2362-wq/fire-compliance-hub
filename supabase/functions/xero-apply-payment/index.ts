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
    const body = await req.json();
    const { invoiceId, bankTransactionId, amount, date, accountCode } = body;

    if (!invoiceId || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: invoiceId, amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // First, get the bank account from the transaction if provided
    let bankAccountId = null;
    if (bankTransactionId) {
      const txUrl = `https://api.xero.com/api.xro/2.0/BankTransactions/${bankTransactionId}`;
      const txResponse = await fetch(txUrl, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Xero-Tenant-Id": connection.tenant_id,
          "Accept": "application/json",
        },
      });
      
      if (txResponse.ok) {
        const txData = await txResponse.json();
        bankAccountId = txData.BankTransactions?.[0]?.BankAccount?.AccountID;
      }
    }

    // If no bank account from transaction, get the first bank account
    if (!bankAccountId) {
      const accountsUrl = `https://api.xero.com/api.xro/2.0/Accounts?where=Type=="BANK"&&Status=="ACTIVE"`;
      const accountsResponse = await fetch(accountsUrl, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Xero-Tenant-Id": connection.tenant_id,
          "Accept": "application/json",
        },
      });
      
      if (accountsResponse.ok) {
        const accountsData = await accountsResponse.json();
        bankAccountId = accountsData.Accounts?.[0]?.AccountID;
      }
    }

    if (!bankAccountId) {
      return new Response(
        JSON.stringify({ error: "No bank account found in Xero" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the payment in Xero
    // This posts the payment against the invoice and reconciles to the bank account
    const paymentData = {
      Invoice: {
        InvoiceID: invoiceId,
      },
      Account: {
        AccountID: bankAccountId,
      },
      Amount: amount,
      Date: date || new Date().toISOString().split("T")[0],
    };

    console.log("Creating payment in Xero:", JSON.stringify(paymentData));

    const paymentUrl = "https://api.xero.com/api.xro/2.0/Payments";
    const paymentResponse = await fetch(paymentUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ Payments: [paymentData] }),
    });

    if (!paymentResponse.ok) {
      const errorText = await paymentResponse.text();
      console.error("Failed to create payment:", errorText);
      throw new Error(`Failed to create payment in Xero: ${errorText}`);
    }

    const paymentResult = await paymentResponse.json();
    const payment = paymentResult.Payments?.[0];

    if (!payment) {
      throw new Error("No payment returned from Xero");
    }

    console.log("Payment created successfully:", payment.PaymentID);

    // Update local xero_invoices record if it exists
    const { error: updateError } = await supabase
      .from("xero_invoices")
      .update({ status: "PAID" })
      .eq("xero_invoice_id", invoiceId);

    if (updateError) {
      console.log("Note: Could not update local invoice status:", updateError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment: {
          paymentId: payment.PaymentID,
          invoiceId: payment.Invoice?.InvoiceID,
          amount: payment.Amount,
          date: payment.Date,
          status: payment.Status,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error applying payment:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshTokenIfNeeded(supabase: any, connection: any, forceRefresh = false) {
  const now = new Date();
  const expiresAt = new Date(connection.expires_at);
  
  // Force refresh or refresh if token expires in less than 10 minutes
  const shouldRefresh = forceRefresh || (expiresAt.getTime() - now.getTime() < 10 * 60 * 1000);
  
  if (shouldRefresh) {
    console.log("Refreshing Xero token...", forceRefresh ? "(forced)" : "(near expiry)");
    
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
      const errorText = await response.text();
      console.error("Token refresh failed:", errorText);
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
    
    console.log("Token refreshed successfully, new expiry:", newExpiresAt);
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

    // Get user's Xero connection (same pattern as xero-invoices)
    const { data: connection, error: connError } = await supabase
      .from("xero_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (connError || !connection) {
      console.error("Connection error:", connError);
      return new Response(
        JSON.stringify({ error: "No Xero connection found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Connection found:", connection.tenant_name, "expires:", connection.expires_at);
    console.log("Access token exists:", !!connection.access_token, "length:", connection.access_token?.length);

    // Force refresh to get a fresh token
    const accessToken = await refreshTokenIfNeeded(supabase, connection, true);
    console.log("Using access token (first 20 chars):", accessToken?.substring(0, 20));

    // Parse body params
    const body = await req.json();
    const { invoiceId, bankTransactionId, amount, date, bankAccountCode } = body;

    if (!invoiceId || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: invoiceId, amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pre-flight: fetch the invoice. If it's already paid, short-circuit
    // so we don't get a ValidationException from Xero.
    const invoiceUrl = `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`;
    const invoiceResponse = await fetch(invoiceUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        "Accept": "application/json",
      },
    });
    if (!invoiceResponse.ok) {
      const errText = await invoiceResponse.text();
      throw new Error(`Failed to fetch invoice from Xero: ${errText}`);
    }
    const invoiceData = await invoiceResponse.json();
    const xeroInvoice = invoiceData.Invoices?.[0];
    if (!xeroInvoice) throw new Error("Invoice not found in Xero");

    const amountDue = Number(xeroInvoice.AmountDue ?? 0);
    const invoiceStatus = xeroInvoice.Status;

    if (invoiceStatus === "PAID" || amountDue <= 0) {
      console.log(`Invoice ${xeroInvoice.InvoiceNumber} already PAID (AmountDue=${amountDue}). Marking as applied without re-posting.`);
      await supabase.from("xero_invoices").update({ status: "PAID" }).eq("xero_invoice_id", invoiceId);
      return new Response(
        JSON.stringify({
          success: true,
          alreadyPaid: true,
          message: `Invoice ${xeroInvoice.InvoiceNumber} is already marked as paid in Xero. No new payment created.`,
          payment: { invoiceId, amount: Number(amount), date: date || new Date().toISOString().split("T")[0], status: "PAID" },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invoiceStatus !== "AUTHORISED") {
      return new Response(
        JSON.stringify({ error: `Invoice ${xeroInvoice.InvoiceNumber} has status '${invoiceStatus}'. Payments can only be applied to AUTHORISED invoices. Approve the draft in Xero first.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payAmount = Number(amount);
    if (payAmount > amountDue + 0.001) {
      return new Response(
        JSON.stringify({ error: `Payment amount £${payAmount.toFixed(2)} exceeds outstanding balance £${amountDue.toFixed(2)} on invoice ${xeroInvoice.InvoiceNumber}.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the bank account - prefer specified code, then from transaction, then first active
    let bankAccountId: string | null = null;
    let bankAccountName: string | null = null;

    const allAccountsUrl = `https://api.xero.com/api.xro/2.0/Accounts`;
    const allAccountsResponse = await fetch(allAccountsUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        "Accept": "application/json",
      },
    });

    let bankAccounts: any[] = [];
    let allAccountsCount = 0;
    let rawAccountsError = "";
    if (allAccountsResponse.ok) {
      const allAccountsData = await allAccountsResponse.json();
      const allAccounts = allAccountsData.Accounts || [];
      allAccountsCount = allAccounts.length;
      // Accept BANK accounts; also accept ACTIVE accounts whose Code matches the
      // user-supplied bankAccountCode (some orgs map "bank" to a CURRENT asset).
      bankAccounts = allAccounts.filter(
        (acc: any) =>
          acc.Status === "ACTIVE" &&
          acc.EnablePaymentsToAccount !== false &&
          (acc.Type === "BANK" || (bankAccountCode && acc.Code === bankAccountCode))
      );
      console.log(`Fetched ${allAccountsCount} total accounts; ${bankAccounts.length} usable:`, bankAccounts.map((a: any) => `${a.Name} (Code=${a.Code}, Type=${a.Type})`));
    } else {
      rawAccountsError = await allAccountsResponse.text();
      console.error("Failed to fetch accounts:", rawAccountsError);
    }

    if (bankAccountCode && bankAccounts.length > 0) {
      const matchedAccount = bankAccounts.find((acc: any) => acc.Code === bankAccountCode);
      if (matchedAccount) {
        bankAccountId = matchedAccount.AccountID;
        bankAccountName = matchedAccount.Name;
      } else {
        return new Response(
          JSON.stringify({
            error: `Bank account with code '${bankAccountCode}' not found among payment-enabled Xero bank accounts. Available codes: ${bankAccounts.map((a: any) => a.Code).filter(Boolean).join(", ") || "(none)"}. Update the code in Remittance settings.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!bankAccountId && bankTransactionId) {
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
        bankAccountId = txData.BankTransactions?.[0]?.BankAccount?.AccountID ?? null;
        bankAccountName = txData.BankTransactions?.[0]?.BankAccount?.Name ?? null;
      }
    }

    // Only fall back to "first available" when no code was specified by the caller.
    if (!bankAccountId && !bankAccountCode && bankAccounts.length > 0) {
      bankAccountId = bankAccounts[0].AccountID;
      bankAccountName = bankAccounts[0].Name;
      console.log(`Using first available bank account: ${bankAccountName}`);
    }

    if (!bankAccountId) {
      const hint = allAccountsCount === 0
        ? "Xero returned 0 accounts. The Xero connection is likely missing the 'accounting.settings' OAuth scope — disconnect and reconnect Xero to grant it."
        : `Xero returned ${allAccountsCount} accounts but none are an ACTIVE BANK account with payments enabled${bankAccountCode ? ` matching code '${bankAccountCode}'` : ""}.`;
      return new Response(
        JSON.stringify({ error: `No payment-enabled bank account found in Xero. ${hint}${rawAccountsError ? ` Raw: ${rawAccountsError.slice(0, 200)}` : ""}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Using bank account: ${bankAccountName} (${bankAccountId})`);
    console.log("Note: Sales account 200 was credited when the invoice was created. This payment clears the receivable.");

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
    } else {
      console.log("Local invoice status updated to PAID");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Payment applied successfully. Invoice marked as paid.",
        payment: {
          paymentId: payment.PaymentID,
          invoiceId: payment.Invoice?.InvoiceID,
          amount: payment.Amount,
          date: payment.Date,
          status: payment.Status,
          bankAccount: bankAccountName,
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

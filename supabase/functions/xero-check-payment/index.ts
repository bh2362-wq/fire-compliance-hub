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
    const { invoiceId, contactName, daysBack = 60 } = body;

    const results: any = {
      bankTransactions: [],
      payments: [],
      invoiceDetails: null,
      bankAccounts: [],
      creditNotes: [],
    };

    // 1. Get bank accounts first
    const accountsUrl = `https://api.xero.com/api.xro/2.0/Accounts?where=${encodeURIComponent('Type=="BANK"')}`;
    console.log("Fetching bank accounts:", accountsUrl);
    
    const accountsResponse = await fetch(accountsUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        "Accept": "application/json",
      },
    });

    if (accountsResponse.ok) {
      const accountsData = await accountsResponse.json();
      results.bankAccounts = (accountsData.Accounts || []).map((a: any) => ({
        accountId: a.AccountID,
        name: a.Name,
        code: a.Code,
        status: a.Status,
      }));
    }

    // 2. Get ALL bank transactions from configurable days back
    const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const toDate = new Date().toISOString().split("T")[0];
    
    const allTxUrl = `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(`Date>=DateTime(${fromDate.replace(/-/g, ",")})`)}`;
    console.log("Fetching all bank transactions:", allTxUrl);
    
    const txResponse = await fetch(allTxUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        "Accept": "application/json",
      },
    });

    if (txResponse.ok) {
      const txData = await txResponse.json();
      const transactions = txData.BankTransactions || [];
      
      // Filter for transactions containing the contact name (case insensitive)
      results.bankTransactions = transactions
        .filter((tx: any) => {
          if (!contactName) return true;
          const name = tx.Contact?.Name?.toLowerCase() || "";
          return name.includes(contactName.toLowerCase());
        })
        .map((tx: any) => ({
          id: tx.BankTransactionID,
          type: tx.Type,
          date: tx.Date,
          contact: tx.Contact?.Name,
          reference: tx.Reference,
          total: tx.Total,
          status: tx.Status,
          isReconciled: tx.IsReconciled,
          bankAccount: tx.BankAccount?.Name,
        }));
    }

    // 2. Get payments for the invoice if provided
    if (invoiceId) {
      const invoiceUrl = `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`;
      const invoiceResponse = await fetch(invoiceUrl, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Xero-Tenant-Id": connection.tenant_id,
          "Accept": "application/json",
        },
      });

      if (invoiceResponse.ok) {
        const invoiceData = await invoiceResponse.json();
        const invoice = invoiceData.Invoices?.[0];
        if (invoice) {
          results.invoiceDetails = {
            invoiceId: invoice.InvoiceID,
            invoiceNumber: invoice.InvoiceNumber,
            reference: invoice.Reference,
            contact: invoice.Contact?.Name,
            status: invoice.Status,
            total: invoice.Total,
            amountDue: invoice.AmountDue,
            amountPaid: invoice.AmountPaid,
            payments: invoice.Payments || [],
          };
        }
      }
    }

    // 4. Get recent payments
    const paymentsUrl = `https://api.xero.com/api.xro/2.0/Payments?where=${encodeURIComponent(`Date>=DateTime(${fromDate.replace(/-/g, ",")})`)}`;
    console.log("Fetching recent payments:", paymentsUrl);
    
    const paymentsResponse = await fetch(paymentsUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        "Accept": "application/json",
      },
    });

    if (paymentsResponse.ok) {
      const paymentsData = await paymentsResponse.json();
      results.payments = (paymentsData.Payments || [])
        .filter((p: any) => {
          if (!contactName) return true;
          return true; // Return all for now
        })
        .map((p: any) => ({
          paymentId: p.PaymentID,
          date: p.Date,
          amount: p.Amount,
          reference: p.Reference,
          invoiceNumber: p.Invoice?.InvoiceNumber,
          status: p.Status,
        }));
    }

    // 5. Get credit notes for the contact
    if (contactName) {
      const creditNotesUrl = `https://api.xero.com/api.xro/2.0/CreditNotes?where=${encodeURIComponent(`Status=="AUTHORISED"`)}`;
      console.log("Fetching credit notes:", creditNotesUrl);
      
      const creditNotesResponse = await fetch(creditNotesUrl, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Xero-Tenant-Id": connection.tenant_id,
          "Accept": "application/json",
        },
      });

      if (creditNotesResponse.ok) {
        const creditNotesData = await creditNotesResponse.json();
        results.creditNotes = (creditNotesData.CreditNotes || [])
          .filter((cn: any) => {
            const name = cn.Contact?.Name?.toLowerCase() || "";
            return name.includes(contactName.toLowerCase());
          })
          .map((cn: any) => ({
            creditNoteId: cn.CreditNoteID,
            creditNoteNumber: cn.CreditNoteNumber,
            date: cn.Date,
            contact: cn.Contact?.Name,
            total: cn.Total,
            remainingCredit: cn.RemainingCredit,
            status: cn.Status,
          }));
      }
    }

    console.log(`Found ${results.bankTransactions.length} bank transactions, ${results.payments.length} payments, ${results.creditNotes.length} credit notes`);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error checking payment:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

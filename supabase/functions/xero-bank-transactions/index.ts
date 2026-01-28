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
    const fromDate = body.fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const toDate = body.toDate || new Date().toISOString().split("T")[0];

    // Fetch bank transactions (RECEIVE type = incoming payments)
    const whereClause = `Type=="RECEIVE"&&Date>=DateTime(${fromDate.replace(/-/g, ",")})&&Date<=DateTime(${toDate.replace(/-/g, ",")})`;
    const transactionsUrl = `https://api.xero.com/api.xro/2.0/BankTransactions?where=${encodeURIComponent(whereClause)}&order=Date DESC`;
    
    console.log("Fetching bank transactions from Xero:", transactionsUrl);

    const transactionsResponse = await fetch(transactionsUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        "Accept": "application/json",
      },
    });

    if (!transactionsResponse.ok) {
      const errorText = await transactionsResponse.text();
      console.error("Failed to fetch bank transactions:", errorText);
      throw new Error("Failed to fetch bank transactions from Xero");
    }

    const transactionsData = await transactionsResponse.json();
    const transactions = transactionsData.BankTransactions || [];

    // Fetch outstanding invoices to match against
    const invoicesUrl = `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent('Type=="ACCREC"&&Status=="AUTHORISED"')}&order=DueDate`;
    
    const invoicesResponse = await fetch(invoicesUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Xero-Tenant-Id": connection.tenant_id,
        "Accept": "application/json",
      },
    });

    let outstandingInvoices: any[] = [];
    if (invoicesResponse.ok) {
      const invoicesData = await invoicesResponse.json();
      outstandingInvoices = invoicesData.Invoices || [];
    }

    // Process transactions and find potential invoice matches
    const processedTransactions = transactions.map((tx: any) => {
      const amount = tx.Total || 0;
      const contactId = tx.Contact?.ContactID;
      const contactName = tx.Contact?.Name;
      const reference = tx.Reference || "";
      const dateStr = parseXeroDate(tx.Date);

      // Try to match with an invoice
      let matchedInvoice = null;
      let matchConfidence = 0;

      if (contactId) {
        // Find invoices from the same contact with matching amount
        const contactInvoices = outstandingInvoices.filter(
          (inv: any) => inv.Contact?.ContactID === contactId
        );

        for (const inv of contactInvoices) {
          const invAmount = inv.AmountDue || inv.Total || 0;
          const amountDiff = Math.abs(amount - invAmount);
          
          // Exact amount match
          if (amountDiff < 0.01) {
            matchedInvoice = {
              invoiceId: inv.InvoiceID,
              invoiceNumber: inv.InvoiceNumber,
              amount: invAmount,
              reference: inv.Reference,
            };
            matchConfidence = 100;
            break;
          }
          
          // Check if reference contains invoice number
          if (reference && inv.InvoiceNumber && reference.includes(inv.InvoiceNumber)) {
            matchedInvoice = {
              invoiceId: inv.InvoiceID,
              invoiceNumber: inv.InvoiceNumber,
              amount: invAmount,
              reference: inv.Reference,
            };
            matchConfidence = amountDiff < 0.01 ? 100 : 80;
            break;
          }
        }
      }

      return {
        transactionId: tx.BankTransactionID,
        date: dateStr,
        amount,
        contactId,
        contactName,
        reference,
        bankAccount: tx.BankAccount?.Name,
        status: tx.Status,
        isReconciled: tx.IsReconciled,
        matchedInvoice,
        matchConfidence,
      };
    });

    // Separate matched and unmatched transactions
    const matched = processedTransactions.filter((tx: any) => tx.matchedInvoice);
    const unmatched = processedTransactions.filter((tx: any) => !tx.matchedInvoice);

    // Calculate summary
    const totalReceived = processedTransactions.reduce((sum: number, tx: any) => sum + tx.amount, 0);
    const totalMatched = matched.reduce((sum: number, tx: any) => sum + tx.amount, 0);
    const totalUnmatched = unmatched.reduce((sum: number, tx: any) => sum + tx.amount, 0);

    return new Response(
      JSON.stringify({
        transactions: processedTransactions,
        matched,
        unmatched,
        summary: {
          totalTransactions: processedTransactions.length,
          matchedCount: matched.length,
          unmatchedCount: unmatched.length,
          totalReceived,
          totalMatched,
          totalUnmatched,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error fetching bank transactions:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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
     
     const { invoiceId, action, paymentAmount, paymentDate, paymentAccountCode } = body;
 
     if (!invoiceId || !action) {
       return new Response(
         JSON.stringify({ error: "Missing required fields: invoiceId, action" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
    if (!["mark_paid", "void", "approve"].includes(action)) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Must be 'mark_paid', 'void', or 'approve'" }),
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
 
     // Fetch invoice to check current status
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
 
     console.log("Invoice status:", invoice.Status, "AmountDue:", invoice.AmountDue);
 
     if (action === "mark_paid") {
       // Check if invoice is already paid
       if (invoice.Status === "PAID") {
         return new Response(
           JSON.stringify({ error: "Invoice is already marked as paid" }),
           { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       // Check if invoice is in a valid state for payment
       if (!["AUTHORISED", "SUBMITTED"].includes(invoice.Status)) {
         return new Response(
           JSON.stringify({ error: `Cannot mark invoice as paid with status: ${invoice.Status}. Must be AUTHORISED first.` }),
           { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       // Create a payment in Xero
       const amountToPay = paymentAmount || invoice.AmountDue;
       const paymentDateStr = paymentDate || new Date().toISOString().split("T")[0];
       
       // Get bank account code - use provided or default to first bank account
       let accountCode = paymentAccountCode;
       
       if (!accountCode) {
         // Fetch accounts to find a bank account
          const accountsResponse = await fetch(
            "https://api.xero.com/api.xro/2.0/Accounts?where=Type%3D%3D%22BANK%22",
           {
             headers: {
               "Authorization": `Bearer ${accessToken}`,
               "Xero-Tenant-Id": connection.tenant_id,
               "Accept": "application/json",
             },
           }
         );
 
          if (accountsResponse.ok) {
            const accountsData = await accountsResponse.json();
            console.log("Found bank accounts:", accountsData.Accounts?.length, accountsData.Accounts?.map((a: any) => `${a.Name} (${a.AccountID})`));
            if (accountsData.Accounts?.length > 0) {
              accountCode = accountsData.Accounts[0].AccountID;
              console.log("Using default bank account:", accountCode);
            }
          }
       }
 
       if (!accountCode) {
         return new Response(
           JSON.stringify({ error: "No bank account found. Please set up a bank account in Xero." }),
           { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       console.log("Creating payment for amount:", amountToPay);
       
       const paymentResponse = await fetch(
         "https://api.xero.com/api.xro/2.0/Payments",
         {
           method: "POST",
           headers: {
             "Authorization": `Bearer ${accessToken}`,
             "Xero-Tenant-Id": connection.tenant_id,
             "Content-Type": "application/json",
             "Accept": "application/json",
           },
           body: JSON.stringify({
             Payments: [{
               Invoice: {
                 InvoiceID: invoiceId,
               },
                Account: {
                  AccountID: accountCode,
                },
               Amount: amountToPay,
               Date: paymentDateStr,
             }],
           }),
         }
       );
 
       if (!paymentResponse.ok) {
         const errorText = await paymentResponse.text();
         console.error("Failed to create payment:", errorText);
         throw new Error(`Failed to create payment: ${errorText}`);
       }
 
       const paymentResult = await paymentResponse.json();
       console.log("Payment created successfully:", paymentResult.Payments?.[0]?.PaymentID);
 
       // Record in payment_history
       await supabase.from("payment_history").insert({
         xero_invoice_id: invoiceId,
         xero_invoice_number: invoice.InvoiceNumber,
         xero_contact_id: invoice.Contact?.ContactID,
         invoice_amount: invoice.Total,
         payment_amount: amountToPay,
         invoice_date: invoice.Date,
         due_date: invoice.DueDate,
         payment_date: paymentDateStr,
         days_to_pay: Math.floor((new Date(paymentDateStr).getTime() - new Date(invoice.Date).getTime()) / (1000 * 60 * 60 * 24)),
         was_overdue: new Date(paymentDateStr) > new Date(invoice.DueDate),
         days_overdue: Math.max(0, Math.floor((new Date(paymentDateStr).getTime() - new Date(invoice.DueDate).getTime()) / (1000 * 60 * 60 * 24))),
       });
 
       return new Response(
         JSON.stringify({ 
           success: true,
           action: "mark_paid",
           message: `Payment of £${amountToPay.toFixed(2)} recorded successfully`,
           paymentId: paymentResult.Payments?.[0]?.PaymentID,
         }),
         { headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
 
    } else if (action === "approve") {
      // Approve a DRAFT invoice - authorise it in Xero and send email
      if (invoice.Status !== "DRAFT") {
        return new Response(
          JSON.stringify({ error: `Invoice is already ${invoice.Status}. Only DRAFT invoices can be approved.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Approving (authorising) invoice...");

      const approveResponse = await fetch(
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
              Status: "AUTHORISED",
            }],
          }),
        }
      );

      if (!approveResponse.ok) {
        const errorText = await approveResponse.text();
        console.error("Failed to approve invoice:", errorText);
        throw new Error(`Failed to approve invoice: ${errorText}`);
      }

      console.log("Invoice approved successfully");

      // Auto-send email to customer
      let emailSent = false;
      try {
        const emailResponse = await fetch(
          `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}/Email`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Xero-Tenant-Id": connection.tenant_id,
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
          }
        );
        if (emailResponse.ok) {
          console.log("Invoice emailed to customer after approval");
          emailSent = true;
        } else {
          console.error("Failed to email invoice:", await emailResponse.text());
        }
      } catch (emailErr) {
        console.error("Error sending invoice email:", emailErr);
      }

      // Update local record status
      await supabase
        .from("xero_invoices")
        .update({ status: "AUTHORISED" })
        .eq("xero_invoice_id", invoiceId);

      return new Response(
        JSON.stringify({
          success: true,
          action: "approve",
          message: emailSent
            ? `Invoice approved and emailed to customer`
            : `Invoice approved successfully`,
          emailSent,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "void") {
       // Check if invoice can be voided
       if (invoice.Status === "PAID") {
         return new Response(
           JSON.stringify({ error: "Cannot void a paid invoice. Reverse the payment first." }),
           { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       if (invoice.Status === "VOIDED") {
         return new Response(
           JSON.stringify({ error: "Invoice is already voided" }),
           { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       if (invoice.AmountPaid > 0) {
         return new Response(
           JSON.stringify({ error: "Cannot void an invoice with partial payments. Remove payments first." }),
           { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
         );
       }
 
       console.log("Voiding invoice...");
       
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
 
       console.log("Invoice voided successfully");
 
       // Remove from local database
       await supabase
         .from("xero_invoices")
         .delete()
         .eq("xero_invoice_id", invoiceId);
 
       return new Response(
         JSON.stringify({ 
           success: true,
           action: "void",
           message: "Invoice voided successfully in Xero",
         }),
         { headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     return new Response(
       JSON.stringify({ error: "Invalid action" }),
       { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
 
   } catch (error: unknown) {
     console.error("Error updating invoice:", error);
     const message = error instanceof Error ? error.message : "Unknown error";
     return new Response(
       JSON.stringify({ error: message }),
       { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
 });
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

      // Auto-send a custom email with the invoice PDF attached.
      //
      // Was: POST /Invoices/{id}/Email which uses Xero's built-in email.
      // That sends a "view online" HTML link with no PDF attached unless
      // online invoicing is configured in the Xero tenant — which it
      // often isn't. Result: customers got bare links instead of the
      // PDF the user expected.
      //
      // Now: fetch the rendered PDF from Xero directly, look up the
      // contact's email, and send via Resend with the PDF as an
      // attachment. Falls back to Xero's /Email endpoint if Resend isn't
      // configured. Returns a structured emailDelivery field so the UI
      // can surface what actually happened.
      let emailSent = false;
      let emailMethod: "resend_pdf" | "xero_link" | "none" = "none";
      let emailDetail: string | null = null;

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      const INVOICE_FROM_EMAIL =
        Deno.env.get("INVOICE_FROM_EMAIL") || "BHO Fire Ltd <accounts@bhofire.com>";

      try {
        // 1. Fetch the contact so we have an email + a clean name. The
        //    full Contact endpoint always includes EmailAddress; the
        //    embedded contact on an invoice does not.
        const contactId = invoice.Contact?.ContactID;
        let customerEmail: string | null = null;
        let customerName: string | null = invoice.Contact?.Name ?? null;

        if (contactId) {
          const contactResp = await fetch(
            `https://api.xero.com/api.xro/2.0/Contacts/${contactId}`,
            {
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Xero-Tenant-Id": connection.tenant_id,
                "Accept": "application/json",
              },
            }
          );
          if (contactResp.ok) {
            const c = (await contactResp.json()).Contacts?.[0];
            customerEmail = (c?.EmailAddress as string | undefined) || null;
            customerName = (c?.Name as string | undefined) || customerName;
          }
        }

        if (RESEND_API_KEY && customerEmail) {
          // 2. Fetch the rendered PDF from Xero (binary).
          const pdfResp = await fetch(
            `https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`,
            {
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Xero-Tenant-Id": connection.tenant_id,
                "Accept": "application/pdf",
              },
            }
          );

          if (!pdfResp.ok) {
            const t = await pdfResp.text().catch(() => "");
            throw new Error(`PDF fetch failed: ${pdfResp.status} ${t.slice(0, 200)}`);
          }

          const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer());
          // Base64-encode in chunks so we don't blow the call stack on
          // larger PDFs.
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < pdfBytes.length; i += chunk) {
            binary += String.fromCharCode.apply(
              null,
              Array.from(pdfBytes.subarray(i, i + chunk)) as any,
            );
          }
          const pdfBase64 = btoa(binary);

          const subject = `Invoice ${invoice.InvoiceNumber ?? ""} from BHO Fire Ltd`;
          const total = typeof invoice.Total === "number"
            ? `£${invoice.Total.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "(see attached)";
          const due = invoice.DueDate
            ? new Date(invoice.DueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            : "see attached";

          const html =
            `<div style="font-family:Inter,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:560px">` +
            `<p>Hi ${customerName ?? "there"},</p>` +
            `<p>Please find attached invoice <strong>${invoice.InvoiceNumber ?? ""}</strong> from BHO Fire Ltd.</p>` +
            `<table style="border-collapse:collapse;margin:14px 0;font-size:14px">` +
            `<tr><td style="padding:4px 12px 4px 0;color:#666">Total</td><td style="padding:4px 0;font-weight:600">${total}</td></tr>` +
            `<tr><td style="padding:4px 12px 4px 0;color:#666">Due</td><td style="padding:4px 0">${due}</td></tr>` +
            `</table>` +
            `<p>If you have any questions about this invoice please reply to this email.</p>` +
            `<p style="color:#666;font-size:12px;margin-top:24px">Sent automatically when the invoice was authorised in our system.</p>` +
            `</div>`;

          const resendResp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: INVOICE_FROM_EMAIL,
              to: [customerEmail],
              subject,
              html,
              attachments: [{
                filename: `Invoice-${invoice.InvoiceNumber ?? invoiceId}.pdf`,
                content: pdfBase64,
              }],
            }),
          });

          if (!resendResp.ok) {
            const t = await resendResp.text().catch(() => "");
            throw new Error(`Resend send failed: ${resendResp.status} ${t.slice(0, 200)}`);
          }

          emailSent = true;
          emailMethod = "resend_pdf";
          emailDetail = `PDF emailed to ${customerEmail}`;
          console.log("Invoice PDF emailed via Resend to", customerEmail);
        } else if (!customerEmail) {
          emailDetail = "No email address on Xero contact — skipping email.";
          console.warn(emailDetail);
        }
      } catch (resendErr) {
        // Resend / PDF path failed. Fall back to Xero's built-in /Email
        // endpoint so something still goes out, even if it's just a
        // "view online" link.
        const errMsg = resendErr instanceof Error ? resendErr.message : "Unknown send error";
        console.error("Resend PDF send failed, falling back to Xero /Email:", errMsg);
        try {
          const xeroEmailResp = await fetch(
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
          if (xeroEmailResp.ok) {
            emailSent = true;
            emailMethod = "xero_link";
            emailDetail = "Sent via Xero (online-invoice link, no PDF attached).";
          } else {
            emailDetail = `Resend failed and Xero /Email returned ${xeroEmailResp.status}.`;
          }
        } catch (xeroErr) {
          const x = xeroErr instanceof Error ? xeroErr.message : "Unknown error";
          emailDetail = `Resend failed (${errMsg}). Xero fallback also failed: ${x}`;
        }
      }

      // Update local record status
      await supabase
        .from("xero_invoices")
        .update({ status: "AUTHORISED" })
        .eq("xero_invoice_id", invoiceId);

      const summary = emailSent
        ? (emailMethod === "resend_pdf"
            ? "Invoice authorised and PDF emailed to customer."
            : "Invoice authorised and sent via Xero (no PDF attached).")
        : `Invoice authorised. Email not sent: ${emailDetail ?? "unknown reason"}.`;

      return new Response(
        JSON.stringify({
          success: true,
          action: "approve",
          message: summary,
          emailSent,
          emailMethod,
          emailDetail,
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
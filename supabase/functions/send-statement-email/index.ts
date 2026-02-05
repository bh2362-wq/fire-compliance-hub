 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 import { Resend } from "npm:resend@2.0.0";
 
 const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers":
     "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
 };
 
 interface InvoiceItem {
   number: string;
   reference: string;
   date: string;
   dueDate: string;
   amount: number;
 }
 
 interface StatementEmailRequest {
   to: string;
   contactName: string;
   invoices: InvoiceItem[];
   totalDue: number;
   message: string;
 }
 
 const formatDate = (dateStr: string) => {
   const date = new Date(dateStr);
   return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
 };
 
 const handler = async (req: Request): Promise<Response> => {
   if (req.method === "OPTIONS") {
     return new Response("ok", { headers: corsHeaders });
   }
 
   try {
     const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
     const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
     const supabase = createClient(supabaseUrl, supabaseServiceKey);
 
     // Verify JWT
     const authHeader = req.headers.get("Authorization");
     if (!authHeader) {
       throw new Error("No authorization header");
     }
     
     const { data: { user }, error: authError } = await supabase.auth.getUser(
       authHeader.replace("Bearer ", "")
     );
     
     if (authError || !user) {
       throw new Error("Unauthorized");
     }
 
     const { to, contactName, invoices, totalDue, message }: StatementEmailRequest = await req.json();
 
     if (!to || !contactName || !invoices?.length) {
       throw new Error("Missing required fields: to, contactName, invoices");
     }
 
     console.log(`Sending statement email to ${to} for ${contactName} with ${invoices.length} invoices`);
 
     // Get company settings for branding
     const { data: companySettings } = await supabase
       .from("company_settings")
       .select("company_name, email, phone, report_logo_url")
       .single();
 
     const companyName = companySettings?.company_name || "BHO Fire";
     const companyEmail = companySettings?.email || "accounts@bhofire.com";
     const companyPhone = companySettings?.phone || "";
     const logoUrl = companySettings?.report_logo_url || "";
 
     // Build invoice table rows
     const invoiceRows = invoices.map((inv) => `
       <tr>
         <td style="padding: 10px; border-bottom: 1px solid #eee;">${inv.number}</td>
         <td style="padding: 10px; border-bottom: 1px solid #eee;">${inv.reference || "—"}</td>
         <td style="padding: 10px; border-bottom: 1px solid #eee;">${formatDate(inv.date)}</td>
         <td style="padding: 10px; border-bottom: 1px solid #eee; color: #e74c3c;">${formatDate(inv.dueDate)}</td>
         <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">£${inv.amount.toFixed(2)}</td>
       </tr>
     `).join("");
 
     const emailHtml = `
       <!DOCTYPE html>
       <html>
       <head>
         <style>
           body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
           .container { max-width: 700px; margin: 0 auto; padding: 20px; }
           .header { text-align: center; padding-bottom: 20px; border-bottom: 3px solid #e74c3c; margin-bottom: 20px; }
           .logo { max-height: 60px; }
           .content { padding: 20px 0; }
           .invoice-table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #fff; }
           .invoice-table th { background: #333; color: #fff; padding: 12px 10px; text-align: left; }
           .invoice-table th:last-child { text-align: right; }
           .total-row { background: #f9f9f9; }
           .total-row td { padding: 15px 10px; font-size: 18px; font-weight: bold; }
           .message-box { background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0; white-space: pre-wrap; }
           .footer { text-align: center; font-size: 12px; color: #666; padding-top: 20px; border-top: 1px solid #eee; margin-top: 30px; }
           .urgent { color: #e74c3c; font-weight: bold; }
         </style>
       </head>
       <body>
         <div class="container">
           <div class="header">
             ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" class="logo" />` : `<h2 style="margin: 0; color: #333;">${companyName}</h2>`}
           </div>
           
           <div class="content">
             <h2 style="color: #333; margin-bottom: 5px;">Statement of Account</h2>
             <p style="color: #666; margin-top: 0;">Outstanding Invoices for ${contactName}</p>
             
             <p>Dear ${contactName},</p>
             <p>Please find below a summary of your outstanding invoices:</p>
             
             <table class="invoice-table">
               <thead>
                 <tr>
                   <th>Invoice #</th>
                   <th>Reference</th>
                   <th>Date</th>
                   <th>Due Date</th>
                   <th style="text-align: right;">Amount</th>
                 </tr>
               </thead>
               <tbody>
                 ${invoiceRows}
               </tbody>
               <tfoot>
                 <tr class="total-row">
                   <td colspan="4" style="text-align: right; padding-right: 10px;">Total Outstanding:</td>
                   <td style="text-align: right; color: #e74c3c;">£${totalDue.toFixed(2)}</td>
                 </tr>
               </tfoot>
             </table>
             
             <div class="message-box">${message.replace(/\n/g, "<br>")}</div>
           </div>
           
           <div class="footer">
             <p style="margin: 0;"><strong>${companyName}</strong></p>
             ${companyEmail ? `<p style="margin: 5px 0;">Email: ${companyEmail}</p>` : ""}
             ${companyPhone ? `<p style="margin: 5px 0;">Phone: ${companyPhone}</p>` : ""}
           </div>
         </div>
       </body>
       </html>
     `;
 
     const emailResponse = await resend.emails.send({
       from: `${companyName} Credit Control <accounts@bhofire.com>`,
       to: [to],
       subject: `Statement of Account - ${invoices.length} Outstanding Invoice${invoices.length > 1 ? "s" : ""} - £${totalDue.toFixed(2)}`,
       html: emailHtml,
     });
 
     console.log("Statement email sent successfully:", emailResponse);
 
     // Log the email
     await supabase.from("email_logs").insert({
       recipients: [to],
       subject: `Statement of Account - ${invoices.length} Outstanding Invoice${invoices.length > 1 ? "s" : ""} - £${totalDue.toFixed(2)}`,
       email_type: "statement",
       status: "sent",
       resend_id: emailResponse.data?.id || null,
       created_by: user.id,
     });
 
     return new Response(
       JSON.stringify({
         success: true,
         email_id: emailResponse.data?.id,
       }),
       {
         status: 200,
         headers: { "Content-Type": "application/json", ...corsHeaders },
       }
     );
   } catch (error: any) {
     console.error("Error in send-statement-email:", error);
     return new Response(
       JSON.stringify({ error: error.message }),
       {
         status: 500,
         headers: { "Content-Type": "application/json", ...corsHeaders },
       }
     );
   }
 };
 
 serve(handler);
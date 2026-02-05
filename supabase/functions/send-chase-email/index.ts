 import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "resend";
 
 const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers":
     "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
 };
 
 interface ChaseEmailRequest {
   reminder_id?: string;
   to: string;
   subject: string;
   message: string;
   invoice_number?: string;
   amount_due?: number;
   days_overdue?: number;
 }
 
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
 
     const { reminder_id, to, subject, message, invoice_number, amount_due, days_overdue }: ChaseEmailRequest = await req.json();
 
     if (!to || !subject || !message) {
       throw new Error("Missing required fields: to, subject, message");
     }
 
     console.log(`Sending chase email to ${to} for invoice ${invoice_number}`);
 
     // Get company settings for branding
     const { data: companySettings } = await supabase
       .from("company_settings")
       .select("company_name, email, phone, report_logo_url")
       .single();
 
     const companyName = companySettings?.company_name || "BHO Fire";
     const companyEmail = companySettings?.email || "";
     const companyPhone = companySettings?.phone || "";
     const logoUrl = companySettings?.report_logo_url || "";
 
     const emailHtml = `
       <!DOCTYPE html>
       <html>
       <head>
         <style>
           body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
           .container { max-width: 600px; margin: 0 auto; padding: 20px; }
           .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #e74c3c; }
           .logo { max-height: 60px; }
           .content { padding: 20px 0; }
           .invoice-details { background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; }
           .invoice-details strong { color: #e74c3c; }
           .footer { text-align: center; font-size: 12px; color: #666; padding-top: 20px; border-top: 1px solid #eee; }
           .urgent { color: #e74c3c; font-weight: bold; }
         </style>
       </head>
       <body>
         <div class="container">
           <div class="header">
             ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" class="logo" />` : `<h2>${companyName}</h2>`}
           </div>
           <div class="content">
             ${message.replace(/\n/g, "<br>")}
             
             ${invoice_number || amount_due ? `
             <div class="invoice-details">
               ${invoice_number ? `<p><strong>Invoice Number:</strong> ${invoice_number}</p>` : ""}
               ${amount_due ? `<p><strong>Amount Due:</strong> £${amount_due.toFixed(2)}</p>` : ""}
               ${days_overdue ? `<p class="urgent">Days Overdue: ${days_overdue}</p>` : ""}
             </div>
             ` : ""}
             
             <p>If you have already made payment, please disregard this reminder.</p>
             <p>If you have any queries regarding this invoice, please contact us.</p>
           </div>
           <div class="footer">
             <p>${companyName}</p>
             ${companyEmail ? `<p>Email: ${companyEmail}</p>` : ""}
             ${companyPhone ? `<p>Phone: ${companyPhone}</p>` : ""}
           </div>
         </div>
       </body>
       </html>
     `;
 
     const emailResponse = await resend.emails.send({
       from: `${companyName} <accounts@bhofire.com>`,
       to: [to],
       subject: subject,
       html: emailHtml,
     });
 
     console.log("Chase email sent successfully:", emailResponse);
 
     // Update reminder status to sent
     if (reminder_id) {
       await supabase
         .from("credit_control_reminders")
         .update({
           status: "sent",
           sent_at: new Date().toISOString(),
          external_id: emailResponse.data?.id || null,
         })
         .eq("id", reminder_id);
     }
 
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
     console.error("Error in send-chase-email:", error);
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
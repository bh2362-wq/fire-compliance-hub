import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ThankYouEmailRequest {
  to: string;
  subject: string;
  greeting: string;
  body: string;
  signoff: string;
  invoice_number: string;
  amount_paid: number;
  payment_date: string;
  customer_name: string;
  customer_id?: string;
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

    const {
      to,
      subject,
      greeting,
      body,
      signoff,
      invoice_number,
      amount_paid,
      payment_date,
      customer_name,
      customer_id,
    }: ThankYouEmailRequest = await req.json();

    if (!to || !subject || !body) {
      throw new Error("Missing required fields: to, subject, body");
    }

    console.log(`Sending thank you email to ${to} for invoice ${invoice_number}`);

    // Get company settings for branding
    const { data: companySettings } = await supabase
      .from("company_settings")
      .select("company_name, email, phone, report_logo_url, company_logo_url")
      .single();

    const companyName = companySettings?.company_name || "BHO Fire";
    const companyEmail = companySettings?.email || "";
    const companyPhone = companySettings?.phone || "";
    const logoUrl = companySettings?.report_logo_url || companySettings?.company_logo_url || "";

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #2ecc71; }
          .logo { max-height: 60px; }
          .content { padding: 20px 0; }
          .payment-details { background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2ecc71; }
          .payment-details p { margin: 5px 0; }
          .payment-details .label { color: #666; font-size: 13px; }
          .payment-details .value { font-weight: bold; color: #333; font-size: 15px; }
          .checkmark { color: #2ecc71; font-size: 24px; }
          .footer { text-align: center; font-size: 12px; color: #666; padding-top: 20px; border-top: 1px solid #eee; }
          .greeting { margin-bottom: 16px; }
          .signoff { margin-top: 24px; white-space: pre-line; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" class="logo" />` : `<h2>${companyName}</h2>`}
          </div>
          <div class="content">
            <p class="greeting">${greeting}</p>
            
            ${body.replace(/\n/g, "<br>")}
            
            <div class="payment-details">
              <p><span class="checkmark">✓</span> <strong>Payment Confirmed</strong></p>
              <p><span class="label">Invoice Number:</span> <span class="value">${invoice_number}</span></p>
              <p><span class="label">Amount Received:</span> <span class="value">£${amount_paid.toFixed(2)}</span></p>
              <p><span class="label">Payment Date:</span> <span class="value">${payment_date}</span></p>
            </div>
            
            <p class="signoff">${signoff.replace(/\n/g, "<br>")}</p>
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

    // Send the email
    const emailResponse = await resend.emails.send({
      from: `${companyName} <accounts@bhofire.com>`,
      to: [to],
      subject: subject,
      html: emailHtml,
    });

    console.log("Thank you email sent successfully:", emailResponse);

    // Log the email
    await supabase.from("email_logs").insert({
      recipients: [to],
      subject: subject,
      status: "sent",
      email_type: "thank_you",
      created_by: user.id,
      customer_id: customer_id || null,
      resend_id: emailResponse.data?.id || null,
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
    console.error("Error in send-thank-you-email:", error);
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

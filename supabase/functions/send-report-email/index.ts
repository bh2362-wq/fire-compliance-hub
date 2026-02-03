import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendReportRequest {
  to: string;
  subject: string;
  siteName: string;
  reportNumber: string;
  reportDate: string;
  pdfBase64: string;
  customerName?: string;
  companyName?: string;
  logoUrl?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      to,
      subject,
      siteName,
      reportNumber,
      reportDate,
      pdfBase64,
      customerName,
      companyName,
      logoUrl,
    }: SendReportRequest = await req.json();

    // Validate required fields
    if (!to || !pdfBase64) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to and pdfBase64" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileName = `${reportNumber || "Report"}-${reportDate || "report"}.pdf`;
    const fromName = companyName || "Service Reports";

    console.log(`Sending report email to ${to}, report: ${reportNumber}`);

    const emailResponse = await resend.emails.send({
      from: `${fromName} <noreply@bhofire.com>`,
      to: [to],
      subject: subject || `Service Report - ${siteName || "Site"}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          ${logoUrl ? `
          <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #dc2626;">
            <img src="${logoUrl}" alt="${companyName || 'Company'} Logo" style="max-height: 60px; max-width: 200px;" />
          </div>
          ` : ''}
          <div style="padding: 30px 20px;">
            <h2 style="color: #1f2937; margin-top: 0;">Service Report</h2>
            ${customerName ? `<p style="color: #374151;">Dear ${customerName},</p>` : '<p style="color: #374151;">Dear Customer,</p>'}
            <p style="color: #374151;">Please find attached the service report for your records.</p>
            <table style="border-collapse: collapse; margin: 20px 0; width: 100%;">
              <tr style="background-color: #f9fafb;">
                <td style="padding: 12px 16px; color: #6b7280; border: 1px solid #e5e7eb;">Report Number:</td>
                <td style="padding: 12px 16px; font-weight: bold; color: #1f2937; border: 1px solid #e5e7eb;">${reportNumber || "—"}</td>
              </tr>
              <tr>
                <td style="padding: 12px 16px; color: #6b7280; border: 1px solid #e5e7eb;">Site:</td>
                <td style="padding: 12px 16px; font-weight: bold; color: #1f2937; border: 1px solid #e5e7eb;">${siteName || "—"}</td>
              </tr>
              <tr style="background-color: #f9fafb;">
                <td style="padding: 12px 16px; color: #6b7280; border: 1px solid #e5e7eb;">Date:</td>
                <td style="padding: 12px 16px; font-weight: bold; color: #1f2937; border: 1px solid #e5e7eb;">${reportDate || "—"}</td>
              </tr>
            </table>
            <p style="color: #374151;">If you have any questions regarding this report, please don't hesitate to contact us.</p>
            <p style="margin-top: 30px; color: #374151;">Kind regards,<br/><strong>${companyName || "The Service Team"}</strong></p>
          </div>
          <div style="background-color: #1f2937; color: #9ca3af; padding: 20px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">${companyName || "BHO Fire"}</p>
            <p style="margin: 5px 0 0 0;">This is an automated email. Please do not reply directly to this message.</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: fileName,
          content: pdfBase64,
        },
      ],
    });

    // Check for Resend API errors
    if (emailResponse.error) {
      console.error("Resend API error:", emailResponse.error);
      return new Response(
        JSON.stringify({ error: emailResponse.error.message || "Failed to send email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully:", emailResponse.data);

    return new Response(
      JSON.stringify({ success: true, data: emailResponse.data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending report email:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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
      from: `${fromName} <onboarding@resend.dev>`,
      to: [to],
      subject: subject || `Service Report - ${siteName || "Site"}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Service Report</h2>
          ${customerName ? `<p>Dear ${customerName},</p>` : "<p>Dear Customer,</p>"}
          <p>Please find attached the service report for your records.</p>
          <table style="border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px 16px 8px 0; color: #666;">Report Number:</td>
              <td style="padding: 8px 0; font-weight: bold;">${reportNumber || "—"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 16px 8px 0; color: #666;">Site:</td>
              <td style="padding: 8px 0; font-weight: bold;">${siteName || "—"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 16px 8px 0; color: #666;">Date:</td>
              <td style="padding: 8px 0; font-weight: bold;">${reportDate || "—"}</td>
            </tr>
          </table>
          <p>If you have any questions regarding this report, please don't hesitate to contact us.</p>
          <p style="margin-top: 30px;">Kind regards,<br/>${companyName || "The Service Team"}</p>
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

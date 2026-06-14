import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendReportRequest {
  to: string | string[]; // Support single email or array of emails
  subject: string;
  siteName: string;
  reportNumber: string;
  reportDate: string;
  pdfBase64: string;
  additionalAttachments?: { filename: string; content: string }[];
  customerName?: string;
  companyName?: string;
  logoUrl?: string;
  emailBody?: string; // Custom email body from template
  documentType?: string; // e.g. "Purchase Order", "Service Report", "Quotation"
}

// Helper to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      additionalAttachments,
      customerName,
      companyName,
      logoUrl,
      emailBody,
      documentType,
    }: SendReportRequest = await req.json();

    // Normalize to array of recipients and filter out empty/whitespace strings
    const recipients = (Array.isArray(to) ? to : [to])
      .map((email) => (email || "").trim())
      .filter((email) => email.length > 0);

    // Validate required fields
    if (!recipients.length) {
      return new Response(
        JSON.stringify({ error: "No valid email recipients provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: "Missing required field: pdfBase64" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // Validate email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipients.filter((email) => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      return new Response(
        JSON.stringify({ error: `Invalid email address(es): ${invalidEmails.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileName = `${reportNumber || "Report"}-${reportDate || "report"}.pdf`;
    const fromName = companyName || "Service Reports";

     // Auto-linkify URLs in text
     const linkifyText = (text: string): string => {
       return text.replace(
         /(https?:\/\/[^\s<]+)/g,
         '<a href="$1" style="color: #dc2626; text-decoration: underline;">$1</a>'
       );
     };

     // Convert plain text email body to HTML paragraphs if provided
     const bodyHtml = emailBody
       ? emailBody
           .split("\n\n")
           .map((paragraph) => `<p style="color: #374151; margin: 16px 0;">${linkifyText(paragraph.replace(/\n/g, "<br/>"))}</p>`)
           .join("")
       : `
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
       `;
 
     const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        ${logoUrl ? `
        <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #dc2626;">
          <img src="${logoUrl}" alt="${companyName || 'Company'} Logo" style="max-height: 60px; max-width: 200px;" />
        </div>
        ` : ''}
        <div style="padding: 30px 20px;">
           <h2 style="color: #1f2937; margin-top: 0;">${documentType || "Service Report"}</h2>
           ${bodyHtml}
        </div>
        <div style="background-color: #1f2937; color: #9ca3af; padding: 20px; text-align: center; font-size: 12px;">
          <p style="margin: 0;">${companyName || "BHO Fire"}</p>
          <p style="margin: 5px 0 0 0;">This is an automated email. Please do not reply directly to this message.</p>
        </div>
      </div>
    `;

    const results: { email: string; success: boolean; id?: string; error?: string }[] = [];

    // Send emails sequentially with delay to respect rate limit (2 req/sec)
    for (let i = 0; i < recipients.length; i++) {
      const email = recipients[i];
      
      // Add delay between requests (600ms to stay under 2/sec limit)
      if (i > 0) {
        await delay(600);
      }

      console.log(`Sending report email to ${email}, report: ${reportNumber}`);

      try {
        const emailResponse = await resend.emails.send({
          from: `${fromName} <noreply@bhofire.com>`,
          to: [email],
          subject: subject || `Service Report - ${siteName || "Site"}`,
          html: emailHtml,
          attachments: [
            {
              filename: fileName,
              content: pdfBase64,
            },
            ...(additionalAttachments || []),
          ],
        });

        if (emailResponse.error) {
          console.error(`Failed to send to ${email}:`, emailResponse.error);
          results.push({ email, success: false, error: emailResponse.error.message });
        } else {
          console.log(`Email sent successfully to ${email}:`, emailResponse.data);
          results.push({ email, success: true, id: emailResponse.data?.id });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Error sending to ${email}:`, errMsg);
        results.push({ email, success: false, error: errMsg });
      }
    }

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    if (failed.length > 0) {
      console.error("send-report-email completed with failures:", failed);
    }

    return new Response(
      JSON.stringify({
        success: failed.length === 0,
        results,
        error: failed.length > 0 ? failed.map((r) => `${r.email}: ${r.error || "Send failed"}`).join("; ") : undefined,
        summary: {
          total: recipients.length,
          sent: successful.length,
          failed: failed.length,
        },
      }),
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

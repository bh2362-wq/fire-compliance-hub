import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface JobInfo {
  siteName: string;
  visitDate: string;
  visitType: string;
  status: string;
  notes?: string;
}

interface SendJobsEmailRequest {
  to: string;
  customerName: string;
  jobs: JobInfo[];
  message?: string;
}

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  confirmed: "Confirmed",
  on_hold: "On Hold",
  awaiting_parts: "Awaiting Parts",
  further_works_required: "Further Works Required",
  quote_needed: "Quote Needed",
  awaiting_po: "Awaiting PO",
  pending_review: "Pending Review",
  completed: "Completed",
};

const statusColors: Record<string, string> = {
  scheduled: "#3b82f6",
  in_progress: "#f59e0b",
  confirmed: "#10b981",
  on_hold: "#f97316",
  awaiting_parts: "#8b5cf6",
  further_works_required: "#f43f5e",
  quote_needed: "#06b6d4",
  awaiting_po: "#ec4899",
  pending_review: "#6366f1",
  completed: "#22c55e",
};

const visitTypeLabels: Record<string, string> = {
  quarterly_service: "Quarterly Service",
  biannual_service: "Biannual Service",
  annual_inspection: "Annual Inspection",
  emergency: "Emergency Call-Out",
  remedial: "Remedial Works",
  supply_only: "Supply Only",
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) throw new Error("Unauthorized");

    const { to, customerName, jobs, message }: SendJobsEmailRequest = await req.json();

    if (!to || !jobs || jobs.length === 0) {
      throw new Error("Missing required fields: to, jobs");
    }

    // Get company settings for branding
    const { data: companySettings } = await supabase
      .from("company_settings")
      .select("company_name, email, phone, report_logo_url")
      .single();

    const companyName = companySettings?.company_name || "BHO Fire";
    const companyEmail = companySettings?.email || "";
    const companyPhone = companySettings?.phone || "";
    const logoUrl = companySettings?.report_logo_url || "";

    const jobRows = jobs.map((job) => {
      const color = statusColors[job.status] || "#6b7280";
      const label = statusLabels[job.status] || job.status;
      const typeLabel = visitTypeLabels[job.visitType] || job.visitType?.replace(/_/g, " ") || "Service";
      return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${job.siteName}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${formatDate(job.visitDate)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px;">${typeLabel}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; color: white; background: ${color};">${label}</span>
          </td>
          ${job.notes ? `<td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">${job.notes}</td>` : `<td style="padding: 12px; border-bottom: 1px solid #e5e7eb;"></td>`}
        </tr>
      `;
    }).join("");

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.7; color: #1f2937; margin: 0; padding: 0;">
        <div style="max-width: 700px; margin: 0 auto;">
          <div style="background: #1e293b; padding: 24px; text-align: center;">
            ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="max-height: 50px;" />` : `<h1 style="margin: 0; color: white; font-size: 22px;">${companyName}</h1>`}
          </div>
          <div style="padding: 30px; background: #ffffff;">
            <h2 style="color: #1e293b; margin-top: 0;">Job Summary</h2>
            <p>Dear ${customerName || "Customer"},</p>
            ${message ? `<p>${message.replace(/\n/g, "<br>")}</p>` : `<p>Please find below a summary of your current jobs. We would appreciate your confirmation and any PO numbers where applicable.</p>`}
            
            <table style="width: 100%; border-collapse: collapse; margin: 24px 0; border: 1px solid #e5e7eb; border-radius: 8px;">
              <thead>
                <tr style="background: #f1f5f9;">
                  <th style="padding: 12px; text-align: left; font-size: 13px; color: #475569; border-bottom: 2px solid #e5e7eb;">Site</th>
                  <th style="padding: 12px; text-align: left; font-size: 13px; color: #475569; border-bottom: 2px solid #e5e7eb;">Date</th>
                  <th style="padding: 12px; text-align: left; font-size: 13px; color: #475569; border-bottom: 2px solid #e5e7eb;">Type</th>
                  <th style="padding: 12px; text-align: left; font-size: 13px; color: #475569; border-bottom: 2px solid #e5e7eb;">Status</th>
                  <th style="padding: 12px; text-align: left; font-size: 13px; color: #475569; border-bottom: 2px solid #e5e7eb;">Notes</th>
                </tr>
              </thead>
              <tbody>
                ${jobRows}
              </tbody>
            </table>

            <p>If you have any queries or would like to provide PO numbers, please reply to this email or contact us directly.</p>
            <p>Kind regards,<br><strong>${companyName}</strong></p>
          </div>
          <div style="background: #1e293b; color: #9ca3af; padding: 16px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">${companyName}</p>
            ${companyEmail ? `<p style="margin: 4px 0 0;">Email: ${companyEmail}</p>` : ""}
            ${companyPhone ? `<p style="margin: 4px 0 0;">Phone: ${companyPhone}</p>` : ""}
          </div>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: `${companyName} <accounts@bhofire.com>`,
      to: to.split(",").map((e: string) => e.trim()).filter(Boolean),
      subject: `Job Summary — ${jobs.length} Job${jobs.length > 1 ? "s" : ""} for Your Review`,
      html: emailHtml,
    });

    console.log("Jobs email sent:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, email_id: emailResponse.data?.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-jobs-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

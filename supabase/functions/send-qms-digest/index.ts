import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Fetch all QMS data in parallel
    const [ncrs, capas, risks, training, audits, feedback, docs, companyResult, profilesResult] = await Promise.all([
      supabase.from("qms_ncrs").select("id, ncr_number, title, status, severity, source, created_at, due_date"),
      supabase.from("qms_capas").select("id, capa_number, title, status, priority, due_date, created_at"),
      supabase.from("qms_risks").select("id, risk_number, title, risk_score, status"),
      supabase.from("qms_training_records").select("id, expiry_date, status, training_type:qms_training_types(name)"),
      supabase.from("qms_audits").select("id, audit_number, title, scheduled_date, status"),
      supabase.from("qms_feedback").select("id, feedback_number, subject, type, status, created_at"),
      supabase.from("qms_documents").select("id, document_number, title, next_review_date, status"),
      supabase.from("company_settings").select("company_name, email, report_logo_url").single(),
      supabase.from("profiles").select("email, full_name"),
    ]);

    const ncrsData = ncrs.data || [];
    const capasData = capas.data || [];
    const risksData = risks.data || [];
    const trainingData = training.data || [];
    const auditsData = audits.data || [];
    const feedbackData = feedback.data || [];
    const docsData = docs.data || [];
    const companySettings = companyResult.data;
    const profiles = profilesResult.data || [];

    // Calculate KPIs
    const openNCRs = ncrsData.filter((n) => n.status !== "closed");
    const newNCRsThisWeek = ncrsData.filter((n) => n.created_at >= weekAgo);
    const autoNCRsThisWeek = newNCRsThisWeek.filter((n) => n.source === "service_report");
    const overdueNCRs = openNCRs.filter((n) => n.due_date && n.due_date < today);

    const openCAPAs = capasData.filter((c) => !["closed", "cancelled"].includes(c.status));
    const overdueCAPAs = openCAPAs.filter((c) => c.due_date && c.due_date < today);

    const highRisks = risksData.filter((r) => (r.risk_score as number) >= 15 && r.status === "active");

    const expiringTraining = trainingData.filter(
      (t) => t.expiry_date && t.expiry_date <= thirtyDays && t.expiry_date >= today
    );
    const expiredTraining = trainingData.filter(
      (t) => t.expiry_date && t.expiry_date < today && t.status !== "expired"
    );

    const upcomingAudits = auditsData.filter(
      (a) => a.scheduled_date >= today && a.scheduled_date <= thirtyDays && a.status === "planned"
    );

    const openFeedback = feedbackData.filter((f) => !["resolved", "closed"].includes(f.status));
    const newComplaints = feedbackData.filter((f) => f.type === "complaint" && f.created_at >= weekAgo);

    const overdueReviews = docsData.filter(
      (d) => d.next_review_date && d.next_review_date < today && d.status !== "archived"
    );

    const companyName = companySettings?.company_name || "BHO Fire";
    const logoUrl = companySettings?.report_logo_url || "";

    // Determine overall status
    const criticalItems = overdueNCRs.length + overdueCAPAs.length + highRisks.length + expiredTraining.length;
    const warningItems = expiringTraining.length + overdueReviews.length + newComplaints.length;
    const overallStatus = criticalItems > 0 ? "🔴" : warningItems > 0 ? "🟡" : "🟢";
    const overallLabel = criticalItems > 0 ? "Action Required" : warningItems > 0 ? "Attention Needed" : "On Track";

    // Build HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.7; color: #333; margin: 0; padding: 0; }
          .container { max-width: 650px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 20px 0; border-bottom: 3px solid #e74c3c; }
          .logo { max-height: 50px; }
          .status-banner { text-align: center; padding: 15px; margin: 20px 0; border-radius: 8px; font-size: 18px; font-weight: bold; }
          .status-green { background: #e8f5e9; color: #2e7d32; }
          .status-yellow { background: #fff8e1; color: #f57f17; }
          .status-red { background: #ffebee; color: #c62828; }
          .section { margin: 20px 0; }
          .section h3 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 12px; }
          .kpi-grid { display: flex; flex-wrap: wrap; gap: 10px; }
          .kpi-card { flex: 1; min-width: 120px; background: #f8f9fa; border-radius: 8px; padding: 12px; text-align: center; }
          .kpi-value { font-size: 28px; font-weight: bold; }
          .kpi-label { font-size: 11px; color: #666; text-transform: uppercase; }
          .kpi-red .kpi-value { color: #c62828; }
          .kpi-orange .kpi-value { color: #e65100; }
          .kpi-green .kpi-value { color: #2e7d32; }
          .kpi-blue .kpi-value { color: #1565c0; }
          .alert-item { padding: 8px 12px; margin: 4px 0; border-left: 3px solid #e74c3c; background: #fff5f5; border-radius: 0 4px 4px 0; font-size: 13px; }
          .warning-item { padding: 8px 12px; margin: 4px 0; border-left: 3px solid #ff9800; background: #fff8e1; border-radius: 0 4px 4px 0; font-size: 13px; }
          .info-item { padding: 8px 12px; margin: 4px 0; border-left: 3px solid #1976d2; background: #e3f2fd; border-radius: 0 4px 4px 0; font-size: 13px; }
          .auto-badge { display: inline-block; background: #e3f2fd; color: #1565c0; font-size: 10px; padding: 1px 6px; border-radius: 10px; margin-left: 6px; font-weight: bold; }
          .footer { text-align: center; font-size: 11px; color: #999; padding-top: 20px; border-top: 1px solid #eee; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" class="logo" />` : `<h2 style="margin:0;color:#e74c3c;">${companyName}</h2>`}
            <p style="margin:5px 0 0;color:#666;font-size:14px;">Weekly QMS Compliance Digest</p>
            <p style="margin:2px 0 0;color:#999;font-size:12px;">Week ending ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>

          <div class="status-banner ${criticalItems > 0 ? "status-red" : warningItems > 0 ? "status-yellow" : "status-green"}">
            ${overallStatus} Overall QMS Status: ${overallLabel}
          </div>

          <!-- KPI Summary -->
          <div class="section">
            <h3>📊 Key Performance Indicators</h3>
            <div class="kpi-grid">
              <div class="kpi-card ${openNCRs.length > 0 ? "kpi-red" : "kpi-green"}">
                <div class="kpi-value">${openNCRs.length}</div>
                <div class="kpi-label">Open NCRs</div>
              </div>
              <div class="kpi-card ${openCAPAs.length > 0 ? "kpi-orange" : "kpi-green"}">
                <div class="kpi-value">${openCAPAs.length}</div>
                <div class="kpi-label">Open CAPAs</div>
              </div>
              <div class="kpi-card ${highRisks.length > 0 ? "kpi-red" : "kpi-green"}">
                <div class="kpi-value">${highRisks.length}</div>
                <div class="kpi-label">High Risks</div>
              </div>
              <div class="kpi-card kpi-blue">
                <div class="kpi-value">${upcomingAudits.length}</div>
                <div class="kpi-label">Upcoming Audits</div>
              </div>
            </div>
          </div>

          <!-- This Week's Activity -->
          <div class="section">
            <h3>📋 This Week's Activity</h3>
            ${newNCRsThisWeek.length > 0 ? `
              ${newNCRsThisWeek.map((n) => `
                <div class="info-item">
                  <strong>${n.ncr_number}</strong>: ${n.title}
                  ${n.source === "service_report" ? `<span class="auto-badge">AUTO</span>` : ""}
                  — <em>${n.severity}</em>
                </div>
              `).join("")}
            ` : `<p style="color:#666;font-size:13px;">No new NCRs raised this week.</p>`}
            ${autoNCRsThisWeek.length > 0 ? `
              <p style="font-size:12px;color:#1565c0;margin-top:8px;">ℹ️ ${autoNCRsThisWeek.length} NCR(s) were auto-raised from service report defects</p>
            ` : ""}
          </div>

          <!-- Action Items -->
          ${criticalItems > 0 ? `
          <div class="section">
            <h3>🚨 Items Requiring Immediate Action</h3>
            ${overdueNCRs.map((n) => `<div class="alert-item"><strong>${n.ncr_number}</strong>: ${n.title} — overdue since ${n.due_date}</div>`).join("")}
            ${overdueCAPAs.map((c) => `<div class="alert-item"><strong>${c.capa_number}</strong>: ${c.title} — overdue since ${c.due_date}</div>`).join("")}
            ${highRisks.map((r) => `<div class="alert-item"><strong>${r.risk_number}</strong>: ${r.title} — Risk Score: ${r.risk_score}</div>`).join("")}
            ${expiredTraining.map((t: any) => `<div class="alert-item">Training expired: ${t.training_type?.name || "Unknown"} — ${t.expiry_date}</div>`).join("")}
          </div>
          ` : ""}

          <!-- Warnings -->
          ${warningItems > 0 ? `
          <div class="section">
            <h3>⚠️ Upcoming Attention</h3>
            ${expiringTraining.map((t: any) => `<div class="warning-item">Training expiring: ${t.training_type?.name || "Unknown"} — ${t.expiry_date}</div>`).join("")}
            ${overdueReviews.map((d) => `<div class="warning-item">Document review overdue: <strong>${d.document_number}</strong> ${d.title} — due ${d.next_review_date}</div>`).join("")}
            ${newComplaints.map((f) => `<div class="warning-item">New complaint: <strong>${f.feedback_number}</strong> ${f.subject}</div>`).join("")}
          </div>
          ` : ""}

          <!-- Upcoming Audits -->
          ${upcomingAudits.length > 0 ? `
          <div class="section">
            <h3>🔍 Upcoming Audits (Next 30 Days)</h3>
            ${upcomingAudits.map((a) => `<div class="info-item"><strong>${a.audit_number}</strong>: ${a.title} — ${a.scheduled_date}</div>`).join("")}
          </div>
          ` : ""}

          <!-- Open Feedback -->
          ${openFeedback.length > 0 ? `
          <div class="section">
            <h3>💬 Open Customer Feedback (${openFeedback.length})</h3>
            ${openFeedback.slice(0, 5).map((f) => `<div class="info-item"><strong>${f.feedback_number}</strong>: ${f.subject} — ${f.type}</div>`).join("")}
            ${openFeedback.length > 5 ? `<p style="font-size:12px;color:#666;">+ ${openFeedback.length - 5} more items</p>` : ""}
          </div>
          ` : ""}

          <div class="footer">
            <p>This is an automated weekly QMS compliance digest from ${companyName}.</p>
            <p>Generated on ${new Date().toLocaleString("en-GB")}.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Get all team members' emails
    const recipients = profiles.filter((p) => p.email).map((p) => p.email!);

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No recipients found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send to each recipient with delay for rate limiting
    const results = [];
    for (const recipient of recipients) {
      try {
        const result = await resend.emails.send({
          from: `${companyName} QMS <accounts@bhofire.com>`,
          to: [recipient],
          subject: `${overallStatus} Weekly QMS Digest — ${overallLabel} — ${new Date().toLocaleDateString("en-GB")}`,
          html: emailHtml,
        });
        results.push({ email: recipient, success: true, id: result.data?.id });
      } catch (err: any) {
        results.push({ email: recipient, success: false, error: err.message });
      }
      // Rate limit delay
      await new Promise((r) => setTimeout(r, 600));
    }

    console.log("QMS digest sent:", JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, recipients: results.length, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-qms-digest:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);

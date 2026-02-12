import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "resend";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NotificationRequest {
  type: "appointment_created" | "appointment_reminder" | "job_completed" | "appointment_updated" | "visit_confirmation";
  appointmentId?: string;
  visitId?: string;
  customerId?: string;
  siteId?: string;
  // Direct data for immediate sends
  customerEmail?: string;
  customerName?: string;
  siteName?: string;
  siteAddress?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  visitType?: string;
  jobNumber?: string;
  engineerName?: string;
  acceptUrl?: string;
  jobNotes?: string;
}

const formatJobNotes = (notes: string): string => {
  const lines = notes.split("\n").filter(line => !line.trim().toLowerCase().startsWith("standards referenced:"));
  let html = "";
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) { html += "</ul>"; inList = false; }
      continue;
    }

    // Bullet points
    if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
      if (!inList) { html += '<ul style="margin: 8px 0; padding-left: 20px;">'; inList = true; }
      const text = trimmed.replace(/^[•\-]\s*/, "").trim();
      html += `<li style="margin-bottom: 4px; color: #374151;">${text}</li>`;
      continue;
    }

    if (inList) { html += "</ul>"; inList = false; }

    // Key:Value lines (label before colon is short)
    if (trimmed.includes(":") && trimmed.indexOf(":") < 30 && !trimmed.endsWith(".")) {
      const colonIdx = trimmed.indexOf(":");
      const label = trimmed.substring(0, colonIdx + 1);
      const value = trimmed.substring(colonIdx + 1).trim();
      if (value) {
        html += `<p style="margin: 4px 0; font-size: 14px;"><strong style="color: #1f2937;">${label}</strong> ${value}</p>`;
      } else {
        html += `<h4 style="margin: 14px 0 6px; font-size: 14px; font-weight: 700; color: #1f2937;">${trimmed}</h4>`;
      }
      continue;
    }

    // All-caps headings
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 80) {
      html += `<h4 style="margin: 14px 0 6px; font-size: 14px; font-weight: 700; color: #1e40af; text-transform: uppercase;">${trimmed}</h4>`;
      continue;
    }

    // Regular paragraph
    html += `<p style="margin: 6px 0; color: #374151; line-height: 1.6;">${trimmed}</p>`;
  }

  if (inList) html += "</ul>";
  return html;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const formatTime = (timeStr: string): string => {
  const [hours, minutes] = timeStr.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

const getVisitTypeLabel = (visitType: string): string => {
  const labels: Record<string, string> = {
    quarterly_service: "Quarterly Service",
    biannual_service: "Biannual Service",
    annual_inspection: "Annual Inspection",
    emergency: "Emergency Call-Out",
    remedial: "Remedial Works",
    supply_only: "Supply Only",
  };
  return labels[visitType] || visitType;
};

const handler = async (req: Request): Promise<Response> => {
  console.log("send-notification function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: NotificationRequest = await req.json();
    console.log("Notification request:", body);

    let customerEmail = body.customerEmail;
    let customerName = body.customerName;
    let siteName = body.siteName;
    let siteAddress = body.siteAddress;
    let appointmentDate = body.appointmentDate;
    let appointmentTime = body.appointmentTime;
    let visitType = body.visitType;
    let jobNumber = body.jobNumber;
    let engineerName = body.engineerName;

    // Fetch data if IDs provided instead of direct data
    if (body.appointmentId && !customerEmail) {
      const { data: appointment, error } = await supabase
        .from("appointments")
        .select(`
          *,
          site:sites(id, name, address, customer_id),
          customer:customers(id, name, contact_email, contact_name)
        `)
        .eq("id", body.appointmentId)
        .single();

      if (error || !appointment) {
        console.error("Failed to fetch appointment:", error);
        return new Response(
          JSON.stringify({ error: "Appointment not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get customer from site if not directly linked
      let customer = appointment.customer;
      if (!customer && appointment.site?.customer_id) {
        const { data: siteCustomer } = await supabase
          .from("customers")
          .select("id, name, contact_email, contact_name")
          .eq("id", appointment.site.customer_id)
          .single();
        customer = siteCustomer;
      }

      if (!customer?.contact_email) {
        console.log("No customer email found for appointment");
        return new Response(
          JSON.stringify({ error: "No customer email found", skipped: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      customerEmail = customer.contact_email;
      customerName = customer.contact_name || customer.name;
      siteName = appointment.site?.name || "Site";
      siteAddress = appointment.site?.address || "";
      appointmentDate = appointment.appointment_date;
      appointmentTime = appointment.start_time;
      visitType = appointment.visit_type;
    }

    // Fetch visit data if needed
    if (body.visitId && !customerEmail) {
      const { data: visit, error } = await supabase
        .from("visits")
        .select(`
          *,
          site:sites(id, name, address, customer_id)
        `)
        .eq("id", body.visitId)
        .single();

      if (error || !visit) {
        console.error("Failed to fetch visit:", error);
        return new Response(
          JSON.stringify({ error: "Visit not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get customer from site
      if (visit.site?.customer_id) {
        const { data: customer } = await supabase
          .from("customers")
          .select("id, name, contact_email, contact_name")
          .eq("id", visit.site.customer_id)
          .single();

        if (!customer?.contact_email) {
          console.log("No customer email found for visit");
          return new Response(
            JSON.stringify({ error: "No customer email found", skipped: true }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        customerEmail = customer.contact_email;
        customerName = customer.contact_name || customer.name;
      }

      siteName = visit.site?.name || "Site";
      siteAddress = visit.site?.address || "";
      appointmentDate = visit.visit_date;
      visitType = visit.visit_type;

      // Get job number from service report if job completed
      if (body.type === "job_completed") {
        const { data: report } = await supabase
          .from("service_reports")
          .select("report_number, engineer_name")
          .eq("visit_id", body.visitId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (report) {
          jobNumber = report.report_number;
          engineerName = report.engineer_name;
        }
      }
    }

    if (!customerEmail) {
      console.log("No customer email available");
      return new Response(
        JSON.stringify({ error: "No customer email available", skipped: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build email content based on type
    let subject: string;
    let htmlContent: string;

    const formattedDate = appointmentDate ? formatDate(appointmentDate) : "";
    const formattedTime = appointmentTime ? formatTime(appointmentTime) : "";
    const visitTypeLabel = visitType ? getVisitTypeLabel(visitType) : "Service Visit";

    switch (body.type) {
      case "appointment_created":
        subject = `Appointment Confirmed - ${siteName}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">BHO Fire</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <h2 style="color: #1e40af;">Appointment Confirmed</h2>
              <p>Dear ${customerName},</p>
              <p>Your appointment has been scheduled. Please find the details below:</p>
              
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Site:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${siteName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Address:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${siteAddress || "N/A"}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Date:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${formattedDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Time:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${formattedTime}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0;"><strong>Service Type:</strong></td>
                    <td style="padding: 10px 0;">${visitTypeLabel}</td>
                  </tr>
                </table>
              </div>
              
              <p>If you need to reschedule or have any questions, please contact us.</p>
              <p>Best regards,<br>BHO Fire Team</p>
            </div>
            <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px;">
              <p style="margin: 0;">BHO Fire - Fire Safety Solutions</p>
            </div>
          </div>
        `;
        break;

      case "appointment_reminder":
        subject = `Reminder: Appointment Tomorrow - ${siteName}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">BHO Fire</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <h2 style="color: #f59e0b;">Appointment Reminder</h2>
              <p>Dear ${customerName},</p>
              <p>This is a friendly reminder that you have an appointment scheduled for <strong>tomorrow</strong>.</p>
              
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0;"><strong>Site:</strong></td>
                    <td style="padding: 10px 0;">${siteName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0;"><strong>Date:</strong></td>
                    <td style="padding: 10px 0;">${formattedDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0;"><strong>Time:</strong></td>
                    <td style="padding: 10px 0;">${formattedTime}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0;"><strong>Service Type:</strong></td>
                    <td style="padding: 10px 0;">${visitTypeLabel}</td>
                  </tr>
                </table>
              </div>
              
              <p>Please ensure site access is available for our engineer.</p>
              <p>Best regards,<br>BHO Fire Team</p>
            </div>
            <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px;">
              <p style="margin: 0;">BHO Fire - Fire Safety Solutions</p>
            </div>
          </div>
        `;
        break;

      case "appointment_updated":
        subject = `Appointment Updated - ${siteName}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">BHO Fire</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <h2 style="color: #1e40af;">Appointment Updated</h2>
              <p>Dear ${customerName},</p>
              <p>Your appointment details have been updated. Please find the new details below:</p>
              
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Site:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${siteName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Date:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${formattedDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Time:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${formattedTime}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0;"><strong>Service Type:</strong></td>
                    <td style="padding: 10px 0;">${visitTypeLabel}</td>
                  </tr>
                </table>
              </div>
              
              <p>If you have any questions about these changes, please contact us.</p>
              <p>Best regards,<br>BHO Fire Team</p>
            </div>
            <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px;">
              <p style="margin: 0;">BHO Fire - Fire Safety Solutions</p>
            </div>
          </div>
        `;
        break;

      case "job_completed":
        subject = `Job Completed - ${jobNumber || siteName}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">BHO Fire</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <h2 style="color: #16a34a;">Job Completed</h2>
              <p>Dear ${customerName},</p>
              <p>We are pleased to confirm that the service work at your site has been completed.</p>
              
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
                <table style="width: 100%; border-collapse: collapse;">
                  ${jobNumber ? `
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Job Reference:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${jobNumber}</td>
                  </tr>
                  ` : ""}
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Site:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${siteName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Date:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${formattedDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Service Type:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${visitTypeLabel}</td>
                  </tr>
                  ${engineerName ? `
                  <tr>
                    <td style="padding: 10px 0;"><strong>Engineer:</strong></td>
                    <td style="padding: 10px 0;">${engineerName}</td>
                  </tr>
                  ` : ""}
                </table>
              </div>
              
              <p>A copy of the job sheet will be sent separately if applicable.</p>
              <p>Thank you for choosing BHO Fire for your fire safety needs.</p>
              <p>Best regards,<br>BHO Fire Team</p>
            </div>
            <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px;">
              <p style="margin: 0;">BHO Fire - Fire Safety Solutions</p>
            </div>
          </div>
        `;
        break;

      case "visit_confirmation":
        subject = `Appointment Confirmation Required - ${siteName}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">BHO Fire</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
              <h2 style="color: #1e40af;">Appointment Confirmation Required</h2>
              <p>Dear ${customerName},</p>
              <p>We have scheduled an appointment at your site. Please review the details below and confirm:</p>
              
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Site:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${siteName}</td>
                  </tr>
                  ${siteAddress ? `
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Address:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${siteAddress}</td>
                  </tr>
                  ` : ""}
                  <tr>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;"><strong>Date:</strong></td>
                    <td style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">${formattedDate}</td>
                  </tr>
                   <tr>
                    <td style="padding: 10px 0;${body.jobNotes ? ' border-bottom: 1px solid #e5e7eb;' : ''}"><strong>Service Type:</strong></td>
                    <td style="padding: 10px 0;${body.jobNotes ? ' border-bottom: 1px solid #e5e7eb;' : ''}">${visitTypeLabel}</td>
                  </tr>
                  ${body.jobNotes ? `
                  <tr>
                    <td style="padding: 16px 0 10px;" colspan="2">
                      <div style="font-family: Arial, Helvetica, sans-serif; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; background: #f9fafb;">
                        <h3 style="margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #1f2937; border-bottom: 2px solid #1e40af; padding-bottom: 8px;">Job Details</h3>
                        <div style="color: #374151; font-size: 14px; line-height: 1.7;">
                          ${formatJobNotes(body.jobNotes)}
                        </div>
                      </div>
                    </td>
                  </tr>
                  ` : ""}
                </table>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${body.acceptUrl || ""}" style="background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  Confirm Appointment
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px;">
                Click the button above to confirm the appointment and provide a PO number if required.
              </p>
              
              <p>If you need to reschedule, please contact us directly.</p>
              <p>Best regards,<br>BHO Fire Team</p>
            </div>
            <div style="background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px;">
              <p style="margin: 0;">BHO Fire - Fire Safety Solutions</p>
            </div>
          </div>
        `;
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Invalid notification type" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    console.log(`Sending ${body.type} email to ${customerEmail}`);

    const emailResponse = await resend.emails.send({
      from: "BHO Fire <noreply@resend.dev>",
      to: [customerEmail],
      subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error sending notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);

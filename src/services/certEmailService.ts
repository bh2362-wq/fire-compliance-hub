/**
 * certEmailService.ts
 *
 * Auto-emails a completed cert PDF to the site's responsible person.
 * Called silently after cert completion — skips gracefully if no email.
 */

import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface CertEmailInput {
  pdfBase64:   string;
  fileName:    string;
  certRef:     string;
  formType:    string;
  siteName:    string;
  visitDate:   string;
  toEmail:     string | null | undefined;
  contactName: string | null | undefined;
}

const FORM_TYPE_LABELS: Record<string, string> = {
  bs5839_inspection_servicing: "Fire Alarm Inspection & Servicing Certificate",
  bs5839_installation:         "Fire Alarm Installation Certificate",
  bs5839_commissioning:        "Fire Alarm Commissioning Certificate",
  bs5839_modification:         "Fire Alarm Modification Certificate",
  el_periodic:                 "Emergency Lighting Periodic Certificate",
  el_commissioning:            "Emergency Lighting Commissioning Certificate",
  asd_annual_service:          "ASD Annual Service Certificate",
  asd_commissioning:           "ASD Commissioning Certificate",
  dr_visual:                   "Dry Riser Visual Inspection Certificate",
  dr_pressure_test:            "Dry Riser Pressure Test Certificate",
};

export async function autoEmailCert(input: CertEmailInput): Promise<boolean> {
  const { pdfBase64, fileName, certRef, formType, siteName, visitDate, toEmail, contactName } = input;

  // Silently skip if no email address
  const email = (toEmail || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;

  const docType = FORM_TYPE_LABELS[formType] || "Service Certificate";
  const dateLabel = visitDate
    ? format(new Date(visitDate), "dd MMMM yyyy")
    : format(new Date(), "dd MMMM yyyy");

  const subject = `${docType} – ${siteName} – ${certRef}`;

  const body = [
    contactName ? `Dear ${contactName},` : "Dear Sir / Madam,",
    "",
    `Please find attached your ${docType} for ${siteName}, reference ${certRef}, dated ${dateLabel}.`,
    "",
    "Please retain this document for your fire safety records. If you have any questions regarding this certificate or the works carried out, please do not hesitate to contact us.",
    "",
    "Kind regards,",
    "BHO Fire & Security Ltd",
    "T: 0330 043 8659",
    "E: admin@bhofire.com",
  ].join("\n");

  const { data: company } = await supabase
    .from("company_settings")
    .select("company_name, report_logo_url, company_logo_url")
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.functions.invoke("send-report-email", {
    body: {
      to:           email,
      subject,
      siteName,
      reportNumber: certRef,
      reportDate:   dateLabel,
      pdfBase64,
      fileName,
      customerName: contactName || undefined,
      companyName:  (company as any)?.company_name || "BHO Fire & Security Ltd",
      logoUrl:      (company as any)?.report_logo_url || (company as any)?.company_logo_url || undefined,
      emailBody:    body,
      documentType: docType,
    },
  });

  if (error) {
    console.warn("[certEmailService] Email send failed:", error.message);
    return false;
  }
  return true;
}

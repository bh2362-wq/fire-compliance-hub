import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AcknowledgementStatus =
  | "pending"           // sent, awaiting acknowledgement
  | "acknowledged"      // responsible person confirmed receipt
  | "overdue"           // past acknowledgement deadline
  | "escalated"         // formal notice issued
  | "remediated"        // works completed
  | "declined"          // client declined works
  | "accepted_risk";    // client signed acceptance of continued risk

export type EscalationLevel =
  | "initial_notification"   // first notice
  | "24h_chase"              // no acknowledgement after 24h
  | "14_day_notice"          // Cat 1: 14 days overdue
  | "30_day_notice"          // Cat 1/2: 30 days overdue
  | "60_day_notice"          // formal non-compliance notice
  | "final_notice";          // legal escalation point

export interface DefectNotice {
  id: string;
  defect_id: string;
  site_id: string;
  customer_id: string;
  responsible_person_name: string;
  responsible_person_email: string;
  responsible_person_phone: string;
  defect_description: string;
  defect_category: "Cat1" | "Cat2" | "Cat3";
  standard_reference: string;      // e.g. "BS 5839-1:2017 Clause 45.2"
  risk_description: string;
  recommended_action: string;
  escalation_level: EscalationLevel;
  acknowledgement_status: AcknowledgementStatus;
  sent_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  acknowledgement_method: string | null;  // email / WhatsApp / portal
  next_escalation_at: string | null;
  created_by: string;
  created_at: string;
}

export interface DeclinationOfWorks {
  id: string;
  defect_notice_id: string;
  defect_id: string;
  site_id: string;
  customer_id: string;
  premises_name: string;
  premises_address: string;
  responsible_person_name: string;
  responsible_person_role: string;
  recommended_works: string;
  standard_reference: string;
  risk_statement: string;
  risk_accepted_statement: string;
  signed_by: string;
  signature: string;
  signed_date: string;
  signed_ip: string | null;
  witnessed_by: string;
  bho_representative: string;
  bho_signature: string;
  created_at: string;
}

// ── Escalation timing per category ────────────────────────────────────────────

export const ESCALATION_SCHEDULE = {
  Cat1: {
    acknowledgement_hours: 24,
    first_remediation_days: 14,
    formal_notice_days: 30,
    final_notice_days: 60,
  },
  Cat2: {
    acknowledgement_hours: 72,
    first_remediation_days: 30,
    formal_notice_days: 60,
    final_notice_days: 90,
  },
  Cat3: {
    acknowledgement_hours: 168,  // 7 days
    first_remediation_days: 90,
    formal_notice_days: 180,
    final_notice_days: 365,
  },
};

// ── Notification message builders ──────────────────────────────────────────────

export function buildInitialNotificationMessage(notice: Partial<DefectNotice>): string {
  return `BHO Fire & Security — Fire Safety Notice

Dear ${notice.responsible_person_name || "Responsible Person"},

A fire safety defect has been identified at ${notice.site_id} that requires your attention.

DEFECT CATEGORY: ${notice.defect_category}
DESCRIPTION: ${notice.defect_description}
STANDARD REFERENCE: ${notice.standard_reference}
RISK: ${notice.risk_description}
RECOMMENDED ACTION: ${notice.recommended_action}

${notice.defect_category === "Cat1"
  ? "This is a CATEGORY 1 defect. Urgent remedial action is required. Please acknowledge receipt of this notice within 24 hours."
  : notice.defect_category === "Cat2"
  ? "This is a CATEGORY 2 defect. Remedial action should be completed within 30 days. Please acknowledge receipt within 72 hours."
  : "This is a CATEGORY 3 defect. Please acknowledge receipt and arrange remedial works at your earliest convenience."}

To acknowledge this notice, please reply to this message or contact us at admin@bhofire.com.

If you choose not to proceed with the recommended works, a formal Declination of Works notice will be required.

BHO Fire & Security Ltd
Tel: 01795 123456
Email: admin@bhofire.com`;
}

export function buildEscalationMessage(notice: Partial<DefectNotice>, level: EscalationLevel): string {
  const levelText = {
    "24h_chase": "REMINDER — Acknowledgement Required",
    "14_day_notice": "FORMAL NOTICE — 14 Days Overdue",
    "30_day_notice": "FORMAL NOTICE — 30 Days Overdue",
    "60_day_notice": "NOTIFICATION OF CONTINUED NON-COMPLIANCE",
    "final_notice": "FINAL NOTICE — Legal Escalation",
  }[level] || "Fire Safety Notice";

  return `BHO Fire & Security — ${levelText}

Dear ${notice.responsible_person_name || "Responsible Person"},

This is a ${level === "60_day_notice" || level === "final_notice" ? "FORMAL " : ""}follow-up regarding the fire safety defect previously notified at your premises.

Original Notice Reference: [NOTICE-REF]
Defect Category: ${notice.defect_category}
Defect: ${notice.defect_description}

${level === "60_day_notice" || level === "final_notice"
  ? `NOTIFICATION OF CONTINUED NON-COMPLIANCE

BHO Fire & Security Ltd hereby formally notifies you that the fire safety defect identified above remains unremediated. This notice is served to confirm that:

1. BHO Fire & Security Ltd has discharged its obligation to notify you of this defect.
2. Responsibility for the unremediated defect and any consequences arising from it now rests solely with the Responsible Person named in our records.
3. This notice forms part of the immutable compliance record maintained for this premises.
4. Continued non-compliance may be reportable to the relevant Fire and Rescue Authority.

Please contact us immediately to discuss remediation options.`
  : `This defect has not yet been acknowledged/remediated. Please respond to this notice within 24 hours.

Failure to respond or remediate may result in formal escalation and notification to the relevant authority.`}

BHO Fire & Security Ltd
Tel: 01795 123456
Email: admin@bhofire.com
Date: ${new Date().toLocaleDateString("en-GB")}`;
}

// ── Supabase operations ────────────────────────────────────────────────────────

export async function createDefectNotice(
  notice: Omit<DefectNotice, "id" | "created_at">
): Promise<DefectNotice> {
  const { data, error } = await supabase
    .from("defect_notices")
    .insert(notice)
    .select()
    .single();
  if (error) throw error;
  return data as DefectNotice;
}

export async function acknowledgeDefectNotice(
  noticeId: string,
  acknowledgedBy: string,
  method: string
): Promise<void> {
  const { error } = await supabase
    .from("defect_notices")
    .update({
      acknowledgement_status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: acknowledgedBy,
      acknowledgement_method: method,
    })
    .eq("id", noticeId);
  if (error) throw error;
}

export async function sendDefectNotification(
  noticeId: string,
  channel: "email" | "whatsapp" | "both",
  message: string
): Promise<void> {
  const { error } = await supabase.functions.invoke("defect-notifications", {
    body: { noticeId, channel, message },
  });
  if (error) throw error;
}

export async function createDeclinationOfWorks(
  declination: Omit<DeclinationOfWorks, "id" | "created_at">
): Promise<DeclinationOfWorks> {
  const { data, error } = await supabase
    .from("declination_of_works")
    .insert(declination)
    .select()
    .single();
  if (error) throw error;
  return data as DeclinationOfWorks;
}

export async function getDefectNotices(defectId: string): Promise<DefectNotice[]> {
  const { data, error } = await supabase
    .from("defect_notices")
    .select("*")
    .eq("defect_id", defectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as DefectNotice[];
}

export async function getPendingEscalations(): Promise<DefectNotice[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("defect_notices")
    .select("*")
    .in("acknowledgement_status", ["pending", "overdue"])
    .lt("next_escalation_at", now)
    .order("next_escalation_at", { ascending: true });
  if (error) throw error;
  return (data || []) as DefectNotice[];
}

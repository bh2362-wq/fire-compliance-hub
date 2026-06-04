// BAFE SP203-1 v8.0.1 — handwritten types for the new tables and
// view introduced in migrations 20260604180000 (foundation) and
// 20260604200000 (extensions + alerts view). The autogen
// integrations/supabase/types.ts will pick these up the next time
// `supabase gen types typescript` is run; until then, components
// import from here.
//
// Each shape mirrors the SQL exactly — fields that are NOT NULL in
// the migration are required here, nullables are `T | null`,
// JSONB arrays are typed as discriminated unions where the shape
// is known.

export type BafeModule =
  | "design"
  | "installation"
  | "commissioning"
  | "maintenance";

export type BafeCertType =
  | "compliance"
  | "modular"
  | "maintenance"
  | "modification";

export type BafeLeadStatus = "active" | "interim" | "departed";

export type BafeAuditType =
  | "initial"
  | "first_surveillance"
  | "surveillance"
  | "special";

export type BafeAuditOutcome =
  | "pass"
  | "conditional"
  | "non_compliance"
  | "suspended";

export type BafeKpiMetric =
  | "complaints_received"
  | "defects_raised"
  | "false_alarms"
  | "certs_issued_on_time"
  | "attendance_sla_met"
  | "subcontractor_checks_current";

export type BafeDefectComplaintType = "defect" | "complaint" | "false_alarm";

// CPD record shape — flexible by design (auditors care about the
// presence of records, not a rigid schema). Each entry on
// bafe_lead_individuals.cpd_records is one of these.
export interface BafeCpdRecord {
  date: string;          // ISO date
  hours: number;
  topic: string;
  evidence_url?: string | null;
}

// ── Foundation tables (PR #1) ──────────────────────────────────────

export interface BafeLeadIndividual {
  id: string;
  user_id: string | null;
  name: string;
  module: BafeModule;
  qualification_name: string | null;
  qualification_level: string | null;
  qualification_body: string | null;
  qualification_date: string | null;
  cpd_records: BafeCpdRecord[];
  status: BafeLeadStatus;
  departed_date: string | null;
  cb_notified_date: string | null;
  replacement_deadline: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BafeDefectComplaint {
  id: string;
  visit_id: string | null;
  site_id: string | null;
  customer_id: string | null;
  type: BafeDefectComplaintType;
  reported_date: string;
  description: string | null;
  corrective_action: string | null;
  resolution_date: string | null;
  customer_prohibited_remedial: boolean;
  kpi_month: number | null;
  kpi_year: number | null;
  created_at: string;
  updated_at: string;
}

export interface BafeFalseAlarm {
  id: string;
  site_id: string | null;
  occurrence_date: string;
  cause: string | null;
  corrective_action: string | null;
  customer_notified: boolean;
  customer_prohibited_action: boolean;
  remotely_connected: boolean;
  created_at: string;
}

export interface BafeMaintenanceContract {
  id: string;
  site_id: string;
  customer_id: string | null;
  contract_start: string | null;
  contract_review: string | null;
  fault_attendance_sla_hours: number;
  arc_agreement: boolean;
  arc_provider: string | null;
  arc_cert_body: string | null;
  arc_notification_within_24h: boolean;
  spare_parts_access: boolean;
  spare_parts_unavailable_notified: boolean;
  spare_parts_notification_date: string | null;
  inherited_system: boolean;
  clause_1412_inspection_complete: boolean;
  clause_1412_inspection_date: string | null;
  clause_1412_variations_documented: boolean;
  created_at: string;
  updated_at: string;
}

export interface BafeBackupCover {
  id: string;
  backup_org_name: string;
  backup_bafe_number: string | null;
  contract_ref: string | null;
  contract_start: string | null;
  contract_expiry: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BafeKpiRecord {
  id: string;
  period_month: number;
  period_year: number;
  metric: BafeKpiMetric;
  target: number | null;
  actual: number | null;
  met: boolean | null;
  variance_notes: string | null;
  reviewed_by: string | null;
  reviewed_date: string | null;
  created_at: string;
}

export interface BafeMsReview {
  id: string;
  review_date: string;
  reviewed_by: string | null;
  changes_made: string | null;
  next_review_due: string;
  created_at: string;
}

export interface BafeSurveillanceAudit {
  id: string;
  audit_type: BafeAuditType;
  scheduled_date: string | null;
  completed_date: string | null;
  outcome: BafeAuditOutcome | null;
  non_compliance_details: string | null;
  remedial_deadline: string | null;
  remedial_completed_date: string | null;
  next_audit_due: string | null;
  certification_body: string | null;
  created_at: string;
  updated_at: string;
}

// ── Extended columns (PR #2) ───────────────────────────────────────

// Just the new columns added to site_bafe_certificates. Components
// will typically read both the existing columns (via the autogen
// Row type) and these; left as a separate interface so the autogen
// type doesn't shadow it.
export interface BafeSiteCertExtension {
  bafe_cert_type: BafeCertType | null;
  bafe_modules_covered: string[];
  completion_date: string | null;
  customer_id: string | null;
  site_address_snapshot: string | null;
  certification_body: string | null;
  bafe_registered_org_ref: string | null;
  variations_list: string | null;
  bs5839_cert_issued: boolean;
  retained_copy: boolean;
  voided: boolean;
  voided_reason: string | null;
  signed_by: string | null;
}

// Same for subcontractors — just the BAFE columns.
export interface BafeSubcontractorExtension {
  bafe_registration_number: string | null;
  bafe_modules_held: string[];
  bafe_verified_date: string | null;
  bafe_expiry_date: string | null;
  iso17065_equivalent: boolean;
  iso17065_cert_ref: string | null;
  electrical_only: boolean;
  electrical_cert_body: string | null;
  electrical_cert_ref: string | null;
  competency_notes: string | null;
}

// ── Company settings BAFE columns (PR #1) ──────────────────────────

export interface CompanySettingsBafeExtension {
  bafe_registration_number: string | null;
  bafe_registration_expiry: string | null;
  bafe_certification_body: string | null;
  bafe_cb_certificate_ref: string | null;
  bafe_primary_contact_id: string | null;
  bafe_modules_certified: BafeModule[];
  bafe_suspended: boolean;
  bafe_suspension_date: string | null;
  bafe_suspension_reason: string | null;
}

// ── Compliance alerts view (PR #2) ─────────────────────────────────

export type BafeAlertKind =
  | "lead_departed_30d"
  | "lead_gap_90d"
  | "no_lead_for_certified"
  | "cert_overdue"
  | "bs5839_cert_missing"
  | "ms_review_due"
  | "subcontractor_expired"
  | "subcontractor_expiring"
  | "backup_cover_expiring"
  | "backup_cover_missing"
  | "clause_1412_outstanding"
  | "surveillance_remedial"
  | "surveillance_overdue";

export type BafeAlertSeverity = "overdue" | "upcoming" | "outstanding";

export interface BafeComplianceAlert {
  alert_kind: BafeAlertKind;
  // subject_id is the underlying row's id when the alert is row-
  // scoped (lead, cert, sub, etc.); null for company-level alerts
  // (no_lead_for_certified, backup_cover_missing).
  subject_id: string | null;
  message: string;
  deadline: string | null;
  severity: BafeAlertSeverity;
  // detail is the per-alert payload — varies by kind. Components
  // narrow via the alert_kind discriminator.
  detail: Record<string, unknown>;
}

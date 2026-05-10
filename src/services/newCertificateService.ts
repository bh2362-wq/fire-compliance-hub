// ─── New certificate types (appended to smartFormService.ts) ─────────────────
// Import this alongside smartFormService for the new certificate types.

import { supabase } from "@/integrations/supabase/client";

// ── Shared sub-types ──────────────────────────────────────────────────────────

export interface InstallVariationEntry {
  id: string;
  description: string;
  justification: string;
  agreed_with_rp: "Yes" | "No" | "";
  bs_clause?: string;
}

export interface OutstandingWorkEntry {
  id: string;
  description: string;
  target_date?: string;
  responsibility?: string;
}

export interface CommissioningTestResult {
  item: string;
  bs_clause: string;
  result: "Pass" | "Fail" | "N/A" | "Partial" | "";
  count_tested?: number;
  count_total?: number;
  comment?: string;
}

// ── FD/02 Installation Certificate Payload ─────────────────────────────────
// Per BS 5839-1:2017+A2:2019 Annex E & BAFE SP203-1 FD/02

export interface InstallationPayload {
  // Section 1 — Header
  certificate_reference?: string;
  date_of_completion?: string;          // YYYY-MM-DD
  job_number?: string;
  contract_reference?: string;
  work_type?: "New Installation" | "Extension" | "Replacement" | "Takeover" | "";

  // Section 2 — Premises
  premises_name?: string;
  premises_address?: string;
  premises_postcode?: string;
  occupancy_type?: string;              // e.g. Office, Hotel, Healthcare

  // Section 3 — Responsible Person
  responsible_person_name?: string;
  responsible_person_position?: string;
  responsible_person_telephone?: string;
  responsible_person_email?: string;

  // Section 4 — System Details
  system_categories?: string[];         // L1-L5, M, P1, P2
  system_type?: "Addressable" | "Conventional" | "Wireless" | "Hybrid" | "";
  panel_manufacturer?: string;
  panel_model?: string;
  panel_software_version?: string;
  panel_serial_number?: string;
  number_of_zones?: number | "";
  total_devices_installed?: number | "";
  areas_covered?: string;
  areas_excluded?: string;

  // Section 5 — Installation Details
  standard_installed_to?: string;      // "BS 5839-1:2017+A2:2019" or "BS 5839-1:2025"
  cable_types_used?: string;
  standby_power_type?: string;
  battery_capacity_ah?: string;
  as_installed_drawings_provided?: "Yes" | "No" | "";
  om_manual_provided?: "Yes" | "No" | "";
  logbook_provided?: "Yes" | "No" | "";
  description_of_works?: string;

  // Section 6 — Variations from Specification
  variations_present?: "Yes" | "No" | "";
  variations?: InstallVariationEntry[];

  // Section 7 — Outstanding Works
  outstanding_works_present?: "Yes" | "No" | "";
  outstanding_works?: OutstandingWorkEntry[];

  // Section 8 — Installer Declaration
  company_name?: string;
  company_address?: string;
  fia_member_number?: string;
  bafe_registration?: string;
  engineer_name?: string;
  engineer_position?: string;
  engineer_competency_confirmed?: boolean;
  engineer_signature?: string;
  engineer_signed_date?: string;

  // Section 9 — Responsible Person Acknowledgement
  rp_acknowledgement?: "Yes" | "No" | "";
  rp_signature?: string;
  rp_signed_date?: string;
  rp_name_signed?: string;
}

// ── FD/03 Commissioning Certificate Payload ───────────────────────────────
// Per BS 5839-1:2017+A2:2019 Annex C & BAFE SP203-1 FD/03

export interface CommissioningPayload {
  // Section 1 — Header
  certificate_reference?: string;
  date_of_commissioning?: string;
  job_number?: string;
  installation_cert_ref?: string;      // links back to FD/02

  // Section 2 — Premises
  premises_name?: string;
  premises_address?: string;
  premises_postcode?: string;

  // Section 3 — Responsible Person
  responsible_person_name?: string;
  responsible_person_telephone?: string;
  responsible_person_email?: string;

  // Section 4 — System Details (mirrors installation)
  system_categories?: string[];
  system_type?: "Addressable" | "Conventional" | "Wireless" | "Hybrid" | "";
  panel_manufacturer?: string;
  panel_model?: string;
  panel_serial_number?: string;
  total_devices_on_system?: number | "";

  // Section 5 — Commissioning Test Checklist
  commissioning_tests?: CommissioningTestResult[];

  // Section 6 — Device Testing
  devices_commissioned?: number | "";
  devices_not_commissioned?: number | "";
  pct_commissioned?: number;            // computed
  devices_not_commissioned_reason?: string;

  // Section 7 — System Operational Status
  system_operational?: "Fully Operational" | "Operational with Conditions" | "Not Operational" | "";
  operational_conditions?: string;     // if conditional
  not_operational_reasons?: string;

  // Section 8 — Outstanding Items
  outstanding_items_present?: "Yes" | "No" | "";
  outstanding_items?: OutstandingWorkEntry[];

  // Section 9 — Commissioning Engineer Declaration
  company_name?: string;
  company_address?: string;
  fia_member_number?: string;
  engineer_name?: string;
  engineer_position?: string;
  engineer_competency_confirmed?: boolean;
  engineer_signature?: string;
  engineer_signed_date?: string;

  // Section 10 — Responsible Person Acknowledgement
  rp_briefed_on_operation?: "Yes" | "No" | "";
  rp_received_logbook?: "Yes" | "No" | "";
  rp_received_drawings?: "Yes" | "No" | "";
  rp_received_manual?: "Yes" | "No" | "";
  rp_name_signed?: string;
  rp_signature?: string;
  rp_signed_date?: string;
}

// ── FD/05 Modification Certificate Payload ────────────────────────────────
// Per BS 5839-1:2017+A2:2019 Annex F & BAFE SP203-1 FD/05
// Issued for any alteration to an existing certified system.

export type ModificationReason =
  | "Extension of coverage"
  | "Change of occupancy"
  | "False alarm reduction"
  | "System upgrade"
  | "Panel replacement"
  | "Device replacement"
  | "Zone reconfiguration"
  | "Addition of ancillary"
  | "Other";

export interface ModificationPayload {
  // Section 1 — Header
  certificate_reference?: string;
  date_of_modification?: string;
  job_number?: string;

  // Section 2 — Premises
  premises_name?: string;
  premises_address?: string;
  premises_postcode?: string;

  // Section 3 — Responsible Person
  responsible_person_name?: string;
  responsible_person_telephone?: string;
  responsible_person_email?: string;

  // Section 4 — Existing System References
  original_installation_cert_ref?: string;
  original_commissioning_cert_ref?: string;
  previous_modification_cert_ref?: string;
  existing_system_category?: string[];
  existing_panel_manufacturer?: string;
  existing_panel_model?: string;

  // Section 5 — Modification Details
  reason_for_modification?: ModificationReason | "";
  reason_other?: string;
  description_of_modifications?: string;

  // What was done (check all that apply)
  devices_added?: "Yes" | "No" | "";
  devices_added_count?: number | "";
  devices_removed?: "Yes" | "No" | "";
  devices_removed_count?: number | "";
  zones_added?: "Yes" | "No" | "";
  zones_added_count?: number | "";
  zones_removed?: "Yes" | "No" | "";
  zones_removed_count?: number | "";
  panel_changes?: "Yes" | "No" | "";
  panel_changes_description?: string;
  cable_additions?: "Yes" | "No" | "";
  cable_additions_description?: string;
  ancillary_changes?: "Yes" | "No" | "";
  ancillary_description?: string;

  // Section 6 — System After Modification
  system_category_changed?: "Yes" | "No" | "";
  new_system_category?: string[];
  areas_affected?: string;
  standard_modified_to?: string;        // "BS 5839-1:2017+A2:2019" or "BS 5839-1:2025"
  cable_types_used?: string;

  // Section 7 — Post-Modification Commissioning Tests
  post_mod_tests?: CommissioningTestResult[];
  new_devices_tested?: number | "";
  modified_devices_tested?: number | "";

  // Section 8 — Variations
  variations_present?: "Yes" | "No" | "";
  variations?: InstallVariationEntry[];

  // Section 9 — Outstanding Works
  outstanding_works_present?: "Yes" | "No" | "";
  outstanding_works?: OutstandingWorkEntry[];

  // Section 10 — Post-Modification System Status
  system_status?: "Satisfactory" | "Satisfactory with Observations" | "Unsatisfactory" | "";
  final_remarks?: string;

  // Section 11 — Engineer Declaration
  company_name?: string;
  company_address?: string;
  fia_member_number?: string;
  engineer_name?: string;
  engineer_position?: string;
  engineer_competency_confirmed?: boolean;
  engineer_signature?: string;
  engineer_signed_date?: string;

  // Section 12 — Responsible Person Acknowledgement
  rp_name_signed?: string;
  rp_signature?: string;
  rp_signed_date?: string;
}

// ── Default commissioning test checklist per BS 5839-1:2025 Annex C ─────────
export const DEFAULT_COMMISSIONING_TESTS: CommissioningTestResult[] = [
  { item: "All manual call points functionally tested", bs_clause: "Cl. 45.2", result: "" },
  { item: "All automatic detectors functionally tested", bs_clause: "Cl. 45.3", result: "" },
  { item: "All audible alarm devices operated", bs_clause: "Cl. 45.4", result: "" },
  { item: "All visual alarm devices operated", bs_clause: "Cl. 45.4", result: "" },
  { item: "Cause and effect confirmed in full", bs_clause: "Cl. 45.5", result: "" },
  { item: "All ancillary control outputs tested", bs_clause: "Cl. 45.6", result: "" },
  { item: "Standby power supply tested", bs_clause: "Cl. 45.7", result: "" },
  { item: "Battery capacity calculated and verified", bs_clause: "Cl. 26", result: "" },
  { item: "False alarm management features configured", bs_clause: "Cl. 45.8", result: "" },
  { item: "System log book completed and handed over", bs_clause: "Cl. 13.1", result: "" },
  { item: "As-installed drawings provided to responsible person", bs_clause: "Cl. 13.2", result: "" },
  { item: "Operation and maintenance manual provided", bs_clause: "Cl. 13.3", result: "" },
  { item: "Responsible person instructed on operation", bs_clause: "Cl. 13.4", result: "" },
  { item: "Responsible person instructed on routine testing", bs_clause: "Cl. 34", result: "" },
  { item: "Monitoring centre (if applicable) notified and confirmed", bs_clause: "Cl. 9.3", result: "" },
];

export const DEFAULT_POST_MOD_TESTS: CommissioningTestResult[] = [
  { item: "New/modified manual call points tested", bs_clause: "Cl. 45.2", result: "" },
  { item: "New/modified automatic detectors tested", bs_clause: "Cl. 45.3", result: "" },
  { item: "New/modified alarm devices operated", bs_clause: "Cl. 45.4", result: "" },
  { item: "Cause and effect confirmed for modified zones", bs_clause: "Cl. 45.5", result: "" },
  { item: "Modified ancillary control outputs tested", bs_clause: "Cl. 45.6", result: "" },
  { item: "Battery capacity re-verified after modification", bs_clause: "Cl. 26", result: "" },
  { item: "No degradation to unmodified parts of system", bs_clause: "Cl. 46.2", result: "" },
  { item: "System log book updated", bs_clause: "Cl. 13.1", result: "" },
  { item: "As-installed drawings updated", bs_clause: "Cl. 13.2", result: "" },
  { item: "Responsible person informed of modification", bs_clause: "Cl. 46.3", result: "" },
];

// ── DB helpers ────────────────────────────────────────────────────────────────

export interface NewCertSubmission {
  form_type: "bs5839_installation" | "bs5839_commissioning" | "bs5839_modification";
  payload: InstallationPayload | CommissioningPayload | ModificationPayload;
  visit_id?: string | null;
  site_id?: string | null;
  customer_id?: string | null;
  job_number?: string | null;
  user_id: string;
  engineer_id: string;
}

export async function createNewCertSubmission(data: NewCertSubmission) {
  const { data: row, error } = await supabase
    .from("smart_form_submissions")
    .insert({
      form_type: data.form_type,
      payload: data.payload as any,
      status: "draft",
      visit_id: data.visit_id ?? null,
      site_id: data.site_id ?? null,
      customer_id: data.customer_id ?? null,
      job_number: data.job_number ?? null,
      user_id: data.user_id,
      engineer_id: data.engineer_id,
    })
    .select()
    .single();
  if (error) throw error;
  return row;
}

export async function updateNewCertSubmission(
  id: string,
  updates: { payload?: any; status?: string; completed_at?: string | null }
) {
  const { data, error } = await supabase
    .from("smart_form_submissions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Validation helpers ────────────────────────────────────────────────────────

export interface CertError { step: number; message: string; }

export function validateInstallation(p: InstallationPayload): CertError[] {
  const e: CertError[] = [];
  if (!p.date_of_completion) e.push({ step: 1, message: "Date of completion required" });
  if (!p.work_type) e.push({ step: 1, message: "Work type required" });
  if (!p.premises_name) e.push({ step: 2, message: "Premises name required" });
  if (!p.premises_address) e.push({ step: 2, message: "Premises address required" });
  if (!p.responsible_person_name) e.push({ step: 3, message: "Responsible person name required" });
  if (!p.system_categories?.length) e.push({ step: 4, message: "System category required" });
  if (!p.description_of_works?.trim()) e.push({ step: 5, message: "Description of works required" });
  if (!p.engineer_name) e.push({ step: 8, message: "Engineer name required" });
  if (!p.engineer_competency_confirmed) e.push({ step: 8, message: "Competency declaration required" });
  return e;
}

export function validateCommissioning(p: CommissioningPayload): CertError[] {
  const e: CertError[] = [];
  if (!p.date_of_commissioning) e.push({ step: 1, message: "Date of commissioning required" });
  if (!p.premises_name) e.push({ step: 2, message: "Premises name required" });
  if (!p.premises_address) e.push({ step: 2, message: "Premises address required" });
  if (!p.responsible_person_name) e.push({ step: 3, message: "Responsible person name required" });
  if (!p.system_categories?.length) e.push({ step: 4, message: "System category required" });
  if (!p.system_operational) e.push({ step: 7, message: "System operational status required" });
  if (!p.engineer_name) e.push({ step: 9, message: "Engineer name required" });
  if (!p.engineer_competency_confirmed) e.push({ step: 9, message: "Competency declaration required" });
  return e;
}

export function validateModification(p: ModificationPayload): CertError[] {
  const e: CertError[] = [];
  if (!p.date_of_modification) e.push({ step: 1, message: "Date of modification required" });
  if (!p.premises_name) e.push({ step: 2, message: "Premises name required" });
  if (!p.premises_address) e.push({ step: 2, message: "Premises address required" });
  if (!p.reason_for_modification) e.push({ step: 5, message: "Reason for modification required" });
  if (!p.description_of_modifications?.trim()) e.push({ step: 5, message: "Description of works required" });
  if (!p.system_status) e.push({ step: 10, message: "Post-modification status required" });
  if (!p.engineer_name) e.push({ step: 11, message: "Engineer name required" });
  if (!p.engineer_competency_confirmed) e.push({ step: 11, message: "Competency declaration required" });
  return e;
}

// ── Additional helpers added for cert tracker integration ─────────────────────

const FORM_TO_BAFE_TYPE: Record<string, string> = {
  "bs5839_installation":        "installation",
  "bs5839_commissioning":       "commissioning",
  "bs5839_modification":        "design",       // closest existing BAFE enum value
  "bs5839_inspection_servicing":"maintenance",
};

/**
 * Check if a completed cert already exists for this job+type+site.
 * Returns the existing submission if a duplicate is found, null otherwise.
 */
export async function checkDuplicateJobCert(
  siteId: string,
  formType: string,
  jobNumber: string | null | undefined
): Promise<{ id: string; certificate_reference: string } | null> {
  if (!jobNumber?.trim() || !siteId) return null;
  const { data } = await supabase
    .from("smart_form_submissions")
    .select("id, certificate_reference")
    .eq("site_id", siteId)
    .eq("form_type", formType)
    .eq("job_number", jobNumber.trim())
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();
  return (data as { id: string; certificate_reference: string } | null) ?? null;
}

/**
 * On cert completion, write a corresponding entry to site_bafe_certificates
 * so the site page BAFE section and cert tracker stay in sync.
 * Safe to call multiple times — checks for existing linked entry first.
 */
export async function autoRegisterCertToSite(
  submissionId: string,
  siteId: string,
  formType: string,
  certRef: string,
  issuedDate: string,
  engineerId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const bafeType = FORM_TO_BAFE_TYPE[formType];
  if (!bafeType || !siteId) return;

  // Avoid duplicates — skip if already linked
  const { data: existing } = await supabase
    .from("site_bafe_certificates")
    .select("id")
    .eq("linked_form_submission_id", submissionId)
    .maybeSingle();
  if (existing) return;

  await supabase.from("site_bafe_certificates").insert({
    site_id: siteId,
    certificate_type: bafeType,
    certificate_number: certRef,
    issued_date: issuedDate,
    issued_by: engineerId,
    expiry_date: null,
    linked_form_submission_id: submissionId,
    status: "valid",
    notes: `Auto-registered from ${formType.replace(/_/g, " ")} smart form`,
  } as any);
}

/**
 * Fetch the most recent completed smart form submission of the given type
 * for a site, and return its payload — used to prefill the next cert of the
 * same type with the previously captured system details.
 */
export async function getLastCertPayload(
  siteId: string,
  formType: string
): Promise<Record<string, unknown> | null> {
  if (!siteId || !formType) return null;
  const { data } = await supabase
    .from("smart_form_submissions")
    .select("payload, certificate_reference, completed_at")
    .eq("site_id", siteId)
    .eq("form_type", formType)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return data.payload as Record<string, unknown>;
}

/**
 * Fetch all completed smart form submissions for a site, grouped by form type.
 * Used by the site page to display issued certs.
 */
export async function getSiteCerts(siteId: string): Promise<{
  id: string;
  form_type: string;
  certificate_reference: string;
  completed_at: string | null;
  job_number: string | null;
  payload: Record<string, unknown>;
}[]> {
  const { data, error } = await supabase
    .from("smart_form_submissions")
    .select("id, form_type, certificate_reference, completed_at, job_number, payload")
    .eq("site_id", siteId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any[];
}

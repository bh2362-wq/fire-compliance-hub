import { supabase } from "@/integrations/supabase/client";

// ── Enums ──────────────────────────────────────────────────────────────────────

export type ELFormType = "commissioning" | "periodic" | "monthly_log" | "annual_discharge";
export type ELSystemType = "Self-contained" | "Central battery" | "Generator" | "Combined";
export type ELMode = "Non-maintained" | "Maintained" | "Combined" | "Sustained";
export type ELDuration = "1 hour" | "3 hours" | "Other";
export type ELResult = "✓" | "7" | "N/A"; // BS 5266 notation: ✓=satisfactory, 7=deviation, N/A

export const EL_CATEGORIES = [
  "Escape route lighting",
  "Open area (anti-panic) lighting",
  "High risk task area lighting",
  "Standby lighting",
] as const;

// EPM6C checklist items — Annex M of BS 5266-1:2016
export interface EPMChecklistItem {
  clause: string;
  description: string;
  result: ELResult;
  notes: string;
}

export const EPM_CHECKLIST_ITEMS: Omit<EPMChecklistItem, "result" | "notes">[] = [
  { clause: "1",  description: "Emergency luminaires and signs correctly positioned as per design drawings" },
  { clause: "2",  description: "Adequate illumination provided under test conditions for safe movement on escape routes and open areas" },
  { clause: "3",  description: "Emergency signs correctly positioned and visible" },
  { clause: "4",  description: "All luminaires and signs appear to be in good working order" },
  { clause: "5",  description: "Self-contained luminaires: batteries appear to be in good condition and of the correct capacity" },
  { clause: "6",  description: "Central battery system: battery in good condition and of correct capacity" },
  { clause: "7",  description: "Central battery system: battery charger operational and of correct specification" },
  { clause: "8",  description: "Central battery system: control panel in good order; all indicators correct" },
  { clause: "9",  description: "Wiring system adequate and appropriately protected against fire" },
  { clause: "10", description: "Final circuit wiring of non-maintained luminaires taken from the local lighting circuit" },
  { clause: "11", description: "Duration test carried out — all luminaires operated for full rated duration without failure" },
  { clause: "12", description: "Emergency lighting operated satisfactorily under test conditions" },
  { clause: "13", description: "Test switch or automatic test facilities correctly labelled and operational" },
  { clause: "14", description: "No luminaire subjected to conditions (temperature, humidity, voltage) outside its rating" },
  { clause: "15", description: "Exit signs and directional signs in good condition, correctly sited and legible" },
  { clause: "16", description: "System design documentation (as-fitted drawings, photometric data) available on site" },
  { clause: "17", description: "Log book showing satisfactory commissioning test available" },
  { clause: "18", description: "Log book showing record of monthly and annual tests available and up to date" },
  { clause: "19", description: "Remedial action from previous inspection has been completed" },
  { clause: "20", description: "Responsible person and their staff trained on monthly test procedures; or maintenance contract in place" },
  { clause: "21", description: "Central Battery System: evidence of servicing in line with manufacturer's procedures" },
  { clause: "22", description: "Standby Generator System: evidence of servicing in line with manufacturer's procedures" },
];

// Monthly log entry
export interface ELMonthlyEntry {
  id: string;
  test_date: string;
  test_month: string;         // e.g. "January 2026"
  test_type: "Manual" | "Automatic";
  duration_mins: number;      // functional test duration (typically 1/4 to 1/3 rated duration)
  total_luminaires: number;
  pass_count: number;
  fail_count: number;
  defects_noted: string;
  interim_measures: string;
  remedial_actions: string;
  engineer_name: string;
  result: "Satisfactory" | "Unsatisfactory";
}

// Annual discharge test entry
export interface ELAnnualEntry {
  id: string;
  test_date: string;
  duration_hours: number;     // full rated duration (1hr or 3hr)
  duration_achieved_hours: number;
  total_luminaires: number;
  pass_count: number;
  fail_count: number;
  fail_locations: string;
  defects: string;
  recharge_period_noted: boolean;
  recharge_hours: number;
  engineer_name: string;
  engineer_signature: string;
  result: "Satisfactory" | "Unsatisfactory";
}

// ── Main payload ───────────────────────────────────────────────────────────────

export interface ELPayload {
  // Section 1: Type and premises
  form_type: ELFormType;
  cert_reference: string;
  cert_date: string;
  next_inspection_date: string;

  // Section 2: Premises
  premises_name: string;
  premises_address: string;
  premises_postcode: string;
  responsible_person: string;
  responsible_email: string;
  responsible_phone: string;
  occupancy_type: string;

  // Section 3: System details
  system_type: ELSystemType;
  system_mode: ELMode;
  duration_rating: ELDuration;
  duration_other: string;
  total_luminaires: number;
  total_exit_signs: number;
  categories: string[];                // which categories present
  has_central_battery: boolean;
  has_generator: boolean;
  has_automatic_testing: boolean;
  logbook_on_site: boolean;
  previous_cert_date: string;
  eicr_reference: string;              // Electrical Installation Condition Report ref

  // Section 4: Commissioning specific (form_type === "commissioning")
  design_basis: string;               // ICEL 1001 / CIBSE LG12 / calculations
  photometric_data_format: string;
  installation_conforms_bs7671: boolean;
  handover_training_given: boolean;
  handover_training_notes: string;

  // Section 5: Periodic inspection (Annex M / EPM6C)
  checklist: EPMChecklistItem[];
  deviations_summary: string;

  // Section 6: Monthly test log
  monthly_entries: ELMonthlyEntry[];

  // Section 7: Annual discharge test
  annual_entries: ELAnnualEntry[];

  // Section 8: Defects and recommendations
  defects: Array<{
    id: string;
    location: string;
    description: string;
    priority: "Urgent" | "Routine";
    remediated: boolean;
    remediation_date: string;
  }>;

  // Section 9: Status and declaration
  overall_status: "Satisfactory" | "Satisfactory with observations" | "Unsatisfactory";
  status_notes: string;
  standard_references: string;
  engineer_name: string;
  engineer_company: string;
  engineer_signature: string;
  engineer_date: string;
  client_name: string;
  client_signature: string;
  client_date: string;
  recommendation_interval_months: number;
}

// ── Empty payload ──────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

export function buildEmptyELPayload(formType: ELFormType = "periodic"): ELPayload {
  return {
    form_type: formType,
    cert_reference: "",
    cert_date: new Date().toISOString().split("T")[0],
    next_inspection_date: "",
    premises_name: "",
    premises_address: "",
    premises_postcode: "",
    responsible_person: "",
    responsible_email: "",
    responsible_phone: "",
    occupancy_type: "",
    system_type: "Self-contained",
    system_mode: "Non-maintained",
    duration_rating: "3 hours",
    duration_other: "",
    total_luminaires: 0,
    total_exit_signs: 0,
    categories: ["Escape route lighting"],
    has_central_battery: false,
    has_generator: false,
    has_automatic_testing: false,
    logbook_on_site: false,
    previous_cert_date: "",
    eicr_reference: "",
    design_basis: "",
    photometric_data_format: "",
    installation_conforms_bs7671: false,
    handover_training_given: false,
    handover_training_notes: "",
    checklist: EPM_CHECKLIST_ITEMS.map(item => ({ ...item, result: "N/A" as ELResult, notes: "" })),
    deviations_summary: "",
    monthly_entries: [],
    annual_entries: [],
    defects: [],
    overall_status: "Satisfactory",
    status_notes: "",
    standard_references: "BS 5266-1:2016 | BS EN 50172:2004/BS 5266-8:2004 | BS EN 1838:2013",
    engineer_name: "",
    engineer_company: "",
    engineer_signature: "",
    engineer_date: new Date().toISOString().split("T")[0],
    client_name: "",
    client_signature: "",
    client_date: new Date().toISOString().split("T")[0],
    recommendation_interval_months: 12,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function createMonthlyEntry(): ELMonthlyEntry {
  const now = new Date();
  return {
    id: uid(),
    test_date: now.toISOString().split("T")[0],
    test_month: now.toLocaleString("en-GB", { month: "long", year: "numeric" }),
    test_type: "Manual",
    duration_mins: 5,
    total_luminaires: 0,
    pass_count: 0,
    fail_count: 0,
    defects_noted: "",
    interim_measures: "",
    remedial_actions: "",
    engineer_name: "",
    result: "Satisfactory",
  };
}

export function createAnnualEntry(): ELAnnualEntry {
  return {
    id: uid(),
    test_date: new Date().toISOString().split("T")[0],
    duration_hours: 3,
    duration_achieved_hours: 0,
    total_luminaires: 0,
    pass_count: 0,
    fail_count: 0,
    fail_locations: "",
    defects: "",
    recharge_period_noted: false,
    recharge_hours: 24,
    engineer_name: "",
    engineer_signature: "",
    result: "Satisfactory",
  };
}

// ── Validation ─────────────────────────────────────────────────────────────────

export interface ELValidationError { step: number; message: string; }

export function validateELPayload(p: ELPayload): ELValidationError[] {
  const e: ELValidationError[] = [];
  if (!p.cert_reference) e.push({ step: 0, message: "Certificate reference required" });
  if (!p.premises_name)  e.push({ step: 1, message: "Premises name required" });
  if (p.total_luminaires <= 0) e.push({ step: 2, message: "Total luminaires must be greater than 0" });
  if (!p.engineer_name)  e.push({ step: 8, message: "Engineer name required" });
  if (!p.engineer_signature) e.push({ step: 8, message: "Engineer signature required" });
  return e;
}

// ── Supabase CRUD ──────────────────────────────────────────────────────────────

export async function createELSubmission(
  payload: ELPayload,
  opts: { siteId?: string; customerId?: string; visitId?: string; userId: string }
) {
  const { data, error } = await supabase.from("smart_form_submissions").insert({
    form_type: `emergency_lighting_${payload.form_type}`,
    certificate_reference: payload.cert_reference || null,
    status: "draft",
    payload: payload as any,
    site_id: opts.siteId || null,
    customer_id: opts.customerId || null,
    visit_id: opts.visitId || null,
    created_by: opts.userId,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateELSubmission(id: string, payload: ELPayload, status = "draft") {
  const { data, error } = await supabase.from("smart_form_submissions").update({
    payload: payload as any,
    status,
    certificate_reference: payload.cert_reference || null,
    completed_at: status === "completed" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

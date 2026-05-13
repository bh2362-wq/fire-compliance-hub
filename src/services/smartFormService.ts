import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SmartFormStatus = "draft" | "completed" | "signed";
export type SmartFormType = "bs5839_inspection_servicing";

/** Strongly-typed payload for the BS 5839-1:2025 Inspection & Servicing Certificate. */
export interface BS5839Payload {
  // STEP 1 — Header
  certificate_reference?: string;
  certificate_type?: string; // fixed
  date_of_service?: string; // YYYY-MM-DD
  job_number?: string;

  // STEP 2 — Premises
  premises_name?: string;
  premises_address?: string;
  responsible_person_name?: string;
  responsible_person_contact?: string;
  site_contact?: string;

  // STEP 3 — System
  system_categories?: string[]; // M, L1...P2
  system_type?: "Addressable" | "Conventional" | "Wireless" | "Hybrid" | "";
  panel_manufacturer?: string;
  panel_model?: string;
  number_of_panels?: number | "";
  approx_number_of_devices?: number | "";
  areas_covered?: string;
  system_limitations?: string;

  // STEP 4 — Service Org
  company_name?: string;
  company_address?: string;
  engineer_name?: string;
  engineer_competency_confirmed?: boolean;

  // STEP 5 — Checklist
  checklist?: ChecklistItem[];

  // STEP 6 — Device testing
  total_devices?: number | "";
  devices_tested?: number | "";
  testing_method?: "25%" | "50%" | "100%" | "Risk-based" | "Other" | "";
  testing_method_other?: string;
  devices_not_tested?: string;
  reason_not_tested?: string;

  // STEP 7 — Standby power
  battery_type?: string;
  battery_age_years?: number | "";
  battery_voltage?: string;
  charger_voltage?: string;
  charger_operational?: "Yes" | "No" | "";
  battery_capacity_adequate?: "Yes" | "No" | "Unable to Verify" | "";
  test_method?: string;
  test_device?: string; // pre-filled
  test_device_serial?: string; // pre-filled

  // STEP 8 — False alarm record
  false_alarm_count?: number | "";
  false_alarm_causes?: string;
  false_alarm_actions?: string;
  false_alarm_recommendations?: string;

  // STEP 9 — Defects (repeatable)
  defects?: DefectEntry[];

  // STEP 10 — Variations
  variations_present?: "Yes" | "No" | "";
  variations?: VariationEntry[];

  // STEP 11 — System status
  overall_status?: "Satisfactory" | "Satisfactory with Observations" | "Unsatisfactory" | "";
  final_remarks?: string;

  // STEP 12 — Engineer declaration
  engineer_declaration_name?: string;
  engineer_signature?: string; // dataURL or "typed:Name"
  engineer_signed_date?: string;

  // STEP 13 — Client acknowledgement
  client_name?: string;
  client_signature?: string;
  client_signed_date?: string;
}

export interface ChecklistItem {
  key: string;
  label: string;
  status: "Pass" | "Fail" | "N/A" | "";
  comment?: string;
}

export interface DefectEntry {
  id: string;
  location: string;
  description: string;
  severity: "Critical" | "Major" | "Minor" | "Advisory" | "";
  bs_reference?: string;
  recommended_action: string;
  photo_url?: string;
  _register_id?: string;   // set when imported from site_defects register
  status: "Open" | "Closed" | "Requires Quote" | "";
}

export interface VariationEntry {
  id: string;
  description: string;
  justification: string;
  agreed_with_responsible_person: "Yes" | "No" | "";
}

export interface SmartFormSubmission {
  id: string;
  form_type: SmartFormType;
  certificate_reference: string;
  status: SmartFormStatus;
  payload: BS5839Payload;
  visit_id: string | null;
  customer_id: string | null;
  site_id: string | null;
  job_number: string | null;
  engineer_id: string | null;
  completed_at: string | null;
  pdf_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Default builders ────────────────────────────────────────────────────────

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { key: "panel_condition", label: "Control panel condition satisfactory", status: "" },
  { key: "indicators", label: "All indicators functioning correctly", status: "" },
  { key: "logbook", label: "Logbook present and up to date", status: "" },
  { key: "environment", label: "No obvious environmental issues affecting system", status: "" },
  { key: "mcps", label: "Manual call points tested", status: "" },
  { key: "detectors", label: "Automatic detectors tested", status: "" },
  { key: "sounders_vads", label: "Sounders and VADs tested", status: "" },
  { key: "interfaces", label: "Interfaces (doors, lifts, plant) tested", status: "" },
  { key: "fire_signal", label: "Fire signal transmission tested (if applicable)", status: "" },
  { key: "previous_faults", label: "Any previous faults reviewed", status: "" },
];

export function buildEmptyPayload(): BS5839Payload {
  return {
    certificate_type: "Inspection & Servicing",
    date_of_service: new Date().toISOString().slice(0, 10),
    company_name: "BHO Fire Ltd",
    system_categories: [],
    system_type: "",
    engineer_competency_confirmed: false,
    checklist: DEFAULT_CHECKLIST.map((c) => ({ ...c })),
    testing_method: "",
    charger_operational: "",
    battery_capacity_adequate: "",
    test_device: "ACT Chrome",
    test_device_serial: "813AK1203058",
    defects: [],
    variations_present: "",
    variations: [],
    overall_status: "",
    engineer_signed_date: new Date().toISOString().slice(0, 10),
    client_signed_date: new Date().toISOString().slice(0, 10),
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createSmartFormSubmission(args: {
  form_type?: SmartFormType;
  payload: BS5839Payload;
  visit_id?: string | null;
  customer_id?: string | null;
  site_id?: string | null;
  job_number?: string | null;
  engineer_id?: string | null;
  user_id: string;
}): Promise<SmartFormSubmission> {
  // Generate a unique cert reference via DB function
  const { data: refData, error: refErr } = await supabase.rpc("get_next_smart_form_cert_ref", {
    p_form_type: args.form_type ?? "bs5839_inspection_servicing",
  });
  if (refErr) throw refErr;
  const certRef = refData as string;

  const payloadWithRef = { ...args.payload, certificate_reference: certRef };

  const { data, error } = await supabase
    .from("smart_form_submissions")
    .insert({
      form_type: args.form_type ?? "bs5839_inspection_servicing",
      certificate_reference: certRef,
      status: "draft",
      payload: payloadWithRef as unknown as never,
      visit_id: args.visit_id ?? null,
      customer_id: args.customer_id ?? null,
      site_id: args.site_id ?? null,
      job_number: args.job_number ?? null,
      engineer_id: args.engineer_id ?? null,
      created_by: args.user_id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as SmartFormSubmission;
}

export async function updateSmartFormSubmission(
  id: string,
  patch: Partial<{
    payload: BS5839Payload;
    status: SmartFormStatus;
    job_number: string | null;
    visit_id: string | null;
    customer_id: string | null;
    site_id: string | null;
    completed_at: string | null;
    pdf_url: string | null;
  }>
): Promise<SmartFormSubmission> {
  const dbPatch: Record<string, unknown> = { ...patch };
  if (patch.payload) dbPatch.payload = patch.payload as unknown as never;

  const { data, error } = await supabase
    .from("smart_form_submissions")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as SmartFormSubmission;
}

export async function getSmartFormSubmissions(
  filter?: { form_type?: SmartFormType; visit_id?: string; site_id?: string; customer_id?: string }
): Promise<SmartFormSubmission[]> {
  let q = supabase
    .from("smart_form_submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (filter?.form_type) q = q.eq("form_type", filter.form_type);
  if (filter?.visit_id) q = q.eq("visit_id", filter.visit_id);
  if (filter?.site_id) q = q.eq("site_id", filter.site_id);
  if (filter?.customer_id) q = q.eq("customer_id", filter.customer_id);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as SmartFormSubmission[];
}

export async function getSmartFormSubmission(id: string): Promise<SmartFormSubmission | null> {
  const { data, error } = await supabase
    .from("smart_form_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as SmartFormSubmission | null;
}

export async function deleteSmartFormSubmission(id: string): Promise<void> {
  const { error } = await supabase.from("smart_form_submissions").delete().eq("id", id);
  if (error) throw error;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface StepError {
  step: number;
  message: string;
}

export function validatePayload(payload: BS5839Payload): StepError[] {
  const errors: StepError[] = [];

  if (!payload.date_of_service) errors.push({ step: 1, message: "Date of service is required" });

  if (!payload.premises_name) errors.push({ step: 2, message: "Premises name is required" });
  if (!payload.premises_address) errors.push({ step: 2, message: "Premises address is required" });
  if (!payload.responsible_person_name)
    errors.push({ step: 2, message: "Responsible person name is required" });

  if (!payload.system_categories || payload.system_categories.length === 0)
    errors.push({ step: 3, message: "System category must be selected" });

  if (!payload.engineer_name) errors.push({ step: 4, message: "Engineer name is required" });
  if (!payload.engineer_competency_confirmed)
    errors.push({ step: 4, message: "Engineer competency confirmation required" });

  const checklist = payload.checklist ?? [];
  checklist.forEach((c, idx) => {
    if (!c.status) errors.push({ step: 5, message: `Checklist item ${idx + 1} (${c.label}) is blank` });
    if (c.status === "Fail" && !c.comment?.trim())
      errors.push({ step: 5, message: `Comment required for failed item: ${c.label}` });
  });

  const total = Number(payload.total_devices) || 0;
  const tested = Number(payload.devices_tested) || 0;
  if (!payload.total_devices && payload.total_devices !== 0)
    errors.push({ step: 6, message: "Total devices on system is required" });
  if (!payload.devices_tested && payload.devices_tested !== 0)
    errors.push({ step: 6, message: "Devices tested is required" });
  if (tested > total) errors.push({ step: 6, message: "Devices tested cannot exceed total devices" });
  if (!payload.testing_method) errors.push({ step: 6, message: "Testing method is required" });

  if (payload.variations_present === "Yes" && (payload.variations ?? []).length === 0)
    errors.push({ step: 10, message: "At least one variation entry is required" });

  if (!payload.overall_status) errors.push({ step: 11, message: "Overall system status is required" });
  if (!payload.final_remarks?.trim()) errors.push({ step: 11, message: "Final remarks are required" });

  return errors;
}

export function percentageTested(payload: BS5839Payload): number {
  const total = Number(payload.total_devices) || 0;
  const tested = Number(payload.devices_tested) || 0;
  if (total <= 0) return 0;
  return Math.round((tested / total) * 100);
}

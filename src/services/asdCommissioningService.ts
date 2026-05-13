import { supabase } from "@/integrations/supabase/client";

// ── Enums ──────────────────────────────────────────────────────────────────────

export type ASDInstallationType = "new" | "modification";
export type ASDClass = "A" | "B" | "C";
export type ASDTestResult = "Pass" | "Fail" | "N/A";

export const ASD_MANUFACTURERS = [
  "Xtralis (VESDA)", "Xtralis (ICAM)", "Wagner TITANUS",
  "Zeta CAST", "Siemens FAAST", "Fike FiboDAT",
  "Hochiki", "Napco / Telgian", "Other",
] as const;

export const ASD_PIPE_MATERIALS = [
  "ABS (white)", "ABS (red)", "CPVC", "UPVC",
  "Copper", "Stainless Steel", "Other",
] as const;

export const ASD_PANEL_TYPES = [
  "Conventional zone", "Addressable — SCI",
  "Addressable — contact input", "Standalone display",
  "Networked system", "Other",
] as const;

// ── Transport time limits per class ───────────────────────────────────────────
export const TRANSPORT_TIME_LIMITS: Record<ASDClass, number> = {
  A: 60,  // seconds
  B: 90,
  C: 120,
};

// ── Payload ────────────────────────────────────────────────────────────────────

export interface ASDPipeRecord {
  id: string;
  pipe_reference: string;        // e.g. "Pipe 1 - Server Room A"
  design_flow_lpm: number;       // litres per minute — design value
  measured_flow_lpm: number;     // measured at commissioning
  within_20_percent: boolean;    // auto-calculated
  notes: string;
}

export interface ASDAlarmThreshold {
  level: "Alert" | "Action" | "Fire1" | "Fire2";
  set_value_obs: string;         // obscuration value e.g. "0.05 dB/m"
  test_result: ASDTestResult;
  notes: string;
}

export interface ASDPayload {
  // Step 1: Installation type
  installation_type: ASDInstallationType;
  cert_reference: string;
  cert_date: string;

  // Step 2: Premises
  premises_name: string;
  premises_address: string;
  premises_postcode: string;
  responsible_person: string;
  responsible_email: string;

  // Step 3: System details
  asd_manufacturer: string;
  asd_model: string;
  asd_serial_number: string;
  software_version: string;
  sensitivity_class: ASDClass;
  num_pipes: number;
  num_sampling_holes: number;
  pipe_material: string;
  protected_area: string;
  design_software_used: string;
  transport_time_limit: number;  // seconds (auto-set from class)

  // Step 4: Pre-modification record (modification only)
  pre_mod_config_description: string;
  modification_description: string;
  areas_affected: string;
  pre_mod_flow_documented: boolean;
  pre_mod_threshold_documented: boolean;

  // Step 5: Pre-commissioning inspection
  area_final_state: boolean;         // AC running, floors/ceilings intact
  pipework_visually_inspected: boolean;
  pipework_labelled: boolean;
  sampling_holes_open: boolean;
  sampling_holes_count_verified: boolean;
  filter_installed: boolean;
  test_points_identified: boolean;
  detector_accessible: boolean;
  pre_commission_notes: string;

  // Step 6: Pipe integrity test
  integrity_test_method: "Pressure" | "Vacuum" | "Smoke" | "N/A";
  integrity_test_pressure_pa: number;
  integrity_test_duration_mins: number;
  integrity_test_result: ASDTestResult;
  integrity_test_notes: string;

  // Step 7: Flow rate verification
  pipe_records: ASDPipeRecord[];
  flow_normalisation_performed: boolean;
  flow_normalisation_access_level: string;

  // Step 8: Transport time test
  furthest_hole_location: string;
  transport_time_measured_s: number;
  transport_time_pass: boolean;
  transport_time_test_method: string;  // "Calibrated aerosol" | "Canned smoke" | "Other"
  transport_time_notes: string;

  // Step 9: Alarm thresholds
  thresholds: ASDAlarmThreshold[];
  sensitivity_test_method: string;    // "Calibrated test aerosol" | "Manufacturer tool" | "Other"
  all_thresholds_pass: boolean;

  // Step 10: Airflow fault test
  airflow_fault_test_performed: boolean;
  low_flow_fault_indicated: boolean;
  low_flow_fault_time_s: number;      // time to fault indication
  single_hole_blockage_tested: boolean;
  single_hole_result: ASDTestResult;
  airflow_fault_notes: string;

  // Panel integration
  panel_manufacturer: string;
  panel_model: string;
  panel_zone_address: string;
  alert_signal_tested: boolean;
  action_signal_tested: boolean;
  fire1_signal_tested: boolean;
  fire2_signal_tested: boolean;
  isolate_disable_tested: boolean;
  panel_integration_notes: string;

  // Step 11: PSU & battery
  psu_voltage_v: number;
  battery_type: string;
  battery_age_years: number;
  battery_voltage_v: number;
  psu_fault_signalled: boolean;
  battery_fault_signalled: boolean;
  psu_notes: string;

  // Step 12: Declarations
  overall_status: "Fully Operational" | "Operational with Observations" | "Not Operational";
  status_notes: string;
  standard_references: string;  // e.g. "BS EN 54-20:2006+A1:2012, FIA CoP ASD 2012, BS 5839-1:2017"
  engineer_name: string;
  engineer_signature: string;
  engineer_date: string;
  client_name: string;
  client_signature: string;
  client_date: string;

  // Company
  company_name: string;
  company_address: string;
}

// ── Empty payload ──────────────────────────────────────────────────────────────

export function buildEmptyASDPayload(): ASDPayload {
  const defaultThresholds: ASDAlarmThreshold[] = [
    { level: "Alert",  set_value_obs: "", test_result: "N/A", notes: "" },
    { level: "Action", set_value_obs: "", test_result: "N/A", notes: "" },
    { level: "Fire1",  set_value_obs: "", test_result: "N/A", notes: "" },
    { level: "Fire2",  set_value_obs: "", test_result: "N/A", notes: "" },
  ];
  return {
    installation_type: "new",
    cert_reference: "",
    cert_date: new Date().toISOString().split("T")[0],
    premises_name: "",
    premises_address: "",
    premises_postcode: "",
    responsible_person: "",
    responsible_email: "",
    asd_manufacturer: "",
    asd_model: "",
    asd_serial_number: "",
    software_version: "",
    sensitivity_class: "A",
    num_pipes: 1,
    num_sampling_holes: 0,
    pipe_material: "ABS (red)",
    protected_area: "",
    design_software_used: "",
    transport_time_limit: 60,
    pre_mod_config_description: "",
    modification_description: "",
    areas_affected: "",
    pre_mod_flow_documented: false,
    pre_mod_threshold_documented: false,
    area_final_state: false,
    pipework_visually_inspected: false,
    pipework_labelled: false,
    sampling_holes_open: false,
    sampling_holes_count_verified: false,
    filter_installed: false,
    test_points_identified: false,
    detector_accessible: false,
    pre_commission_notes: "",
    integrity_test_method: "Pressure",
    integrity_test_pressure_pa: 0,
    integrity_test_duration_mins: 5,
    integrity_test_result: "N/A",
    integrity_test_notes: "",
    pipe_records: [
      { id: uid(), pipe_reference: "Pipe 1", design_flow_lpm: 0, measured_flow_lpm: 0, within_20_percent: false, notes: "" },
    ],
    flow_normalisation_performed: false,
    flow_normalisation_access_level: "Level 3",
    furthest_hole_location: "",
    transport_time_measured_s: 0,
    transport_time_pass: false,
    transport_time_test_method: "Calibrated aerosol",
    transport_time_notes: "",
    thresholds: defaultThresholds,
    sensitivity_test_method: "Calibrated test aerosol",
    all_thresholds_pass: false,
    airflow_fault_test_performed: false,
    low_flow_fault_indicated: false,
    low_flow_fault_time_s: 0,
    single_hole_blockage_tested: false,
    single_hole_result: "N/A",
    airflow_fault_notes: "",
    panel_manufacturer: "",
    panel_model: "",
    panel_zone_address: "",
    alert_signal_tested: false,
    action_signal_tested: false,
    fire1_signal_tested: false,
    fire2_signal_tested: false,
    isolate_disable_tested: false,
    panel_integration_notes: "",
    psu_voltage_v: 0,
    battery_type: "",
    battery_age_years: 0,
    battery_voltage_v: 0,
    psu_fault_signalled: false,
    battery_fault_signalled: false,
    psu_notes: "",
    overall_status: "Fully Operational",
    status_notes: "",
    standard_references: "BS EN 54-20:2006+A1:2012 | FIA CoP for ASD Systems 2012 | BS 5839-1:2017+A2:2019",
    engineer_name: "",
    engineer_signature: "",
    engineer_date: new Date().toISOString().split("T")[0],
    client_name: "",
    client_signature: "",
    client_date: new Date().toISOString().split("T")[0],
    company_name: "",
    company_address: "",
  };
}

function uid() { return Math.random().toString(36).slice(2, 10); }

// ── Helpers ────────────────────────────────────────────────────────────────────

export function calcFlowWithin20(design: number, measured: number): boolean {
  if (!design || !measured) return false;
  return Math.abs((measured - design) / design) <= 0.2;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export interface ASDValidationError {
  step: number;
  message: string;
}

export function validateASDPayload(p: ASDPayload): ASDValidationError[] {
  const errors: ASDValidationError[] = [];
  if (!p.cert_reference) errors.push({ step: 0, message: "Certificate reference required" });
  if (!p.premises_name)  errors.push({ step: 1, message: "Premises name required" });
  if (!p.asd_manufacturer) errors.push({ step: 2, message: "ASD manufacturer required" });
  if (!p.asd_model)        errors.push({ step: 2, message: "ASD model required" });
  if (p.installation_type === "modification" && !p.modification_description)
    errors.push({ step: 3, message: "Modification description required" });
  if (p.transport_time_measured_s > 0 && p.transport_time_measured_s > p.transport_time_limit)
    errors.push({ step: 7, message: `Transport time ${p.transport_time_measured_s}s exceeds Class ${p.sensitivity_class} limit of ${p.transport_time_limit}s` });
  if (!p.engineer_name) errors.push({ step: 11, message: "Engineer name required" });
  if (!p.engineer_signature) errors.push({ step: 11, message: "Engineer signature required" });
  return errors;
}

// ── Supabase CRUD ──────────────────────────────────────────────────────────────

export interface ASDSubmission {
  id: string;
  form_type: string;
  certificate_reference: string | null;
  status: string;
  payload: ASDPayload;
  site_id: string | null;
  customer_id: string | null;
  visit_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function createASDSubmission(
  payload: ASDPayload,
  opts: { siteId?: string; customerId?: string; visitId?: string; userId: string }
): Promise<ASDSubmission> {
  const { data, error } = await supabase
    .from("smart_form_submissions")
    .insert({
      form_type: "asd_commissioning",
      certificate_reference: payload.cert_reference || null,
      status: "draft",
      payload: payload as any,
      site_id: opts.siteId || null,
      customer_id: opts.customerId || null,
      visit_id: opts.visitId || null,
      created_by: opts.userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ASDSubmission;
}

export async function updateASDSubmission(
  id: string,
  payload: ASDPayload,
  status: "draft" | "completed" = "draft"
): Promise<ASDSubmission> {
  const { data, error } = await supabase
    .from("smart_form_submissions")
    .update({
      payload: payload as any,
      status,
      certificate_reference: payload.cert_reference || null,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ASDSubmission;
}

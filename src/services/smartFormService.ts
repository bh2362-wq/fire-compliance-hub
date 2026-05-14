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
  section?: string;
  status: "Pass" | "Fail" | "YES" | "NO" | "N/A" | "";
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
  // ── Section 1: Visual Inspection ─────────────────────────────────────────
  { key: "1.1",  section: "Section 1: Visual Inspection",        label: "1.1  Are all manual call points unobstructed and conspicuous?",                                                        status: "" },
  { key: "1.2",  section: "Section 1: Visual Inspection",        label: "1.2  Have there been any new exits created without the provision of a manual call point?",                             status: "" },
  { key: "1.3",  section: "Section 1: Visual Inspection",        label: "1.3  Are there any new or relocated partitions within 500mm of any automatic fire detector?",                          status: "" },
  { key: "1.4",  section: "Section 1: Visual Inspection",        label: "1.4  Is there any storage which encroaches within 300mm of ceilings?",                                                 status: "" },
  { key: "1.5",  section: "Section 1: Visual Inspection",        label: "1.5  If yes to 1.4, is there a requirement to install additional fire detection?",                                      status: "" },
  { key: "1.6",  section: "Section 1: Visual Inspection",        label: "1.6  Is there any racking present greater than 8m in height or containing high value/risk materials?",                 status: "" },
  { key: "1.7",  section: "Section 1: Visual Inspection",        label: "1.7  If yes to 1.6, is in rack detection installed?",                                                                   status: "" },
  { key: "1.8",  section: "Section 1: Visual Inspection",        label: "1.8  If no to 1.7, has recommendation been written for in rack detection?",                                             status: "" },
  { key: "1.9",  section: "Section 1: Visual Inspection",        label: "1.9  Is 500mm clear space being maintained below each automatic fire detector?",                                        status: "" },
  { key: "1.10", section: "Section 1: Visual Inspection",        label: "1.10 Have there been any changes to occupancy making existing detection unsuitable?",                                   status: "" },
  { key: "1.11", section: "Section 1: Visual Inspection",        label: "1.11 Have there been any alterations/extensions requiring additional detection?",                                       status: "" },
  { key: "1.12", section: "Section 1: Visual Inspection",        label: "1.12 Have all detectors & remote indicators been examined to ensure not damaged/painted?",                              status: "" },
  { key: "1.13", section: "Section 1: Visual Inspection",        label: "1.13 Have all visual alarm devices been checked that they are not obstructed from view?",                               status: "" },
  { key: "1.14", section: "Section 1: Visual Inspection",        label: "1.14 Have all visual alarm devices been checked to ensure their lenses are clean?",                                     status: "" },
  { key: "1.15", section: "Section 1: Visual Inspection",        label: "1.15 Has a visual inspection of cable fixings ensured they are secure and undamaged?",                                  status: "" },

  // ── Section 2: Manual Call Points ────────────────────────────────────────
  { key: "2.1",  section: "Section 2: Manual Call Points",       label: "2.1  Has the switch mechanism of every manual call point been tested?",                                                 status: "" },

  // ── Section 3: Automatic Detection ───────────────────────────────────────
  { key: "3.1",  section: "Section 3: Automatic Detection",      label: "3.1  Have all automatic fire detectors been functionally tested?",                                                      status: "" },
  { key: "3.2",  section: "Section 3: Automatic Detection",      label: "3.2  Have all remote indicators been functionally tested?",                                                             status: "" },
  { key: "3.3",  section: "Section 3: Automatic Detection",      label: "3.3  Have all optical beam smoke detectors been functionally tested?",                                                  status: "" },
  { key: "3.4",  section: "Section 3: Automatic Detection",      label: "3.4  Have all aspirating fire detectors been inspected & serviced per ASD Checklist?",                                 status: "" },
  { key: "3.5",  section: "Section 3: Automatic Detection",      label: "3.5  Have all carbon monoxide fire detectors been functionally tested?",                                                status: "" },
  { key: "3.6",  section: "Section 3: Automatic Detection",      label: "3.6  Have all flame detectors been functionally tested?",                                                               status: "" },
  { key: "3.7",  section: "Section 3: Automatic Detection",      label: "3.7  Have all multi-sensors been functionally tested per manufacturer recommendations?",                               status: "" },
  { key: "3.8",  section: "Section 3: Automatic Detection",      label: "3.8  Have all analogue values been confirmed within manufacturer's range?",                                             status: "" },

  // ── Section 4: Audible Alarms ─────────────────────────────────────────────
  { key: "4.1",  section: "Section 4: Audible Alarms",           label: "4.1  Have all audible alarm devices been operated to check correct functioning?",                                       status: "" },
  { key: "4.2",  section: "Section 4: Audible Alarms",           label: "4.2  Have all audible alarm devices been checked for correct operation?",                                               status: "" },

  // ── Section 5: Visual Alarms ──────────────────────────────────────────────
  { key: "5.1",  section: "Section 5: Visual Alarms",            label: "5.1  Have all visual alarm devices been operated to check correct functioning?",                                        status: "" },
  { key: "5.2",  section: "Section 5: Visual Alarms",            label: "5.2  Have all visual alarm devices been checked for correct operation?",                                                status: "" },

  // ── Section 6: Ancillary Equipment ───────────────────────────────────────
  { key: "6.1",  section: "Section 6: Ancillary Equipment",      label: "6.1  Has the cause and effect programme been confirmed by operating at least one cause?",                               status: "" },

  // ── Section 7: Radio Linked Equipment ────────────────────────────────────
  { key: "7.1",  section: "Section 7: Radio Linked Equipment",   label: "7.1  Are details of radio signal strength levels from commissioning held in logbook?",                                  status: "" },
  { key: "7.2",  section: "Section 7: Radio Linked Equipment",   label: "7.2  Radio signal strengths have been checked for adequacy and results recorded?",                                      status: "" },
  { key: "7.3",  section: "Section 7: Radio Linked Equipment",   label: "7.3  Has all radio system equipment been inspected per manufacturer recommendations?",                                  status: "" },

  // ── Section 8: Fault Monitoring ───────────────────────────────────────────
  { key: "8.1",  section: "Section 8: Fault Monitoring",         label: "8.1  Removal of a manual call point, fire detector or detachable alarm device?",                                        status: "" },
  { key: "8.2",  section: "Section 8: Fault Monitoring",         label: "8.2  Short circuit and open circuit to circuits serving fire alarm devices?",                                           status: "" },
  { key: "8.3",  section: "Section 8: Fault Monitoring",         label: "8.3  Short/open circuit of wiring between separate enclosure power supply and equipment?",                              status: "" },
  { key: "8.4",  section: "Section 8: Fault Monitoring",         label: "8.4  Introduction of an earth fault?",                                                                                  status: "" },
  { key: "8.5",  section: "Section 8: Fault Monitoring",         label: "8.5  Removal of any fuse or operation of other protective device?",                                                     status: "" },
  { key: "8.6",  section: "Section 8: Fault Monitoring",         label: "8.6  Short/open circuit on wiring between separate control/indicating equipment?",                                      status: "" },
  { key: "8.7",  section: "Section 8: Fault Monitoring",         label: "8.7  Short/open circuit on wiring between main and repeat control/mimic diagram?",                                      status: "" },
  { key: "8.8",  section: "Section 8: Fault Monitoring",         label: "8.8  Short/open circuit on wiring to alarm receiving centre transmission equipment?",                                   status: "" },
  { key: "8.9",  section: "Section 8: Fault Monitoring",         label: "8.9  Introduction of a mains power failure?",                                                                           status: "" },
  { key: "8.10", section: "Section 8: Fault Monitoring",         label: "8.10 Introduction of a standby power failure?",                                                                         status: "" },
  { key: "8.11", section: "Section 8: Fault Monitoring",         label: "8.11 Introduction of a battery charger failure?",                                                                       status: "" },
  { key: "8.12", section: "Section 8: Fault Monitoring",         label: "8.12 Disconnection of 1 battery where batteries are connected in parallel?",                                            status: "" },
  { key: "8.13", section: "Section 8: Fault Monitoring",         label: "8.13 Short/open/disconnection of communication link to separate systems (voice alarm etc)?",                            status: "" },
  { key: "8.14", section: "Section 8: Fault Monitoring",         label: "8.14 Removal of any end of line resistors (non addressable circuits)?",                                                 status: "" },
  { key: "8.15", section: "Section 8: Fault Monitoring",         label: "8.15 All connections to other fire protection systems simulated for fault per BS7273?",                                 status: "" },
  { key: "8.16", section: "Section 8: Fault Monitoring",         label: "8.16 All tactile alarm devices for people with impaired hearing simulated for fault?",                                  status: "" },

  // ── Section 9: Standby Power Supplies ────────────────────────────────────
  { key: "9.1",  section: "Section 9: Standby Power Supplies",   label: "9.1  Have all vented batteries and connections been examined with electrolyte checked?",                                status: "" },
  { key: "9.2",  section: "Section 9: Standby Power Supplies",   label: "9.2  Battery steady state charge voltage measurement recorded?",                                                        status: "" },
  { key: "9.3",  section: "Section 9: Standby Power Supplies",   label: "9.3  Is the steady state charge voltage within manufacturer recommendations?",                                          status: "" },
  { key: "9.4",  section: "Section 9: Standby Power Supplies",   label: "9.4  Batteries have been inspected and are in good serviceable condition?",                                             status: "" },
  { key: "9.5",  section: "Section 9: Standby Power Supplies",   label: "9.5  Batteries have been momentarily load tested with mains off - serviceable?",                                        status: "" },
  { key: "9.6",  section: "Section 9: Standby Power Supplies",   label: "9.6  Have any vented batteries been examined to ensure specific gravity is correct?",                                   status: "" },
  { key: "9.7",  section: "Section 9: Standby Power Supplies",   label: "9.7  Have all standby batteries been verified as suitably sized using verification record?",                            status: "" },

  // ── Section 10: Control & Indicating Equipment ────────────────────────────
  { key: "10.1", section: "Section 10: Control & Indicating Equipment", label: "10.1 Have all fire alarm functions been checked by operation of detector/MCP on each circuit?",                status: "" },
  { key: "10.2", section: "Section 10: Control & Indicating Equipment", label: "10.2 Have all controls and visual indicators been checked for correct operation?",                              status: "" },
  { key: "10.3", section: "Section 10: Control & Indicating Equipment", label: "10.3 Have all ancillary functions of the CIE been tested?",                                                    status: "" },
  { key: "10.4", section: "Section 10: Control & Indicating Equipment", label: "10.4 Have all printers been tested for correct operation and legible characters?",                              status: "" },
  { key: "10.5", section: "Section 10: Control & Indicating Equipment", label: "10.5 Are there sufficient quantities of printer consumables until next service?",                               status: "" },
  { key: "10.6", section: "Section 10: Control & Indicating Equipment", label: "10.6 All unmonitored permanently illuminated filament lamp indicators replaced?",                               status: "" },

  // ── Section 11: Cause & Effect ────────────────────────────────────────────
  { key: "11.1", section: "Section 11: Cause & Effect",          label: "11.1 The cause & effect programme has been confirmed by operation of at least one cause?",                              status: "" },

  // ── Section 12: Remote Transmission of Alarms ─────────────────────────────
  { key: "12.1", section: "Section 12: Remote Transmission of Alarms", label: "12.1 Has automatic transmission of alarm signals to ARC been checked and confirmed?",                           status: "" },
  { key: "12.2", section: "Section 12: Remote Transmission of Alarms", label: "12.2 Has automatic transmission of fault signals to ARC been checked and confirmed?",                           status: "" },

  // ── Section 13: Detection Zones ───────────────────────────────────────────
  { key: "13.1", section: "Section 13: Detection Zones",         label: "13.1 Is there a suitable zone plan correctly orientated and fixed to all CIE?",                                         status: "" },

  // ── Section 14: False Alarms ──────────────────────────────────────────────
  { key: "14.1", section: "Section 14: False Alarms",            label: "14.1 Quantity of fire detectors present on the system?",                                                                status: "" },
  { key: "14.2", section: "Section 14: False Alarms",            label: "14.2 How many false alarms have occurred within the previous 12 months?",                                              status: "" },
  { key: "14.3", section: "Section 14: False Alarms",            label: "14.3 Does the rate of false alarms exceed 1 per 25 detectors per annum?",                                              status: "" },
  { key: "14.4", section: "Section 14: False Alarms",            label: "14.4 Have there been 11 or more false alarms since the previous service visit?",                                       status: "" },
  { key: "14.5", section: "Section 14: False Alarms",            label: "14.5 Have there been 2+ false alarms from a single MCP or detector since last visit?",                                 status: "" },
  { key: "14.6", section: "Section 14: False Alarms",            label: "14.6 Have there been 2+ false alarms from a single detector location since last visit?",                               status: "" },
  { key: "14.7", section: "Section 14: False Alarms",            label: "14.7 Is there an identified persistent cause of false alarms?",                                                         status: "" },
  { key: "14.8", section: "Section 14: False Alarms",            label: "14.8 If yes to 14.3-14.7, has investigation been carried out and advice provided?",                                    status: "" },

  // ── Section 15: Logbook ───────────────────────────────────────────────────
  { key: "15.1", section: "Section 15: Logbook",                 label: "15.1 Have all faults recorded in the system logbook received appropriate attention?",                                  status: "" },
  { key: "15.2", section: "Section 15: Logbook",                 label: "15.2 Have the details of MCPs and detectors used for test 10.1 been recorded in logbook?",                             status: "" },
  { key: "15.3", section: "Section 15: Logbook",                 label: "15.3 Have defects identified during this visit been reported and recorded in logbook?",                                 status: "" },

  // ── Section 16: Certification ─────────────────────────────────────────────
  { key: "16.1", section: "Section 16: Certification",           label: "16.1 Has a BS5839-1:2025 Cl.45 Inspection & Service certificate been issued?",                                         status: "" },
  { key: "16.2", section: "Section 16: Certification",           label: "16.2 Has a BAFE SP203-1 Section 5 Inspection & Service certificate been issued?",                                      status: "" },

  // ── Section 17: Post Inspection Checks ────────────────────────────────────
  { key: "17.1", section: "Section 17: Post Inspection Checks",  label: "17.1 The system has been returned to its normal state?",                                                                status: "" },
  { key: "17.2", section: "Section 17: Post Inspection Checks",  label: "17.2 The alarm-receiving centre has been advised that normal monitoring is to resume?",                                 status: "" },
  { key: "17.3", section: "Section 17: Post Inspection Checks",  label: "17.3 Test keys, access keys and documentation have been returned to the Client?",                                       status: "" },
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

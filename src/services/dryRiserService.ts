import { supabase } from "@/integrations/supabase/client";

export type DRFormType = "visual_inspection" | "pressure_test";
export type DRTestResult = "Pass" | "Fail" | "N/A";

// ── Visual inspection checklist — BS 9990:2015 Clause 7 ───────────────────────
export interface DRVisualCheckItem {
  id: string;
  category: string;
  description: string;
  result: DRTestResult;
  notes: string;
}

export const DR_VISUAL_CHECKS: Omit<DRVisualCheckItem, "id" | "result" | "notes">[] = [
  // Inlet breeching
  { category: "Inlet Breeching", description: "Inlet cabinet/box undamaged and secure" },
  { category: "Inlet Breeching", description: "'Dry Riser Inlet' signage clearly visible and legible" },
  { category: "Inlet Breeching", description: "Glass panel intact (where fitted)" },
  { category: "Inlet Breeching", description: "Inlet connections clean and free from debris" },
  { category: "Inlet Breeching", description: "Inlet blanking caps present, in good condition and secured" },
  { category: "Inlet Breeching", description: "Air release valve (at head) present and operational" },
  // Landing valves
  { category: "Landing Valves", description: "All landing valves closed and in correct position" },
  { category: "Landing Valves", description: "Landing valve handwheels present and undamaged" },
  { category: "Landing Valves", description: "Rubber washers/seals not perished or damaged" },
  { category: "Landing Valves", description: "Landing valve outlet caps present and secured" },
  { category: "Landing Valves", description: "Landing valve boxes undamaged and accessible" },
  { category: "Landing Valves", description: "'Dry Riser Outlet' signage present at each landing valve" },
  // Pipework
  { category: "Pipework", description: "Visible pipework free from damage, corrosion or mechanical defect" },
  { category: "Pipework", description: "Pipework supports/brackets secure" },
  { category: "Pipework", description: "Drain valve present and closed" },
  // Access
  { category: "Access & Security", description: "Fire service access to inlet is clear and unobstructed" },
  { category: "Access & Security", description: "No vehicles, bins or landscaping obstructing inlet access" },
  { category: "Access & Security", description: "Landing valve boxes not locked or obstructed" },
  { category: "Access & Security", description: "Evidence of vandalism or theft noted" },
];

// ── Per-floor landing valve record ─────────────────────────────────────────────
export interface DRFloorRecord {
  id: string;
  floor_level: string;       // e.g. "Ground", "1st", "2nd", "Roof"
  valve_condition: DRTestResult;
  box_condition: DRTestResult;
  signage_present: boolean;
  pressure_bar?: number;     // recorded during pressure test
  notes: string;
}

// ── Main payload ───────────────────────────────────────────────────────────────
export interface DRPayload {
  form_type: DRFormType;
  cert_reference: string;
  cert_date: string;
  next_inspection_date: string;

  // Premises
  premises_name: string;
  premises_address: string;
  premises_postcode: string;
  responsible_person: string;
  responsible_email: string;
  building_height_m: number;       // must be 18–60m for dry riser requirement
  num_floors: number;
  num_risers: number;

  // System details
  riser_diameter_mm: number;       // typically 100mm
  inlet_type: string;              // e.g. "2-way breeching"
  inlet_location: string;
  previous_cert_date: string;
  previous_cert_result: string;

  // Visual inspection
  visual_checks: DRVisualCheckItem[];
  visual_defects_noted: string;

  // Floor records
  floor_records: DRFloorRecord[];

  // Pressure test (annual only)
  test_pressure_bar: number;        // BS 9990: 12 bar (1034 kPa)
  test_duration_mins: number;       // minimum 15 minutes
  pressure_at_start_bar: number;
  pressure_at_end_bar: number;
  pressure_drop_bar: number;        // auto-calculated
  pressure_test_result: DRTestResult;
  leaks_found: boolean;
  leak_locations: string;
  air_release_functional: boolean;
  drain_functional: boolean;
  pressure_test_notes: string;

  // Remedial works
  remedial_works_required: boolean;
  remedial_description: string;
  remedial_urgency: "Immediate" | "Within 30 days" | "Routine";
  remediated_on_visit: boolean;

  // Declaration
  overall_status: "Compliant" | "Non-compliant" | "Non-compliant — Remedial works completed";
  status_notes: string;
  standard_references: string;
  engineer_name: string;
  engineer_company: string;
  engineer_signature: string;
  engineer_date: string;
  client_name: string;
  client_signature: string;
  client_date: string;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

export function buildEmptyDRPayload(formType: DRFormType = "visual_inspection"): DRPayload {
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
    building_height_m: 0,
    num_floors: 0,
    num_risers: 1,
    riser_diameter_mm: 100,
    inlet_type: "2-way breeching",
    inlet_location: "",
    previous_cert_date: "",
    previous_cert_result: "",
    visual_checks: DR_VISUAL_CHECKS.map((c, i) => ({ ...c, id: `vc${i}`, result: "N/A" as DRTestResult, notes: "" })),
    visual_defects_noted: "",
    floor_records: [],
    test_pressure_bar: 12,
    test_duration_mins: 15,
    pressure_at_start_bar: 0,
    pressure_at_end_bar: 0,
    pressure_drop_bar: 0,
    pressure_test_result: "N/A",
    leaks_found: false,
    leak_locations: "",
    air_release_functional: false,
    drain_functional: false,
    pressure_test_notes: "",
    remedial_works_required: false,
    remedial_description: "",
    remedial_urgency: "Routine",
    remediated_on_visit: false,
    overall_status: "Compliant",
    status_notes: "",
    standard_references: "BS 9990:2015 | Regulatory Reform (Fire Safety) Order 2005",
    engineer_name: "",
    engineer_company: "",
    engineer_signature: "",
    engineer_date: new Date().toISOString().split("T")[0],
    client_name: "",
    client_signature: "",
    client_date: new Date().toISOString().split("T")[0],
  };
}

export function createFloorRecord(floor: string): DRFloorRecord {
  return {
    id: uid(),
    floor_level: floor,
    valve_condition: "N/A",
    box_condition: "N/A",
    signage_present: true,
    pressure_bar: undefined,
    notes: "",
  };
}

export function autoGenerateFloors(numFloors: number): DRFloorRecord[] {
  const levels = ["Ground"];
  const ordinals = ["1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th","11th","12th","13th","14th","15th","16th"];
  for (let i = 0; i < numFloors - 1 && i < ordinals.length; i++) levels.push(ordinals[i]);
  return levels.map(l => createFloorRecord(l));
}

export interface DRValidationError { step: number; message: string; }

export function validateDRPayload(p: DRPayload): DRValidationError[] {
  const e: DRValidationError[] = [];
  if (!p.cert_reference) e.push({ step: 0, message: "Certificate reference required" });
  if (!p.premises_name)  e.push({ step: 1, message: "Premises name required" });
  if (p.form_type === "pressure_test") {
    if (p.test_pressure_bar !== 12) e.push({ step: 4, message: "BS 9990 requires 12 bar test pressure" });
    if (p.test_duration_mins < 15)   e.push({ step: 4, message: "BS 9990 requires minimum 15 minutes duration" });
  }
  if (!p.engineer_name) e.push({ step: 6, message: "Engineer name required" });
  return e;
}

export async function createDRSubmission(
  payload: DRPayload,
  opts: { siteId?: string; customerId?: string; visitId?: string; userId: string }
) {
  const { data, error } = await supabase.from("smart_form_submissions").insert({
    form_type: `dry_riser_${payload.form_type}`,
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

export async function updateDRSubmission(id: string, payload: DRPayload, status = "draft") {
  const { data, error } = await supabase.from("smart_form_submissions").update({
    payload: payload as any, status,
    certificate_reference: payload.cert_reference || null,
    completed_at: status === "completed" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

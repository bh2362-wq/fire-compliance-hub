// BS 5839-1 cert schema — handwritten types matching migration
// 20260605120000_bs5839_cert_schema. Same pattern as src/types/bafe.ts:
// covers the new tables until `supabase gen types` picks them up.
//
// Five tables backing the four DOCX templates landed in PR #144:
//   bs5839_commissioning_certs        — header (1:1 with parent cert)
//   bs5839_commissioning_checks       — 33-item §39 checklist
//   bs5839_acceptance_certs           — customer-signed handover
//   bs5839_acceptance_trained_persons — up to 4 trained-person slots
//   bs5839_battery_calculations       — per-panel calc rows

export type Bs5839CertType =
  | "installation"
  | "commissioning"
  | "acceptance"
  | "battery_calc";

export type Bs5839SystemState = "new" | "modification";

// Y / N / NA discriminator matches the A051 paper form's column
// labels exactly. Stored as text for query ergonomics; could be an
// enum but enums add migration friction without buying us much.
export type Bs5839CheckResponse = "Y" | "N" | "NA";

// ── Commissioning certificate (A051) ───────────────────────────────

export interface Bs5839CommissioningCert {
  id: string;
  cert_id: string;

  customer_name: string | null;
  customer_address: string | null;
  customer_postcode: string | null;

  system_state: Bs5839SystemState | null;
  extent_of_system: string | null;

  exam_all_equipment_operates: boolean | null;
  exam_install_acceptable: boolean | null;
  exam_inspected_per_39_2c: boolean | null;
  exam_performs_to_spec: boolean | null;
  exam_no_false_alarm_potential: boolean | null;
  exam_documentation_provided: boolean | null;
  specifier: string | null;
  soak_test_weeks: number | null;
  outstanding_work: string | null;
  false_alarm_risks: string | null;

  design_cert_number: string | null;
  design_drawings_ref: string | null;
  installation_cert_number: string | null;
  as_fitted_drawings_ref: string | null;

  incomplete_work_details: string | null;
  incomplete_work_reasons: string | null;
  further_visit_required: string | null;

  created_at: string;
  updated_at: string;
}

export interface Bs5839CommissioningCheck {
  id: string;
  commissioning_cert_id: string;
  item_number: number; // 1..33
  response: Bs5839CheckResponse;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Acceptance certificate (A038) ──────────────────────────────────

export interface Bs5839AcceptanceCert {
  id: string;
  cert_id: string;

  customer_name: string | null;
  customer_position: string | null;
  // base64 data URL or "typed:Name" — same convention as the wizard's
  // other signature capture surfaces (Callout sign-off, C&E §9).
  customer_signature: string | null;
  customer_organisation: string | null;

  extent_of_system: string | null;
  work_required: string | null;

  created_at: string;
  updated_at: string;
}

export interface Bs5839AcceptanceTrainedPerson {
  id: string;
  acceptance_cert_id: string;
  slot: 1 | 2 | 3 | 4;
  person_name: string;
  created_at: string;
}

// ── Battery calculation (A058) — one row per panel ─────────────────

export interface Bs5839BatteryCalculation {
  id: string;
  cert_id: string;

  panel_label: string;
  panel_location: string | null;
  loop_count: number | null;

  standby_current_a: number | null;
  standby_hours: number | null;
  alarm_current_a: number | null;

  battery_subtotal_ah: number | null;
  min_battery_capacity_ah: number | null;
  design_battery_size_ah: number | null;
  installed_battery_size_ah: number | null;

  test_engineer_name: string | null;
  test_engineer_signature: string | null;
  test_date: string | null;
  test_meter_model: string | null;
  test_meter_serial: string | null;

  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Pure helpers — derived values for the calc UI ──────────────────

/**
 * Mirrors the A058 paper-form arithmetic:
 *   (standby_current × standby_hours) + alarm_current = subtotal_ah
 *   subtotal_ah × 1.25 = min_battery_capacity_ah
 *
 * Returns null when any input is missing so the wizard can render
 * an empty cell rather than spurious zeros.
 */
export function computeBatteryCalc(input: {
  standby_current_a: number | null;
  standby_hours: number | null;
  alarm_current_a: number | null;
}): {
  battery_subtotal_ah: number | null;
  min_battery_capacity_ah: number | null;
} {
  const { standby_current_a, standby_hours, alarm_current_a } = input;
  if (
    standby_current_a == null ||
    standby_hours == null ||
    alarm_current_a == null
  ) {
    return { battery_subtotal_ah: null, min_battery_capacity_ah: null };
  }
  const subtotal = standby_current_a * standby_hours + alarm_current_a;
  return {
    battery_subtotal_ah: round2(subtotal),
    min_battery_capacity_ah: round2(subtotal * 1.25),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── 33-item §39 checklist — descriptions verbatim from the
//     scripts/_build_bs5839_templates.py constant array. Re-declared
//     here so the wizard renders the same text the DOCX template
//     does without parsing the .docx at runtime.

export const BS5839_COMMISSIONING_ITEMS: readonly { number: number; description: string }[] = [
  { number: 1,  description: "The system complies with the original specification / design and the use of the building has not changed." },
  { number: 2,  description: "The 'as fitted' drawing accurately reflects the building structure (any changes recorded and passed to PM)." },
  { number: 3,  description: "System has been installed to meet the requirements of category L1 / L2 / L3 / L4 / L5 / P1 / P2 / M (state)." },
  { number: 4,  description: "Variations to the defined category have been identified and the schedule of variations agreed by the client and a nominated designer." },
  { number: 5,  description: "Cables meet requirements for standard / enhanced / mixed (BS 5839-1 §26.2)." },
  { number: 6,  description: "Cables are segregated as required and suitably supported (where visibly checked, §26.2)." },
  { number: 7,  description: "Cables are mechanically protected as required where necessary (§26.2)." },
  { number: 8,  description: "Junction boxes correctly labelled and identified on drawings (where visibly checked)." },
  { number: 9,  description: "All cable insulation and continuity resistance measurements are logged." },
  { number: 10, description: "All cable penetrations are sleeved and fire-stopped (where visibly checked)." },
  { number: 11, description: "Mains supply is dedicated, key-switched, correctly fused and labelled 'fire alarm — do not switch off' (red, accessible with a special tool only)." },
  { number: 12, description: "Mains supply identified at ALL distribution boards with a 'fire alarm — do not switch off' label in red." },
  { number: 13, description: "230V suppliers' installation covered by a certificate (request the EICR). If not seen, log variation as '230VAC supply test records not seen during commissioning BS 5839-1 §38.2c.'" },
  { number: 14, description: "Standby battery verification calculation has been carried out for ALL panels / power supplies. If calculation requires larger batteries than provided, contact PM or line manager." },
  { number: 15, description: "All batteries are clearly marked and labelled with date of installation (§25.4)." },
  { number: 16, description: "Field wiring is labelled and correctly terminated in all control and ancillary equipment." },
  { number: 17, description: "Detector removal fault indication has been checked and tested (§12.2.1)." },
  { number: 18, description: "Short circuit fault indication has been checked and tested." },
  { number: 19, description: "ALL detection, MCPs, warning and ancillary devices have been tested for control operation and results recorded." },
  { number: 20, description: "Cause and effect on the system has been tested and results recorded." },
  { number: 21, description: "Provision of sounder circuits is appropriate (§16.2)." },
  { number: 22, description: "Sound pressure levels have been checked and recorded (§16.2)." },
  { number: 23, description: "Detector type and spacing is appropriate to the system category (§22.2)." },
  { number: 24, description: "MCPs are located correctly and travel distances do not exceed 45 m (§22.2)." },
  { number: 25, description: "Remote signalling has been checked and tested for correct operation to ARC (fire and fault)." },
  { number: 26, description: "Radio signal strength (where applicable) exceeds manufacturer's minimum requirements." },
  { number: 27, description: "Cause and effects have been checked and verified." },
  { number: 28, description: "Zone charts have been fitted in appropriate locations and with the correct orientation (e.g. adjacent to control equipment and repeaters); search distances do not exceed limits; emergency lighting above." },
  { number: 29, description: "'As fitted' drawings are complete and updated where required including cable type and sizes, cable routing, 230V supply, location of all MCPs / detectors / sounders / isolators." },
  { number: 30, description: "User handbook and operating instructions have been issued to the 'responsible person'." },
  { number: 31, description: "The 'responsible person' has been adequately trained in the use of the fire alarm system; details recorded." },
  { number: 32, description: "Premises have been left in a tidy condition and all surplus materials and equipment removed from site." },
  { number: 33, description: "Signage — correct signage has been installed (call points and fire action signs)." },
] as const;

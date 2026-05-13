/**
 * smartPrefillService.ts
 *
 * Builds prefill payloads for any smart form type by aggregating
 * data from the most recent completed cert + service reports for a site.
 *
 * Usage:
 *   const result = await buildSmartPrefill(siteId, "bs5839_inspection_servicing");
 *   if (result) setPayload(prev => ({ ...prev, ...result.fields }));
 */

import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, differenceInYears } from "date-fns";

// ── What fields are STATIC (carry over) vs DYNAMIC (fresh each visit) ─────────
const STATIC_FIELDS_BY_TYPE: Record<string, string[]> = {
  bs5839_inspection_servicing: [
    "premises_name", "premises_address", "responsible_person_name",
    "responsible_person_contact", "site_contact",
    "system_categories", "system_type",
    "panel_manufacturer", "panel_model", "number_of_panels",
    "approx_number_of_devices", "areas_covered", "system_limitations",
    "company_name", "company_address", "engineer_name",
    "engineer_competency_confirmed",
    "battery_type", "test_device", "test_device_serial",
  ],
  el_commissioning: [
    "premises_name", "premises_address", "premises_postcode",
    "responsible_person", "responsible_email",
    "system_type", "system_mode", "duration_rating",
    "total_luminaires", "total_exit_signs", "eicr_reference",
  ],
  el_periodic: ["premises_name", "premises_address", "premises_postcode",
    "responsible_person", "responsible_email",
    "system_type", "system_mode", "duration_rating",
    "total_luminaires", "total_exit_signs", "eicr_reference"],
  asd_annual_service: [
    "premises_name", "premises_address", "premises_postcode",
    "responsible_person", "responsible_email",
    "manufacturer", "model", "serial_number", "asd_class",
    "num_pipes", "num_sampling_holes", "panel_interface",
    "pipe_records",  // carry previous baseline readings forward
  ],
  asd_commissioning: [
    "premises_name", "premises_address", "premises_postcode",
    "responsible_person", "responsible_email",
    "manufacturer", "model", "serial_number", "asd_class",
    "num_pipes", "num_sampling_holes", "panel_interface",
  ],
  dr_visual: [
    "premises_name", "premises_address", "premises_postcode",
    "responsible_person", "responsible_email",
    "building_height_m", "num_floors", "num_risers",
    "riser_diameter_mm", "inlet_type", "inlet_location",
  ],
  dr_pressure_test: [
    "premises_name", "premises_address", "premises_postcode",
    "responsible_person", "responsible_email",
    "building_height_m", "num_floors", "num_risers",
    "riser_diameter_mm", "inlet_type", "inlet_location",
  ],
};

// Fields that should be freshened up each visit (NEVER carry)
const NEVER_CARRY = new Set([
  "certificate_reference", "cert_reference",
  "date_of_service", "cert_date",
  "job_number",
  "overall_status", "system_operational", "overall_condition",
  "final_remarks", "remarks",
  "engineer_signature", "client_signature", "engineer_signed_date",
  "engineer_date", "client_date", "client_signed_date",
  "rp_signature", "rp_signed_date",
  "checklist",                   // fresh each visit
  "defects",                     // fresh each visit
  "variations",                  // fresh each visit
  "monthly_entries",             // fresh
  "annual_entries",              // fresh
  "false_alarm_count", "false_alarm_causes", "false_alarm_actions",
  "devices_tested", "testing_method",
  "pressure_test_result",
  "pressure_start_bar", "pressure_end_bar",
  "leaks_found", "leak_locations",
  "floor_records",
  "faults_found", "fault_description", "parts_replaced",
]);

export interface PrefillSource {
  form_type: string;
  cert_reference: string;
  completed_at: string;        // ISO date
  completed_at_label: string;  // "12 Jan 2026"
  field_count: number;
  source_type: "cert" | "service_report";
}

export interface SmartPrefillResult {
  source: PrefillSource;
  fields: Record<string, unknown>;
  // For BS5839 IS — battery age adjustment
  battery_age_hint?: { previous_age: number; suggested_age: number; years_since: number };
}

// ── Main function ─────────────────────────────────────────────────────────────
export async function buildSmartPrefill(
  siteId: string,
  formType: string
): Promise<SmartPrefillResult | null> {
  if (!siteId) return null;

  // Determine which form types to look for previous data
  // For periodic/annual types, also look at previous of same type
  const lookupTypes = [formType];

  // EL periodic can prefill from EL commissioning too
  if (formType === "el_periodic") lookupTypes.push("el_commissioning");
  // ASD annual service can prefill from ASD commissioning
  if (formType === "asd_annual_service") lookupTypes.push("asd_commissioning");
  // DR pressure test can prefill from DR visual
  if (formType === "dr_pressure_test") lookupTypes.push("dr_visual", "dr_visual_inspection");

  // ── 1. Fetch most recent completed smart form cert for this site ─────────────
  const { data: certRows } = await supabase
    .from("smart_form_submissions")
    .select("id, form_type, certificate_reference, completed_at, payload")
    .eq("site_id", siteId)
    .in("form_type", lookupTypes)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1);

  const prevCert = certRows?.[0];

  // ── 2. Fetch latest service report for extra panel/system data ───────────────
  const { data: reportRows } = await supabase
    .from("service_reports")
    .select("engineer_name, panel_manufacturer, panel_model, system_type, devices_count, zones_count, report_date")
    .eq("site_id", siteId)
    .eq("status", "completed")
    .order("report_date", { ascending: false })
    .limit(1);

  const latestReport = reportRows?.[0];

  // ── 3. Fetch site + responsible person data ──────────────────────────────────
  const { data: siteData } = await supabase
    .from("sites")
    .select("name, address, city, postcode, contact_name, contact_email, contact_phone, total_devices")
    .eq("id", siteId)
    .single();

  // If nothing found, return null
  if (!prevCert && !latestReport && !siteData) return null;

  // ── 4. Determine static field list for this form type ───────────────────────
  const staticFields = STATIC_FIELDS_BY_TYPE[formType] ?? [];

  // ── 5. Build merged prefill ──────────────────────────────────────────────────
  const fields: Record<string, unknown> = {};

  // Start with site data (always available, lowest priority)
  if (siteData) {
    const addr = [siteData.address, siteData.city].filter(Boolean).join(", ");
    if (staticFields.includes("premises_name"))    fields.premises_name    = siteData.name || "";
    if (staticFields.includes("premises_address")) fields.premises_address = addr;
    if (staticFields.includes("premises_postcode"))fields.premises_postcode= siteData.postcode || "";
    if (staticFields.includes("responsible_person"))    fields.responsible_person     = siteData.contact_name || "";
    if (staticFields.includes("responsible_person_name"))fields.responsible_person_name= siteData.contact_name || "";
    if (staticFields.includes("responsible_person_contact"))fields.responsible_person_contact = siteData.contact_phone || "";
    if (staticFields.includes("responsible_email"))     fields.responsible_email      = siteData.contact_email || "";
    if (staticFields.includes("approx_number_of_devices"))fields.approx_number_of_devices = siteData.total_devices || "";
  }

  // Layer in service report data (medium priority — reflects actual on-site findings)
  if (latestReport) {
    if (staticFields.includes("engineer_name") && latestReport.engineer_name)
      fields.engineer_name = latestReport.engineer_name;
    if (staticFields.includes("panel_manufacturer") && latestReport.panel_manufacturer)
      fields.panel_manufacturer = latestReport.panel_manufacturer;
    if (staticFields.includes("panel_model") && latestReport.panel_model)
      fields.panel_model = latestReport.panel_model;
    if (staticFields.includes("approx_number_of_devices") && latestReport.devices_count)
      fields.approx_number_of_devices = latestReport.devices_count;
  }

  // Layer in previous cert payload (highest priority — most complete)
  let certFieldCount = 0;
  if (prevCert?.payload) {
    const prev = prevCert.payload as Record<string, unknown>;
    for (const field of staticFields) {
      if (NEVER_CARRY.has(field)) continue;
      const val = prev[field];
      if (val !== undefined && val !== "" && !(Array.isArray(val) && val.length === 0)) {
        fields[field] = val;
        certFieldCount++;
      }
    }

    // Special: pipe_records for ASD service — carry previous baseline as new baseline
    if (formType === "asd_annual_service" && Array.isArray(prev.pipe_records)) {
      fields.pipe_records = (prev.pipe_records as any[]).map(p => ({
        ...p,
        measured_flow_lpm: "",  // Clear measured — fresh reading each visit
        within_20_percent: true,
        notes: "",
      }));
    }
  }

  // Remove any NEVER_CARRY fields that snuck in
  for (const key of NEVER_CARRY) delete fields[key];

  const totalFieldCount = Object.keys(fields).filter(k => fields[k] !== "" && fields[k] !== undefined).length;

  if (totalFieldCount === 0) return null;

  // ── 6. Battery age hint for BS5839 IS cert ─────────────────────────────────
  let battery_age_hint: SmartPrefillResult["battery_age_hint"] | undefined;
  if (formType === "bs5839_inspection_servicing" && prevCert?.payload) {
    const prev = prevCert.payload as Record<string, unknown>;
    const prevAge = Number(prev.battery_age_years);
    if (!isNaN(prevAge) && prevCert.completed_at) {
      const yearsSince = differenceInYears(new Date(), parseISO(prevCert.completed_at));
      battery_age_hint = {
        previous_age:  prevAge,
        suggested_age: prevAge + Math.max(1, yearsSince),
        years_since:   yearsSince || 1,
      };
    }
  }

  // ── 7. Build source metadata ─────────────────────────────────────────────────
  const source: PrefillSource = prevCert ? {
    form_type:           prevCert.form_type,
    cert_reference:      prevCert.certificate_reference,
    completed_at:        prevCert.completed_at,
    completed_at_label:  format(parseISO(prevCert.completed_at), "dd MMM yyyy"),
    field_count:         totalFieldCount,
    source_type:         "cert",
  } : {
    form_type:           formType,
    cert_reference:      latestReport ? `Service report ${latestReport.report_date}` : "Site data",
    completed_at:        latestReport?.report_date || new Date().toISOString(),
    completed_at_label:  latestReport?.report_date
      ? format(parseISO(latestReport.report_date), "dd MMM yyyy")
      : "Site record",
    field_count:         totalFieldCount,
    source_type:         "service_report",
  };

  return { source, fields, battery_age_hint };
}

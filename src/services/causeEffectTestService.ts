import { supabase } from "@/integrations/supabase/client";
import type { CauseEffectTestReport } from "@/features/causeEffectTest/useCauseEffectTestDraft";

export interface CauseEffectOutputCheck {
  id: string;
  ordinal: number;
  function_name: string;
  expected: string | null;
  actual: string | null;
  result: "pass" | "fail" | "na" | null;
}

export interface CauseEffectStageTest {
  id: string;
  ordinal: number;
  stage_name: string;
  areas_activated: string | null;
  delay_time: string | null;
  result: "pass" | "fail" | "na" | null;
}

export interface CauseEffectAudibilityReading {
  id: string;
  ordinal: number;
  location: string;
  floor: string | null;
  ambient_db: number | null;
  alarm_db: number | null;
  required_db: number | null;
  result: "pass" | "fail" | null;
  notes: string | null;
}

export interface CauseEffectIssue {
  id: string;
  kind: "cause_effect" | "audibility";
  description: string | null;
  location: string | null;
  measured_db: number | null;
  required_db: number | null;
  severity: "critical" | "non_critical" | null;
  action_required: string | null;
}

export interface CauseEffectRemedial {
  id: string;
  priority: "urgent" | "routine" | null;
  description: string | null;
  location: string | null;
  estimated_cost: number | null;
}

export interface CauseEffectDeviceTest {
  device_id: string | null;
  loop: string | null;
  address: string | null;
  device_type: string | null;
  location: string | null;
  status: string;
  tested_at: string | null;
  fail_reason: string | null;
}

export interface CauseEffectSiteInfo {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  panel_make_model: string | null;
  bs5839_category: string | null;
  num_zones: number | null;
  num_devices: number | null;
  arc_connected: boolean | null;
}

export interface CauseEffectVisitInfo {
  id: string;
  visit_type: string;
  visit_date: string;
  job_number: string | null;
}

export interface CauseEffectReportBundle {
  report: CauseEffectTestReport;
  site: CauseEffectSiteInfo;
  visit: CauseEffectVisitInfo;
  outputs: CauseEffectOutputCheck[];
  stages: CauseEffectStageTest[];
  readings: CauseEffectAudibilityReading[];
  issues: CauseEffectIssue[];
  remedials: CauseEffectRemedial[];
  deviceTests: CauseEffectDeviceTest[];
}

/**
 * Load every row needed to render the printed C&E + Audibility test
 * report PDF. Runs the child queries in parallel — the wizard already
 * paginated through them on its own steps, but the PDF generator only
 * sees one slice at a time so it needs the full set.
 */
export async function loadCauseEffectReportBundle(
  reportId: string,
): Promise<CauseEffectReportBundle> {
  const { data: report, error: rErr } = await (supabase as any)
    .from("ce_audibility_reports")
    .select("*")
    .eq("id", reportId)
    .single();
  if (rErr || !report) throw rErr ?? new Error("Report not found");

  const [siteRes, visitRes, outRes, stgRes, audRes, issRes, remRes, dtRes] = await Promise.all([
    (supabase as any)
      .from("sites")
      .select("id, name, address, city, postcode, contact_name, contact_phone, panel_make_model, bs5839_category, num_zones, num_devices, arc_connected")
      .eq("id", report.site_id)
      .single(),
    (supabase as any)
      .from("service_visits")
      .select("id, visit_type, visit_date, job_number")
      .eq("id", report.visit_id)
      .single(),
    (supabase as any)
      .from("ce_output_checks")
      .select("id, ordinal, function_name, expected, actual, result")
      .eq("report_id", reportId)
      .order("ordinal"),
    (supabase as any)
      .from("ce_stage_tests")
      .select("id, ordinal, stage_name, areas_activated, delay_time, result")
      .eq("report_id", reportId)
      .order("ordinal"),
    (supabase as any)
      .from("ce_audibility_readings")
      .select("id, ordinal, location, floor, ambient_db, alarm_db, required_db, result, notes")
      .eq("report_id", reportId)
      .order("ordinal"),
    (supabase as any)
      .from("ce_issues")
      .select("id, kind, description, location, measured_db, required_db, severity, action_required")
      .eq("report_id", reportId),
    (supabase as any)
      .from("ce_remedials")
      .select("id, priority, description, location, estimated_cost")
      .eq("report_id", reportId),
    // Device ticks recorded against the visit — same source the wizard
    // Step 2 reads. Used to populate §3.2 of the printed report.
    (supabase as any)
      .from("parsed_device_tests")
      .select("device_id, loop, address, device_type, location, status, tested_at, fail_reason")
      .eq("visit_id", report.visit_id)
      .order("tested_at", { ascending: true }),
  ]);

  return {
    report: report as CauseEffectTestReport,
    site: siteRes.data as CauseEffectSiteInfo,
    visit: visitRes.data as CauseEffectVisitInfo,
    outputs: (outRes.data ?? []) as CauseEffectOutputCheck[],
    stages: (stgRes.data ?? []) as CauseEffectStageTest[],
    readings: (audRes.data ?? []) as CauseEffectAudibilityReading[],
    issues: (issRes.data ?? []) as CauseEffectIssue[],
    remedials: (remRes.data ?? []) as CauseEffectRemedial[],
    deviceTests: (dtRes.data ?? []) as CauseEffectDeviceTest[],
  };
}

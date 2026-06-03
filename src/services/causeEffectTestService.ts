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

// Per-device row for the printed report's "Appendix A — Device register".
// Joined from devices (asset registry) ⨝ parsed_device_tests (this visit's
// results). Devices not tested on this visit get test_status = null.
export interface CauseEffectDeviceRegisterEntry {
  loop: string | null;
  address: string | null;
  device_type: string | null;
  location: string | null;
  zone: string | null;
  installed_at: string | null;
  test_status: "passed" | "fault" | null;
}

export interface CauseEffectSiteInfo {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  panel_make_model: string | null;
  bs5839_category: string | null;
  num_zones: number | null;
  num_devices: number | null;
  arc_connected: boolean | null;
  customer_id: string | null;
  // Augmented from the sites template-prefill migration. Populated by
  // the Site → System Information panel and rendered on the report
  // header band so the engineer doesn't have to re-type them each visit.
  duty_holder_name: string | null;
  duty_holder_role: string | null;
  duty_holder_email: string | null;
  duty_holder_phone: string | null;
  arc_provider: string | null;
  arc_account_ref: string | null;
  access_hours: string | null;
}

export interface CauseEffectCustomerInfo {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
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
  customer: CauseEffectCustomerInfo | null;
  visit: CauseEffectVisitInfo;
  outputs: CauseEffectOutputCheck[];
  stages: CauseEffectStageTest[];
  readings: CauseEffectAudibilityReading[];
  issues: CauseEffectIssue[];
  remedials: CauseEffectRemedial[];
  deviceTests: CauseEffectDeviceTest[];
  deviceRegister: CauseEffectDeviceRegisterEntry[];
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

  const [siteRes, visitRes, outRes, stgRes, audRes, issRes, remRes, dtRes, devRes] = await Promise.all([
    (supabase as any)
      .from("sites")
      .select(
        [
          "id", "name", "address", "city", "postcode",
          "contact_name", "contact_phone", "contact_email",
          "panel_make_model", "bs5839_category",
          "num_zones", "num_devices",
          "arc_connected", "arc_provider", "arc_account_ref",
          "customer_id",
          "duty_holder_name", "duty_holder_role", "duty_holder_email", "duty_holder_phone",
          "access_hours",
        ].join(","),
      )
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
    // Full device register for the site (asset registry). Used to build
    // the "Appendix A — Device register" table on the printed report:
    // every device on site, plus this visit's test result if any.
    (supabase as any)
      .from("devices")
      .select("id, loop, address, device_type, location, zone, installed_at")
      .eq("site_id", report.site_id)
      .order("loop", { ascending: true })
      .order("address", { ascending: true }),
  ]);

  // Second-stage customer lookup — only when the site has a customer linked.
  // Kept as a separate await so the parallel batch above doesn't have to
  // wait on it, and the bundle still resolves cleanly when the site is
  // an orphan.
  const site = siteRes.data as CauseEffectSiteInfo;
  let customer: CauseEffectCustomerInfo | null = null;
  if (site?.customer_id) {
    const { data } = await (supabase as any)
      .from("customers")
      .select("id, name, contact_name, contact_email, contact_phone")
      .eq("id", site.customer_id)
      .maybeSingle();
    customer = (data as CauseEffectCustomerInfo) ?? null;
  }

  // Merge visit test results into the device register by device id so
  // Appendix A can show PASS / FAIL / Not tested for each row without
  // an extra round trip on the edge function.
  const tests = (dtRes.data ?? []) as Array<{ device_id: string | null; status: string }>;
  const testByDeviceId = new Map<string, "passed" | "fault">();
  for (const t of tests) {
    if (!t.device_id) continue;
    const s = t.status === "passed" || t.status === "fault" ? t.status : null;
    if (s) testByDeviceId.set(t.device_id, s);
  }
  // Surface a silent device-register fetch failure — without this the
  // Appendix A "No devices recorded" message is indistinguishable from
  // a genuinely empty site, and the engineer can't tell whether RLS
  // blocked the query, the site_id mismatched, or the table is empty.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const devErr = (devRes as { error?: { message?: string; code?: string; details?: string } }).error;
  if (devErr) {
    console.error(
      "[loadCauseEffectReportBundle] device register fetch failed:",
      JSON.stringify({
        message: devErr.message,
        code: devErr.code,
        details: devErr.details,
        site_id: report.site_id,
      }),
    );
  }
  const registerRows = (devRes.data ?? []) as Array<{
    id: string; loop: string | null; address: string | null;
    device_type: string | null; location: string | null;
    zone: string | null; installed_at: string | null;
  }>;
  console.log(
    "[loadCauseEffectReportBundle] device register:",
    JSON.stringify({
      site_id: report.site_id,
      rows_returned: registerRows.length,
      tests_returned: tests.length,
      // Sample the first row's keys so we can spot a schema mismatch
      // (e.g. column renamed since this SELECT was written).
      sample_keys: registerRows[0] ? Object.keys(registerRows[0]) : null,
    }),
  );
  const deviceRegister: CauseEffectDeviceRegisterEntry[] = registerRows.map((d) => ({
    loop: d.loop, address: d.address, device_type: d.device_type,
    location: d.location, zone: d.zone, installed_at: d.installed_at,
    test_status: testByDeviceId.get(d.id) ?? null,
  }));

  return {
    report: report as CauseEffectTestReport,
    site,
    customer,
    visit: visitRes.data as CauseEffectVisitInfo,
    outputs: (outRes.data ?? []) as CauseEffectOutputCheck[],
    stages: (stgRes.data ?? []) as CauseEffectStageTest[],
    readings: (audRes.data ?? []) as CauseEffectAudibilityReading[],
    issues: (issRes.data ?? []) as CauseEffectIssue[],
    remedials: (remRes.data ?? []) as CauseEffectRemedial[],
    deviceTests: (dtRes.data ?? []) as CauseEffectDeviceTest[],
    deviceRegister,
  };
}

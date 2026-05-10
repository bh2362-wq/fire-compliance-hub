/**
 * certPrefillService.ts
 *
 * Builds prefill payloads for all three new certificate types by aggregating
 * every available data source for a given visit/site:
 *   - sites (name, address, contact)
 *   - customers (name, contact)
 *   - site_assets (panel make/model/serial/zones/loops, device counts)
 *   - service_reports (panel_manufacturer, panel_model, system_type from prior visits)
 *   - smart_form_submissions (existing cert refs for Modification certs)
 *   - company_settings (issuing company details)
 */

import { supabase } from "@/integrations/supabase/client";
import { InstallationPayload, CommissioningPayload, ModificationPayload, getLastCertPayload } from "@/services/newCertificateService";

interface SiteAssetRow {
  id: string;
  asset_type: string;
  item_name: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  location: string | null;
  zones_count: number | null;
  loops_count: number | null;
  notes: string | null;
}

interface SiteRow {
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  total_devices: number | null;
  customer: {
    name: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  } | null;
}

interface ReportRow {
  panel_manufacturer: string | null;
  panel_model: string | null;
  system_type: string | null;
  report_date: string | null;
}

interface CertRow {
  certificate_reference: string;
  form_type: string;
  created_at: string;
  payload: Record<string, unknown>;
}

export interface CertPrefillResult {
  installation: Partial<InstallationPayload>;
  commissioning: Partial<CommissioningPayload>;
  modification: Partial<ModificationPayload>;
}

// ── Visit type → installation work type mapping ──────────────────────────────
function inferWorkType(visitType: string): InstallationPayload["work_type"] {
  if (visitType === "installation") return "New Installation";
  if (visitType === "commissioning") return "New Installation";
  if (visitType === "remedial") return "Extension";
  return "";
}

// ── Infer system type from assets ─────────────────────────────────────────────
function inferSystemType(loops: number): InstallationPayload["system_type"] {
  return loops > 0 ? "Addressable" : "Conventional";
}

// ── Build areas covered from asset locations ──────────────────────────────────
function buildAreasCovered(assets: SiteAssetRow[]): string {
  const locs = assets
    .map((a) => a.location)
    .filter((l): l is string => !!l && l.trim().length > 0);
  const unique = [...new Set(locs)];
  return unique.join(", ");
}

// ── Infer system category from asset type / item name ─────────────────────────
function inferSystemCategories(assets: SiteAssetRow[]): string[] {
  // Look for hints in item_name or notes fields across all fire assets
  const combined = assets.map((a) => `${a.item_name} ${a.notes || ""}`).join(" ").toLowerCase();
  const cats: string[] = [];
  if (/\bl1\b/.test(combined)) cats.push("L1");
  if (/\bl2\b/.test(combined)) cats.push("L2");
  if (/\bl3\b/.test(combined)) cats.push("L3");
  if (/\bl4\b/.test(combined)) cats.push("L4");
  if (/\bl5\b/.test(combined)) cats.push("L5");
  if (/\bm\b|manual/.test(combined)) cats.push("M");
  if (/\bp1\b/.test(combined)) cats.push("P1");
  if (/\bp2\b/.test(combined)) cats.push("P2");
  return cats;
}

/**
 * Main function — call this when any of the three cert types is launched from a visit row.
 * Returns prefill payloads for all three cert types; use whichever is appropriate.
 */
export async function buildCertPrefill(
  visitId: string,
  siteId: string,
  visitDate: string,
  visitType: string,
  jobNumber?: string | null
): Promise<CertPrefillResult> {
  // ── Parallel data fetch ────────────────────────────────────────────────────
  const [
    siteResult,
    assetsResult,
    reportsResult,
    certsResult,
    companyResult,
  ] = await Promise.allSettled([
    supabase
      .from("sites")
      .select("name, address, city, postcode, contact_name, contact_email, contact_phone, total_devices, customer:customers(name, contact_name, contact_email, contact_phone)")
      .eq("id", siteId)
      .single(),

    supabase
      .from("site_assets")
      .select("id, asset_type, item_name, manufacturer, model, serial_number, location, zones_count, loops_count, notes")
      .eq("site_id", siteId),

    // Most recent 3 completed service reports for this site — for panel data
    supabase
      .from("service_reports")
      .select("panel_manufacturer, panel_model, system_type, report_date")
      .eq("site_id", siteId)
      .eq("status", "completed")
      .order("report_date", { ascending: false })
      .limit(3),

    // All smart form submissions for this site — for cert references
    supabase
      .from("smart_form_submissions")
      .select("certificate_reference, form_type, created_at, payload")
      .eq("site_id", siteId)
      .in("form_type", ["bs5839_installation", "bs5839_commissioning", "bs5839_modification"])
      .order("created_at", { ascending: false })
      .limit(10),

    supabase
      .from("company_settings")
      .select("company_name, address, city, postcode, phone, email")
      .limit(1)
      .maybeSingle(),
  ]);

  // Safely extract results
  const site: SiteRow | null = siteResult.status === "fulfilled" ? siteResult.value.data as unknown as SiteRow : null;
  const assets: SiteAssetRow[] = assetsResult.status === "fulfilled" ? (assetsResult.value.data as SiteAssetRow[]) ?? [] : [];
  const reports: ReportRow[] = reportsResult.status === "fulfilled" ? (reportsResult.value.data as ReportRow[]) ?? [] : [];
  const certs: CertRow[] = certsResult.status === "fulfilled" ? (certsResult.value.data as CertRow[]) ?? [] : [];
  const company = companyResult.status === "fulfilled" ? companyResult.value.data : null;

  // ── Build shared values ────────────────────────────────────────────────────
  const customer = site?.customer as { name: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null } | null;

  const premisesName = site?.name || "";
  const premisesAddress = [site?.address, site?.city].filter(Boolean).join(", ");
  const premisesPostcode = site?.postcode || "";
  const rpName = site?.contact_name || customer?.contact_name || customer?.name || "";
  const rpEmail = site?.contact_email || customer?.contact_email || "";
  const rpPhone = site?.contact_phone || customer?.contact_phone || "";

  // Fire panel assets — match by asset_type or item_name
  const fireAssets = assets.filter((a) =>
    /fire.*alarm|panel|fa\b|fire.*panel/i.test(`${a.asset_type} ${a.item_name}`)
  );
  const panel = fireAssets[0] ?? null;

  // Panel details — prefer service_report data (captured live on-site) over assets
  const latestReport = reports[0] ?? null;
  const panelManufacturer = latestReport?.panel_manufacturer || panel?.manufacturer || "";
  const panelModel = latestReport?.panel_model || panel?.model || "";
  const panelSerial = panel?.serial_number || "";
  const totalLoops = fireAssets.reduce((n, a) => n + (Number(a.loops_count) || 0), 0);
  const totalZones = fireAssets.reduce((n, a) => n + (Number(a.zones_count) || 0), 0) || undefined;
  const systemTypeRaw = latestReport?.system_type || "";
  const systemType = (systemTypeRaw === "Addressable" || systemTypeRaw === "Conventional" || systemTypeRaw === "Wireless" || systemTypeRaw === "Hybrid")
    ? systemTypeRaw as InstallationPayload["system_type"]
    : inferSystemType(totalLoops);

  const totalDevices: number | "" = (site?.total_devices as number | null) ?? "";
  const areasCovered = buildAreasCovered(assets);
  const inferredCats = inferSystemCategories(fireAssets.length > 0 ? fireAssets : assets);

  const companyName = company?.company_name || "";
  const companyAddress = [company?.address, company?.city, company?.postcode].filter(Boolean).join(", ");

  // ── Previous cert references ───────────────────────────────────────────────
  const prevInstall = certs.find((c) => c.form_type === "bs5839_installation");
  const prevComm = certs.find((c) => c.form_type === "bs5839_commissioning");
  const prevMod = certs.find((c) => c.form_type === "bs5839_modification");

  // ── Build Installation prefill ─────────────────────────────────────────────
  const installation: Partial<InstallationPayload> = {
    date_of_completion: visitDate,
    job_number: jobNumber || "",
    work_type: inferWorkType(visitType),
    standard_installed_to: "BS 5839-1:2017+A2:2019",

    premises_name: premisesName,
    premises_address: premisesAddress,
    premises_postcode: premisesPostcode,

    responsible_person_name: rpName,
    responsible_person_email: rpEmail,
    responsible_person_telephone: rpPhone,

    system_categories: inferredCats.length > 0 ? inferredCats : undefined,
    system_type: systemType || "",
    panel_manufacturer: panelManufacturer,
    panel_model: panelModel,
    panel_serial_number: panelSerial,
    number_of_zones: totalZones ?? "",
    total_devices_installed: totalDevices,
    areas_covered: areasCovered,

    company_name: companyName,
    company_address: companyAddress,

    // Outstanding works and variations default to No
    variations_present: "No",
    outstanding_works_present: "No",
  };

  // ── Build Commissioning prefill ────────────────────────────────────────────
  const commissioning: Partial<CommissioningPayload> = {
    date_of_commissioning: visitDate,
    job_number: jobNumber || "",
    installation_cert_ref: prevInstall?.certificate_reference || "",

    premises_name: premisesName,
    premises_address: premisesAddress,
    premises_postcode: premisesPostcode,

    responsible_person_name: rpName,
    responsible_person_email: rpEmail,
    responsible_person_telephone: rpPhone,

    system_categories: inferredCats.length > 0 ? inferredCats : undefined,
    system_type: systemType || "",
    panel_manufacturer: panelManufacturer,
    panel_model: panelModel,
    panel_serial_number: panelSerial,
    total_devices_on_system: totalDevices,

    company_name: companyName,

    outstanding_items_present: "No",
  };

  // ── Build Modification prefill ─────────────────────────────────────────────
  const modification: Partial<ModificationPayload> = {
    date_of_modification: visitDate,
    job_number: jobNumber || "",

    premises_name: premisesName,
    premises_address: premisesAddress,
    premises_postcode: premisesPostcode,

    responsible_person_name: rpName,
    responsible_person_email: rpEmail,
    responsible_person_telephone: rpPhone,

    // Existing system — pull from the most recent installation/commissioning cert payload
    original_installation_cert_ref: prevInstall?.certificate_reference || "",
    original_commissioning_cert_ref: prevComm?.certificate_reference || "",
    previous_modification_cert_ref: prevMod?.certificate_reference || "",

    existing_system_category: inferredCats.length > 0 ? inferredCats : undefined,
    existing_panel_manufacturer: panelManufacturer,
    existing_panel_model: panelModel,

    standard_modified_to: "BS 5839-1:2017+A2:2019",
    company_name: companyName,

    variations_present: "No",
    outstanding_works_present: "No",
    system_category_changed: "No",
  };

  // ── Merge last cert payloads for same form type on this site ─────────────────
  // This means if you've issued an FD/02 for this site before, the new one comes
  // pre-filled with all system details from the last one, overridden by fresh data.
  const [lastInstall, lastComm, lastMod] = await Promise.allSettled([
    getLastCertPayload(siteId, "bs5839_installation"),
    getLastCertPayload(siteId, "bs5839_commissioning"),
    getLastCertPayload(siteId, "bs5839_modification"),
  ]);

  // System-level fields that carry over from previous cert (panel details, areas etc.)
  const CARRY_OVER_FIELDS: (keyof InstallationPayload)[] = [
    "system_categories", "system_type", "panel_manufacturer", "panel_model",
    "panel_software_version", "panel_serial_number", "number_of_zones",
    "total_devices_installed", "areas_covered", "areas_excluded",
    "cable_types_used", "standby_power_type", "battery_capacity_ah",
    "standard_installed_to", "company_name", "company_address", "fia_member_number",
  ];
  // Fields that must NOT carry over (they are job-specific or sensitive)
  const NEVER_CARRY = new Set([
    "certificate_reference", "date_of_completion", "date_of_commissioning",
    "date_of_modification", "job_number", "work_type",
    "engineer_signature", "rp_signature", "engineer_signed_date", "rp_signed_date",
    "variations", "outstanding_works", "variations_present", "outstanding_works_present",
    "commissioning_tests", "post_mod_tests",
  ]);

  function mergeCarryOver<T extends Record<string, unknown>>(
    fresh: Partial<T>,
    last: Record<string, unknown> | null
  ): Partial<T> {
    if (!last) return fresh;
    const merged = { ...fresh };
    for (const key of CARRY_OVER_FIELDS) {
      if (NEVER_CARRY.has(key)) continue;
      // Only carry over if the fresh prefill didn't already get a value from site/asset data
      const freshVal = (fresh as Record<string, unknown>)[key];
      const lastVal = last[key];
      const freshIsEmpty = freshVal === undefined || freshVal === "" || (Array.isArray(freshVal) && freshVal.length === 0);
      if (freshIsEmpty && lastVal !== undefined && lastVal !== "") {
        (merged as Record<string, unknown>)[key] = lastVal;
      }
    }
    return merged;
  }

  const lastInstallPayload = lastInstall.status === "fulfilled" ? lastInstall.value : null;
  const lastCommPayload    = lastComm.status === "fulfilled"    ? lastComm.value    : null;
  const lastModPayload     = lastMod.status === "fulfilled"     ? lastMod.value     : null;

  return {
    installation:  mergeCarryOver<InstallationPayload>(installation, lastInstallPayload),
    commissioning: mergeCarryOver<CommissioningPayload>(commissioning, lastCommPayload),
    modification:  mergeCarryOver<ModificationPayload>(modification, lastModPayload),
  };
}

// BS 5839-1 cert DOCX generator.
//
// Single edge function with one branch per cert type. Takes a
// { cert_id } body, looks up the parent site_bafe_certificates row,
// reads cert-type-specific data from the satellite tables, fills the
// matching template, uploads to bs5839-cert-outputs, returns the
// storage path + signed URL + base64.
//
// Cert types and their data sources:
//   installation  — site_bafe_certificates only (slim form, all
//                   fields live on the parent row).
//   commissioning — site_bafe_certificates + bs5839_commissioning_certs
//                   + 33 bs5839_commissioning_checks rows (page 2).
//   acceptance    — site_bafe_certificates + bs5839_acceptance_certs
//                   + bs5839_acceptance_trained_persons rows (up to 4).
//   battery_calc  — site_bafe_certificates + bs5839_battery_calculations
//                   rows (one row per panel — first panel only in this
//                   first cut; multi-panel pagination is a follow-up).
//
// Same JSZip + placeholder-substitution pattern as
// generate-callout-docx and generate-cause-effect-docx. The
// substitution engine fills <w:t>[Placeholder]</w:t> by exact text
// match; templates were built with these placeholders in mind
// (scripts/_build_bs5839_templates.py).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { INSTALLATION_TEMPLATE_BASE64 } from "./_installation-template.ts";
import { COMMISSIONING_TEMPLATE_BASE64 } from "./_commissioning-template.ts";
import { ACCEPTANCE_TEMPLATE_BASE64 } from "./_acceptance-template.ts";
import { BATTERY_CALC_TEMPLATE_BASE64 } from "./_battery-calc-template.ts";

const BUCKET = "bs5839-cert-outputs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

// ──────────────────────────────────────────────────────────────────────
// XML helpers — copied verbatim from generate-callout-docx so the
// fill semantics stay consistent (em-dash on empty, attribute-aware
// <w:t> matching, ampersand escape parity).

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function xmlEscapeSearch(s: string): string {
  return s.replace(/&/g, "&amp;");
}

function replaceWtText(xml: string, placeholder: string, value: string): string {
  const safe = xmlEscapeSearch(placeholder).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(<w:t(?:\\s[^>]*)?>)([^<]*?)${safe}([^<]*?)(</w:t>)`, "g");
  return xml.replace(re, (_m, openTag, before, after, closeTag) =>
    `${openTag}${before}${escapeXmlText(value)}${after}${closeTag}`,
  );
}

function fill(xml: string, placeholder: string, value: string | null | undefined): string {
  const v = (value == null || (typeof value === "string" && value.trim() === ""))
    ? "—"
    : String(value).trim();
  return replaceWtText(xml, placeholder, v);
}

// fill() always sets a value, even an em-dash for empty. The
// continuation-page slot on the Installation cert is the one case
// where we'd rather render an empty cell than "—". This variant
// substitutes an empty string when the input is null.
function fillOrBlank(xml: string, placeholder: string, value: string | null | undefined): string {
  const v = (value == null || (typeof value === "string" && value.trim() === ""))
    ? ""
    : String(value).trim();
  return replaceWtText(xml, placeholder, v);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

// ──────────────────────────────────────────────────────────────────────
// Data loaders — service-role queries that build the bundle for each
// cert type. Returns null if the parent cert can't be found.

interface ParentCert {
  id: string;
  certificate_number: string;
  bs5839_cert_type: string | null;
  bs5839_install_category: string | null;
  bs5839_install_extent_of_liability: string | null;
  certificate_type: string | null;
  completion_date: string | null;
  issued_date: string | null;
  variations_list: string | null;
  signed_by: string | null;
  site_id: string;
  customer_id: string | null;
  voided: boolean;
}

interface SiteRow {
  name: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
}

interface CustomerRow {
  name: string | null;
  contact_name: string | null;
}

interface CompanyRow {
  company_name: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
}

interface EngineerRow {
  full_name: string | null;
  // The wizard stores typed signatures as "typed:Name" and drawn as
  // base64 data URLs. Render time is responsible for picking the
  // right rendering.
  signature: string | null;
  position: string | null;
}

async function loadParent(supabase: SupabaseClient, certId: string): Promise<ParentCert | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("site_bafe_certificates")
    .select(
      "id, certificate_number, bs5839_cert_type, bs5839_install_category, " +
      "bs5839_install_extent_of_liability, certificate_type, " +
      "completion_date, issued_date, variations_list, signed_by, " +
      "site_id, customer_id, voided",
    )
    .eq("id", certId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadSite(supabase: SupabaseClient, siteId: string): Promise<SiteRow | null> {
  const { data } = await supabase
    .from("sites")
    .select("name, address, city, postcode")
    .eq("id", siteId)
    .maybeSingle();
  return data;
}

async function loadCustomer(supabase: SupabaseClient, customerId: string | null): Promise<CustomerRow | null> {
  if (!customerId) return null;
  const { data } = await supabase
    .from("customers")
    .select("name, contact_name")
    .eq("id", customerId)
    .maybeSingle();
  return data;
}

async function loadCompany(supabase: SupabaseClient): Promise<CompanyRow | null> {
  // company_settings is a singleton in this single-tenant app — first
  // row is the company.
  const { data } = await supabase
    .from("company_settings")
    .select("company_name, address, city, postcode")
    .limit(1)
    .maybeSingle();
  return data;
}

async function loadEngineer(supabase: SupabaseClient, userId: string | null): Promise<EngineerRow | null> {
  if (!userId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("profiles")
    .select("full_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    full_name: data.full_name ?? null,
    // profiles doesn't currently store position / signature — the
    // edge function falls back to placeholder text. A follow-up can
    // pull from a dedicated engineer signature table.
    signature: null,
    position: null,
  };
}

function composeSiteAddress(site: SiteRow | null): { line: string | null; postcode: string | null } {
  if (!site) return { line: null, postcode: null };
  const parts = [site.address, site.city].filter((p): p is string => !!p && p.trim() !== "");
  return {
    line: parts.length > 0 ? parts.join(", ") : null,
    postcode: site.postcode,
  };
}

function composeCompanyAddress(company: CompanyRow | null): string | null {
  if (!company) return null;
  const parts = [company.address, company.city, company.postcode]
    .filter((p): p is string => !!p && p.trim() !== "");
  return parts.length > 0 ? parts.join(", ") : null;
}

// ──────────────────────────────────────────────────────────────────────
// A056 Installation — slim form, fields all on the parent + extras.

async function fillInstallationTemplate(
  supabase: SupabaseClient,
  parent: ParentCert,
): Promise<{ xml: string; templateBytes: Uint8Array }> {
  const [site, customer, company, engineer] = await Promise.all([
    loadSite(supabase, parent.site_id),
    loadCustomer(supabase, parent.customer_id),
    loadCompany(supabase),
    loadEngineer(supabase, parent.signed_by),
  ]);
  const siteAddr = composeSiteAddress(site);

  const templateBytes = base64ToBytes(INSTALLATION_TEMPLATE_BASE64);
  const zip = await JSZip.loadAsync(templateBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Installation template missing word/document.xml");
  let xml = await docFile.async("string");

  xml = fill(xml, "[Site Address]", siteAddr.line);
  xml = fill(xml, "[Site Postcode]", siteAddr.postcode);
  xml = fill(xml, "[Engineer Name]", engineer?.full_name ?? null);
  xml = fill(xml, "[Engineer Position]", engineer?.position ?? null);
  xml = fillSignature(xml, "[Engineer Signature]", engineer?.signature ?? null);
  xml = fill(xml, "[Date]", fmtDate(parent.issued_date ?? parent.completion_date));
  xml = fill(xml, "[Company Name]", company?.company_name ?? null);
  xml = fill(xml, "[Company Address]", composeCompanyAddress(company));
  xml = fill(xml, "[Category of System]", parent.bs5839_install_category);
  xml = fill(xml, "[Certificate Number]", parent.certificate_number);
  xml = fill(xml, "[Extent of Liability]", parent.bs5839_install_extent_of_liability);
  xml = fill(xml, "[Agreed Variations]", parent.variations_list);
  xml = fillOrBlank(xml, "[Variations Continuation]", null);

  zip.file("word/document.xml", xml);
  return { xml, templateBytes };
}

// ──────────────────────────────────────────────────────────────────────
// A051 Commissioning — header row + 33-item checklist + page-3 fields.

interface CommissioningHeader {
  customer_name: string | null;
  customer_address: string | null;
  customer_postcode: string | null;
  system_state: string | null;
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
}

interface CommissioningCheck {
  item_number: number;
  response: "Y" | "N" | "NA";
}

async function fillCommissioningTemplate(
  supabase: SupabaseClient,
  parent: ParentCert,
): Promise<{ xml: string; templateBytes: Uint8Array }> {
  const [site, company, engineer, headerRes, checksRes] = await Promise.all([
    loadSite(supabase, parent.site_id),
    loadCompany(supabase),
    loadEngineer(supabase, parent.signed_by),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("bs5839_commissioning_certs")
      .select("*")
      .eq("cert_id", parent.id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("bs5839_commissioning_checks")
      .select("item_number, response, commissioning_cert_id, " +
              "commissioning_cert:bs5839_commissioning_certs!inner(cert_id)")
      .eq("commissioning_cert.cert_id", parent.id),
  ]);
  const header = (headerRes.data ?? {}) as Partial<CommissioningHeader>;
  const checks: CommissioningCheck[] = checksRes.data ?? [];
  const siteAddr = composeSiteAddress(site);

  const templateBytes = base64ToBytes(COMMISSIONING_TEMPLATE_BASE64);
  const zip = await JSZip.loadAsync(templateBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Commissioning template missing word/document.xml");
  let xml = await docFile.async("string");

  // ── Page 1 — Client / System / Examination block ─────────────────
  xml = fill(xml, "[Customer Name]", header.customer_name ?? null);
  xml = fill(xml, "[Customer Address]", header.customer_address ?? null);
  xml = fill(xml, "[Customer Postcode]", header.customer_postcode ?? null);
  xml = fill(xml, "[Site Address]", siteAddr.line);
  xml = fill(xml, "[Extent of System]", header.extent_of_system ?? null);
  xml = fill(xml, "[New / Modification]",
    header.system_state === "new" ? "New"
    : header.system_state === "modification" ? "Modification"
    : null,
  );
  xml = fill(xml, "[Category of System]", parent.bs5839_install_category);
  xml = fill(xml, "[Specifier]", header.specifier ?? null);
  xml = fill(xml, "[Soak Test Weeks]",
    header.soak_test_weeks != null ? String(header.soak_test_weeks) : null,
  );
  xml = fill(xml, "[N/A]", header.soak_test_weeks != null ? "" : "N/A");
  xml = fill(xml, "[Outstanding Work]", header.outstanding_work ?? null);
  xml = fill(xml, "[False Alarm Risks]", header.false_alarm_risks ?? null);
  xml = fill(xml, "[Cl 39 Variations]", parent.variations_list);

  // ── Sign-off + organisation block ────────────────────────────────
  xml = fill(xml, "[Engineer Name]", engineer?.full_name ?? null);
  xml = fill(xml, "[Engineer Position]", engineer?.position ?? null);
  xml = fillSignature(xml, "[Engineer Signature]", engineer?.signature ?? null);
  xml = fill(xml, "[Date]", fmtDate(parent.issued_date ?? parent.completion_date));
  xml = fill(xml, "[Company Name]", company?.company_name ?? null);
  xml = fill(xml, "[Company Address]", composeCompanyAddress(company));
  xml = fill(xml, "[Design Cert Number]", header.design_cert_number ?? null);
  xml = fill(xml, "[Design Drawings]", header.design_drawings_ref ?? null);
  xml = fill(xml, "[Installation Cert Number]", header.installation_cert_number ?? null);
  xml = fill(xml, "[As Fitted Drawings]", header.as_fitted_drawings_ref ?? null);

  // ── Page 3 — Incomplete-work block ───────────────────────────────
  xml = fill(xml, "[Incomplete Work Details]", header.incomplete_work_details ?? null);
  xml = fill(xml, "[Incomplete Work Reasons]", header.incomplete_work_reasons ?? null);
  xml = fillOrBlank(xml, "[Further Visit Required]", header.further_visit_required);

  // ── Page 2 — 33-item §39 checklist ───────────────────────────────
  // Each item gets three placeholders ([Q{n}Y], [Q{n}N], [Q{n}NA]),
  // one per Y/N/NA column. Fill the chosen column with the ticked
  // glyph and the others with the empty glyph.
  const responseByItem = new Map<number, "Y" | "N" | "NA">();
  for (const c of checks) responseByItem.set(c.item_number, c.response);

  for (let n = 1; n <= 33; n++) {
    const r = responseByItem.get(n);
    xml = replaceWtText(xml, `[Q${n}Y]`,  r === "Y"  ? "☑" : "☐");
    xml = replaceWtText(xml, `[Q${n}N]`,  r === "N"  ? "☑" : "☐");
    xml = replaceWtText(xml, `[Q${n}NA]`, r === "NA" ? "☑" : "☐");
  }

  zip.file("word/document.xml", xml);
  return { xml, templateBytes };
}

// ──────────────────────────────────────────────────────────────────────
// A038 Acceptance — customer-signed handover.

interface AcceptanceHeader {
  customer_name: string | null;
  customer_position: string | null;
  customer_signature: string | null;
  customer_organisation: string | null;
  extent_of_system: string | null;
  work_required: string | null;
}

interface TrainedPerson {
  slot: number;
  person_name: string;
}

async function fillAcceptanceTemplate(
  supabase: SupabaseClient,
  parent: ParentCert,
): Promise<{ xml: string; templateBytes: Uint8Array }> {
  const [site, headerRes, trainedRes] = await Promise.all([
    loadSite(supabase, parent.site_id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("bs5839_acceptance_certs")
      .select("*")
      .eq("cert_id", parent.id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("bs5839_acceptance_trained_persons")
      .select("slot, person_name, acceptance_cert_id, " +
              "acceptance_cert:bs5839_acceptance_certs!inner(cert_id)")
      .eq("acceptance_cert.cert_id", parent.id)
      .order("slot"),
  ]);
  const header = (headerRes.data ?? {}) as Partial<AcceptanceHeader>;
  const trained: TrainedPerson[] = trainedRes.data ?? [];
  const trainedBySlot = new Map<number, string>();
  for (const t of trained) trainedBySlot.set(t.slot, t.person_name);

  const siteAddr = composeSiteAddress(site);

  const templateBytes = base64ToBytes(ACCEPTANCE_TEMPLATE_BASE64);
  const zip = await JSZip.loadAsync(templateBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Acceptance template missing word/document.xml");
  let xml = await docFile.async("string");

  xml = fill(xml, "[Site Address]", siteAddr.line);
  xml = fill(xml, "[Site Postcode]", siteAddr.postcode);
  xml = fill(xml, "[Customer Name]", header.customer_name ?? null);
  xml = fill(xml, "[Customer Position]", header.customer_position ?? null);
  xml = fillSignature(xml, "[Customer Signature]", header.customer_signature ?? null);
  xml = fill(xml, "[Date]", fmtDate(parent.issued_date ?? parent.completion_date));
  xml = fill(xml, "[Customer Organisation]", header.customer_organisation ?? null);
  xml = fill(xml, "[Extent of System]", header.extent_of_system ?? null);
  xml = fill(xml, "[Work Required]", header.work_required ?? null);
  xml = fill(xml, "[Cl 39 Variations]", parent.variations_list);
  for (let i = 1; i <= 4; i++) {
    xml = fillOrBlank(xml, `[Trained Person ${i}]`, trainedBySlot.get(i) ?? null);
  }

  zip.file("word/document.xml", xml);
  return { xml, templateBytes };
}

// ──────────────────────────────────────────────────────────────────────
// A058 Battery Calculation — one panel per call (first row by
// created_at). Multi-panel pagination is a follow-up: the caller
// invokes once per panel, or a future version of the function
// generates a multi-page DOCX with one sheet per panel.

interface BatteryCalc {
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
}

async function fillBatteryCalcTemplate(
  supabase: SupabaseClient,
  parent: ParentCert,
  panelId: string | null,
): Promise<{ xml: string; templateBytes: Uint8Array }> {
  const [site, calcRes] = await Promise.all([
    loadSite(supabase, parent.site_id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (panelId
      ? (supabase as any)
          .from("bs5839_battery_calculations")
          .select("*")
          .eq("id", panelId)
          .maybeSingle()
      : (supabase as any)
          .from("bs5839_battery_calculations")
          .select("*")
          .eq("cert_id", parent.id)
          .order("created_at")
          .limit(1)
          .maybeSingle()),
  ]);
  const calc = (calcRes.data ?? {}) as Partial<BatteryCalc>;
  const siteAddr = composeSiteAddress(site);

  const templateBytes = base64ToBytes(BATTERY_CALC_TEMPLATE_BASE64);
  const zip = await JSZip.loadAsync(templateBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("Battery calc template missing word/document.xml");
  let xml = await docFile.async("string");

  xml = fill(xml, "[Site Address]", siteAddr.line);
  xml = fill(xml, "[Site Postcode]", siteAddr.postcode);
  xml = fill(xml, "[Job Number]", parent.certificate_number);
  xml = fill(xml, "[Standby Current]", numOrNull(calc.standby_current_a));
  xml = fill(xml, "[Standby Hours]", numOrNull(calc.standby_hours));
  xml = fill(xml, "[Alarm Current]", numOrNull(calc.alarm_current_a));
  xml = fill(xml, "[Battery Subtotal]", numOrNull(calc.battery_subtotal_ah));
  xml = fill(xml, "[Min Battery Capacity]", numOrNull(calc.min_battery_capacity_ah));
  xml = fill(xml, "[Design Battery]", numOrNull(calc.design_battery_size_ah));
  xml = fill(xml, "[Installed Battery]", numOrNull(calc.installed_battery_size_ah));
  xml = fill(xml, "[Panel Location]", calc.panel_location ?? calc.panel_label ?? null);
  xml = fill(xml, "[Loop Count]", numOrNull(calc.loop_count));
  xml = fill(xml, "[Test Engineer Name]", calc.test_engineer_name ?? null);
  xml = fillSignature(xml, "[Test Engineer Signature]", calc.test_engineer_signature ?? null);
  xml = fill(xml, "[Test Date]", fmtDate(calc.test_date));
  xml = fill(xml, "[Test Meter Model]", calc.test_meter_model ?? null);
  xml = fill(xml, "[Test Meter Serial]", calc.test_meter_serial ?? null);

  zip.file("word/document.xml", xml);
  return { xml, templateBytes };
}

function numOrNull(n: number | null | undefined): string | null {
  return n == null ? null : String(n);
}

// ──────────────────────────────────────────────────────────────────────
// Signature rendering. For now: text-only.
//   "typed:Some Name" → render "Some Name" in the placeholder slot
//   "data:image/..."  → render "(signature on file)" placeholder text.
//                       Image embedding is a follow-up — mirrors the
//                       deferred-embedding decision documented in the
//                       callout cert pipeline.
//   null / absent      → em-dash via fill()
function fillSignature(xml: string, placeholder: string, value: string | null): string {
  if (!value) return fill(xml, placeholder, null);
  if (value.startsWith("typed:")) {
    return fill(xml, placeholder, value.slice("typed:".length));
  }
  if (value.startsWith("data:image/")) {
    return replaceWtText(xml, placeholder, "(signature on file)");
  }
  // Anything else — render as text. Engineer who handcrafted the
  // value gets it printed verbatim.
  return fill(xml, placeholder, value);
}

// ──────────────────────────────────────────────────────────────────────
// Encoding helpers.

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// HTTP handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  try {
    const body = await req.json();
    const certId: string | undefined = body?.cert_id;
    // Optional panel_id for battery calc — pick a specific panel
    // when the cert has multiple rows. Defaults to the first row by
    // created_at if not provided.
    const panelId: string | null = body?.panel_id ?? null;
    if (!certId) throw new Error("cert_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const parent = await loadParent(supabase, certId);
    if (!parent) throw new Error(`Cert ${certId} not found`);
    if (parent.voided) throw new Error("Cannot generate DOCX for a voided cert");
    if (!parent.bs5839_cert_type) {
      throw new Error(`Cert ${certId} has no bs5839_cert_type set`);
    }

    let filled: { xml: string; templateBytes: Uint8Array };
    switch (parent.bs5839_cert_type) {
      case "installation":
        filled = await fillInstallationTemplate(supabase, parent);
        break;
      case "commissioning":
        filled = await fillCommissioningTemplate(supabase, parent);
        break;
      case "acceptance":
        filled = await fillAcceptanceTemplate(supabase, parent);
        break;
      case "battery_calc":
        filled = await fillBatteryCalcTemplate(supabase, parent, panelId);
        break;
      default:
        throw new Error(`Unknown bs5839_cert_type: ${parent.bs5839_cert_type}`);
    }

    // The zip we worked with above had its document.xml mutated;
    // re-load + write back to get the final bytes. (We could keep
    // the zip handle but the loaders are easier to read as
    // self-contained.)
    const zip = await JSZip.loadAsync(filled.templateBytes);
    zip.file("word/document.xml", filled.xml);
    const out = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
    });

    // Upload to bs5839-cert-outputs so convert-quote-pdf can render
    // a PDF in a follow-on call.
    const storagePath = `${parent.id}/${parent.bs5839_cert_type}.docx`;
    let signedUrl: string | null = null;
    let uploadError: string | null = null;
    try {
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, out, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET).createSignedUrl(storagePath, 3600);
      if (signErr || !signed) throw signErr ?? new Error("signed-url returned no data");
      signedUrl = signed.signedUrl;
    } catch (err) {
      uploadError = err instanceof Error ? err.message : String(err);
      console.error("[generate-bs5839-cert-docx] storage upload failed:", uploadError);
    }

    return new Response(
      JSON.stringify({
        storage_path: uploadError ? null : storagePath,
        signed_url: signedUrl,
        bucket: BUCKET,
        docx_base64: bytesToBase64(out),
        cert_type: parent.bs5839_cert_type,
        certificate_number: parent.certificate_number,
        diagnostics: {
          template_bytes: filled.templateBytes.length,
          output_bytes: out.length,
          storage_upload_error: uploadError,
        },
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-bs5839-cert-docx]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

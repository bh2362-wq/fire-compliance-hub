// Cause & Effect + Audibility Test report DOCX generator.
//
// Architecture: opens the BHO C&E template (assets/cause-effect-
// template-baseline.docx, embedded as base64 in _template-data.ts so
// we don't need a separate storage upload step), runs placeholder
// substitution against the bundle the client posts, and uploads the
// filled DOCX to the ce-outputs bucket. The follow-on convert-quote-pdf
// invocation (with bucket: "ce-outputs") then renders the PDF.
//
// Why template-based rather than programmatic: the template was
// crafted to match the master quote template exactly — same fonts,
// section headings, info cards, sig boxes, red header bars. Filling
// it preserves that styling pixel-perfectly. The programmatic version
// (previous revision in git history) had to re-derive the styling in
// code and could drift from the quote template over time.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { CE_TEMPLATE_BASE64 } from "./_template-data.ts";

// ──────────────────────────────────────────────────────────────────────
// Input types — must match CauseEffectReportBundle in
// src/services/causeEffectTestService.ts. Narrowed to fields we render.

interface Report {
  id: string;
  general_observations: string | null;
  test_methodology: string | null;
  panel_make_model: string | null;
  num_devices_total: number | null;
  arc_monitoring: boolean | null;
  sound_meter_make_model: string | null;
  sound_meter_serial: string | null;
  sound_meter_cal_due: string | null;
  compliance_status: string | null;          // 'complies' | 'does_not_comply'
  remedial_timeframe_days: string | null;
  next_service_due: string | null;
  engineer_name: string | null;
  client_name: string | null;
  client_company: string | null;
  attach_ce_matrix: boolean | null;
  attach_floor_plans: boolean | null;
  attach_calibration_cert: boolean | null;
  attach_photos: boolean | null;
  attach_previous_reports: boolean | null;
}

interface Site {
  name: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}
interface Customer { name: string | null; }
interface Visit { visit_date: string; job_number: string | null; }
interface OutputCheck { function_name: string; expected: string | null; actual: string | null; result: string | null; }
interface AudibilityReading {
  location: string | null;
  floor: string | null;
  ambient_db: number | null;
  alarm_db: number | null;
  required_db: number | null;
  result: string | null;
}
interface Issue {
  kind: string;
  description: string | null;
  location: string | null;
  measured_db: number | null;
  required_db: number | null;
  severity: string | null;
  action_required: string | null;
}
interface Remedial {
  priority: string | null;
  description: string | null;
  location: string | null;
  estimated_cost: number | null;
}

interface Bundle {
  report: Report;
  site: Site;
  customer: Customer | null;
  visit: Visit;
  outputs: OutputCheck[];
  readings: AudibilityReading[];
  issues: Issue[];
  remedials: Remedial[];
}

// ──────────────────────────────────────────────────────────────────────
// XML helpers — same pattern as generate-quote-docx so the behaviour
// matches what the quote template fill already proves out.

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function xmlEscapeSearch(s: string): string {
  // The template stores ampersands escaped as &amp;. When we search
  // for a placeholder text we must use the same form.
  return s.replace(/&/g, "&amp;");
}

// Replace every occurrence of `placeholder` text in <w:t> elements
// with `value`. Matches both bare `<w:t>` and attribute-rich
// `<w:t xml:space="preserve">` tags.
function replaceWtText(xml: string, placeholder: string, value: string): string {
  const safe = xmlEscapeSearch(placeholder).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(<w:t(?:\\s[^>]*)?>)([^<]*?)${safe}([^<]*?)(</w:t>)`, "g");
  return xml.replace(re, (_m, openTag, before, after, closeTag) =>
    `${openTag}${before}${escapeXmlText(value)}${after}${closeTag}`,
  );
}

// Convenience: replace OR insert "—" placeholder for empty values so
// the rendered cell isn't visually blank.
function fill(xml: string, placeholder: string, value: string | null | undefined): string {
  const v = (value == null || (typeof value === "string" && value.trim() === "")) ? "—" : String(value).trim();
  return replaceWtText(xml, placeholder, v);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

function fmtTimeframe(value: string | null): string {
  const t = value?.trim();
  if (!t) return "the agreed timescale";
  if (/^\d+$/.test(t)) return `${t} days`;
  return t;
}

function dedupeParagraphs(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => {
      if (p.length === 0) return false;
      const key = p.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n\n");
}

// ──────────────────────────────────────────────────────────────────────
// Row-cloning for dynamic tables

// Find the start index of the <w:tr ...> element enclosing the
// position `anchorIdx` falls inside. Scans backwards for the tag.
function findEnclosingTrStart(xml: string, anchorIdx: number): number {
  const re = /<w:tr(?:\s|>)/g;
  let lastIdx = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && m.index < anchorIdx) lastIdx = m.index;
  return lastIdx;
}

function findEnclosingTrEnd(xml: string, anchorIdx: number): number {
  const end = xml.indexOf("</w:tr>", anchorIdx);
  return end < 0 ? -1 : end + "</w:tr>".length;
}

// Given a placeholder row template (XML of one <w:tr>) and a list of
// data rows, returns the concatenated XML of N filled clones. Each
// data row is a Record<placeholder, value>.
function cloneRowFor(
  templateRowXml: string,
  rows: Record<string, string>[],
): string {
  if (rows.length === 0) return "";
  return rows
    .map((row) => {
      let xml = templateRowXml;
      for (const [ph, val] of Object.entries(row)) {
        xml = replaceWtText(xml, ph, val);
      }
      return xml;
    })
    .join("");
}

// Locate a placeholder row by one of its placeholders, return
// [trStart, trEnd, rowXml]. If not found, returns null (caller can skip
// the section — likely the engineer hasn't filled that bit yet).
function locateRowByPlaceholder(xml: string, marker: string): [number, number, string] | null {
  const idx = xml.indexOf(marker);
  if (idx < 0) return null;
  const trStart = findEnclosingTrStart(xml, idx);
  const trEnd = findEnclosingTrEnd(xml, idx);
  if (trStart < 0 || trEnd < 0) return null;
  return [trStart, trEnd, xml.slice(trStart, trEnd)];
}

// Replace the placeholder row with N filled clones. If `rows` is empty,
// the placeholder row is removed and a single "no data" row is inserted
// in its place — keeps the section visually intact rather than leaving
// a header-only orphan table.
function fillTable(
  xml: string,
  markerPlaceholder: string,
  rows: Record<string, string>[],
  emptyMessage: string,
  columnCount: number,
): string {
  const located = locateRowByPlaceholder(xml, markerPlaceholder);
  if (!located) return xml;
  const [trStart, trEnd, rowXml] = located;
  if (rows.length === 0) {
    const empty = buildEmptyRow(rowXml, emptyMessage, columnCount);
    return xml.slice(0, trStart) + empty + xml.slice(trEnd);
  }
  const filled = cloneRowFor(rowXml, rows);
  return xml.slice(0, trStart) + filled + xml.slice(trEnd);
}

// Synthesise a colspan'd "no data" row by mutating the original
// placeholder row: keep the first <w:tc>, drop the rest, add a
// gridSpan attribute. Doesn't touch the table's column widths so the
// header row still aligns above it.
function buildEmptyRow(rowXml: string, message: string, columnCount: number): string {
  // Find the first <w:tc>...</w:tc> in the row
  const tcStart = rowXml.indexOf("<w:tc");
  const tcEnd = rowXml.indexOf("</w:tc>", tcStart);
  if (tcStart < 0 || tcEnd < 0) return rowXml; // shouldn't happen on a valid template
  const firstTc = rowXml.slice(tcStart, tcEnd + "</w:tc>".length);
  // Build a single-cell row spanning the whole table: take first cell's
  // <w:tcPr>, inject <w:gridSpan>, replace inner text with the empty
  // message in italic muted style.
  const italic = '<w:r><w:rPr><w:i/><w:iCs/><w:color w:val="6B7280"/></w:rPr>' +
    `<w:t xml:space="preserve">${escapeXmlText(message)}</w:t></w:r>`;
  let merged = firstTc;
  // Inject gridSpan into tcPr if not present
  if (/<w:tcPr>/.test(merged)) {
    merged = merged.replace(
      "<w:tcPr>",
      `<w:tcPr><w:gridSpan w:val="${columnCount}"/>`,
    );
  } else {
    merged = merged.replace(
      "<w:tc>",
      `<w:tc><w:tcPr><w:gridSpan w:val="${columnCount}"/></w:tcPr>`,
    );
  }
  // Replace the cell's paragraph content with just the italic message.
  merged = merged.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/, `<w:p><w:r>${italic.slice(8)}</w:p>`);
  // (The above regex eats only the FIRST paragraph; if the cell had
  // more paragraphs they remain. For our template the placeholder
  // rows have one paragraph per cell so this is fine.)
  return `<w:tr>${merged}</w:tr>`;
}

// ──────────────────────────────────────────────────────────────────────
// Checkbox swap — for compliance + attachments. The template uses ☐;
// we replace it with ☑ on the chosen line by matching the trailing
// label text and rewriting the leading character.

function tickAttachment(xml: string, label: string, ticked: boolean): string {
  if (!ticked) return xml;
  // Match the paragraph that holds the checkbox + the label text. The
  // template has them as a single paragraph with two <w:t> runs.
  const safe = xmlEscapeSearch(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(<w:t[^>]*>)([^<]*?)☐([^<]*?)(</w:t>)([\\s\\S]*?<w:t[^>]*>${safe}</w:t>)`, "g");
  return xml.replace(re, (_m, openTag, before, after, closeTag, tail) =>
    `${openTag}${before}☑${after}${closeTag}${tail}`,
  );
}

function tickCompliance(xml: string, complies: boolean): string {
  const complyLabel = "COMPLIES with BS 5839-1:2017 requirements.";
  const noComplyLabel = "DOES NOT COMPLY — see remedial works in section 6.";
  return tickAttachment(tickAttachment(xml, complyLabel, complies), noComplyLabel, !complies);
}

// ──────────────────────────────────────────────────────────────────────
// Main fill

function buildBundleXml(bundle: Bundle, originalXml: string): string {
  let xml = originalXml;
  const r = bundle.report;
  const s = bundle.site;
  const v = bundle.visit;

  // ── Title row + REF/DATE ─────────────────────────────────────────
  xml = fill(xml, "[Job Ref]", v.job_number);
  xml = fill(xml, "[Visit Date]", fmtDate(v.visit_date));

  // ── SITE info card ───────────────────────────────────────────────
  xml = fill(xml, "[Site Name]", s.name);
  const addrParts = [s.address, s.city, s.postcode].filter(Boolean);
  xml = fill(xml, "[Site Address]", addrParts.length > 0 ? addrParts.join(", ") : null);
  xml = fill(xml, "[Site Contact Name]", s.contact_name);
  xml = fill(xml, "[Site Contact Phone]", s.contact_phone);

  // ── JOB DETAILS info card ────────────────────────────────────────
  xml = fill(xml, "[Customer]", bundle.customer?.name ?? null);
  xml = fill(xml, "[Engineer]", r.engineer_name);
  xml = fill(xml, "[Panel Make Model]", r.panel_make_model);
  xml = fill(xml, "[Device Count]", r.num_devices_total != null ? String(r.num_devices_total) : null);
  xml = fill(xml, "[ARC Status]", r.arc_monitoring == null ? null : r.arc_monitoring ? "Yes" : "No");

  // ── §2 System details key/value pairs ────────────────────────────
  // (same placeholders as the info card — already covered above; the
  // template just shows the same data in two places.)

  // ── §3.1 Methodology ─────────────────────────────────────────────
  xml = fill(xml, "[Test Methodology]", r.test_methodology);

  // ── §3.3 Output functions table — dynamic rows ───────────────────
  xml = fillTable(xml, "[Function]", bundle.outputs.map((o) => ({
    "[Function]": o.function_name ?? "—",
    "[Expected Response]": o.expected ?? "—",
    "[Actual Response]": o.actual ?? "—",
    "[Output Result]": (
      o.result === "pass" ? "PASS" :
      o.result === "fail" ? "FAIL" :
      o.result === "na"   ? "N/A"  : "—"
    ),
  })), "No output functions tested.", 4);

  // ── §4.1 Test equipment key/value ────────────────────────────────
  xml = fill(xml, "[Sound Meter Make Model]", r.sound_meter_make_model);
  xml = fill(xml, "[Sound Meter Serial]", r.sound_meter_serial);
  xml = fill(xml, "[Calibration Due]", fmtDate(r.sound_meter_cal_due));

  // ── §4.2 Sound level measurements table ──────────────────────────
  xml = fillTable(xml, "[Location]", bundle.readings.map((rd) => ({
    "[Location]": rd.location ?? "—",
    "[Floor]": rd.floor ?? "—",
    "[Ambient dB]": rd.ambient_db != null ? String(rd.ambient_db) : "—",
    "[Alarm dB]": rd.alarm_db != null ? String(rd.alarm_db) : "—",
    "[Required dB]": rd.required_db != null ? String(rd.required_db) : "—",
    "[Reading Result]": (
      rd.result === "pass" ? "PASS" :
      rd.result === "fail" ? "FAIL" : "—"
    ),
  })), "No reading-by-reading entries recorded — see §5.2 for non-compliant locations.", 6);

  // ── §4.3 Audibility summary ──────────────────────────────────────
  const passCount = bundle.readings.filter((rd) => rd.result === "pass").length;
  const failCount = bundle.readings.filter((rd) => rd.result === "fail").length;
  const audSummary = `Total locations tested: ${bundle.readings.length}    ·    Meeting requirements: ${passCount}    ·    Below requirements: ${failCount}`;
  xml = fill(xml, "[Audibility Summary]", audSummary);

  // ── §5.1 Cause & effect issues table ─────────────────────────────
  const ceIssues = bundle.issues.filter((i) => i.kind === "cause_effect");
  xml = fillTable(xml, "[CE Issue]", ceIssues.map((i) => ({
    "[CE Issue]": i.description ?? "—",
    "[CE Location]": i.location ?? "—",
    "[CE Severity]": (
      i.severity === "critical" ? "Critical" :
      i.severity === "non_critical" ? "Non-critical" : "—"
    ),
    "[CE Action]": i.action_required ?? "—",
  })), "No cause & effect issues identified.", 4);

  // ── §5.2 Audibility issues table ─────────────────────────────────
  const audIssues = bundle.issues.filter((i) => i.kind === "audibility");
  xml = fillTable(xml, "[Aud Issue]", audIssues.map((i) => ({
    "[Aud Issue]": i.description ?? "—",
    "[Aud Location]": i.location ?? "—",
    "[Aud Measured dB]": i.measured_db != null ? String(i.measured_db) : "—",
    "[Aud Required dB]": i.required_db != null ? String(i.required_db) : "—",
    "[Aud Action]": i.action_required ?? "—",
  })), "No audibility issues identified.", 5);

  // ── §5.3 General observations ────────────────────────────────────
  const obs = r.general_observations?.trim() ? dedupeParagraphs(r.general_observations) : null;
  xml = fill(xml, "[General Observations]", obs ?? "None recorded.");

  // ── §6 Remedial works table ──────────────────────────────────────
  const totalCost = bundle.remedials.reduce((s, rm) => s + (rm.estimated_cost ?? 0), 0);
  xml = fillTable(xml, "[Priority]", bundle.remedials.map((rm) => ({
    "[Priority]": rm.priority === "urgent" ? "URGENT" : rm.priority === "routine" ? "Routine" : "—",
    "[Remedial Description]": rm.description ?? "—",
    "[Remedial Location]": rm.location ?? "—",
    "[Estimated Cost]": rm.estimated_cost != null ? `£${rm.estimated_cost.toFixed(2)}` : "—",
  })), "No remedial works required.", 4);
  xml = fill(xml, "[Total Cost]", `£${totalCost.toFixed(2)}`);

  // ── §7 Compliance ☐ → ☑ on the chosen line ──────────────────────
  xml = tickCompliance(xml, r.compliance_status === "complies");

  // ── §8 Recommendations placeholders ─────────────────────────────
  xml = fill(xml, "[Remedial Timeframe]", fmtTimeframe(r.remedial_timeframe_days));
  xml = fill(xml, "[Next Service Due]", fmtDate(r.next_service_due));

  // ── §9 Sign-off ─────────────────────────────────────────────────
  xml = fill(xml, "[Engineer Name]", r.engineer_name);
  xml = fill(xml, "[Client Name]", r.client_name);
  xml = fill(xml, "[Client Company]", r.client_company);

  // ── §10 Attachments ☐ → ☑ where ticked ──────────────────────────
  xml = tickAttachment(xml, "Cause and Effect Matrix", !!r.attach_ce_matrix);
  xml = tickAttachment(xml, "Floor Plans with Test Locations Marked", !!r.attach_floor_plans);
  xml = tickAttachment(xml, "Sound Level Meter Calibration Certificate", !!r.attach_calibration_cert);
  xml = tickAttachment(xml, "Photographic Evidence (if applicable)", !!r.attach_photos);
  xml = tickAttachment(xml, "Previous Test Reports for Comparison", !!r.attach_previous_reports);

  return xml;
}

// ──────────────────────────────────────────────────────────────────────
// HTTP handler

function decodeTemplate(): Uint8Array {
  const bin = atob(CE_TEMPLATE_BASE64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const bundle = await req.json() as Bundle;
    if (!bundle?.report?.id) throw new Error("Missing bundle.report.id");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const templateBytes = decodeTemplate();
    const zip = await JSZip.loadAsync(templateBytes);
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) throw new Error("Template is missing word/document.xml — corrupt build");

    const originalXml = await documentFile.async("string");
    const filledXml = buildBundleXml(bundle, originalXml);
    zip.file("word/document.xml", filledXml);

    const docxBytes = await zip.generateAsync({
      type: "uint8array",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const storagePath = `${bundle.report.id}/cause-effect-report.docx`;
    const { error: upErr } = await supabase.storage.from("ce-outputs").upload(storagePath, docxBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
    if (upErr) throw new Error(`DOCX upload failed: ${upErr.message}`);

    const { data: signed, error: signErr } = await supabase.storage.from("ce-outputs").createSignedUrl(storagePath, 3600);
    if (signErr || !signed) throw new Error(`Sign failed: ${signErr?.message}`);

    return new Response(JSON.stringify({
      storage_path: storagePath,
      signed_url: signed.signedUrl,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      file_size_bytes: docxBytes.byteLength,
      bucket: "ce-outputs",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate-cause-effect-docx error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

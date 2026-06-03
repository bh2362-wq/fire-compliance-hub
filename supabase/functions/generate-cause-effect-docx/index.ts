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
  /** Captured signatures from the wizard's sign-off step. Either null
      (engineer didn't sign) or a base64 data URL like
      "data:image/png;base64,iVBORw...". When set, the function embeds
      the bitmap into the DOCX in place of the dashed signature line. */
  engineer_signature: string | null;
  client_signature: string | null;
}

interface Site {
  name: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  /** Site-level fallbacks for fire-alarm-specific fields. The C&E
      wizard's System step writes these onto the SITE row first;
      the bundle loader pulls them so we can render them in the
      JOB DETAILS card + §2 even when the engineer never re-typed
      them on the report itself. */
  panel_make_model: string | null;
  num_devices: number | null;
  arc_connected: boolean | null;
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

// Cell-value display helper for table columns. The ?? operator misses
// empty strings — a reading row added in the wizard but left blank
// has location="" which would render as a visually blank cell. This
// treats null, undefined, "" and whitespace-only as missing so every
// empty slot gets the em-dash.
function cell(value: string | null | undefined): string {
  if (value == null) return "—";
  const s = String(value).trim();
  return s === "" ? "—" : s;
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
// Multi-paragraph placeholder fill
//
// A plain text replacement on a placeholder like [General Observations]
// inserts literal '\n' inside a single <w:t> element. Word collapses
// those into spaces, so engineers see one giant blob of text instead
// of the paragraphs they typed.
//
// fillMultiParagraph fixes that: it locates the enclosing <w:p>,
// extracts its <w:pPr> (alignment, spacing) and the placeholder run's
// <w:rPr> (font sizing), then rebuilds N paragraphs — one per
// blank-line-separated chunk — re-using the same paragraph properties
// so the styling stays consistent.
//
// Lines that begin with "• ", "- ", "* ", or "– " become bullet items
// (using ListParagraph + numId=2 — the template already ships both,
// so no extra runtime setup needed).

const BULLET_RE = /^[•\-*–]\s+/;

function findEnclosingWpStart(xml: string, fromIdx: number): number {
  const a = xml.lastIndexOf("<w:p>", fromIdx);
  const b = xml.lastIndexOf("<w:p ", fromIdx);
  return Math.max(a, b);
}

function fillMultiParagraph(xml: string, placeholder: string, value: string): string {
  if (!value || !value.trim()) return fill(xml, placeholder, null);
  const phIdx = xml.indexOf(placeholder);
  if (phIdx < 0) return xml;
  const pStart = findEnclosingWpStart(xml, phIdx);
  if (pStart < 0) return xml;
  const pEnd = xml.indexOf("</w:p>", phIdx) + "</w:p>".length;
  if (pEnd <= 0) return xml;
  const pXml = xml.slice(pStart, pEnd);

  // Reuse the original paragraph's pPr (spacing, alignment, etc.)
  // and the placeholder run's rPr (italic placeholder styling).
  const pPrMatch = pXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0] : "";
  // Strip italic from the rPr — the placeholder is rendered italic
  // in the template (placeholder convention) but real content reads
  // better in upright type.
  const rPrMatch = pXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  let rPr = rPrMatch ? rPrMatch[0] : "";
  rPr = rPr.replace(/<w:i\/>/g, "").replace(/<w:iCs\/>/g, "");
  if (rPr === "<w:rPr></w:rPr>") rPr = "";

  // pPr for bullet items: same as body pPr but with ListParagraph
  // style + numbering reference.
  const bulletPPr = "<w:pPr>" +
    '<w:pStyle w:val="ListParagraph"/>' +
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>' +
    (pPrMatch ? pPrMatch[0].slice("<w:pPr>".length, -"</w:pPr>".length) : "") +
    "</w:pPr>";

  const blocks = value.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const rebuilt = blocks.map((block) => {
    if (BULLET_RE.test(block)) {
      const text = block.replace(BULLET_RE, "");
      return `<w:p>${bulletPPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r></w:p>`;
    }
    return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXmlText(block)}</w:t></w:r></w:p>`;
  }).join("");

  return xml.slice(0, pStart) + rebuilt + xml.slice(pEnd);
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

// Synthesise a colspan'd "no data" row by rebuilding it cleanly from the
// placeholder row. We keep the first cell's <w:tcPr> contents (borders,
// margins, etc.) so the empty row visually matches a normal row, but
// reconstruct the rest of the markup explicitly — string-mutation
// shortcuts on the original cell produced malformed XML that the
// Microsoft Graph PDF converter rejected with "cannotOpenFile".
function buildEmptyRow(rowXml: string, message: string, columnCount: number): string {
  const tcStart = rowXml.indexOf("<w:tc");
  const tcEnd = rowXml.indexOf("</w:tc>", tcStart);
  if (tcStart < 0 || tcEnd < 0) return rowXml; // shouldn't happen on a valid template
  const firstTc = rowXml.slice(tcStart, tcEnd + "</w:tc>".length);

  // Extract the existing <w:tcPr>...</w:tcPr> body so we reuse the cell
  // styling (borders, margins, vertical alignment). If the cell didn't
  // have a tcPr block (rare), fall back to empty.
  const tcPrMatch = firstTc.match(/<w:tcPr>([\s\S]*?)<\/w:tcPr>/);
  const tcPrBody = tcPrMatch ? tcPrMatch[1] : "";

  const escapedMsg = escapeXmlText(message);
  const cell =
    "<w:tc>" +
      "<w:tcPr>" +
        `<w:gridSpan w:val="${columnCount}"/>` +
        tcPrBody +
      "</w:tcPr>" +
      "<w:p>" +
        "<w:r>" +
          '<w:rPr><w:i/><w:iCs/><w:color w:val="6B7280"/></w:rPr>' +
          `<w:t xml:space="preserve">${escapedMsg}</w:t>` +
        "</w:r>" +
      "</w:p>" +
    "</w:tc>";

  return `<w:tr>${cell}</w:tr>`;
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
  // Panel / device count / ARC fall back to the SITE row when the
  // report row doesn't have them — engineers commonly capture these
  // once on the Site form and don't re-type per-visit.
  const panelText = r.panel_make_model ?? s.panel_make_model ?? null;
  const deviceCount = r.num_devices_total ?? s.num_devices ?? null;
  const arcStatus =
    r.arc_monitoring != null
      ? (r.arc_monitoring ? "Yes" : "No")
      : s.arc_connected != null
        ? (s.arc_connected ? "Yes" : "No")
        : null;
  xml = fill(xml, "[Customer]", bundle.customer?.name ?? null);
  xml = fill(xml, "[Engineer]", r.engineer_name);
  xml = fill(xml, "[Panel Make Model]", panelText);
  xml = fill(xml, "[Device Count]", deviceCount != null ? String(deviceCount) : null);
  xml = fill(xml, "[ARC Status]", arcStatus);

  // ── §2 System details key/value pairs ────────────────────────────
  // (same placeholders as the info card — already covered above; the
  // template just shows the same data in two places.)

  // ── §3.1 Methodology ─────────────────────────────────────────────
  // Default methodology text matches the legacy PDF generator so the
  // section is never blank when the engineer hasn't typed their own.
  // Default uses bullet-prefixed lines so the rendered output is a
  // bulleted list rather than a single block.
  const methodology = r.test_methodology?.trim() || (
    "• Minimum one detector per zone activated to verify programmed responses.\n\n" +
    "• All input/output relationships tested as per cause and effect matrix.\n\n" +
    "• System responses observed and verified."
  );
  xml = fillMultiParagraph(xml, "[Test Methodology]", methodology);

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
  // Drop fully-empty rows so the wizard's auto-added blank row doesn't
  // render as 6 em-dashes. A reading counts as real if any of
  // location / ambient / alarm has been touched.
  const readingsToRender = bundle.readings.filter((rd) =>
    (rd.location && rd.location.trim() !== "") ||
    rd.ambient_db != null ||
    rd.alarm_db != null
  );
  xml = fillTable(xml, "[Location]", readingsToRender.map((rd) => ({
    "[Location]": cell(rd.location),
    "[Floor]": cell(rd.floor),
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
  // Engineers type these as multiple paragraphs (often pasted from
  // their own notes). Single-text-run replacement collapsed them into
  // one giant block; fillMultiParagraph rebuilds them as real <w:p>
  // elements so Word renders the paragraph breaks. Bullet lines
  // (• / - / *) become bullet items.
  const obs = r.general_observations?.trim() ? dedupeParagraphs(r.general_observations) : null;
  if (obs) {
    xml = fillMultiParagraph(xml, "[General Observations]", obs);
  } else {
    xml = fill(xml, "[General Observations]", "None recorded.");
  }

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
// Signature embedding
//
// The template's §9 sign-off block has two underscore lines after the
// "Signature:" labels — one for engineer, one for client. When the
// wizard captured a signature (saved as a base64 PNG data URL on
// report.engineer_signature / report.client_signature), embed the
// bitmap in place of the line.
//
// Doing it from the function (rather than asking the user to add
// placeholders to the template) keeps the template human-editable —
// engineers can re-author the .docx in Word without remembering to
// preserve obscure tags.

interface ZipLike {
  file: (name: string, data?: Uint8Array | string) => unknown;
  files: Record<string, unknown>;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

// EMU = English Metric Units. 914400 per inch.
const SIG_WIDTH_EMU = 2160000;  // ~2.36 inches
const SIG_HEIGHT_EMU = 900000;  // ~0.98 inches

function buildSignatureRun(relId: string, drawingId: number, name: string): string {
  return (
    '<w:r>' +
      '<w:drawing>' +
        '<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
          `<wp:extent cx="${SIG_WIDTH_EMU}" cy="${SIG_HEIGHT_EMU}"/>` +
          '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
          `<wp:docPr id="${drawingId}" name="${name}"/>` +
          '<wp:cNvGraphicFramePr>' +
            '<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>' +
          '</wp:cNvGraphicFramePr>' +
          '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
            '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
              '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
                '<pic:nvPicPr>' +
                  `<pic:cNvPr id="${drawingId}" name="${name}"/>` +
                  '<pic:cNvPicPr/>' +
                '</pic:nvPicPr>' +
                '<pic:blipFill>' +
                  `<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${relId}"/>` +
                  '<a:stretch><a:fillRect/></a:stretch>' +
                '</pic:blipFill>' +
                '<pic:spPr>' +
                  '<a:xfrm>' +
                    '<a:off x="0" y="0"/>' +
                    `<a:ext cx="${SIG_WIDTH_EMU}" cy="${SIG_HEIGHT_EMU}"/>` +
                  '</a:xfrm>' +
                  '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
                '</pic:spPr>' +
              '</pic:pic>' +
            '</a:graphicData>' +
          '</a:graphic>' +
        '</wp:inline>' +
      '</w:drawing>' +
    '</w:r>'
  );
}

// Add image bytes to word/media/<name>, register a new relationship in
// word/_rels/document.xml.rels, and return the new rel id.
async function attachImageRel(
  zip: ZipLike,
  relsXml: string,
  fileName: string,
  bytes: Uint8Array,
  preferredRelId: string,
): Promise<string> {
  zip.file(`word/media/${fileName}`, bytes);
  // Add the relationship if not already present.
  if (relsXml.includes(`Id="${preferredRelId}"`)) return preferredRelId;
  const rel = `<Relationship Id="${preferredRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${fileName}"/>`;
  const newRels = relsXml.replace("</Relationships>", `${rel}</Relationships>`);
  zip.file("word/_rels/document.xml.rels", newRels);
  return preferredRelId;
}

// Ensure [Content_Types].xml has a Default entry for the given image
// extension/mime. The base template registers jpeg only; PNG / JPEG-only
// signatures need their type declared or Word refuses to open the file.
function ensureContentType(ctXml: string, ext: string, mime: string): string {
  if (ctXml.includes(`Extension="${ext}"`)) return ctXml;
  const entry = `<Default Extension="${ext}" ContentType="${mime}"/>`;
  return ctXml.replace("<Types ", "<Types ").replace(/<Default /, entry + "<Default ");
}

// Locate the FIRST signature line (the run containing the underscore
// glyphs) AFTER a given anchor text in the document XML. Returns
// [runStart, runEnd] for the enclosing <w:r>...</w:r>, or null when
// the anchor or line can't be found.
function locateSignatureRun(xml: string, anchorText: string): [number, number] | null {
  const anchorIdx = xml.indexOf(anchorText);
  if (anchorIdx < 0) return null;
  // Find the next "____________________________" (28 underscores) after anchor
  const lineIdx = xml.indexOf("____________________________", anchorIdx);
  if (lineIdx < 0) return null;
  // Walk back to the <w:r ... that encloses this <w:t>
  const runStart = xml.lastIndexOf("<w:r ", lineIdx);
  const runStartBare = xml.lastIndexOf("<w:r>", lineIdx);
  const start = Math.max(runStart, runStartBare);
  if (start < 0) return null;
  const runEnd = xml.indexOf("</w:r>", lineIdx);
  if (runEnd < 0) return null;
  return [start, runEnd + "</w:r>".length];
}

export interface SignatureEmbedDiagnostics {
  engineer_provided: boolean;
  engineer_is_data_url: boolean;
  engineer_embedded: boolean;
  engineer_reason?: string;
  client_provided: boolean;
  client_is_data_url: boolean;
  client_embedded: boolean;
  client_reason?: string;
}

async function embedSignatures(
  zip: ZipLike,
  doc: string,
  bundle: Bundle,
  diag: SignatureEmbedDiagnostics,
): Promise<string> {
  const r = bundle.report;
  diag.engineer_provided = !!r.engineer_signature;
  diag.client_provided = !!r.client_signature;
  diag.engineer_is_data_url = typeof r.engineer_signature === "string" && r.engineer_signature.startsWith("data:image/");
  diag.client_is_data_url = typeof r.client_signature === "string" && r.client_signature.startsWith("data:image/");
  if (!r.engineer_signature && !r.client_signature) {
    diag.engineer_reason = "no signature on report row";
    diag.client_reason = "no signature on report row";
    return doc;
  }

  // Read the rels + content_types so we can mutate them.
  let relsXml = "";
  let ctXml = "";
  try {
    const relsFile = (zip as unknown as { files: Record<string, { async: (t: string) => Promise<string> }> })
      .files["word/_rels/document.xml.rels"];
    const ctFile = (zip as unknown as { files: Record<string, { async: (t: string) => Promise<string> }> })
      .files["[Content_Types].xml"];
    relsXml = await relsFile.async("string");
    ctXml = await ctFile.async("string");
  } catch {
    // If we can't read the metadata, bail out gracefully — leave the
    // signature lines as-is rather than crash the function.
    console.warn("Couldn't access rels/content-types; skipping signature embed");
    return doc;
  }

  const sigs = [
    { url: r.engineer_signature, anchor: "ENGINEER", relId: "rIdSigEngineer", drawingId: 1001, name: "EngineerSignature", file: "sig_engineer", who: "engineer" as const },
    { url: r.client_signature,   anchor: "CLIENT / RESPONSIBLE PERSON", relId: "rIdSigClient", drawingId: 1002, name: "ClientSignature", file: "sig_client", who: "client" as const },
  ];

  const setReason = (who: "engineer" | "client", r: string) => {
    if (who === "engineer") diag.engineer_reason = r;
    else diag.client_reason = r;
  };
  const markEmbedded = (who: "engineer" | "client") => {
    if (who === "engineer") diag.engineer_embedded = true;
    else diag.client_embedded = true;
  };

  for (const s of sigs) {
    if (!s.url) { setReason(s.who, "no signature on report row"); continue; }
    const decoded = dataUrlToBytes(s.url);
    if (!decoded) {
      const head = s.url.slice(0, 30);
      const reason = `not a data URL (starts with "${head}")`;
      console.warn(`Signature for ${s.anchor}: ${reason}`);
      setReason(s.who, reason);
      continue;
    }
    const ext = decoded.mime === "image/png" ? "png" : decoded.mime === "image/jpeg" ? "jpeg" : "png";
    const fileName = `${s.file}.${ext}`;
    await attachImageRel(zip, relsXml, fileName, decoded.bytes, s.relId);
    // attachImageRel writes a NEW rels XML; re-read so next iteration sees it.
    const relsFile2 = (zip as unknown as { files: Record<string, { async: (t: string) => Promise<string> }> })
      .files["word/_rels/document.xml.rels"];
    relsXml = await relsFile2.async("string");

    ctXml = ensureContentType(ctXml, ext, decoded.mime);

    // Replace the signature line run with our drawing run.
    const loc = locateSignatureRun(doc, s.anchor);
    if (!loc) {
      const reason = `anchor "${s.anchor}" or trailing underscore line not found`;
      console.warn(reason);
      setReason(s.who, reason);
      continue;
    }
    const [runStart, runEnd] = loc;
    doc = doc.slice(0, runStart) + buildSignatureRun(s.relId, s.drawingId, s.name) + doc.slice(runEnd);
    markEmbedded(s.who);
    setReason(s.who, "ok");
  }

  // Save the updated content types back to the zip once.
  zip.file("[Content_Types].xml", ctXml);

  return doc;
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
    let filledXml = buildBundleXml(bundle, originalXml);
    // Embed signatures if the wizard captured them — modifies the zip
    // in place (adds image bytes, registers relationships, declares
    // PNG content type) and returns updated document XML.
    const sigDiag: SignatureEmbedDiagnostics = {
      engineer_provided: false, engineer_is_data_url: false, engineer_embedded: false,
      client_provided:   false, client_is_data_url:   false, client_embedded:   false,
    };
    filledXml = await embedSignatures(
      zip as unknown as ZipLike,
      filledXml,
      bundle,
      sigDiag,
    );
    console.log("Signature embed status:", JSON.stringify(sigDiag));
    zip.file("word/document.xml", filledXml);

    const docxBytes = await zip.generateAsync({
      type: "uint8array",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // Office's headless PDF converter (MS Graph /content?format=pdf)
      // rejects STORED zips with "cannotOpenFile". DEFLATE matches the
      // working quote-docx pipeline.
      compression: "DEFLATE",
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
      // Diagnostic — client logs this so we can see why signatures
      // didn't embed without needing Supabase function logs.
      signature_diagnostics: sigDiag,
      // Section diagnostics — what actually got rendered. Helps debug
      // "section X is blank in the PDF" reports: if the count here is
      // 0, the data never reached the function (wizard didn't save,
      // bundle didn't load it, or RLS filtered it).
      section_diagnostics: {
        outputs_rendered: bundle.outputs.length,
        readings_received: bundle.readings.length,
        readings_rendered: bundle.readings.filter((rd) =>
          (rd.location && rd.location.trim() !== "") ||
          rd.ambient_db != null ||
          rd.alarm_db != null
        ).length,
        ce_issues_rendered: bundle.issues.filter((i) => i.kind === "cause_effect").length,
        aud_issues_rendered: bundle.issues.filter((i) => i.kind === "audibility").length,
        remedials_rendered: bundle.remedials.length,
      },
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

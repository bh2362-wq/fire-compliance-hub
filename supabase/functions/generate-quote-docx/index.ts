/**
 * generate-quote-docx — renders a quote by loading the BHO master template
 * from quote-assets/master-template.docx and populating placeholder markers
 * with quote-specific content. Static sections (Exclusions, Assumptions,
 * Payment Terms, Standards & Accreditations) come verbatim from the template
 * so they always include BHO's commercial protections.
 *
 * Placeholder conventions in the template:
 *   [BHO-Q-2026-0234]          quote ref
 *   [DD Month YYYY]            date issued
 *   [Client / Main Contractor] client company
 *   [Contact Name & Role]      client contact
 *   [Billing Address]          client address
 *   [Project Name]             project title
 *   [Copilot: ...]             AI/data-driven content (replaced or stripped)
 *   [Line item] / [Qty] /      pricing table row — template row is cloned
 *     [0.00]                     per line item, all rows replace the original
 *   [£0.00]                    grand total in pricing schedule
 *
 * Rules baked in:
 *   - Empty value -> the entire label+value paragraph pair is removed (so
 *     the document never shows orphan "[bracketed placeholder]" text).
 *   - Line items are rendered cell-by-cell by position (not by text-content
 *     find-replace) so the math always lines up: cell 4 = unit price, cell
 *     5 = qty x unit_price.
 *   - Subtotal / VAT / TOTAL are located by their row label so they can't
 *     collide with any leftover [0.00] from a half-replaced line item row.
 *   - TOTAL row text is forced white (#FFFFFF) for contrast on the red fill.
 *   - Issued-By Name/Position/Email come from the profile of the user who
 *     created the quotation (quotations.created_by -> profiles.user_id).
 */

import JSZip from "npm:jszip@3.10.1";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface QuoteItem { desc: string; qty: number; unit: number; }

interface SectionedLineItem {
  is_section?: boolean;
  title?: string | null;
  description?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
}

interface QuoteInput {
  ref: string;
  issued_date: string;
  valid_until?: string;
  project_title: string;
  client: { company: string; contact: string; address: string };

  // Scope narrative. scope_content (markdown) preferred; falls back to scope (string[]).
  scope_content?: string;
  scope?: string[];

  // §1 Executive Summary text. summary_paragraph (job-type-aware) preferred;
  // falls back to introduction.
  summary_paragraph?: string;
  introduction?: string;

  // Line items — sectioned or flat. Section header rows are filtered out;
  // the template's own §3 visual layout doesn't expose per-section subtotals.
  line_items?: SectionedLineItem[];
  items?: QuoteItem[];

  assumptions?: string[];
  exclusions?: string[];

  vat_rate?: number;
  quotation_id?: string;
}

interface IssuerInfo {
  name: string;     // empty string -> field omitted
  position: string;
  email: string;
  direct: string;
}

interface QuoteContext {
  worksType: string | null;        // quotations.works_type — drives §2.2 bullet set
}

// ── §2.2 Works Included bullets, per works_type ───────────────────────────────
//
// The master template hardcodes a new-install-flavoured bullet list. For any
// other job type those bullets are misleading. We swap them in-place using
// the work-type the quotation was created for. Unknown / null keeps the
// template defaults (safe — they match a new install).

// EXACT bullets currently in the template's §2.2 (order matters — we
// rewrite in-place, then strip any excess if the new list is shorter).
const TEMPLATE_WORKS_BULLETS: string[] = [
  "Design and design review to BS 5839-1:2017",
  "Supply of all panels, devices, cabling, containment and ancillaries as scheduled",
  "Installation by FIA-accredited engineers",
  "Programming of cause & effect to agreed matrix",
  "Pre-commissioning testing and commissioning",
  "Issue of BS 5839-1 Certificate of Design, Installation and Commissioning",
  "As-fitted drawings, zone plans and O&M manuals (PDF + 1 hard copy)",
  "Site demonstration and client handover",
];

// Max 8 bullets per job (template only has 8 slots). Lists are kept tight —
// long bullet runs read as marketing fluff in a quote.
const WORKS_INCLUDED_BY_TYPE: Record<string, string[]> = {
  new_install: TEMPLATE_WORKS_BULLETS,
  system_upgrade: [
    "Survey and impact assessment against the existing system architecture and battery capacity",
    "Removal of redundant equipment and supply of replacement panel, loop cards and devices",
    "Installation by FIA-accredited engineers, including any extension of detection coverage",
    "Re-programming of cause & effect to the agreed matrix",
    "Recommissioning of the affected zones in accordance with BS 5839-1:2017 Clause 39",
    "Issue of a Modification Certificate per Clause 44 and Annex G",
    "Update of as-fitted drawings, zone plans and the system logbook",
    "Site demonstration and client handover",
  ],
  upgrade: undefined as unknown as string[],   // legacy alias resolved below
  extension: [
    "Impact assessment on existing system architecture and battery capacity",
    "Supply and installation of additional devices, cabling and any reconfiguration required",
    "Re-programming of cause & effect to integrate the new equipment",
    "Partial commissioning of the new equipment per BS 5839-1:2017 Clause 39",
    "Issue of a Modification Certificate per Clause 44 and Annex G",
    "Update of zone plans, cause-and-effect schedule and the system logbook",
  ],
  system_takeover: [
    "Initial condition survey of the existing fire detection and alarm system",
    "Verification of zone plans, cause-and-effect schedule and as-fitted documentation",
    "Functional sample test of detectors, manual call points and output groups",
    "Rectification of any immediate defects identified (priced separately if extensive)",
    "Issue of an Acceptance Certificate to BS 5839-1:2017",
    "Commencement of routine servicing per the agreed maintenance frequency",
  ],
  takeover: undefined as unknown as string[],
  reactive_remedial: [
    "Site investigation of each reported defect",
    "Rectification works — component replacement, wiring repair, or configuration change as required",
    "Functional re-testing of the affected zones, devices and output groups",
    "Update of the system logbook (BS 5839-1:2017 Annex G)",
    "Issue of a service report detailing the works performed and confirming the system's operational status",
  ],
  remedial: undefined as unknown as string[],
  planned_maintenance: [
    "Visual inspection of the panel, batteries, indicators and printer",
    "Functional testing of a representative sample of detectors and manual call points per BS 5839-1:2017 Clause 43.3",
    "Verification of ARC signal transmission with the receiving centre notified before and after testing",
    "Inspection of battery condition and recording of standby capacity",
    "Issue of a Service Certificate (BS 5839-1:2017 Annex G)",
    "Update of the system logbook",
  ],
  cause_and_effect: [
    "Pre-test review of the documented cause-and-effect matrix and any site-specific software configuration",
    "Systematic activation of every input (manual call points, detectors, interfaces) and verification of corresponding output groups (sounders, VADs, plant shutdowns, ancillary interfaces)",
    "ARC signal transmission verification, with the receiving centre notified before and after testing",
    "Issue of a Cause and Effect Test Report",
    "Update of the system logbook and the cause-and-effect schedule",
  ],
  commissioning_only: [
    "Review of as-installed documentation, zone plans and the design specification",
    "Visual inspection of the installed equipment and insulation resistance testing of all cabling",
    "Functional testing of every detector, manual call point, sounder, VAD and interface",
    "Cause-and-effect verification against the documented matrix",
    "Issue of a BS 5839-1:2017 Commissioning Certificate per Annex G",
    "Handover of completion documentation to the responsible person",
  ],
  acceptance_testing: [
    "Review of design documentation and the Commissioning Certificate",
    "Witness testing of a representative sample of devices and cause-and-effect operations",
    "Verification of zone plans, signage and accessibility of equipment",
    "Issue of an Acceptance Certificate per BS 5839-1:2017",
    "Recording of any outstanding items requiring rectification",
  ],
  verification: [
    "Independent review of design, commissioning and modification certificates",
    "Physical verification of the installation against the design and BS 5839-1:2017",
    "Sample functional testing of devices and output groups",
    "Issue of a verification report listing compliance status and any non-conformities",
  ],
  design_only: [
    "Site survey and design brief capture",
    "Production of a BS 5839-1:2017 compliant design — zone plans, device schedules, cabling routes",
    "Production of the cause-and-effect matrix",
    "Issue of a Design Certificate per BS 5839-1:2017 Clause 44 and Annex G",
    "Handover pack for the installing contractor",
  ],
  certification: [
    "Site audit and verification of the installed equipment against the as-found configuration",
    "Functional sample testing where required to support certification",
    "Production of the appropriate certificate (Commissioning / Modification / Acceptance) per BS 5839-1:2017 Annex G",
    "Issue of the certificate to the responsible person and update of the system logbook",
  ],
};
// Resolve legacy aliases.
WORKS_INCLUDED_BY_TYPE.upgrade = WORKS_INCLUDED_BY_TYPE.system_upgrade;
WORKS_INCLUDED_BY_TYPE.takeover = WORKS_INCLUDED_BY_TYPE.system_takeover;
WORKS_INCLUDED_BY_TYPE.remedial = WORKS_INCLUDED_BY_TYPE.reactive_remedial;

// ── Helpers ────────────────────────────────────────────────────────────────────

function normalizeVatFraction(raw: number | null | undefined, ref?: string): number {
  const r = raw == null ? 20 : Number(raw);
  if (!Number.isFinite(r)) throw new Error(`VAT rate invalid (non-numeric) on quote ${ref ?? "?"}: ${raw}`);
  const fraction = r > 1 ? r / 100 : r;
  if (fraction < 0 || fraction > 0.5) {
    throw new Error(`VAT rate out of plausible range on quote ${ref ?? "?"} — raw=${raw}, fraction=${fraction}. Refusing to render.`);
  }
  return fraction;
}

const gbp = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function escapeXmlText(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// When a placeholder string in TS source contains `&` (e.g. "[Contact Name & Role]"),
// the matching XML text node will have it XML-escaped as `&amp;`. Searching the
// XML for the literal `&` form misses the match entirely — every placeholder
// stays visible in the rendered document. Applied to every helper that searches
// XML by literal text.
function xmlEscapeSearch(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function flatPriceableItems(q: QuoteInput): QuoteItem[] {
  if (Array.isArray(q.line_items) && q.line_items.length > 0) {
    return q.line_items
      .filter((li) => !li.is_section)
      .map((li) => ({
        desc: li.description ?? "",
        qty: Number(li.quantity) || 0,
        unit: Number(li.unit_price) || 0,
      }));
  }
  return q.items ?? [];
}

function resolveScopeParagraphs(q: QuoteInput): string[] {
  if (q.scope_content && q.scope_content.trim().length > 0) {
    const md = q.scope_content.replace(/\r\n/g, "\n").trim();
    const items: string[] = [];
    let buf: string[] = [];
    const flush = () => { if (buf.length) { items.push(buf.join(" ").trim().replace(/^\d+\.\s+/, "")); buf = []; } };
    for (const line of md.split("\n")) {
      if (/^\s*\d+\.\s+/.test(line)) { flush(); buf.push(line.trim()); }
      else if (line.trim().length === 0) { flush(); }
      else { buf.push(line.trim()); }
    }
    flush();
    return items.filter((s) => s.length > 0);
  }
  return q.scope ?? [];
}

// ── XML primitives ────────────────────────────────────────────────────────────

function replaceAllWtText(xml: string, placeholder: string, value: string): string {
  // Search the XML for the entity-escaped form of the placeholder so & in the
  // source string finds &amp; in the document.
  const safe = xmlEscapeSearch(placeholder).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `<w:t[^>]*>` would also match `<w:tcPr>`, `<w:tcW>`, etc. — restrict to
  // genuine `<w:t>` / `<w:t ...>` elements.
  const re = new RegExp(`(<w:t(?:\\s[^>]*)?>)([^<]*?)${safe}([^<]*?)(</w:t>)`, "g");
  return xml.replace(re, (_m, openTag, before, after, closeTag) =>
    `${openTag}${before}${escapeXmlText(value)}${after}${closeTag}`,
  );
}

// Find the start index of the <w:p> element that encloses `fromIdx`.
// Handles both bare `<w:p>` and attribute-rich `<w:p ...>` forms.
function findEnclosingWpStart(xml: string, fromIdx: number): number {
  const a = xml.lastIndexOf("<w:p>", fromIdx);
  const b = xml.lastIndexOf("<w:p ", fromIdx);
  return Math.max(a, b);
}

// Remove the value paragraph containing `placeholder` AND the immediately
// preceding paragraph (its label). Used for fields like "Project: / [Project
// Name]" where label and value are in two sibling <w:p>s.
function removePairedParagraphs(xml: string, placeholder: string): string {
  const phIdx = xml.indexOf(xmlEscapeSearch(placeholder));
  if (phIdx < 0) return xml;
  const valueStart = findEnclosingWpStart(xml, phIdx);
  if (valueStart < 0) return xml;
  const valueEndMarker = "</w:p>";
  const valueEnd = xml.indexOf(valueEndMarker, phIdx) + valueEndMarker.length;
  if (valueEnd <= 0) return xml;
  // Preceding paragraph: its </w:p> sits right at (or just before) valueStart.
  const prevCloseIdx = xml.lastIndexOf(valueEndMarker, valueStart);
  if (prevCloseIdx < 0) return xml;
  const labelStart = findEnclosingWpStart(xml, prevCloseIdx);
  if (labelStart < 0) return xml;
  return xml.substring(0, labelStart) + xml.substring(valueEnd);
}

// Remove just the paragraph containing `placeholder` (no label pair). Used
// for free-standing placeholders like the Programme bullets.
function removeContainingParagraph(xml: string, placeholder: string): string {
  const phIdx = xml.indexOf(xmlEscapeSearch(placeholder));
  if (phIdx < 0) return xml;
  const pStart = findEnclosingWpStart(xml, phIdx);
  if (pStart < 0) return xml;
  const pEnd = xml.indexOf("</w:p>", phIdx) + "</w:p>".length;
  if (pEnd <= 0) return xml;
  return xml.substring(0, pStart) + xml.substring(pEnd);
}

// Apply a field-or-omit: if value has content, replace; if empty, drop the
// label+value paragraph pair entirely.
function fieldOrOmit(xml: string, placeholder: string, value: string | null | undefined): string {
  if (value && String(value).trim()) return replaceAllWtText(xml, placeholder, String(value).trim());
  return removePairedParagraphs(xml, placeholder);
}

// ── Pricing table — cell-by-cell rendering ───────────────────────────────────

// Cell order in the canonical row is fixed by the template:
//   0 = ITEM #   |  1 = DESCRIPTION  |  2 = QTY  |  3 = UNIT PRICE  |  4 = LINE TOTAL
const CELL_ITEM_NUM = 0;
const CELL_DESC = 1;
const CELL_QTY = 2;
const CELL_UNIT = 3;
const CELL_LINE_TOTAL = 4;

// Split a <w:tr>...</w:tr> row into its sequential <w:tc>...</w:tc> cells.
// Returns an array of cell substrings AND the surrounding row "shell" so the
// caller can re-assemble the row after mutating cells.
function splitRowIntoCells(rowXml: string): { shell: string[]; cells: string[] } {
  const cells: string[] = [];
  const shell: string[] = [];
  const openTag = "<w:tc>";
  const closeTag = "</w:tc>";
  let cursor = 0;
  while (true) {
    const cellStart = rowXml.indexOf(openTag, cursor);
    if (cellStart < 0) {
      shell.push(rowXml.substring(cursor));
      break;
    }
    shell.push(rowXml.substring(cursor, cellStart));
    const cellEnd = rowXml.indexOf(closeTag, cellStart) + closeTag.length;
    cells.push(rowXml.substring(cellStart, cellEnd));
    cursor = cellEnd;
  }
  return { shell, cells };
}

function joinRowFromCells(shell: string[], cells: string[]): string {
  let out = "";
  for (let i = 0; i < shell.length; i++) {
    out += shell[i];
    if (i < cells.length) out += cells[i];
  }
  return out;
}

// Within a single cell, replace the first <w:t>...</w:t> text content with `value`.
// Also drops italic and demotes placeholder grey to body black so populated
// cells look like normal table text rather than disabled placeholders.
function setCellText(cellXml: string, value: string): string {
  let c = cellXml
    .replace(/<w:i\s*\/>\s*<w:iCs\s*\/>/g, "")
    .replace(/<w:color w:val="9CA3AF"\s*\/>/g, '<w:color w:val="1A1A1A"/>');
  const re = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/;
  if (!re.test(c)) return c;
  return c.replace(re, (_m, o, _t, e) => `${o}${escapeXmlText(value)}${e}`);
}

function buildRow(canonicalRow: string, itemNum: number, item: QuoteItem): string {
  const { shell, cells } = splitRowIntoCells(canonicalRow);
  if (cells.length < 5) return canonicalRow; // template shape changed — leave alone
  const qty = Number(item.qty) || 0;
  const unit = Number(item.unit) || 0;
  const lineTotal = qty * unit;
  cells[CELL_ITEM_NUM] = setCellText(cells[CELL_ITEM_NUM], String(itemNum));
  cells[CELL_DESC] = setCellText(cells[CELL_DESC], item.desc);
  cells[CELL_QTY] = setCellText(cells[CELL_QTY], String(qty));
  cells[CELL_UNIT] = setCellText(cells[CELL_UNIT], gbp(unit));
  cells[CELL_LINE_TOTAL] = setCellText(cells[CELL_LINE_TOTAL], gbp(lineTotal));
  return joinRowFromCells(shell, cells);
}

// Replace ALL template placeholder rows in the pricing table with N rendered
// rows. A placeholder row is any <w:tr> between the header and the Subtotal
// row containing [Copilot: Line item or [Line item.
function renderPricingRows(xml: string, items: QuoteItem[]): string {
  const canonicalMarker = "[Copilot: Line item description]";
  const canonicalIdx = xml.indexOf(canonicalMarker);
  if (canonicalIdx < 0) return xml;
  const canonicalRowStart = xml.lastIndexOf("<w:tr>", canonicalIdx);
  const canonicalRowEnd = xml.indexOf("</w:tr>", canonicalIdx) + "</w:tr>".length;
  if (canonicalRowStart < 0 || canonicalRowEnd <= 0) return xml;
  const canonicalRow = xml.substring(canonicalRowStart, canonicalRowEnd);

  // Walk forward absorbing any [Line item] stub rows up to (but not into)
  // the Subtotal row, so the final document has no leftover placeholders.
  const subtotalIdx = xml.indexOf("Subtotal", canonicalRowEnd);
  let blockEnd = canonicalRowEnd;
  let cursor = canonicalRowEnd;
  while (true) {
    const nextStub = xml.indexOf("[Line item]", cursor);
    if (nextStub < 0) break;
    if (subtotalIdx > 0 && nextStub > subtotalIdx) break;
    const stubRowEnd = xml.indexOf("</w:tr>", nextStub);
    if (stubRowEnd < 0) break;
    blockEnd = stubRowEnd + "</w:tr>".length;
    cursor = blockEnd;
  }

  const renderedRows = items.length === 0
    ? buildRow(canonicalRow, 1, { desc: "(no line items)", qty: 0, unit: 0 })
    : items.map((it, i) => buildRow(canonicalRow, i + 1, it)).join("");
  return xml.substring(0, canonicalRowStart) + renderedRows + xml.substring(blockEnd);
}

// ── Totals row updates by label ──────────────────────────────────────────────

// Find the <w:tr> whose first non-empty <w:t> contains `label`, then set the
// LAST cell's text to `value`. The totals rows have an empty first cell and
// the value in the rightmost cell; using "last cell" avoids ambiguity if the
// label spans multiple runs.
function setTotalsRowValue(xml: string, label: string, value: string, alsoUpdateLabel?: string): string {
  // Locate the row by its label text.
  const labelIdx = xml.indexOf(`>${label}<`); // bare text node, e.g. ">Subtotal<"
  if (labelIdx < 0) {
    // Try a slightly looser locate via the label substring inside any w:t.
    const looser = xml.indexOf(label);
    if (looser < 0) return xml;
    return setTotalsRowValueAt(xml, looser, value, alsoUpdateLabel);
  }
  return setTotalsRowValueAt(xml, labelIdx, value, alsoUpdateLabel);
}

function setTotalsRowValueAt(xml: string, anchorIdx: number, value: string, newLabel?: string): string {
  const rowStart = xml.lastIndexOf("<w:tr>", anchorIdx);
  const rowEnd = xml.indexOf("</w:tr>", anchorIdx) + "</w:tr>".length;
  if (rowStart < 0 || rowEnd <= 0) return xml;
  const row = xml.substring(rowStart, rowEnd);
  const { shell, cells } = splitRowIntoCells(row);
  if (cells.length === 0) return xml;
  // Update the last cell with the calculated value.
  cells[cells.length - 1] = setCellText(cells[cells.length - 1], value);
  // Optionally rewrite the label (e.g. "VAT @ 20%" -> "VAT @ 5%").
  let rebuilt = joinRowFromCells(shell, cells);
  if (newLabel) {
    rebuilt = rebuilt.replace(/<w:t((?:\s[^>]*)?)>([^<]*?)VAT @ \d+%([^<]*?)<\/w:t>/, `<w:t$1>$2${escapeXmlText(newLabel)}$3</w:t>`);
  }
  return xml.substring(0, rowStart) + rebuilt + xml.substring(rowEnd);
}

// Force the TOTAL row's text colour to white so it reads on the red fill.
function forceTotalRowWhiteText(xml: string): string {
  const labelIdx = xml.indexOf(">TOTAL<");
  if (labelIdx < 0) return xml;
  const rowStart = xml.lastIndexOf("<w:tr>", labelIdx);
  const rowEnd = xml.indexOf("</w:tr>", labelIdx) + "</w:tr>".length;
  if (rowStart < 0 || rowEnd <= 0) return xml;
  const row = xml.substring(rowStart, rowEnd);
  // Swap any 1A1A1A or 9CA3AF text colour in this row to white.
  const whitened = row
    .replace(/<w:color w:val="1A1A1A"\s*\/>/g, '<w:color w:val="FFFFFF"/>')
    .replace(/<w:color w:val="9CA3AF"\s*\/>/g, '<w:color w:val="FFFFFF"/>');
  return xml.substring(0, rowStart) + whitened + xml.substring(rowEnd);
}

// ── Top fields (Quote ref, dates, client, site, issued-by) ───────────────────

function renderTopFields(xml: string, q: QuoteInput, issuer: IssuerInfo): string {
  let x = xml;
  // Quote ref + dates (top of page).
  x = replaceAllWtText(x, "[BHO-Q-2026-0234]", q.ref);
  x = replaceAllWtText(x, "[DD Month YYYY]", q.issued_date);

  // Client block — omit empty rows.
  x = fieldOrOmit(x, "[Client / Main Contractor]", q.client.company);
  x = fieldOrOmit(x, "[Contact Name & Role]", q.client.contact);
  x = fieldOrOmit(x, "[Billing Address]", q.client.address);
  x = fieldOrOmit(x, "[Contact Email]", "");  // not in QuoteInput payload
  x = fieldOrOmit(x, "[Contact Phone]", "");

  // Site Details block — omit empty rows.
  x = fieldOrOmit(x, "[Project Name]", q.project_title);
  x = fieldOrOmit(x, "[Site Name & Address]", q.client.address);
  x = fieldOrOmit(x, "[e.g. Gent S-Quad / Vigilon]", "");  // no system info in payload yet
  x = fieldOrOmit(x, "[e.g. BS 5839-1:2017 Cat L1]", "BS 5839-1:2017");
  x = fieldOrOmit(x, "[Client Enquiry Reference]", q.ref);

  // Issued-By block (foot of doc). All sourced from the issuer profile;
  // missing fields collapse cleanly.
  x = fieldOrOmit(x, "[Estimator Name]", issuer.name);
  x = fieldOrOmit(x, "[Job Title]", issuer.position);
  x = fieldOrOmit(x, "[estimator@bhofire.com]", issuer.email);
  x = fieldOrOmit(x, "[Direct Phone]", issuer.direct);
  return x;
}

// ── AI-fill (Copilot) placeholders ───────────────────────────────────────────

function renderAIFillPlaceholders(xml: string, q: QuoteInput): string {
  let x = xml;
  const scope = resolveScopeParagraphs(q);

  // §1 Executive Summary — prefer the dynamic per-job-type summary_paragraph,
  // fall back to introduction, then to first scope paragraph.
  const exec = (q.summary_paragraph && q.summary_paragraph.trim())
    || (q.introduction && q.introduction.trim())
    || scope[0]
    || "";
  x = replaceAllWtText(
    x,
    "[Copilot: Insert a 3-5 sentence plain-English summary of the works — system type, scale, key interfaces, programme highlights.]",
    exec,
  );

  // §2.1 System Description — first scope paragraph (panel & architecture).
  x = replaceAllWtText(
    x,
    "[Copilot: Insert system type (e.g. Gent S-Quad analogue addressable), category (Cat L1 / P1 / M), number of loops, panel locations, networking arrangement.]",
    scope[0] ?? "",
  );

  // §2.2 Works Included extra — remaining scope paragraphs.
  const worksExtra = scope.slice(1).join("  ");
  x = replaceAllWtText(
    x,
    "[Copilot: Add project-specific items — interfaces with BMS, lift recall, AOV, sprinkler, ARC connection, voice alarm, ASD, beam detection.]",
    worksExtra,
  );

  // §4 Exclusions / §5 Assumptions — append project-specific entries.
  x = replaceAllWtText(
    x,
    "[Copilot: Add project-specific exclusions identified in the spec review.]",
    (q.exclusions ?? []).join("  "),
  );
  x = replaceAllWtText(
    x,
    "[Copilot: Add project-specific assumptions.]",
    (q.assumptions ?? []).join("  "),
  );

  // §6 Programme bullets — remove the whole bullet if we have no data.
  // Free-standing placeholders, not label+value pairs.
  for (const p of [
    "[Copilot: insert weeks — typically 4-6 for Gent]",
    "[Copilot: insert]",
    "[Copilot: Insert phasing notes, isolation windows, or critical client milestones.]",
    "[Copilot: Insert phasing arrangement, key milestones, agreed dates, working hours, isolations required.]",
    "[Copilot: Adjust milestones for project-specific application/valuation arrangements (JCT, NEC, monthly applications).]",
  ]) {
    while (x.indexOf(p) >= 0) {
      x = removeContainingParagraph(x, p);
    }
  }

  // Sweep any remaining [Copilot: ...] markers so they don't leak into the
  // output — strip the marker text but preserve the surrounding paragraph
  // (renders as empty whitespace).
  x = x.replace(/(<w:t(?:\s[^>]*)?>)([^<]*?)\[Copilot:[^\]]*\]([^<]*?)(<\/w:t>)/g, "$1$2$3$4");
  return x;
}

// ── Server-side lookups (quotation + issuer) ─────────────────────────────────

interface QuotationLookup {
  issuer: IssuerInfo;
  ctx: QuoteContext;
}

async function loadQuotationData(quotationId: string | undefined, supabase: SupabaseClient): Promise<QuotationLookup> {
  const empty: QuotationLookup = {
    issuer: { name: "", position: "", email: "", direct: "" },
    ctx: { worksType: null },
  };
  if (!quotationId) return empty;
  const { data: q } = await supabase
    .from("quotations")
    .select("created_by, works_type")
    .eq("id", quotationId)
    .maybeSingle();
  const quotation = (q as { created_by?: string; works_type?: string | null } | null) ?? null;
  if (!quotation) return empty;
  let profile: { full_name?: string | null; email?: string | null } | null = null;
  if (quotation.created_by) {
    const { data: p } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", quotation.created_by)
      .maybeSingle();
    profile = (p as typeof profile) ?? null;
  }
  return {
    issuer: {
      name: profile?.full_name?.trim() ?? "",
      position: "Estimator",                            // not in schema; safe default
      email: profile?.email?.trim() ?? "",
      direct: "",                                       // not in schema; omit by default
    },
    ctx: { worksType: quotation.works_type ?? null },
  };
}

// ── §2.2 Works Included renderer ──────────────────────────────────────────────

// Swap the template's hardcoded §2.2 bullets for a job-type-appropriate list.
// If we have no mapping for this works_type, leave the template defaults
// alone (they read as a new-install bullet list — safe fallback).
function renderWorksIncludedBullets(xml: string, worksType: string | null): string {
  if (!worksType) return xml;
  const bullets = WORKS_INCLUDED_BY_TYPE[worksType];
  if (!bullets || bullets.length === 0) return xml;
  let x = xml;
  for (let i = 0; i < TEMPLATE_WORKS_BULLETS.length; i++) {
    const templateText = TEMPLATE_WORKS_BULLETS[i];
    const replacement = bullets[i];
    if (replacement) {
      x = replaceAllWtText(x, templateText, replacement);
    } else {
      // No replacement at this slot — strip the bullet paragraph entirely so
      // the rendered list ends cleanly.
      x = removeContainingParagraph(x, templateText);
    }
  }
  return x;
}

// ── Handler ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  try {
    const quote = (await req.json()) as QuoteInput;
    const required: (keyof QuoteInput)[] = ["ref", "issued_date", "project_title", "client"];
    for (const k of required) if (quote[k] == null) throw new Error(`Missing required field: ${k}`);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Load master template.
    const { data: templateBlob, error: tmplErr } = await supabase.storage
      .from("quote-assets").download("master-template.docx");
    if (tmplErr || !templateBlob) {
      throw new Error(
        "Master template not found at quote-assets/master-template.docx. " +
        "Upload BHO_Quote_Template_Verdana.docx via Admin → Quote Settings.",
      );
    }

    // 2. Look up issuer info and quotation context (works_type for §2.2).
    const { issuer, ctx } = await loadQuotationData(quote.quotation_id, supabase);

    // 3. Unzip + read document.xml.
    const zip = await JSZip.loadAsync(await templateBlob.arrayBuffer());
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) throw new Error("Template is missing word/document.xml — file is not a valid .docx");
    let xml = await documentFile.async("string");

    // 4. Apply replacements in the order most likely to keep cell-lookup
    //    unambiguous (line items before totals before generic Copilot sweep).
    const items = flatPriceableItems(quote);
    xml = renderTopFields(xml, quote, issuer);
    xml = renderWorksIncludedBullets(xml, ctx.worksType);
    xml = renderPricingRows(xml, items);

    const vatFraction = normalizeVatFraction(quote.vat_rate, quote.ref);
    const subtotal = items.reduce((s, it) => s + it.qty * it.unit, 0);
    const vat = subtotal * vatFraction;
    const total = subtotal + vat;
    const vatPercent = Math.round(vatFraction * 100);
    xml = setTotalsRowValue(xml, "Subtotal", gbp(subtotal));
    xml = setTotalsRowValue(xml, "VAT", gbp(vat), `VAT @ ${vatPercent}%`);
    xml = setTotalsRowValue(xml, "TOTAL", `£${gbp(total)}`);
    xml = forceTotalRowWhiteText(xml);

    xml = renderAIFillPlaceholders(xml, quote);

    // 5. Write back.
    zip.file("word/document.xml", xml);

    // 6. Generate output bytes.
    const out = await zip.generateAsync({
      type: "uint8array",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      compression: "DEFLATE",
    });

    // 7. Upload to quote-outputs and sign a URL (unchanged behaviour).
    const pathBase = quote.quotation_id ?? quote.ref.replace(/[^A-Za-z0-9_-]/g, "_");
    const storagePath = `${pathBase}/quote.docx`;
    const { error: uploadErr } = await supabase.storage.from("quote-outputs").upload(storagePath, out, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: signed, error: signedErr } = await supabase.storage.from("quote-outputs").createSignedUrl(storagePath, 3600);
    if (signedErr || !signed) throw new Error(`Sign failed: ${signedErr?.message ?? "no url"}`);

    if (quote.quotation_id) {
      await supabase.from("quotations").update({ latest_docx_path: storagePath }).eq("id", quote.quotation_id);
    }

    return new Response(JSON.stringify({
      storage_path: storagePath,
      signed_url: signed.signedUrl,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      file_size_bytes: out.byteLength,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate-quote-docx error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});

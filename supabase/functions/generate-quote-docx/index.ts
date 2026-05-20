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
  client: {
    company: string;
    contact: string;
    address: string;       // billing address
    email?: string;
    phone?: string;
  };
  site?: {
    name?: string;
    address?: string;
  };

  // Scope narrative. scope_content (markdown) preferred; falls back to scope (string[]).
  scope_content?: string;
  scope?: string[];

  // §1 Executive Summary text. summary_paragraph (job-type-aware) preferred;
  // falls back to introduction.
  summary_paragraph?: string;
  introduction?: string;

  // §2.3 Phasing & Programme text. If empty/null, the whole §2.3 section
  // (heading + body) is hidden from the rendered document — no orphan heading.
  phasing_paragraph?: string;

  // §6 Programme & Delivery body text. Same omission behaviour as §2.3 —
  // an empty programme leaves §6 absent entirely (avoids the "heading
  // then nearly-blank page" the user complained about). When the AI starts
  // emitting this field, the section automatically reappears with content.
  programme_paragraph?: string;

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
  "Design and design review to BS 5839-1:2025",
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
    "Recommissioning of the affected zones in accordance with BS 5839-1:2025 Clause 39",
    "Issue of a Modification Certificate per Clause 44 and Annex G",
    "Update of as-fitted drawings, zone plans and the system logbook",
    "Site demonstration and client handover",
  ],
  upgrade: undefined as unknown as string[],   // legacy alias resolved below
  extension: [
    "Impact assessment on existing system architecture and battery capacity",
    "Supply and installation of additional devices, cabling and any reconfiguration required",
    "Re-programming of cause & effect to integrate the new equipment",
    "Partial commissioning of the new equipment per BS 5839-1:2025 Clause 39",
    "Issue of a Modification Certificate per Clause 44 and Annex G",
    "Update of zone plans, cause-and-effect schedule and the system logbook",
  ],
  system_takeover: [
    "Initial condition survey of the existing fire detection and alarm system",
    "Verification of zone plans, cause-and-effect schedule and as-fitted documentation",
    "Functional sample test of detectors, manual call points and output groups",
    "Rectification of any immediate defects identified (priced separately if extensive)",
    "Issue of an Acceptance Certificate to BS 5839-1:2025",
    "Commencement of routine servicing per the agreed maintenance frequency",
  ],
  takeover: undefined as unknown as string[],
  reactive_remedial: [
    "Site investigation of each reported defect",
    "Rectification works — component replacement, wiring repair, or configuration change as required",
    "Functional re-testing of the affected zones, devices and output groups",
    "Update of the system logbook (BS 5839-1:2025 Annex G)",
    "Issue of a service report detailing the works performed and confirming the system's operational status",
  ],
  remedial: undefined as unknown as string[],
  planned_maintenance: [
    "Visual inspection of the panel, batteries, indicators and printer",
    "Functional testing of a representative sample of detectors and manual call points per BS 5839-1:2025 Clause 43.3",
    "Verification of ARC signal transmission with the receiving centre notified before and after testing",
    "Inspection of battery condition and recording of standby capacity",
    "Issue of a Service Certificate (BS 5839-1:2025 Annex G)",
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
    "Issue of a BS 5839-1:2025 Commissioning Certificate per Annex G",
    "Handover of completion documentation to the responsible person",
  ],
  acceptance_testing: [
    "Review of design documentation and the Commissioning Certificate",
    "Witness testing of a representative sample of devices and cause-and-effect operations",
    "Verification of zone plans, signage and accessibility of equipment",
    "Issue of an Acceptance Certificate per BS 5839-1:2025",
    "Recording of any outstanding items requiring rectification",
  ],
  verification: [
    "Independent review of design, commissioning and modification certificates",
    "Physical verification of the installation against the design and BS 5839-1:2025",
    "Sample functional testing of devices and output groups",
    "Issue of a verification report listing compliance status and any non-conformities",
  ],
  design_only: [
    "Site survey and design brief capture",
    "Production of a BS 5839-1:2025 compliant design — zone plans, device schedules, cabling routes",
    "Production of the cause-and-effect matrix",
    "Issue of a Design Certificate per BS 5839-1:2025 Clause 44 and Annex G",
    "Handover pack for the installing contractor",
  ],
  certification: [
    "Site audit and verification of the installed equipment against the as-found configuration",
    "Functional sample testing where required to support certification",
    "Production of the appropriate certificate (Commissioning / Modification / Acceptance) per BS 5839-1:2025 Annex G",
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

// Insert a page-break paragraph immediately before §7 PAYMENT TERMS so the
// whole section starts on a fresh page (Word's auto layout was splitting it
// between two pages). Idempotent — if a page break is already in place
// directly before the heading, this is a no-op.
function pageBreakBeforeSection7(xml: string): string {
  const idx = xml.indexOf("7. PAYMENT TERMS");
  if (idx < 0) return xml;
  const pStart = findEnclosingWpStart(xml, idx);
  if (pStart < 0) return xml;
  // Skip if there's already a pageBreakBefore in the heading's own pPr or
  // immediately preceding paragraph (avoid stacking blank pages).
  const window = xml.substring(Math.max(0, pStart - 200), pStart + 100);
  if (window.includes("<w:pageBreakBefore")) return xml;
  return xml.substring(0, pStart)
    + '<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>'
    + xml.substring(pStart);
}

// Global cleanup: any run whose text is NO LONGER a [ bracketed placeholder
// loses its italic + grey-9CA3AF "placeholder" styling — populated values
// should read as normal body text. Applied AFTER all replacements so we only
// demote runs that actually got filled; remaining "[Copilot:" etc. runs
// either keep their styling or get stripped by removeAllParagraphsContaining.
// Matches both <w:r> and attribute-rich <w:r w:rsidR="..."> forms.
function demotePopulatedRuns(xml: string): string {
  const re = /(<w:r(?:\s[^>]*)?>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)<w:t([^>]*)>([^<]*)<\/w:t>(<\/w:r>)/g;
  return xml.replace(re, (match, openAndRpr, tAttr, text, closeR) => {
    if (text.length === 0) return match;          // empty cell — leave alone
    if (text.includes("[")) return match;          // still a placeholder — leave alone
    if (!/<w:i\s*\/>|9CA3AF/.test(openAndRpr)) return match;  // not styled grey/italic — no change needed
    const cleaned = openAndRpr
      .replace(/<w:i\s*\/>\s*<w:iCs\s*\/>/g, "")
      .replace(/<w:color w:val="9CA3AF"\s*\/>/g, '<w:color w:val="1A1A1A"/>');
    return `${cleaned}<w:t${tAttr}>${text}</w:t>${closeR}`;
  });
}

// Remove a numbered section (e.g. "2.3 Phasing & Programme") entirely —
// heading paragraph PLUS the single body paragraph immediately following it.
// Used when the section has no dynamic data to render so we don't leave an
// orphan heading floating above no content.
function removeSectionHeadingAndBody(xml: string, headingMatch: string): string {
  const idx = xml.indexOf(headingMatch);
  if (idx < 0) return xml;
  const hStart = findEnclosingWpStart(xml, idx);
  if (hStart < 0) return xml;
  const hEnd = xml.indexOf("</w:p>", idx);
  if (hEnd < 0) return xml;
  // Find the next paragraph after the heading and remove it too.
  const bodyEnd = xml.indexOf("</w:p>", hEnd + "</w:p>".length);
  if (bodyEnd < 0) return xml;
  return xml.substring(0, hStart) + xml.substring(bodyEnd + "</w:p>".length);
}

// Remove everything from `headingMatch` up to (but not including) the
// `untilNext` heading. Used for multi-paragraph sections like §6 PROGRAMME
// where the section has a heading + an intro line + several bullets, all
// of which need to vanish when there's no content to populate.
function removeSectionUntilNext(xml: string, headingMatch: string, untilNext: string): string {
  const idx = xml.indexOf(headingMatch);
  if (idx < 0) return xml;
  const hStart = findEnclosingWpStart(xml, idx);
  if (hStart < 0) return xml;
  const nextIdx = xml.indexOf(untilNext, idx);
  if (nextIdx < 0) return xml;
  const nextStart = findEnclosingWpStart(xml, nextIdx);
  if (nextStart < 0 || nextStart <= hStart) return xml;
  return xml.substring(0, hStart) + xml.substring(nextStart);
}

// Word fragments edited text into adjacent <w:r> runs (so "[Contact Email]"
// can become 3 runs: "[Contact ", "Email", "]"). When two consecutive runs in
// the same paragraph have identical <w:rPr> AND both contain only a <w:t>,
// they can safely be merged into one — preserving formatting and concatenating
// the text. Run on document.xml load so all downstream placeholder searches
// see whole-string nodes.
function mergeAdjacentRuns(xml: string): string {
  // Pattern: capture rPr, capture text1, then a second run with identical rPr
  // and text2. Replace with a single run whose text is text1+text2.
  // Iterated to convergence — a 4-run split needs 3 passes.
  const re = /<w:r>(<w:rPr>[^<]*(?:<[^/][^>]*\/>[^<]*)*<\/w:rPr>)<w:t(?:\s[^>]*)?>([^<]*)<\/w:t><\/w:r><w:r>\1<w:t(?:\s[^>]*)?>([^<]*)<\/w:t><\/w:r>/g;
  // Also handle runs with no rPr at all.
  const reNoRpr = /<w:r><w:t(?:\s[^>]*)?>([^<]*)<\/w:t><\/w:r><w:r><w:t(?:\s[^>]*)?>([^<]*)<\/w:t><\/w:r>/g;
  let prev = "";
  let curr = xml;
  let guard = 30; // worst-case 30 passes per file; placeholders rarely split more
  while (curr !== prev && guard-- > 0) {
    prev = curr;
    curr = curr.replace(re, (_m, rpr, t1, t2) =>
      `<w:r>${rpr}<w:t xml:space="preserve">${t1}${t2}</w:t></w:r>`);
    curr = curr.replace(reNoRpr, (_m, t1, t2) =>
      `<w:r><w:t xml:space="preserve">${t1}${t2}</w:t></w:r>`);
  }
  return curr;
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

// Repeatedly remove every paragraph that contains the substring `needle`.
// Used to sweep ANY remaining [Copilot: ...] paragraph (including ones whose
// exact text we couldn't pre-match) so the orphan labels — e.g. "Lead time
// on materials: " left after the marker was stripped — don't survive into
// the output. Capped to 200 iterations as a runaway guard.
function removeAllParagraphsContaining(xml: string, needle: string): string {
  let x = xml;
  for (let i = 0; i < 200; i++) {
    const idx = x.indexOf(needle);
    if (idx < 0) break;
    const pStart = findEnclosingWpStart(x, idx);
    if (pStart < 0) break;
    const pEnd = x.indexOf("</w:p>", idx);
    if (pEnd < 0) break;
    x = x.substring(0, pStart) + x.substring(pEnd + "</w:p>".length);
  }
  return x;
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
// rows. The canonical row is the first one that contains a recognisable
// placeholder marker (any of the three fallbacks below). If the user edits
// the template and removes the [Copilot: Line item description] text from
// the canonical row, we still find it via [Line item] or [Qty] / [0.00].
function renderPricingRows(xml: string, items: QuoteItem[]): string {
  // Try markers in decreasing specificity. Whichever hits first owns the
  // canonical row; the rest are absorbed as stubs.
  const MARKERS = ["[Copilot: Line item description]", "[Line item]", "[Qty]"];
  let canonicalIdx = -1;
  for (const m of MARKERS) {
    canonicalIdx = xml.indexOf(m);
    if (canonicalIdx >= 0) break;
  }
  if (canonicalIdx < 0) return xml;
  const canonicalRowStart = xml.lastIndexOf("<w:tr>", canonicalIdx);
  const canonicalRowEnd = xml.indexOf("</w:tr>", canonicalIdx) + "</w:tr>".length;
  if (canonicalRowStart < 0 || canonicalRowEnd <= 0) return xml;
  const canonicalRow = xml.substring(canonicalRowStart, canonicalRowEnd);

  // Walk forward absorbing every subsequent placeholder row up to (but not
  // into) the Subtotal row. A row is a stub if it contains any of the
  // pricing-cell markers. Capped to defend against malformed templates.
  const subtotalIdx = xml.indexOf("Subtotal", canonicalRowEnd);
  let blockEnd = canonicalRowEnd;
  let cursor = canonicalRowEnd;
  for (let guard = 0; guard < 30; guard++) {
    // Find the next position of ANY stub marker after the cursor.
    const stubMarkers = ["[Line item]", "[Qty]", "[Copilot: Line item description]"];
    let nextStub = -1;
    for (const m of stubMarkers) {
      const pos = xml.indexOf(m, cursor);
      if (pos >= 0 && (nextStub < 0 || pos < nextStub)) nextStub = pos;
    }
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

// Find the <w:tr> whose label-cell text matches `exactLabel` and set the
// LAST cell's text to `value`. The label MUST be the full text content of a
// <w:t> node (e.g. "VAT @ 20%" not "VAT") so a substring elsewhere in the
// document (e.g. the "exclusive of VAT" preamble) can't accidentally match.
// Also validates that the located <w:tr> actually CONTAINS the anchor — a
// stale earlier-table <w:tr> can leak through lastIndexOf otherwise.
function setTotalsRowValue(xml: string, exactLabel: string, value: string, alsoUpdateLabel?: string): string {
  // Search for the label as the entire text of a <w:t> node:
  // <w:t...>label</w:t>. The pattern is anchored on both sides so partial
  // matches like ">VAT @" inside ">VAT @ 20%</w:t>" don't confuse us.
  const safe = exactLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<w:t[^>]*>${safe}</w:t>`);
  const m = re.exec(xml);
  if (!m) return xml;
  const anchorIdx = m.index;
  const rowStart = xml.lastIndexOf("<w:tr>", anchorIdx);
  if (rowStart < 0) return xml;
  // Anchor must be inside the located row — no </w:tr> between rowStart and anchor.
  if (xml.substring(rowStart, anchorIdx).indexOf("</w:tr>") >= 0) return xml;
  const rowEnd = xml.indexOf("</w:tr>", anchorIdx) + "</w:tr>".length;
  if (rowEnd <= 0) return xml;
  const row = xml.substring(rowStart, rowEnd);
  const { shell, cells } = splitRowIntoCells(row);
  if (cells.length === 0) return xml;
  cells[cells.length - 1] = setCellText(cells[cells.length - 1], value);
  let rebuilt = joinRowFromCells(shell, cells);
  if (alsoUpdateLabel) {
    // Rewrite the label cell's text — used to swap "VAT @ 20%" for the actual rate.
    rebuilt = rebuilt.replace(
      new RegExp(`(<w:t[^>]*>)${safe}(</w:t>)`),
      `$1${escapeXmlText(alsoUpdateLabel)}$2`,
    );
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

  // Client block — omit empty rows. Email/phone now come from the payload
  // (caller pulls from customers.contact_email/contact_phone) rather than
  // being hardcoded empty as before.
  x = fieldOrOmit(x, "[Client / Main Contractor]", q.client.company);
  x = fieldOrOmit(x, "[Contact Name & Role]", q.client.contact);
  x = fieldOrOmit(x, "[Billing Address]", q.client.address);
  x = fieldOrOmit(x, "[Contact Email]", q.client.email ?? "");
  x = fieldOrOmit(x, "[Contact Phone]", q.client.phone ?? "");

  // Site Details block — site address (which already includes the site
  // name as its first component) is distinct from the billing address.
  // Falls back to client.address if the caller didn't split them.
  const siteForRender = (q.site?.address && q.site.address.trim()) || q.client.address;
  x = fieldOrOmit(x, "[Project Name]", q.project_title);
  x = fieldOrOmit(x, "[Site Name & Address]", siteForRender);
  x = fieldOrOmit(x, "[e.g. Gent S-Quad / Vigilon]", "");  // no system info in payload yet
  x = fieldOrOmit(x, "[e.g. BS 5839-1:2025 Cat L1]", "BS 5839-1:2025");
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
  // fall back to introduction, then first scope paragraph, then project title
  // as a last-resort so §1 isn't a heading with nothing under it.
  const exec = (q.summary_paragraph && q.summary_paragraph.trim())
    || (q.introduction && q.introduction.trim())
    || scope[0]
    || (q.project_title && `BHO Fire Ltd is pleased to submit this quotation for ${q.project_title.trim()}.`)
    || "";
  x = replaceAllWtText(
    x,
    "[Copilot: Insert a 3–5 sentence plain-English summary of the works — system type, scale, key interfaces, programme highlights.]",
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

  // Anything still containing "[Copilot:" — Programme bullets, leftover
  // markers in any section — gets its entire paragraph removed. This wipes
  // the orphan labels (e.g. "Lead time on materials: ") that would
  // otherwise survive a text-only strip.
  x = removeAllParagraphsContaining(x, "[Copilot:");
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

// ── §2.2 Detailed Scope renderer (replaces "Works Included" approach) ──────
//
// Template has §2.2 with just a [Copilot: Add project-specific items …]
// placeholder paragraph (the old install-focused static bullets were stripped
// from the template). This renderer replaces that placeholder with N numbered
// scope-item paragraphs styled as Verdana 8pt black body text — not the
// italic-grey "placeholder" style of the marker it replaces.

const BODY_RPR =
  '<w:rPr>' +
    '<w:rFonts w:ascii="Verdana" w:cs="Verdana" w:eastAsia="Verdana" w:hAnsi="Verdana"/>' +
    '<w:color w:val="1A1A1A"/>' +
    '<w:sz w:val="16"/><w:szCs w:val="16"/>' +
  '</w:rPr>';

function buildScopeItemParagraph(num: number, text: string): string {
  const prefix = escapeXmlText(`${num}. `);
  const body = escapeXmlText(text.trim());
  return '<w:p>'
    + '<w:pPr>'
      + '<w:spacing w:after="120" w:line="260" w:lineRule="auto"/>'
      + '<w:ind w:left="360" w:hanging="360"/>'
      + '<w:jc w:val="both"/>'
    + '</w:pPr>'
    + `<w:r>${BODY_RPR}<w:t xml:space="preserve">${prefix}</w:t></w:r>`
    + `<w:r>${BODY_RPR}<w:t xml:space="preserve">${body}</w:t></w:r>`
    + '</w:p>';
}

// Replace the §2.2 placeholder paragraph with N numbered scope items.
// scope[0] feeds §2.1 (System Description) so §2.2 lists scope[1..] —
// unless the entire scope is one item, in which case §2.2 is omitted.
function renderDetailedScope(xml: string, scope: string[]): string {
  const marker = "[Copilot: Add project-specific items";  // partial match — placeholder may have been edited
  const phIdx = xml.indexOf(marker);
  if (phIdx < 0) return xml;
  const pStart = findEnclosingWpStart(xml, phIdx);
  if (pStart < 0) return xml;
  const pEnd = xml.indexOf("</w:p>", phIdx) + "</w:p>".length;
  if (pEnd <= 0) return xml;

  const items = scope.slice(1).filter((s) => s && s.trim().length > 0);
  if (items.length === 0) {
    // No detailed items — strip the placeholder paragraph cleanly.
    return xml.substring(0, pStart) + xml.substring(pEnd);
  }
  const paragraphs = items.map((t, i) => buildScopeItemParagraph(i + 1, t)).join("");
  return xml.substring(0, pStart) + paragraphs + xml.substring(pEnd);
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
        "DOCX generation temporarily unavailable — template restore in progress. " +
        "Please try again later or contact an administrator.",
      );
    }
    // Zero-byte template = upload corruption. Don't try to unzip — JSZip would
    // throw a cryptic "end of central directory" error that masks the real issue.
    const templateBytes = await templateBlob.arrayBuffer();
    if (templateBytes.byteLength === 0) {
      throw new Error(
        "DOCX generation temporarily unavailable — template restore in progress. " +
        "The master template at quote-assets/master-template.docx is empty (0 bytes).",
      );
    }

    // 2. Look up issuer info and quotation context (works_type for §2.2).
    const { issuer, ctx } = await loadQuotationData(quote.quotation_id, supabase);

    // 3. Unzip + read document.xml.
    const zip = await JSZip.loadAsync(templateBytes);
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) throw new Error("Template is missing word/document.xml — file is not a valid .docx");
    let xml = await documentFile.async("string");

    // Defragment Word's split runs FIRST so subsequent placeholder searches
    // see whole-string nodes. Word commonly splits placeholders into
    // multiple <w:r>s when the user edits the template — without this pass
    // a hand-edited template would silently leave placeholders untouched
    // in the rendered output.
    xml = mergeAdjacentRuns(xml);

    // 4. Apply replacements in the order most likely to keep cell-lookup
    //    unambiguous (line items before totals before generic Copilot sweep).
    const items = flatPriceableItems(quote);
    const scope = resolveScopeParagraphs(quote);
    xml = renderTopFields(xml, quote, issuer);
    xml = renderDetailedScope(xml, scope);
    // §2.3 — if we have phasing_paragraph, fill it; otherwise drop the
    // whole section so the document doesn't show an empty heading.
    if (quote.phasing_paragraph && quote.phasing_paragraph.trim()) {
      xml = replaceAllWtText(
        xml,
        "[Copilot: Insert phasing arrangement, key milestones, agreed dates, working hours, isolations required.]",
        quote.phasing_paragraph.trim(),
      );
    } else {
      xml = removeSectionHeadingAndBody(xml, "2.3 Phasing");
    }
    // §6 PROGRAMME & DELIVERY — populate or hide.
    // The template has heading + "Subject to receipt..." intro + 4 bullets
    // with [Copilot:] placeholders. If we have no programme_paragraph,
    // drop the whole section through to (but not into) §7 PAYMENT TERMS.
    if (quote.programme_paragraph && quote.programme_paragraph.trim()) {
      // Replace the first remaining [Copilot:] inside §6 with the body text.
      // (Specific bullet placeholders are still stripped by the generic
      // [Copilot:] sweep below; this captures any survivor we care to fill.)
      xml = replaceAllWtText(
        xml,
        "[Copilot: Insert phasing notes, isolation windows, or critical client milestones.]",
        quote.programme_paragraph.trim(),
      );
    } else {
      xml = removeSectionUntilNext(xml, "6. PROGRAMME", "7. PAYMENT TERMS");
    }
    xml = renderPricingRows(xml, items);

    const vatFraction = normalizeVatFraction(quote.vat_rate, quote.ref);
    const subtotal = items.reduce((s, it) => s + it.qty * it.unit, 0);
    const vat = subtotal * vatFraction;
    const total = subtotal + vat;
    const vatPercent = Math.round(vatFraction * 100);
    // Pass the EXACT label as it appears in the template's totals rows.
    // The renderer matches >${exactLabel}</w:t> so partial substrings
    // ("VAT" inside "exclusive of VAT") can't trip the locator.
    xml = setTotalsRowValue(xml, "Subtotal", gbp(subtotal));
    xml = setTotalsRowValue(xml, "VAT @ 20%", gbp(vat), `VAT @ ${vatPercent}%`);
    xml = setTotalsRowValue(xml, "TOTAL", `£${gbp(total)}`);
    xml = forceTotalRowWhiteText(xml);

    xml = renderAIFillPlaceholders(xml, quote);

    // Layout: keep §7 PAYMENT TERMS on one page (Word was splitting it
    // mid-section). pageBreakBefore on a leading empty paragraph forces
    // the section to start on a fresh page.
    xml = pageBreakBeforeSection7(xml);

    // Final cleanup pass: any run that now holds a real value (not a
    // [ bracketed placeholder) gets its italic + grey "placeholder" styling
    // removed so the populated text reads as normal black body text.
    xml = demotePopulatedRuns(xml);

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

/**
 * generate-quote-docx — renders a quote by loading the BHO master template
 * (quote-assets/master-template.docx) and replacing placeholder markers
 * with quote-specific content. Static sections (Exclusions, Assumptions,
 * Payment Terms, Standards & Accreditations) come verbatim from the template
 * so they always include BHO's commercial protections.
 *
 * Placeholder conventions in the template:
 *   [BHO-Q-2026-0234]          quote ref
 *   [DD Month YYYY]            date issued (also Issued-By block)
 *   [Client / Main Contractor] client company
 *   [Contact Name & Role]      client contact
 *   [Billing Address]          client address
 *   [Project Name]             project title
 *   [Copilot: ...]             AI/data-driven content (replaced or stripped)
 *   [Line item] / [Qty] /      pricing table row — template row is cloned
 *     [0.00]                     per line item, all rows replace the original
 *   [£0.00]                    grand total in pricing schedule
 */

import JSZip from "npm:jszip@3.10.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  // Scope — narrative form. `scope` (string[]) is the legacy shape from the
  // older AI generator; `scope_content` is the markdown shape from the new
  // one. Both supported — first available wins.
  scope_content?: string;
  scope?: string[];

  // Line items — sectioned or flat. Section header rows are filtered out
  // before rendering (the master template handles its own section visuals).
  line_items?: SectionedLineItem[];
  items?: QuoteItem[];

  introduction?: string;
  assumptions?: string[];
  exclusions?: string[];

  vat_rate?: number;
  quotation_id?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// VAT may arrive as fraction (0.20) or whole percent (20). Throws if the
// resulting fraction is outside the plausible UK range so a misinterpreted
// "20" parsed as 2000% can never silently render a wrong invoice.
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

// Normalise the two possible line-item shapes into one flat priceable list.
// Section header rows are filtered out — the template doesn't expose
// per-section subtotals in v1.
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

// Resolve the narrative scope to a single array of paragraph strings.
// Prefer scope_content (markdown numbered list) split into items; fall
// back to the legacy `scope: string[]` if scope_content is empty.
function resolveScopeParagraphs(q: QuoteInput): string[] {
  if (q.scope_content && q.scope_content.trim().length > 0) {
    const md = q.scope_content.replace(/\r\n/g, "\n").trim();
    // Split at the start of each "N. " line and join wrapped lines.
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

// ── XML replacement primitives ────────────────────────────────────────────────

// Replace ALL occurrences of `placeholder` text appearing inside a <w:t>...</w:t>
// run. The replacement value is XML-escaped. Surrounding text in the same run
// is preserved.
function replaceAllWtText(xml: string, placeholder: string, value: string): string {
  const safe = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(<w:t[^>]*>)([^<]*?)${safe}([^<]*?)(</w:t>)`, "g");
  return xml.replace(re, (_m, openTag, before, after, closeTag) =>
    `${openTag}${before}${escapeXmlText(value)}${after}${closeTag}`,
  );
}

// Replace the FIRST occurrence of `placeholder` text inside a <w:t>...</w:t>.
// Used where the same literal appears multiple times and we want to consume
// them in order (e.g. multiple [0.00] cells in the totals rows).
function replaceFirstWtText(xml: string, placeholder: string, value: string): string {
  const safe = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(<w:t[^>]*>)([^<]*?)${safe}([^<]*?)(</w:t>)`);
  return xml.replace(re, (_m, openTag, before, after, closeTag) =>
    `${openTag}${before}${escapeXmlText(value)}${after}${closeTag}`,
  );
}

// The template's placeholder cells are styled italic grey (#9CA3AF). When we
// render a real value into one we want it to look like normal body text:
// drop italic, switch grey to body black. Operates on rPr blocks inside a row.
function fixCellStyling(rowXml: string): string {
  return rowXml
    .replace(/<w:i\s*\/>\s*<w:iCs\s*\/>/g, "")
    .replace(/<w:color w:val="9CA3AF"\s*\/>/g, '<w:color w:val="1A1A1A"/>');
}

// ── Line items table ──────────────────────────────────────────────────────────

// Replace the template's placeholder rows (one canonical + any extras) with
// N rendered rows — one per priceable line item. The cell order in the
// canonical row is: ITEM#, DESCRIPTION, QTY, UNIT PRICE, LINE TOTAL.
function renderLineItemRows(xml: string, items: QuoteItem[]): string {
  const marker = "[Copilot: Line item description]";
  const markerIdx = xml.indexOf(marker);
  if (markerIdx < 0) return xml; // no template row found — leave doc alone

  const rowStart = xml.lastIndexOf("<w:tr>", markerIdx);
  const firstRowEnd = xml.indexOf("</w:tr>", markerIdx) + "</w:tr>".length;
  if (rowStart < 0 || firstRowEnd < 0) return xml;

  const canonicalRow = xml.substring(rowStart, firstRowEnd);

  // Walk forward to find any additional template rows (containing `[Line item]`).
  // They're remnants of the master template that we want to absorb into the
  // block we replace, so the final document doesn't contain leftover stubs.
  let blockEnd = firstRowEnd;
  let scanFrom = firstRowEnd;
  // Cap the look-ahead so a stray "[Line item]" later in the doc doesn't
  // accidentally extend the block past the totals rows.
  const HARD_STOP = xml.indexOf("Subtotal", firstRowEnd);
  while (true) {
    const nextStub = xml.indexOf("[Line item]", scanFrom);
    if (nextStub < 0) break;
    if (HARD_STOP > 0 && nextStub > HARD_STOP) break;
    const stubRowEnd = xml.indexOf("</w:tr>", nextStub) + "</w:tr>".length;
    if (stubRowEnd <= 0) break;
    blockEnd = stubRowEnd;
    scanFrom = stubRowEnd;
  }

  const renderedRows = items.length === 0
    ? renderItemRow(canonicalRow, 1, { desc: "(no line items)", qty: 0, unit: 0 })
    : items.map((it, i) => renderItemRow(canonicalRow, i + 1, it)).join("");

  return xml.substring(0, rowStart) + renderedRows + xml.substring(blockEnd);
}

function renderItemRow(templateRow: string, itemNum: number, item: QuoteItem): string {
  let r = fixCellStyling(templateRow);
  // Cell order is fixed by the template; replace each placeholder in document
  // order so the first [0.00] becomes the unit price and the second becomes
  // the line total.
  r = replaceFirstWtText(r, "1", String(itemNum));            // item number cell (canonical row hardcodes "1")
  r = replaceFirstWtText(r, "[Copilot: Line item description]", item.desc);
  r = replaceFirstWtText(r, "[Qty]", String(item.qty));
  r = replaceFirstWtText(r, "[0.00]", gbp(item.unit));        // unit price
  r = replaceFirstWtText(r, "[0.00]", gbp(item.qty * item.unit)); // line total
  return r;
}

// ── Totals rows ───────────────────────────────────────────────────────────────

// Runs AFTER renderLineItemRows so the only remaining [0.00] placeholders
// are the Subtotal and VAT cells, in document order, followed by [£0.00]
// for the grand total. Also updates the hardcoded "VAT @ 20%" label.
function renderTotals(xml: string, subtotal: number, vat: number, total: number, vatPercent: number): string {
  let x = xml;
  x = x.replace(/VAT @ 20%/g, `VAT @ ${Math.round(vatPercent)}%`);
  x = replaceFirstWtText(x, "[0.00]", gbp(subtotal));
  x = replaceFirstWtText(x, "[0.00]", gbp(vat));
  x = replaceFirstWtText(x, "[£0.00]", `£${gbp(total)}`);
  return x;
}

// ── Top-of-document and Issued-By placeholders ───────────────────────────────

function renderSimpleFields(xml: string, q: QuoteInput): string {
  let x = xml;
  // Quote ref and date (top header)
  x = replaceAllWtText(x, "[BHO-Q-2026-0234]", q.ref);
  x = replaceAllWtText(x, "[DD Month YYYY]", q.issued_date);

  // Client block
  x = replaceAllWtText(x, "[Client / Main Contractor]", q.client.company);
  x = replaceAllWtText(x, "[Contact Name & Role]", q.client.contact);
  x = replaceAllWtText(x, "[Billing Address]", q.client.address);
  x = replaceAllWtText(x, "[Contact Email]", "");  // not in payload
  x = replaceAllWtText(x, "[Contact Phone]", "");

  // Site Details block
  x = replaceAllWtText(x, "[Project Name]", q.project_title);
  x = replaceAllWtText(x, "[Site Name & Address]", q.client.address);
  x = replaceAllWtText(x, "[e.g. Gent S-Quad / Vigilon]", "");
  x = replaceAllWtText(x, "[e.g. BS 5839-1:2025 Cat L1]", "BS 5839-1:2025");
  x = replaceAllWtText(x, "[Client Enquiry Reference]", q.ref);

  // Issued-By block at the foot
  x = replaceAllWtText(x, "[Estimator Name]", "BHO Fire & Security Ltd");
  x = replaceAllWtText(x, "[Job Title]", "Estimating Team");
  x = replaceAllWtText(x, "[estimator@bhofire.com]", "tenders@bhofire.com");
  x = replaceAllWtText(x, "[Direct Phone]", "0330 043 8659");
  return x;
}

// ── AI-fill / Copilot placeholders ───────────────────────────────────────────

function renderAIFillPlaceholders(xml: string, q: QuoteInput): string {
  let x = xml;
  const scope = resolveScopeParagraphs(q);

  // §1 Executive Summary — prefer dedicated introduction, fall back to scope.
  const exec = (q.introduction && q.introduction.trim()) || scope[0] || "";
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

  // §2.2 Works Included — append remaining scope paragraphs as project-specific items.
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

  // Sweep any other [Copilot: ...] markers we don't have data for so they
  // don't leak into the final document. Strips the marker but preserves the
  // surrounding paragraph (which will render as empty whitespace).
  x = x.replace(/(<w:t[^>]*>)([^<]*?)\[Copilot:[^\]]*\]([^<]*?)(<\/w:t>)/g, "$1$2$3$4");
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

    // 1. Load the master template.
    const { data: templateBlob, error: tmplErr } = await supabase.storage
      .from("quote-assets").download("master-template.docx");
    if (tmplErr || !templateBlob) {
      throw new Error(
        "Master template not found at quote-assets/master-template.docx. " +
        "Upload BHO_Quote_Template_Verdana.docx via Admin → Quote Settings.",
      );
    }

    // 2. Unzip in memory.
    const zip = await JSZip.loadAsync(await templateBlob.arrayBuffer());
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) throw new Error("Template is missing word/document.xml — file is not a valid .docx");
    let xml = await documentFile.async("string");

    // 3. Apply placeholder replacements.
    const items = flatPriceableItems(quote);
    xml = renderSimpleFields(xml, quote);
    xml = renderLineItemRows(xml, items);

    const vatFraction = normalizeVatFraction(quote.vat_rate, quote.ref);
    const subtotal = items.reduce((s, it) => s + it.qty * it.unit, 0);
    const vat = subtotal * vatFraction;
    const total = subtotal + vat;
    xml = renderTotals(xml, subtotal, vat, total, vatFraction * 100);

    xml = renderAIFillPlaceholders(xml, quote);

    // 4. Write modified document.xml back into the zip.
    zip.file("word/document.xml", xml);

    // 5. Generate the output .docx.
    const out = await zip.generateAsync({ type: "uint8array", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });

    // 6. Upload to storage and sign a URL (unchanged from prior version).
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

import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PriceListItem {
  id: string;
  part_number: string | null;
  description: string;
  short_name: string | null;
  category: string | null;
  manufacturer: string | null;
  model: string | null;
  unit_cost: number;
  labour_cost: number;
  markup_pct: number;
  keywords: string[];
  is_active: boolean;
  notes: string | null;
  upload_batch: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParsedPriceRow {
  part_number?: string;
  description: string;
  short_name?: string;
  category?: string;
  manufacturer?: string;
  model?: string;
  unit_cost: number;
  labour_cost: number;
  _rowIndex: number;
  _error?: string;
}

export const PRICE_LIST_CATEGORIES = [
  "Detector", "Sounder", "VAD", "Sounder/VAD", "MCP",
  "Interface", "Panel", "Relay", "Cable", "Containment",
  "Fixings", "Battery", "Keyswitch", "Other",
] as const;

// ── CSV parsing ────────────────────────────────────────────────────────────────
// Supported column headers (case-insensitive):
//   Part No / Part Number / PartNo / SKU → part_number
//   Description / Product / Item / Name  → description
//   Short Name / Short / Display         → short_name
//   Category / Type                      → category
//   Manufacturer / Make / Brand          → manufacturer
//   Model                                → model
//   Unit Cost / Cost / Price / Buy Price / Unit Price / Our Price / £ → unit_cost
//   Labour / Labour Cost / Labour (£) / Fit / Install                 → labour_cost

const HEADER_MAP: Record<string, keyof ParsedPriceRow> = {
  // Part number
  part_no: "part_number", part_number: "part_number", partno: "part_number", part: "part_number",
  sku: "part_number", code: "part_number", product_code: "part_number", item_code: "part_number",
  ref: "part_number", reference: "part_number", cat_no: "part_number", cat: "part_number",
  catalogue_no: "part_number", catalog_no: "part_number", article: "part_number", article_no: "part_number",
  stock_code: "part_number", order_code: "part_number",
  // Description
  description: "description", product: "description", item: "description", name: "description",
  item_name: "description", product_name: "description", product_description: "description",
  title: "description", goods: "description", detail: "description", details: "description",
  // Short name
  short_name: "short_name", short: "short_name", display: "short_name", short_description: "short_name",
  // Category
  category: "category", type: "category", group: "category", product_group: "category",
  product_type: "category", range: "category", family: "category",
  // Manufacturer
  manufacturer: "manufacturer", make: "manufacturer", brand: "manufacturer", mfr: "manufacturer",
  supplier: "manufacturer", vendor: "manufacturer", produced_by: "manufacturer",
  // Model
  model: "model", model_no: "model", model_number: "model", series: "model",
  // Unit cost — all the aliases a supplier might use
  unit_cost: "unit_cost", cost: "unit_cost", price: "unit_cost",
  buy_price: "unit_cost", unit_price: "unit_cost", our_price: "unit_cost", sell_price: "unit_cost",
  trade_price: "unit_cost", net_price: "unit_cost", nett_price: "unit_cost", nett: "unit_cost",
  list_price: "unit_cost", rrp: "unit_cost", msrp: "unit_cost",
  cost_price: "unit_cost", purchase_price: "unit_cost", wholesale_price: "unit_cost",
  each: "unit_cost", rate: "unit_cost", charge: "unit_cost", amount: "unit_cost",
  ex_vat: "unit_cost", excl_vat: "unit_cost", exc_vat: "unit_cost",
  net: "unit_cost", trade: "unit_cost", dealer_price: "unit_cost",
  "£": "unit_cost", "unit_(£)": "unit_cost", "unit_cost_(£)": "unit_cost",
  "price_(£)": "unit_cost", "cost_(£)": "unit_cost", "trade_(£)": "unit_cost",
  "net_(£)": "unit_cost", "rrp_(£)": "unit_cost", "each_(£)": "unit_cost",
  // Labour
  labour: "labour_cost", labour_cost: "labour_cost", "labour_(£)": "labour_cost",
  labor: "labour_cost", labor_cost: "labour_cost", fit: "labour_cost",
  install: "labour_cost", fitting: "labour_cost", install_cost: "labour_cost",
  installation: "labour_cost", service: "labour_cost", fit_cost: "labour_cost",
};

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_£]/g, "");
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === "," && !inQuotes) { result.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  result.push(cur.trim());
  return result;
}

function parsePrice(v: string): number {
  if (!v) return 0;
  const cleaned = v.replace(/[£$€,\s]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}


// ── Excel parsing ──────────────────────────────────────────────────────────────

export interface ExcelSheetInfo {
  name: string;
  rowCount: number;
}

export function getExcelSheets(buffer: ArrayBuffer): ExcelSheetInfo[] {
  const wb = XLSX.read(buffer, { type: "array" });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { e: { r: 0 } };
    return { name, rowCount: Math.max(0, range.e.r) };
  });
}

export function parseExcelSheet(buffer: ArrayBuffer, sheetName: string): ParsedPriceRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const csvText = XLSX.utils.sheet_to_csv(ws, { blankrows: false } as any);
  return parsePriceListCsv(csvText);
}

export function parseExcelSheetFull(
  buffer: ArrayBuffer,
  sheetName: string,
  overrides: Partial<Record<keyof ParsedPriceRow, number>> = {}
): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[sheetName];
  if (!ws) return { rows: [], detectedHeaders: [], mappedColumns: {}, unmappedHeaders: [], allPricesZero: true };
  const csvText = XLSX.utils.sheet_to_csv(ws, { blankrows: false } as any);
  return parsePriceListCsvWithOverrides(csvText, overrides);
}

export interface ParseResult {
  rows: ParsedPriceRow[];
  detectedHeaders: string[];           // raw header names from the file
  mappedColumns: Record<string, string>; // field name -> raw header that mapped to it
  unmappedHeaders: string[];           // headers we couldn't map
  allPricesZero: boolean;
}

export function parsePriceListCsvWithOverrides(
  csvText: string,
  overrides: Partial<Record<keyof ParsedPriceRow, number>> = {}
): ParseResult {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { rows: [], detectedHeaders: [], mappedColumns: {}, unmappedHeaders: [], allPricesZero: true };

  const rawHeaders = splitCsvLine(lines[0]);
  const normalisedHeaders = rawHeaders.map(normaliseHeader);

  // Build field map from auto-detection + manual overrides
  const fieldMap: Record<number, keyof ParsedPriceRow> = {};
  const mappedColumns: Record<string, string> = {};

  normalisedHeaders.forEach((h, i) => {
    const mapped = HEADER_MAP[h];
    if (mapped && !fieldMap[i]) {
      fieldMap[i] = mapped;
      mappedColumns[mapped] = rawHeaders[i];
    }
  });

  // Apply manual overrides (column index → field)
  Object.entries(overrides).forEach(([field, colIdx]) => {
    if (colIdx !== undefined && colIdx >= 0) {
      fieldMap[colIdx] = field as keyof ParsedPriceRow;
      mappedColumns[field] = rawHeaders[colIdx];
    }
  });

  const unmappedHeaders = rawHeaders.filter((_, i) => !fieldMap[i]);

  const rows: ParsedPriceRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const raw: Record<string, string> = {};
    Object.entries(fieldMap).forEach(([colIdx, field]) => {
      raw[field] = values[parseInt(colIdx)] ?? "";
    });
    const description = (raw.description || "").trim();
    if (!description) continue;
    rows.push({
      part_number: raw.part_number?.trim() || undefined,
      description,
      short_name: raw.short_name?.trim() || undefined,
      category: raw.category?.trim() || undefined,
      manufacturer: raw.manufacturer?.trim() || undefined,
      model: raw.model?.trim() || undefined,
      unit_cost: parsePrice(raw.unit_cost),
      labour_cost: parsePrice(raw.labour_cost),
      _rowIndex: i,
    });
  }

  const allPricesZero = rows.length > 0 && rows.every(r => r.unit_cost === 0);

  return { rows, detectedHeaders: rawHeaders, mappedColumns, unmappedHeaders, allPricesZero };
}

export function parsePriceListCsv(csvText: string): ParsedPriceRow[] {
  return parsePriceListCsvWithOverrides(csvText).rows;
}

// Keep legacy signature for backward compat
export function parsePriceListCsvFull(csvText: string): ParseResult {
  return parsePriceListCsvWithOverrides(csvText);
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export async function getPriceList(activeOnly = true): Promise<PriceListItem[]> {
  // PostgREST caps unbounded selects at 1000 rows, so we page through the
  // full price list in 1000-row chunks to load all items (catalogues can be 13k+).
  const PAGE = 1000;
  const all: PriceListItem[] = [];
  let from = 0;

  while (true) {
    let q = supabase
      .from("price_list_items")
      .select("*")
      .order("manufacturer", { ascending: true })
      .order("description", { ascending: true })
      .range(from, from + PAGE - 1);
    if (activeOnly) q = q.eq("is_active", true);

    const { data, error } = await q;
    if (error) throw error;

    const batch = (data ?? []) as unknown as PriceListItem[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

export async function uploadPriceList(
  rows: ParsedPriceRow[],
  options: { createdBy: string; replaceAll?: boolean }
): Promise<{ created: number; errors: string[] }> {
  const batchId = `BATCH-${Date.now()}`;
  const errors: string[] = [];
  let created = 0;

  if (options.replaceAll) {
    const { error } = await supabase
      .from("price_list_items")
      .update({ is_active: false })
      .gte("created_at", "1970-01-01");
    if (error) errors.push(`Could not deactivate old items: ${error.message}`);
  }

  const toInsert = rows.map(r => ({
    part_number: r.part_number ?? null,
    description: r.description,
    short_name: r.short_name ?? null,
    category: r.category ?? "Other",
    manufacturer: r.manufacturer ?? null,
    model: r.model ?? null,
    unit_cost: r.unit_cost,
    labour_cost: r.labour_cost,
    markup_pct: 25,
    keywords: generateKeywords(r),
    is_active: true,
    upload_batch: batchId,
    created_by: options.createdBy,
  }));

  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100);
    const { error } = await supabase.from("price_list_items").insert(chunk as any);
    if (error) errors.push(`Rows ${i + 1}–${i + chunk.length}: ${error.message}`);
    else created += chunk.length;
  }

  return { created, errors };
}

function generateKeywords(r: ParsedPriceRow): string[] {
  const kws = new Set<string>();
  const add = (s?: string) => s && s.split(/[\s,\-\/]+/).forEach(w => { if (w.length > 2) kws.add(w.toLowerCase()); });
  add(r.description); add(r.short_name); add(r.category); add(r.manufacturer); add(r.model);
  return [...kws];
}

export async function updatePriceListItem(id: string, updates: Partial<PriceListItem>): Promise<void> {
  const { error } = await supabase.from("price_list_items").update(updates as any).eq("id", id);
  if (error) throw error;
}

export async function deletePriceListItem(id: string): Promise<void> {
  const { error } = await supabase.from("price_list_items").delete().eq("id", id);
  if (error) throw error;
}

// ── Price list lookup ─────────────────────────────────────────────────────────

/** Search price list by part number (exact first, then fuzzy) or description */
export async function findPriceListMatch(query: string): Promise<PriceListItem[]> {
  if (!query.trim()) return [];
  const q = query.trim();

  // 1. Exact part number match
  const { data: exact } = await supabase
    .from("price_list_items")
    .select("*")
    .ilike("part_number", q)
    .eq("is_active", true)
    .limit(3);
  if (exact && exact.length > 0) return exact as unknown as PriceListItem[];

  // 2. Fuzzy: part number contains OR description contains
  const { data: fuzzy } = await supabase
    .from("price_list_items")
    .select("*")
    .or(`part_number.ilike.%${q}%,description.ilike.%${q}%`)
    .eq("is_active", true)
    .limit(5);
  return (fuzzy ?? []) as unknown as PriceListItem[];
}

// ── Context builder for Claude ─────────────────────────────────────────────────
// Formats the price list into a concise string for inclusion in the Claude prompt.

export function buildPriceListContext(items: PriceListItem[], maxItems = 200): string {
  if (items.length === 0) return "No price list loaded.";

  // Hard cap to keep the prompt under Claude's 200k token limit.
  // Each line is ~30 tokens, so 200 items ≈ 6k tokens of context.
  const capped = items.slice(0, maxItems);

  const lines = capped.map(item => {
    const parts: string[] = [];
    if (item.part_number) parts.push(`[${item.part_number}]`);
    parts.push(item.description);
    if (item.manufacturer) parts.push(`(${item.manufacturer}${item.model ? " " + item.model : ""})`);
    if (item.category) parts.push(`| ${item.category}`);
    parts.push(`| £${item.unit_cost.toFixed(2)} unit`);
    if (item.labour_cost > 0) parts.push(`+ £${item.labour_cost.toFixed(2)} labour`);
    return parts.join(" ");
  });

  const grouped: Record<string, string[]> = {};
  capped.forEach((item, i) => {
    const cat = item.category ?? "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(lines[i]);
  });

  const body = Object.entries(grouped)
    .map(([cat, catLines]) => `${cat.toUpperCase()}:\n${catLines.join("\n")}`)
    .join("\n\n");

  const truncatedNote = items.length > maxItems
    ? `\n\n(Showing ${maxItems} most relevant of ${items.length} catalogue items.)`
    : "";

  return body + truncatedNote;
}

/**
 * Pre-filter a large price list down to items most relevant to a free-text
 * search blob (e.g. email body + requirements). Used to keep prompts small
 * when the full catalogue is 10k+ rows.
 */
export function filterPriceListByRelevance(
  items: PriceListItem[],
  searchText: string,
  maxItems = 200
): PriceListItem[] {
  if (items.length <= maxItems) return items;

  const tokens = Array.from(
    new Set(
      searchText
        .toLowerCase()
        .replace(/[^a-z0-9\s\-/]/g, " ")
        .split(/\s+/)
        .filter(t => t.length >= 3)
    )
  );
  if (tokens.length === 0) return items.slice(0, maxItems);

  const scored = items.map(item => {
    const hay = [
      item.part_number, item.description, item.short_name,
      item.manufacturer, item.model, item.category,
      ...(item.keywords || []),
    ].filter(Boolean).join(" ").toLowerCase();

    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += t.length >= 5 ? 2 : 1;
    }
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const matched = scored.filter(s => s.score > 0).map(s => s.item);
  return matched.length >= maxItems ? matched.slice(0, maxItems) : matched;
}

// ── CSV download template ──────────────────────────────────────────────────────

export function downloadPriceListTemplate(): void {
  const csv = [
    "Part Number,Description,Category,Manufacturer,Model,Unit Cost (£),Labour (£)",
    "55000-300,Optical smoke detector - white,Detector,Gent,Predator,28.50,12.00",
    "55000-200,Heat detector - white,Detector,Gent,Predator,24.00,12.00",
    "E80A001,Addressable MCP - red,MCP,Hochiki,CCP-E,18.50,10.00",
    "41500-222 APO,Sounder/strobe base - white,VAD,Gent,Vigilon,42.00,18.00",
    "S4-34BAS,Addressable sounder - white,Sounder,Advanced,MxPro5,36.00,15.00",
    ",Enhanced fire cable (per metre),Cable,,,0.85,0",
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "price-list-template.csv"; a.click();
  URL.revokeObjectURL(url);
}

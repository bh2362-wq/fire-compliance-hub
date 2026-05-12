import { supabase } from "@/integrations/supabase/client";

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
  part_no: "part_number", part_number: "part_number", partno: "part_number", sku: "part_number", ref: "part_number", reference: "part_number",
  description: "description", product: "description", item: "description", name: "description", item_name: "description",
  short_name: "short_name", short: "short_name", display: "short_name",
  category: "category", type: "category",
  manufacturer: "manufacturer", make: "manufacturer", brand: "manufacturer", mfr: "manufacturer",
  model: "model",
  unit_cost: "unit_cost", cost: "unit_cost", price: "unit_cost", buy_price: "unit_cost",
  unit_price: "unit_cost", our_price: "unit_cost", sell_price: "unit_cost",
  "£": "unit_cost", "unit_(£)": "unit_cost", "unit_cost_(£)": "unit_cost",
  labour: "labour_cost", labour_cost: "labour_cost", "labour_(£)": "labour_cost",
  fit: "labour_cost", install: "labour_cost", fitting: "labour_cost",
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

export function parsePriceListCsv(csvText: string): ParsedPriceRow[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const rawHeaders = splitCsvLine(lines[0]);
  const headers = rawHeaders.map(normaliseHeader);
  const fieldMap: Record<number, keyof ParsedPriceRow> = {};
  headers.forEach((h, i) => {
    const mapped = HEADER_MAP[h];
    if (mapped) fieldMap[i] = mapped;
  });

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

  return rows;
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export async function getPriceList(activeOnly = true): Promise<PriceListItem[]> {
  let q = supabase
    .from("price_list_items")
    .select("*")
    .order("manufacturer", { ascending: true })
    .order("description", { ascending: true });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as PriceListItem[];
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
      .neq("id", "00000000-0000-0000-0000-000000000000"); // update all
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

// ── Context builder for Claude ─────────────────────────────────────────────────
// Formats the price list into a concise string for inclusion in the Claude prompt.

export function buildPriceListContext(items: PriceListItem[]): string {
  if (items.length === 0) return "No price list loaded.";

  const lines = items.map(item => {
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
  items.forEach((item, i) => {
    const cat = item.category ?? "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(lines[i]);
  });

  return Object.entries(grouped)
    .map(([cat, catLines]) => `${cat.toUpperCase()}:\n${catLines.join("\n")}`)
    .join("\n\n");
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

import { supabase } from "@/integrations/supabase/client";

/**
 * Unified supplier-products view.
 *
 * Reads come from `price_list_items` (the Huvo PDF catalog, ~13k+ rows) so the
 * Product Lookup page and Quotation lookups share the same dataset as the
 * Device Pricing workbench. Legacy writes still target `supplier_products` for
 * the older Upload Catalog flow.
 */
export interface SupplierProduct {
  id: string;
  supplier_name: string;
  product_code: string;
  description: string;
  trade_price: number;
  category: string | null;
  created_at: string;
  updated_at: string;
}

const mapPriceListRow = (r: any): SupplierProduct => ({
  id: r.id,
  supplier_name: r.manufacturer || "Huvo",
  product_code: r.part_number || "",
  description: r.description || "",
  trade_price: Number(r.unit_cost) || 0,
  category: r.category || null,
  created_at: r.created_at,
  updated_at: r.updated_at,
});

// Translate engineer-typed search tokens into a Postgres ILIKE pattern.
//   "s4*"   → "s4%"     (starts with s4)
//   "*4w"   → "%4w"     (ends with 4w)
//   "*det*" → "%det%"   (contains; same as default)
//   "s4"    → "%s4%"    (plain text — still contains for back-compat)
// Engineers asked for the `s4*` form explicitly so a SKU-prefix search
// pulls every result starting with that prefix instead of being polluted
// by mid-string matches. The * is treated as an end-anchored wildcard
// rather than a SQL `_`-style placeholder.
function toIlikePattern(token: string): string {
  const t = token.trim();
  if (!t) return "%";
  const startsWild = t.startsWith("*");
  const endsWild = t.endsWith("*");
  const core = t.replace(/^\*/, "").replace(/\*$/, "");
  // Escape Postgres LIKE metacharacters in the core (% and _) so a
  // model column containing "50%-loaded" or "T_HEAT" doesn't match
  // bogus things on a literal search.
  const escaped = core.replace(/[%_]/g, "\\$&");
  if (startsWild && endsWild) return `%${escaped}%`;
  if (endsWild)               return `${escaped}%`;     // s4* → s4%
  if (startsWild)             return `%${escaped}`;     // *4w → %4w
  return `%${escaped}%`;                                  // default contains
}

export async function searchSupplierProducts(
  query: string,
  limit = 200,
): Promise<{ data: SupplierProduct[]; error: Error | null }> {
  const trimmed = query.trim();
  if (!trimmed) return { data: [], error: null };

  // model column also searched — engineer's data has SKUs like
  // "S4-OPT-W" in model rather than part_number / description, and
  // the previous narrower search was missing them.
  const pattern = toIlikePattern(trimmed);
  const { data, error } = await supabase
    .from("price_list_items")
    .select("id, part_number, description, short_name, model, unit_cost, manufacturer, category, created_at, updated_at")
    .eq("is_active", true)
    .or(
      `part_number.ilike.${pattern},description.ilike.${pattern},short_name.ilike.${pattern},model.ilike.${pattern}`,
    )
    .order("part_number")
    .limit(limit);

  if (error) return { data: [], error };
  return { data: (data || []).map(mapPriceListRow), error: null };
}

export async function getSupplierProductCount(): Promise<number> {
  const { count } = await supabase
    .from("price_list_items")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);
  return count || 0;
}

export async function getSupplierProducts(
  page = 1,
  pageSize = 50,
  search = ""
): Promise<{ data: SupplierProduct[]; total: number; error: Error | null }> {
  let query = supabase
    .from("price_list_items")
    .select("id, part_number, description, short_name, model, unit_cost, manufacturer, category, created_at, updated_at", { count: "exact" })
    .eq("is_active", true);

  if (search.trim()) {
    const pattern = toIlikePattern(search);
    query = query.or(
      `part_number.ilike.${pattern},description.ilike.${pattern},short_name.ilike.${pattern},model.ilike.${pattern}`,
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await query.order("part_number").range(from, to);

  if (error) return { data: [], total: 0, error };
  return { data: (data || []).map(mapPriceListRow), total: count || 0, error: null };
}

export async function updateSupplierProduct(
  id: string,
  updates: Partial<Pick<SupplierProduct, "product_code" | "description" | "trade_price" | "category">>
): Promise<{ error: Error | null }> {
  const mapped: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.product_code !== undefined) mapped.part_number = updates.product_code;
  if (updates.description !== undefined) mapped.description = updates.description;
  if (updates.trade_price !== undefined) mapped.unit_cost = updates.trade_price;
  if (updates.category !== undefined) mapped.category = updates.category;

  const { error } = await supabase.from("price_list_items").update(mapped).eq("id", id);
  return { error };
}

export async function deleteSupplierProduct(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from("price_list_items").delete().eq("id", id);
  return { error };
}

// ── Legacy write path (Upload Catalog dialog) ────────────────────────────────
export async function deleteAllSupplierProducts(supplierName = "Huvo"): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("price_list_items")
    .delete()
    .eq("manufacturer", supplierName);
  return { error };
}

export async function insertSupplierProducts(
  products: Array<{ product_code: string; description: string; trade_price: number; category?: string; supplier_name?: string }>
): Promise<{ count: number; error: Error | null }> {
  const batchSize = 200;
  let inserted = 0;
  const batch_id = `upload_${Date.now()}`;

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize).map((p) => ({
      part_number: p.product_code,
      description: p.description,
      unit_cost: p.trade_price,
      category: p.category || null,
      manufacturer: p.supplier_name || "Huvo",
      is_active: true,
      upload_batch: batch_id,
    }));

    const { error } = await supabase.from("price_list_items").insert(batch);
    if (error) return { count: inserted, error };
    inserted += batch.length;
  }

  return { count: inserted, error: null };
}

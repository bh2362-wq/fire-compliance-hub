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

export async function searchSupplierProducts(
  query: string,
  limit = 20
): Promise<{ data: SupplierProduct[]; error: Error | null }> {
  const trimmed = query.trim();
  if (!trimmed) return { data: [], error: null };

  const { data, error } = await supabase
    .from("price_list_items")
    .select("id, part_number, description, short_name, unit_cost, manufacturer, category, created_at, updated_at")
    .eq("is_active", true)
    .or(
      `part_number.ilike.%${trimmed}%,description.ilike.%${trimmed}%,short_name.ilike.%${trimmed}%`
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
    .select("id, part_number, description, short_name, unit_cost, manufacturer, category, created_at, updated_at", { count: "exact" })
    .eq("is_active", true);

  if (search.trim()) {
    const s = search.trim();
    query = query.or(
      `part_number.ilike.%${s}%,description.ilike.%${s}%,short_name.ilike.%${s}%`
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

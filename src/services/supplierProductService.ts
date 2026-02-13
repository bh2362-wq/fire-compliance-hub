import { supabase } from "@/integrations/supabase/client";

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

export async function searchSupplierProducts(
  query: string,
  limit = 20
): Promise<{ data: SupplierProduct[]; error: Error | null }> {
  const trimmed = query.trim();
  if (!trimmed) return { data: [], error: null };

  // Search by product code (exact/prefix) OR full-text on description
  const { data, error } = await supabase
    .from("supplier_products")
    .select("*")
    .or(`product_code.ilike.%${trimmed}%,description.ilike.%${trimmed}%`)
    .order("product_code")
    .limit(limit);

  if (error) return { data: [], error };
  return { data: (data || []) as SupplierProduct[], error: null };
}

export async function getSupplierProductCount(): Promise<number> {
  const { count } = await supabase
    .from("supplier_products")
    .select("*", { count: "exact", head: true });
  return count || 0;
}

export async function deleteAllSupplierProducts(supplierName = "Huvo"): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("supplier_products")
    .delete()
    .eq("supplier_name", supplierName);
  return { error };
}

export async function insertSupplierProducts(
  products: Array<{ product_code: string; description: string; trade_price: number; category?: string; supplier_name?: string }>
): Promise<{ count: number; error: Error | null }> {
  const batchSize = 200;
  let inserted = 0;

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize).map((p) => ({
      product_code: p.product_code,
      description: p.description,
      trade_price: p.trade_price,
      category: p.category || null,
      supplier_name: p.supplier_name || "Huvo",
    }));

    const { error } = await supabase.from("supplier_products").insert(batch);
    if (error) return { count: inserted, error };
    inserted += batch.length;
  }

  return { count: inserted, error: null };
}

export async function getSupplierProducts(
  page = 1,
  pageSize = 50,
  search = ""
): Promise<{ data: SupplierProduct[]; total: number; error: Error | null }> {
  let query = supabase
    .from("supplier_products")
    .select("*", { count: "exact" });

  if (search.trim()) {
    const s = search.trim();
    query = query.or(`product_code.ilike.%${s}%,description.ilike.%${s}%`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await query
    .order("product_code")
    .range(from, to);

  if (error) return { data: [], total: 0, error };
  return { data: (data || []) as SupplierProduct[], total: count || 0, error: null };
}

export async function updateSupplierProduct(
  id: string,
  updates: Partial<Pick<SupplierProduct, "product_code" | "description" | "trade_price" | "category">>
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("supplier_products")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  return { error };
}

export async function deleteSupplierProduct(id: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from("supplier_products")
    .delete()
    .eq("id", id);
  return { error };
}

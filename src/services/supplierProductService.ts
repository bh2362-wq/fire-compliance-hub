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

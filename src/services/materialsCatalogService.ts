import { supabase } from "@/integrations/supabase/client";

export interface MaterialSuggestion {
  part_number: string;
  description: string;
  retail_price: number;
  category: string;
  supplier: string;
  source: "catalog" | "supplier" | "ai";
}

export async function lookupMaterial(query: string): Promise<{ suggestions: MaterialSuggestion[]; ai_used: boolean }> {
  const { data, error } = await supabase.functions.invoke("lookup-material", {
    body: { query },
  });
  if (error) return { suggestions: [], ai_used: false };
  return { suggestions: data?.suggestions || [], ai_used: data?.ai_used || false };
}

export async function saveToCatalog(item: MaterialSuggestion): Promise<{ error: Error | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { error } = await (supabase.from("materials_catalog") as any).upsert(
    {
      part_number: item.part_number,
      description: item.description,
      retail_price: item.retail_price,
      category: item.category || null,
      supplier_name: item.supplier || null,
      source: item.source === "ai" ? "ai_lookup" : "manual",
      created_by: user?.id || null,
    },
    { onConflict: "part_number" }
  );
  return { error };
}

export async function searchCatalog(query: string, limit = 10): Promise<MaterialSuggestion[]> {
  if (!query.trim()) return [];
  const { data } = await (supabase.from("materials_catalog") as any)
    .select("*")
    .or(`part_number.ilike.%${query.trim()}%,description.ilike.%${query.trim()}%`)
    .order("part_number")
    .limit(limit);

  return (data || []).map((c: any) => ({
    part_number: c.part_number,
    description: c.description,
    retail_price: Number(c.retail_price) || 0,
    category: c.category || "",
    supplier: c.supplier_name || "",
    source: "catalog" as const,
  }));
}

import { supabase } from "@/integrations/supabase/client";

export type DefectCategory = 1 | 2 | 3;
export type DefectStatus = "open" | "quoted" | "remediated" | "accepted_risk";

export interface Defect {
  id: string;
  description: string;
  category: DefectCategory;
  location?: string | null;
  status?: DefectStatus;
  site_id?: string;
  site_name?: string;
  notes?: string | null;
}
export interface SiteDefect {
  id: string;
  site_id: string;
  visit_id: string | null;
  report_id: string | null;
  description: string;
  location: string | null;
  category: DefectCategory;
  status: DefectStatus;
  raised_by: string | null;
  notes: string | null;
  quotation_id: string | null;
  raised_at: string;
  remediated_at: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  // Joined
  site?: { id: string; name: string; customer_id: string; customers?: { name: string } | null } | null;
}

export interface DefectInsert {
  site_id: string;
  visit_id?: string | null;
  report_id?: string | null;
  description: string;
  location?: string | null;
  category: DefectCategory;
  status?: DefectStatus;
  raised_by?: string | null;
  notes?: string | null;
}

export const DEFECT_CATEGORY_LABELS: Record<DefectCategory, string> = {
  1: "Cat 1 — Critical",
  2: "Cat 2 — Major",
  3: "Cat 3 — Minor",
};

export const DEFECT_CATEGORY_DESCRIPTIONS: Record<DefectCategory, string> = {
  1: "Immediate risk to life safety / system non-operational",
  2: "Significant impairment but system still functional",
  3: "Cosmetic or minor non-conformance, no impairment",
};

export async function listDefects(filters?: {
  status?: DefectStatus | "all";
  category?: DefectCategory | "all";
  siteId?: string;
}): Promise<SiteDefect[]> {
  let q = supabase
    .from("site_defects")
    .select("*, site:sites(id, name, customer_id, customers(name))")
    .order("raised_at", { ascending: false });

  if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters?.category && filters.category !== "all") q = q.eq("category", filters.category);
  if (filters?.siteId) q = q.eq("site_id", filters.siteId);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as any;
}

export async function createDefect(input: DefectInsert): Promise<SiteDefect> {
  const { data: userData } = await supabase.auth.getUser();
  const payload: any = { ...input, user_id: userData.user?.id ?? null };
  const { data, error } = await supabase
    .from("site_defects")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function updateDefect(
  id: string,
  patch: Partial<Pick<SiteDefect, "status" | "notes" | "category" | "description" | "location" | "quotation_id" | "remediated_at">>,
): Promise<void> {
  const { error } = await supabase.from("site_defects").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteDefect(id: string): Promise<void> {
  const { error } = await supabase.from("site_defects").delete().eq("id", id);
  if (error) throw error;
}

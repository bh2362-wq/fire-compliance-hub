import { supabase } from "@/integrations/supabase/client";

// Thin service for the system-info columns that landed on sites in
// Migration A — used by:
//   1. The admin "System Information" panel on the site detail page.
//   2. The Service Report wizard's System step, which writes back to
//      sites whenever the engineer confirms panel/zones/devices/ARC.
//
// sites is the canonical home for this data; previously it was scattered
// across service_reports, quotations and site_assets. Keep both writers
// idempotent — they each set fields they own and leave the rest alone.
//
// SiteSystemInfo is declared explicitly rather than Pick<SiteRow, …>:
// the autogen types haven't been re-run since the migration, so the new
// columns aren't visible there yet. This file works today and will keep
// working after the next gen-types — the shape is the same.

export type Bs5839Category = "L1" | "L2" | "L3" | "L4" | "L5" | "M" | "P1" | "P2";
export type CableType = "standard" | "enhanced_fr";

export const BS5839_CATEGORIES: Bs5839Category[] = [
  "L1", "L2", "L3", "L4", "L5", "M", "P1", "P2",
];

export const CABLE_TYPES: { value: CableType; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "enhanced_fr", label: "Enhanced FR" },
];

export interface SiteSystemInfo {
  panel_make_model: string | null;
  bs5839_category: Bs5839Category | null;
  year_installed: number | null;
  num_zones: number | null;
  num_loops: number | null;
  num_devices: number | null;
  arc_connected: boolean | null;
  cable_type: CableType | null;
  psu_capacity_ah: number | null;
  panel_software_version: string | null;
  areas_covered: string | null;
  areas_not_covered: string | null;
  building_type: string | null;
  occupancy_type: string | null;
}

const SELECT_COLS =
  "panel_make_model,bs5839_category,year_installed," +
  "num_zones,num_loops,num_devices,arc_connected," +
  "cable_type,psu_capacity_ah,panel_software_version," +
  "areas_covered,areas_not_covered,building_type,occupancy_type";

export async function getSiteSystemInfo(
  siteId: string,
): Promise<SiteSystemInfo | null> {
  const { data, error } = await supabase
    .from("sites")
    .select(SELECT_COLS)
    .eq("id", siteId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as SiteSystemInfo | null) ?? null;
}

export async function updateSiteSystemInfo(
  siteId: string,
  patch: Partial<SiteSystemInfo>,
): Promise<void> {
  const { error } = await supabase
    .from("sites")
    .update(patch as never)
    .eq("id", siteId);
  if (error) throw error;
}

// Compose a single panel string from the wizard's separate manufacturer /
// model fields (which still live on service_reports). Used by the System
// step's write-back. Returns null if neither has content so we don't blat
// a populated value with empty string.
export function composePanelMakeModel(
  manufacturer: string | null | undefined,
  model: string | null | undefined,
): string | null {
  const parts = [manufacturer, model]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 0);
  return parts.length === 0 ? null : parts.join(" ");
}

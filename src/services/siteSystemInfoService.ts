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
  // ── Fire detection system ────────────────────────────────────────
  panel_make_model: string | null;
  bs5839_category: Bs5839Category | null;
  year_installed: number | null;
  num_zones: number | null;
  num_loops: number | null;
  num_devices: number | null;
  num_manual_call_points: number | null;
  num_sounders: number | null;
  num_detectors: number | null;
  arc_connected: boolean | null;
  arc_provider: string | null;
  arc_account_ref: string | null;
  cable_type: CableType | null;
  psu_capacity_ah: number | null;
  panel_software_version: string | null;
  // ── Coverage ─────────────────────────────────────────────────────
  areas_covered: string | null;
  areas_not_covered: string | null;
  // ── Site profile ─────────────────────────────────────────────────
  building_type: string | null;
  occupancy_type: string | null;
  access_hours: string | null;
  duty_holder_name: string | null;
  duty_holder_role: string | null;
  duty_holder_email: string | null;
  duty_holder_phone: string | null;
  // ── Voice alarm (PAVA) — gated by has_pava in the UI ────────────
  has_pava: boolean | null;
  pava_make: string | null;
  pava_model: string | null;
  pava_software_version: string | null;
  pava_bs_en_54_16_compliant: boolean | null;
  pava_bs_en_54_24_compliant: boolean | null;
  pava_num_zones: number | null;
  pava_num_loudspeakers: number | null;
  pava_num_circuits: number | null;
  pava_fa_interface_method: string | null;
  pava_network_topology: string | null;
  pava_has_backup_amplifier: boolean | null;
}

const SELECT_COLS = [
  "panel_make_model", "bs5839_category", "year_installed",
  "num_zones", "num_loops", "num_devices",
  "num_manual_call_points", "num_sounders", "num_detectors",
  "arc_connected", "arc_provider", "arc_account_ref",
  "cable_type", "psu_capacity_ah", "panel_software_version",
  "areas_covered", "areas_not_covered",
  "building_type", "occupancy_type", "access_hours",
  "duty_holder_name", "duty_holder_role", "duty_holder_email", "duty_holder_phone",
  "has_pava",
  "pava_make", "pava_model", "pava_software_version",
  "pava_bs_en_54_16_compliant", "pava_bs_en_54_24_compliant",
  "pava_num_zones", "pava_num_loudspeakers", "pava_num_circuits",
  "pava_fa_interface_method", "pava_network_topology", "pava_has_backup_amplifier",
].join(",");

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

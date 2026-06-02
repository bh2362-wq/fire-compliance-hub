/**
 * siteIntelligenceService.ts
 *
 * Single source of truth for harvested site data used to prefill AI forms,
 * job sheets, scope writers, RAMS and quotations.
 *
 * Pulls from (in parallel):
 *   - sites              → contact + access notes
 *   - site_assets        → panel, devices, batteries, tagging protocol
 *   - site_service_contracts → contract category / frequency
 *   - smart_form_submissions → latest cert payload (system features, building)
 *   - site_defects       → top 3 open defects
 *
 * Every consumer should treat the result as suggestions only.
 * Empty / null fields silently skip prefill.
 */

import { supabase } from "@/integrations/supabase/client";

export interface SiteIntelligence {
  site: {
    id: string;
    name: string;
    address: string;
    postcode: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    access_notes: string | null;
    parking_notes: string | null;
    gate_code: string | null;
  };
  contract: {
    category: string | null;       // L1 / L2 / P1 etc
    frequency: string | null;      // 3m / 6m / 12m
    service_type: string | null;
    included_visits: number | null;
  } | null;
  panel: {
    manufacturer: string | null;
    model: string | null;
    loops_count: number | null;
    zones_count: number | null;
    location: string | null;
    age_years: number | null;
  } | null;
  devices: {
    total: number;
    by_type: Record<string, number>;
    manufacturers: string[];
  };
  battery: {
    fitted_year: number | null;
    age_years: number | null;
    suggested_replace_year: number | null;
  } | null;
  features: {
    arc_signal: boolean;
    voice_alarm: boolean;
    wireless: boolean;
    bms_interface: boolean;
    lift_recall: boolean;
  };
  building: {
    type: string | null;
    occupancy: string | null;
    storeys: number | null;
  } | null;
  latest_cert: {
    reference: string | null;
    date: string | null;
    form_type: string | null;
  } | null;
  latest_defects: string[];
  tagging: {
    protocol: string | null;
    scheme: string | null;
  };
}

type AssetRow = {
  asset_type: string;
  item_name: string | null;
  manufacturer: string | null;
  model: string | null;
  location: string | null;
  zones_count: number | null;
  loops_count: number | null;
  notes: string | null;
  created_at: string;
};

function safeParseJson(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function yearsBetween(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000)));
}

export async function getSiteIntelligence(siteId: string): Promise<SiteIntelligence | null> {
  if (!siteId) return null;

  const sb = supabase as unknown as {
    from: (t: string) => {
      select: (q: string) => any;
    };
  };

  const [siteRes, assetsRes, contractRes, certRes, defectsRes] = await Promise.all([
    sb.from("sites")
      .select("id, name, address, city, postcode, contact_name, contact_email, contact_phone, access_notes, parking_notes, gate_code, total_devices, bs5839_category, building_type, occupancy_type, panel_make_model, num_loops, num_zones, arc_connected, has_pava")
      .eq("id", siteId).single(),
    sb.from("site_assets")
      .select("asset_type, item_name, manufacturer, model, location, zones_count, loops_count, notes, created_at")
      .eq("site_id", siteId),
    sb.from("site_service_contracts")
      .select("service_type, frequency, included_visits, notes, description")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false })
      .limit(5),
    sb.from("smart_form_submissions")
      .select("certificate_reference, completed_at, form_type, payload")
      .eq("site_id", siteId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1),
    sb.from("site_defects")
      .select("description, location, status")
      .eq("site_id", siteId)
      .eq("status", "open")
      .order("raised_at", { ascending: false })
      .limit(3),
  ]);

  const siteRow = siteRes.data as any;
  if (!siteRow) return null;

  const assets: AssetRow[] = (assetsRes.data ?? []) as AssetRow[];
  const contracts: any[] = (contractRes.data ?? []);
  const cert = (certRes.data?.[0] ?? null) as any;
  const defects: any[] = (defectsRes.data ?? []);

  // ── Panel ────────────────────────────────────────────────────────────────────
  // Many sites store panels as asset_type='fire' (legacy) rather than 'fire_panel'.
  // Treat any 'fire_panel' OR a 'fire' asset whose name/model looks panel-like as a panel.
  const looksLikePanel = (a: AssetRow) =>
    a.asset_type === "fire_panel" ||
    (a.asset_type === "fire" && (
      /panel/i.test(a.item_name ?? "") ||
      !!a.manufacturer ||
      !!a.model ||
      (a.loops_count ?? 0) > 0
    ));
  const panelAssets = assets.filter(looksLikePanel);
  // Prefer the asset that actually has manufacturer + model populated.
  const primaryPanel =
    panelAssets.find(a => a.manufacturer && a.model) ??
    panelAssets.find(a => a.manufacturer || a.model) ??
    panelAssets[0] ?? null;
  const totalLoops = panelAssets.reduce((sum, a) => sum + (a.loops_count ?? 0), 0);
  const totalZones = panelAssets.reduce((sum, a) => sum + (a.zones_count ?? 0), 0);

  // sites.panel_make_model is the engineer's direct entry on the Site
  // form — most authoritative. Often shaped as "Gent Vigilon" or
  // "Honeywell Notifier ID3000". Split the first token off as
  // manufacturer; remainder is model. If there's no space, treat the
  // whole string as a model only (engineer can correct in the dialog).
  let siteManufacturer: string | null = null;
  let siteModel: string | null = null;
  if (siteRow.panel_make_model) {
    const raw = String(siteRow.panel_make_model).trim();
    const firstSpace = raw.indexOf(" ");
    if (firstSpace > 0) {
      siteManufacturer = raw.slice(0, firstSpace);
      siteModel = raw.slice(firstSpace + 1).trim() || null;
    } else {
      siteModel = raw;
    }
  }

  // Build the merged panel object. Precedence: site row direct entry >
  // primary panel asset. (loops/zones fall back to assets aggregate.)
  const haveAnyPanel = !!(siteManufacturer || siteModel || primaryPanel || siteRow.num_loops || siteRow.num_zones);
  const panel = haveAnyPanel ? {
    manufacturer: siteManufacturer ?? primaryPanel?.manufacturer ?? null,
    model:        siteModel        ?? primaryPanel?.model        ?? null,
    loops_count:  (siteRow.num_loops as number | null) ?? (totalLoops || primaryPanel?.loops_count) ?? null,
    zones_count:  (siteRow.num_zones as number | null) ?? (totalZones || primaryPanel?.zones_count) ?? null,
    location:     primaryPanel?.location ?? null,
    age_years:    yearsBetween(primaryPanel?.created_at),
  } : null;

  // ── Devices aggregate ────────────────────────────────────────────────────────
  const by_type: Record<string, number> = {};
  const mfgSet = new Set<string>();
  for (const a of assets) {
    by_type[a.asset_type] = (by_type[a.asset_type] ?? 0) + 1;
    if (a.manufacturer) mfgSet.add(a.manufacturer);
  }
  const devices = {
    total: siteRow.total_devices ?? assets.length,
    by_type,
    manufacturers: Array.from(mfgSet),
  };

  // ── Battery (search asset notes for battery_fitted_date) ─────────────────────
  let battery: SiteIntelligence["battery"] = null;
  for (const a of assets) {
    const meta = safeParseJson(a.notes);
    const fitted = meta?.battery_fitted_date as string | undefined;
    if (fitted) {
      const age = yearsBetween(fitted);
      const year = new Date(fitted).getFullYear();
      battery = {
        fitted_year: isNaN(year) ? null : year,
        age_years: age,
        suggested_replace_year: isNaN(year) ? null : year + 5,
      };
      break;
    }
  }

  // ── Features (precedence: cert payload > asset notes > false) ────────────────
  const certPayload = (cert?.payload ?? {}) as Record<string, unknown>;
  const certFeatures = (certPayload.system_features ?? {}) as Record<string, unknown>;
  const assetFlags: Record<string, boolean> = {};
  for (const a of assets) {
    const meta = safeParseJson(a.notes);
    if (!meta) continue;
    for (const k of ["arc_signal", "voice_alarm", "wireless", "bms_interface", "lift_recall"]) {
      if (meta[k] === true) assetFlags[k] = true;
    }
  }
  // Site row direct flags take precedence over cert/asset-derived ones —
  // an engineer's tick on the Site form is the most authoritative source
  // for "this site has ARC monitoring" or "this site has voice alarm".
  const features = {
    arc_signal:    !!(siteRow.arc_connected ?? certFeatures.arc_signal    ?? certPayload.arc_signal    ?? assetFlags.arc_signal),
    voice_alarm:   !!(siteRow.has_pava      ?? certFeatures.voice_alarm   ?? certPayload.voice_alarm   ?? assetFlags.voice_alarm),
    wireless:      !!(certFeatures.wireless      ?? certPayload.wireless      ?? assetFlags.wireless),
    bms_interface: !!(certFeatures.bms_interface ?? certPayload.bms_interface ?? assetFlags.bms_interface),
    lift_recall:   !!(certFeatures.lift_recall   ?? certPayload.lift_recall   ?? assetFlags.lift_recall),
  };

  // ── Building — sites row direct entry beats cert payload ────────────────────
  const buildingType     = (siteRow.building_type   as string | null) ?? (certPayload.building_type ?? certPayload.premises_type ?? null);
  const buildingOccupancy = (siteRow.occupancy_type as string | null) ?? (certPayload.occupancy_type ?? null);
  const building = (buildingType || buildingOccupancy) ? {
    type: buildingType,
    occupancy: buildingOccupancy,
    storeys: typeof certPayload.storeys === "number" ? (certPayload.storeys as number) : null,
  } : null;

  // ── Contract (find fire alarm contract first, else first) ────────────────────
  // sites.bs5839_category is the most authoritative category source —
  // engineers set it directly on the Site form. Fall back to inferring
  // from contract description / notes / cert payload.
  const fireContract = contracts.find(c => /fire[_ ]alarm/i.test(c.service_type ?? "")) ?? contracts[0] ?? null;
  const categoryMatch = (fireContract?.description || fireContract?.notes || "").match(/\b(L[1-5]|P[12]|M)\b/);
  const resolvedCategory =
    (siteRow.bs5839_category as string | null) ?? categoryMatch?.[1] ?? ((certPayload.system_categories as string) ?? null);
  const contract = (fireContract || resolvedCategory) ? {
    category: resolvedCategory,
    frequency: fireContract?.frequency ?? null,
    service_type: fireContract?.service_type ?? null,
    included_visits: fireContract?.included_visits ?? null,
  } : null;

  // ── Tagging (search panel notes first, then any asset) ───────────────────────
  let tagging = { protocol: null as string | null, scheme: null as string | null };
  for (const a of [primaryPanel, ...assets].filter(Boolean) as AssetRow[]) {
    const meta = safeParseJson(a.notes);
    if (meta?.tagging_protocol || meta?.tagging_scheme) {
      tagging = {
        protocol: (meta.tagging_protocol as string) ?? null,
        scheme: (meta.tagging_scheme as string) ?? null,
      };
      break;
    }
  }

  const addr = [siteRow.address, siteRow.city].filter(Boolean).join(", ");

  return {
    site: {
      id: siteRow.id,
      name: siteRow.name,
      address: addr,
      postcode: siteRow.postcode,
      contact_name: siteRow.contact_name,
      contact_email: siteRow.contact_email,
      contact_phone: siteRow.contact_phone,
      access_notes: siteRow.access_notes,
      parking_notes: siteRow.parking_notes,
      gate_code: siteRow.gate_code,
    },
    contract,
    panel,
    devices,
    battery,
    features,
    building,
    latest_cert: cert ? {
      reference: cert.certificate_reference,
      date: cert.completed_at,
      form_type: cert.form_type,
    } : null,
    latest_defects: defects.map(d => [d.location, d.description].filter(Boolean).join(" — ")),
    tagging,
  };
}

/** Count how many "useful" fields the intelligence yielded — for UX badges. */
export function intelligenceFieldCount(si: SiteIntelligence | null): number {
  if (!si) return 0;
  let n = 0;
  if (si.panel?.manufacturer) n++;
  if (si.panel?.model) n++;
  if (si.panel?.loops_count) n++;
  if (si.devices.total) n++;
  if (si.contract?.category) n++;
  if (si.contract?.frequency) n++;
  if (si.building?.type) n++;
  if (si.features.arc_signal) n++;
  if (si.features.voice_alarm) n++;
  if (si.features.wireless) n++;
  if (si.battery?.age_years != null) n++;
  if (si.latest_cert) n++;
  if (si.tagging.protocol) n++;
  return n;
}

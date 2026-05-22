/**
 * AssetMaintenance
 * Fleet-wide view of every asset across every site — for accountability.
 *
 * Sources merged:
 *   1. site_assets   → panels, ASD, EL, dry risers, gas, intruder, room integrity
 *   2. devices       → per loop/address device inventory (toggleable, large dataset)
 *
 * Organisation aids for a big database:
 *   • Source filter chips (Systems / Devices / All)
 *   • Group by Site (collapsible) or flat list
 *   • Search across item / site / mfr / model / loop / address / zone
 *   • "Include device inventory" toggle — off by default so the page stays fast,
 *     load on demand and the devices auto-group by site.
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, differenceInDays, isPast } from "date-fns";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { AssetHistoryPanel } from "@/components/sites/AssetHistoryPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Server, Wind, Lightbulb, Flame, Droplets, ShieldAlert,
  Search, ChevronRight, AlertTriangle, CheckCircle2, Clock, Box, Cpu, ChevronDown, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AssetRow {
  id:               string;
  site_id:          string;
  site_name:        string;
  asset_type:       string;
  item_name:        string;
  manufacturer:     string | null;
  model:            string | null;
  serial_number:    string | null;
  location:         string | null;
  last_serviced:    string | null;
  next_due:         string | null;
  last_cert_ref:    string | null;
  last_cert_status: string | null;
  // Unified additions
  source:           "system" | "device";
  loop?:            string | null;
  address?:         string | null;
  zone?:            string | null;
  device_status?:   string | null; // active/faulty/replaced/inactive
  raw_import_data?: Record<string, unknown> | null;
  extra_details?:   string | null; // pre-flattened "key: value · key: value" for search & display
}

// ── Config ─────────────────────────────────────────────────────────────────────
const ASSET_TYPE_CONFIG: Record<string, { label: string; Icon: React.FC<any>; color: string }> = {
  fire:               { label: "Fire Alarm Panel",     Icon: Server,      color: "text-destructive" },
  fire_panel:         { label: "Fire Alarm Panel",     Icon: Server,      color: "text-destructive" },
  aspirator:          { label: "ASD System",           Icon: Wind,        color: "text-sky-600" },
  asd:                { label: "ASD System",           Icon: Wind,        color: "text-sky-600" },
  emergency_lighting: { label: "Emergency Lighting",   Icon: Lightbulb,   color: "text-warning" },
  dry_riser:          { label: "Dry Riser",            Icon: Droplets,    color: "text-blue-600" },
  gas_suppression:    { label: "Gas Suppression",      Icon: Flame,       color: "text-orange-500" },
  intruder_alarm:     { label: "Intruder Alarm",       Icon: ShieldAlert, color: "text-accent" },
  room_integrity:     { label: "Room Integrity",       Icon: Box,         color: "text-cyan-600" },
  device:             { label: "Device (loop/address)", Icon: Cpu,        color: "text-muted-foreground" },
};

const ASSET_FORM_TYPES: Record<string, string[]> = {
  fire:               ["bs5839_inspection_servicing", "bs5839_installation", "bs5839_commissioning", "bs5839_modification"],
  fire_panel:         ["bs5839_inspection_servicing", "bs5839_installation", "bs5839_commissioning", "bs5839_modification"],
  aspirator:          ["asd_service", "asd_commissioning"],
  asd:                ["asd_service", "asd_commissioning"],
  emergency_lighting: ["el_inspection_commissioning"],
  dry_riser:          ["dry_riser"],
};

function getStatusInfo(row: AssetRow) {
  // Device-level rows surface their own status (faulty/replaced/inactive) up-front
  if (row.source === "device") {
    const s = (row.device_status || "active").toLowerCase();
    if (s === "faulty")   return { label: "Faulty",   cls: "vstatus vstatus-overdue",    icon: AlertTriangle };
    if (s === "replaced") return { label: "Replaced", cls: "vstatus vstatus-completed",  icon: CheckCircle2 };
    if (s === "inactive") return { label: "Inactive", cls: "vstatus vstatus-inprogress", icon: Clock };
    return                  { label: "Active",        cls: "vstatus vstatus-completed",  icon: CheckCircle2 };
  }
  if (!row.last_serviced) return { label: "Never serviced", cls: "vstatus vstatus-overdue",    icon: AlertTriangle };
  if (!row.next_due)      return { label: "Up to date",     cls: "vstatus vstatus-completed",  icon: CheckCircle2 };
  const days = differenceInDays(parseISO(row.next_due), new Date());
  if (days < 0)           return { label: `${Math.abs(days)}d overdue`, cls: "vstatus vstatus-overdue",    icon: AlertTriangle };
  if (days < 30)          return { label: `Due in ${days}d`,            cls: "vstatus vstatus-inprogress", icon: Clock };
  return                    { label: "Up to date",                       cls: "vstatus vstatus-completed",  icon: CheckCircle2 };
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function AssetMaintenance() {
  const navigate                           = useNavigate();
  const [assets, setAssets]                = useState<AssetRow[]>([]);
  const [devices, setDevices]              = useState<AssetRow[]>([]);
  const [loading, setLoading]              = useState(true);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [includeDevices, setIncludeDevices] = useState(false);
  const [search, setSearch]                = useState("");
  const [typeFilter, setTypeFilter]        = useState("all");
  const [sourceFilter, setSourceFilter]    = useState<"all" | "system" | "device">("all");
  const [groupBySite, setGroupBySite]      = useState(false);
  const [collapsedSites, setCollapsedSites] = useState<Set<string>>(new Set());
  const [selectedAsset, setSelectedAsset]  = useState<AssetRow | null>(null);
  const [panelOpen, setPanelOpen]          = useState(false);

  useEffect(() => { loadSystems(); }, []);
  useEffect(() => {
    if (includeDevices && devices.length === 0) loadDevices();
    if (includeDevices) setGroupBySite(true);
  }, [includeDevices]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSystems() {
    setLoading(true);
    try {
      const { data: rawAssets, error } = await supabase
        .from("site_assets")
        .select("*, site:sites(id, name)")
        .order("asset_type")
        .order("item_name");

      if (error) throw error;

      const siteIds = [...new Set((rawAssets ?? []).map((a: any) => a.site_id))];
      let certMap: Record<string, { completed_at: string; certificate_reference: string; overall_status: string; next_service_date: string }> = {};

      if (siteIds.length) {
        const { data: certs } = await supabase
          .from("smart_form_submissions")
          .select("site_id, form_type, completed_at, certificate_reference, payload")
          .in("site_id", siteIds)
          .eq("status", "completed")
          .order("completed_at", { ascending: false });

        (certs ?? []).forEach((c: any) => {
          const p = c.payload ?? {};
          const key = `${c.site_id}:${c.form_type}`;
          if (!certMap[key]) {
            certMap[key] = {
              completed_at:          c.completed_at,
              certificate_reference: c.certificate_reference,
              overall_status:        p.overall_status ?? "",
              next_service_date:     p.next_service_date ?? "",
            };
          }
        });
      }

      const rows: AssetRow[] = (rawAssets ?? []).map((a: any) => {
        const formTypes = ASSET_FORM_TYPES[a.asset_type] ?? [];
        let bestCert: typeof certMap[string] | null = null;
        for (const ft of formTypes) {
          const c = certMap[`${a.site_id}:${ft}`];
          if (c && (!bestCert || c.completed_at > bestCert.completed_at)) bestCert = c;
        }

        return {
          id:               a.id,
          site_id:          a.site_id,
          site_name:        (a.site as any)?.name ?? "Unknown site",
          asset_type:       a.asset_type,
          item_name:        a.item_name,
          manufacturer:     a.manufacturer,
          model:            a.model,
          serial_number:    a.serial_number,
          location:         a.location,
          last_serviced:    bestCert?.completed_at ?? null,
          next_due:         bestCert?.next_service_date || null,
          last_cert_ref:    bestCert?.certificate_reference ?? null,
          last_cert_status: bestCert?.overall_status ?? null,
          source:           "system",
        };
      });

      setAssets(rows);
    } finally {
      setLoading(false);
    }
  }

  async function loadDevices() {
    setLoadingDevices(true);
    try {
      // Page through devices in chunks to respect the 1000-row PostgREST default.
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("devices")
          .select("id, site_id, loop, address, device_type, location, zone, status, last_tested_at, raw_import_data, imported_source_columns, site:sites(id, name)")
          .order("site_id")
          .order("loop")
          .order("address")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data?.length) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
        if (all.length > 25000) break; // safety cap — UI is paginated/grouped, but avoid runaway
      }

      const CORE_COLS = new Set(["loop", "address", "type", "device type", "location", "zone", "status"]);

      const rows: AssetRow[] = all.map((d: any) => {
        const raw = (d.raw_import_data ?? {}) as Record<string, unknown>;
        // Pull "label" / "device number" / "age" / "serial" etc out for display + search
        const extras = Object.entries(raw)
          .filter(([k, v]) => v != null && String(v).trim() !== "" && !CORE_COLS.has(k.toLowerCase()))
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(" · ");

        // Try to pick a useful label-ish field from the import to enrich item_name
        const labelKey = Object.keys(raw).find((k) => /label|device\s*no|device\s*number|tag/i.test(k));
        const labelVal = labelKey ? String(raw[labelKey] ?? "").trim() : "";

        return {
          id:               d.id,
          site_id:          d.site_id,
          site_name:        (d.site as any)?.name ?? "Unknown site",
          asset_type:       "device",
          item_name:        labelVal
            ? `L${d.loop}/${d.address} · ${d.device_type}${labelVal ? ` · ${labelVal}` : ""}`
            : `L${d.loop}/${d.address} · ${d.device_type}`,
          manufacturer:     null,
          model:            d.device_type ?? null,
          serial_number:    null,
          location:         [d.location, d.zone ? `Zone ${d.zone}` : null].filter(Boolean).join(" · ") || null,
          last_serviced:    d.last_tested_at ?? null,
          next_due:         null,
          last_cert_ref:    null,
          last_cert_status: null,
          source:           "device",
          loop:             d.loop ?? null,
          address:          d.address ?? null,
          zone:             d.zone ?? null,
          device_status:    d.status ?? "active",
          raw_import_data:  raw,
          extra_details:    extras || null,
        };
      });

      setDevices(rows);
      toast.success(`Loaded ${rows.length.toLocaleString()} device inventory items`);
    } catch (e: any) {
      toast.error(e.message || "Failed to load devices");
    } finally {
      setLoadingDevices(false);
    }
  }

  const combined = useMemo<AssetRow[]>(() => {
    const out: AssetRow[] = [];
    if (sourceFilter !== "device") out.push(...assets);
    if (sourceFilter !== "system" && includeDevices) out.push(...devices);
    return out;
  }, [assets, devices, sourceFilter, includeDevices]);

  const filtered = useMemo(() => {
    let out = combined;
    if (typeFilter !== "all") {
      out = out.filter(a => a.asset_type === typeFilter || (typeFilter === "fire" && a.asset_type === "fire_panel"));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(a =>
        a.item_name.toLowerCase().includes(q) ||
        a.site_name.toLowerCase().includes(q) ||
        (a.manufacturer?.toLowerCase().includes(q) ?? false) ||
        (a.model?.toLowerCase().includes(q) ?? false) ||
        (a.serial_number?.toLowerCase().includes(q) ?? false) ||
        (a.location?.toLowerCase().includes(q) ?? false) ||
        (a.loop?.toLowerCase().includes(q) ?? false) ||
        (a.address?.toLowerCase().includes(q) ?? false) ||
        (a.zone?.toLowerCase().includes(q) ?? false) ||
        (a.extra_details?.toLowerCase().includes(q) ?? false)
      );
    }
    return out;
  }, [combined, typeFilter, search]);

  // Group rows by site when requested
  const groupedBySite = useMemo(() => {
    if (!groupBySite) return null;
    const map = new Map<string, { site_id: string; site_name: string; rows: AssetRow[] }>();
    for (const r of filtered) {
      const k = r.site_id;
      const g = map.get(k);
      if (g) g.rows.push(r);
      else map.set(k, { site_id: r.site_id, site_name: r.site_name, rows: [r] });
    }
    return Array.from(map.values()).sort((a, b) => a.site_name.localeCompare(b.site_name));
  }, [filtered, groupBySite]);

  function toggleSite(id: string) {
    setCollapsedSites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Summary counts (across all loaded rows respecting current source filter)
  const overdueCount  = combined.filter(a => a.next_due && isPast(parseISO(a.next_due))).length;
  const dueSoonCount  = combined.filter(a => {
    if (!a.next_due || isPast(parseISO(a.next_due))) return false;
    return differenceInDays(parseISO(a.next_due), new Date()) < 30;
  }).length;
  const faultyDeviceCount = combined.filter(a => a.source === "device" && (a.device_status || "") === "faulty").length;

  const uniqueTypes = [...new Set(combined.map(a => a.asset_type))];

  function handleRowClick(row: AssetRow) {
    if (row.source === "system") {
      setSelectedAsset(row);
      setPanelOpen(true);
    } else {
      // Device rows jump to site detail's device inventory section
      navigate(`/dashboard/sites/${row.site_id}`);
    }
  }

  // Render a single asset row (shared by grouped & flat views)
  const renderRow = (asset: AssetRow) => {
    const cfg = ASSET_TYPE_CONFIG[asset.asset_type] ?? ASSET_TYPE_CONFIG.device;
    const Icon = cfg?.Icon ?? Server;
    const { label, cls } = getStatusInfo(asset);
    return (
      <tr
        key={asset.id}
        className="border-b border-border last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => handleRowClick(asset)}
      >
        <td className="px-4 py-2.5">
          <Icon className={cn("w-4 h-4", cfg?.color ?? "text-muted-foreground")} />
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">{asset.item_name}</p>
            {asset.source === "device" && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1">device</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {[asset.manufacturer, asset.model].filter(Boolean).join(" · ")}
            {asset.location ? ` · ${asset.location}` : ""}
          </p>
          {asset.extra_details && (
            <p className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-1" title={asset.extra_details}>
              {asset.extra_details}
            </p>
          )}
        </td>
        {!groupBySite && (
          <td className="px-4 py-2.5">
            <button
              className="text-sm text-primary hover:underline text-left"
              onClick={e => { e.stopPropagation(); navigate(`/dashboard/sites/${asset.site_id}`); }}
            >
              {asset.site_name}
            </button>
          </td>
        )}
        <td className="px-4 py-2.5 text-sm text-muted-foreground">
          {asset.last_serviced ? format(parseISO(asset.last_serviced), "dd MMM yyyy") : "—"}
        </td>
        <td className="px-4 py-2.5 text-sm">
          {asset.next_due
            ? <span className={isPast(parseISO(asset.next_due)) ? "text-destructive font-medium" : ""}>
                {format(parseISO(asset.next_due), "dd MMM yyyy")}
              </span>
            : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-2.5">
          <span className={cls}>{label}</span>
        </td>
        <td className="px-4 py-2.5 text-right">
          {asset.last_cert_ref && (
            <span className="text-[11px] font-mono text-muted-foreground">{asset.last_cert_ref}</span>
          )}
        </td>
        <td className="px-2">
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </td>
      </tr>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="page-title">Asset Maintenance</h1>
            <p className="page-subtitle">
              {assets.length} systems
              {includeDevices && ` · ${devices.length.toLocaleString()} devices`}
              {" "}across {new Set(combined.map(a => a.site_id)).size} sites
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card">
              <Switch
                id="include-devices"
                checked={includeDevices}
                onCheckedChange={setIncludeDevices}
                disabled={loadingDevices}
              />
              <Label htmlFor="include-devices" className="text-xs cursor-pointer flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                Include device inventory
                {loadingDevices && <Loader2 className="w-3 h-3 animate-spin" />}
              </Label>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card">
              <Switch id="group-site" checked={groupBySite} onCheckedChange={setGroupBySite} />
              <Label htmlFor="group-site" className="text-xs cursor-pointer">Group by site</Label>
            </div>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total items",       value: combined.length, color: "" },
            { label: "Systems",           value: assets.length, color: "" },
            { label: "Devices",           value: includeDevices ? devices.length : "—", color: "" },
            { label: "Overdue / Faulty",  value: overdueCount + faultyDeviceCount, color: (overdueCount + faultyDeviceCount) > 0 ? "text-destructive" : "" },
            { label: "Due this month",    value: dueSoonCount, color: dueSoonCount > 0 ? "text-warning" : "" },
          ].map(s => (
            <div key={s.label} className="bg-card rounded-lg border border-border p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <p className={cn("text-2xl font-semibold", s.color)}>{loading ? "—" : s.value.toLocaleString?.() ?? s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search item, site, loop, address, zone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All asset types</SelectItem>
              {uniqueTypes.map(t => (
                <SelectItem key={t} value={t}>{ASSET_TYPE_CONFIG[t]?.label ?? t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Source chips */}
          <div className="flex gap-1">
            {([
              { v: "all",    l: "All" },
              { v: "system", l: "Systems" },
              { v: "device", l: "Devices" },
            ] as const).map(o => (
              <button
                key={o.v}
                onClick={() => setSourceFilter(o.v)}
                disabled={o.v === "device" && !includeDevices}
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                  sourceFilter === o.v
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-accent/30",
                  o.v === "device" && !includeDevices && "opacity-50 cursor-not-allowed"
                )}
              >
                {o.l}
              </button>
            ))}
          </div>
          <div className="ml-auto text-[11px] text-muted-foreground">
            Showing {filtered.length.toLocaleString()} of {combined.length.toLocaleString()}
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                <th className="text-left px-4 py-2.5 w-8"></th>
                <th className="text-left px-4 py-2.5">Asset</th>
                {!groupBySite && <th className="text-left px-4 py-2.5">Site</th>}
                <th className="text-left px-4 py-2.5">Last serviced</th>
                <th className="text-left px-4 py-2.5">Next due</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Cert</th>
                <th className="w-8 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td colSpan={groupBySite ? 7 : 8} className="px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={groupBySite ? 7 : 8} className="px-4 py-12 text-center text-muted-foreground">
                    <Server className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No assets match the current filters</p>
                    {!includeDevices && (
                      <p className="text-xs mt-1">
                        Toggle <strong>Include device inventory</strong> to load every loop/address device.
                      </p>
                    )}
                  </td>
                </tr>
              )}

              {/* Grouped view */}
              {!loading && groupBySite && groupedBySite?.map(g => {
                const collapsed = collapsedSites.has(g.site_id);
                const devCount = g.rows.filter(r => r.source === "device").length;
                const sysCount = g.rows.length - devCount;
                return (
                  <>
                    <tr
                      key={`group-${g.site_id}`}
                      className="bg-muted/50 hover:bg-muted/60 cursor-pointer border-b border-border"
                      onClick={() => toggleSite(g.site_id)}
                    >
                      <td className="px-2 py-2">
                        {collapsed
                          ? <ChevronRight className="w-4 h-4" />
                          : <ChevronDown className="w-4 h-4" />}
                      </td>
                      <td colSpan={groupBySite ? 6 : 7} className="px-4 py-2 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            className="font-semibold text-foreground hover:underline"
                            onClick={e => { e.stopPropagation(); navigate(`/dashboard/sites/${g.site_id}`); }}
                          >
                            {g.site_name}
                          </button>
                          <Badge variant="outline" className="text-[10px]">{sysCount} systems</Badge>
                          {devCount > 0 && <Badge variant="outline" className="text-[10px]">{devCount.toLocaleString()} devices</Badge>}
                        </div>
                      </td>
                      <td />
                    </tr>
                    {!collapsed && g.rows.map(renderRow)}
                  </>
                );
              })}

              {/* Flat view */}
              {!loading && !groupBySite && filtered.map(renderRow)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-asset history drawer (systems only) */}
      <AssetHistoryPanel
        asset={selectedAsset}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </DashboardLayout>
  );
}

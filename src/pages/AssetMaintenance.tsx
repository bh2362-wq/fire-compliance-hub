/**
 * AssetMaintenance
 * Fleet-wide view of all assets across all sites.
 * Shows last service date, next due, and compliance status per asset.
 * Click any row → AssetHistoryPanel slide-in with full service history.
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, differenceInDays, isPast } from "date-fns";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { AssetHistoryPanel } from "@/components/sites/AssetHistoryPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Server, Wind, Lightbulb, Flame, Droplets, ShieldAlert,
  Search, ChevronRight, AlertTriangle, CheckCircle2, Clock, Box,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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
};

const ASSET_FORM_TYPES: Record<string, string[]> = {
  fire:               ["bs5839_inspection_servicing", "bs5839_installation", "bs5839_commissioning", "bs5839_modification"],
  fire_panel:         ["bs5839_inspection_servicing", "bs5839_installation", "bs5839_commissioning", "bs5839_modification"],
  aspirator:          ["asd_service", "asd_commissioning"],
  asd:                ["asd_service", "asd_commissioning"],
  emergency_lighting: ["el_inspection_commissioning"],
  dry_riser:          ["dry_riser"],
};

function getStatusInfo(nextDue: string | null, lastServiced: string | null) {
  if (!lastServiced) return { label: "Never serviced", cls: "vstatus vstatus-overdue", icon: AlertTriangle, days: null };
  if (!nextDue)      return { label: "Up to date",     cls: "vstatus vstatus-completed", icon: CheckCircle2, days: null };
  const days = differenceInDays(parseISO(nextDue), new Date());
  if (days < 0)      return { label: `${Math.abs(days)}d overdue`,  cls: "vstatus vstatus-overdue",    icon: AlertTriangle, days };
  if (days < 30)     return { label: `Due in ${days}d`,             cls: "vstatus vstatus-inprogress", icon: Clock, days };
  return               { label: "Up to date",                        cls: "vstatus vstatus-completed", icon: CheckCircle2, days };
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function AssetMaintenance() {
  const navigate                    = useNavigate();
  const [assets, setAssets]         = useState<AssetRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedAsset, setSelectedAsset] = useState<AssetRow | null>(null);
  const [panelOpen, setPanelOpen]   = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      // Fetch all assets with their site names
      const { data: rawAssets, error } = await supabase
        .from("site_assets")
        .select("*, site:sites(id, name)")
        .order("asset_type")
        .order("item_name");

      if (error) throw error;

      // For each asset type, fetch the most recent completed cert for each site
      const siteIds = [...new Set((rawAssets ?? []).map((a: any) => a.site_id))];

      let certMap: Record<string, { completed_at: string; certificate_reference: string; overall_status: string; next_service_date: string }> = {};

      if (siteIds.length) {
        const { data: certs } = await supabase
          .from("smart_form_submissions")
          .select("site_id, form_type, completed_at, certificate_reference, payload")
          .in("site_id", siteIds)
          .eq("status", "completed")
          .order("completed_at", { ascending: false });

        // Build a map: `${site_id}:${form_type_bucket}` → most recent cert
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
        // Find the most recent cert across all relevant form types
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
        };
      });

      setAssets(rows);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let out = assets;
    if (typeFilter !== "all") out = out.filter(a => a.asset_type === typeFilter || (typeFilter === "fire" && a.asset_type === "fire_panel"));
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(a =>
        a.item_name.toLowerCase().includes(q) ||
        a.site_name.toLowerCase().includes(q) ||
        (a.manufacturer?.toLowerCase().includes(q) ?? false) ||
        (a.model?.toLowerCase().includes(q) ?? false)
      );
    }
    return out;
  }, [assets, typeFilter, search]);

  // Summary counts
  const overdueCount  = assets.filter(a => a.next_due && isPast(parseISO(a.next_due))).length;
  const dueSoonCount  = assets.filter(a => {
    if (!a.next_due || isPast(parseISO(a.next_due))) return false;
    return differenceInDays(parseISO(a.next_due), new Date()) < 30;
  }).length;

  const uniqueTypes = [...new Set(assets.map(a => a.asset_type))];

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Asset Maintenance</h1>
            <p className="page-subtitle">{assets.length} assets across all sites</p>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total assets",    value: assets.length,  color: "" },
            { label: "Overdue",         value: overdueCount,   color: overdueCount  > 0 ? "text-destructive" : "" },
            { label: "Due this month",  value: dueSoonCount,   color: dueSoonCount  > 0 ? "text-warning"     : "" },
            { label: "Up to date",      value: assets.length - overdueCount - dueSoonCount, color: "text-success" },
          ].map(s => (
            <div key={s.label} className="bg-card rounded-lg border border-border p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <p className={cn("text-2xl font-semibold", s.color)}>{loading ? "—" : s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search assets or sites…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All asset types</SelectItem>
              {uniqueTypes.map(t => (
                <SelectItem key={t} value={t}>
                  {ASSET_TYPE_CONFIG[t]?.label ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                <th className="text-left px-4 py-2.5 w-8"></th>
                <th className="text-left px-4 py-2.5">Asset</th>
                <th className="text-left px-4 py-2.5">Site</th>
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
                  <td colSpan={8} className="px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <Server className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No assets found</p>
                    <p className="text-xs mt-1">Add assets to site records to track maintenance here.</p>
                  </td>
                </tr>
              )}

              {!loading && filtered.map(asset => {
                const cfg = ASSET_TYPE_CONFIG[asset.asset_type];
                const Icon = cfg?.Icon ?? Server;
                const { label, cls, icon: StatusIcon } = getStatusInfo(asset.next_due, asset.last_serviced);

                return (
                  <tr
                    key={asset.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => { setSelectedAsset(asset); setPanelOpen(true); }}
                  >
                    <td className="px-4 py-2.5">
                      <Icon className={cn("w-4 h-4", cfg?.color ?? "text-muted-foreground")} />
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{asset.item_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[asset.manufacturer, asset.model].filter(Boolean).join(" · ")}
                        {asset.location ? ` · ${asset.location}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        className="text-sm text-primary hover:underline text-left"
                        onClick={e => { e.stopPropagation(); navigate(`/dashboard/sites/${asset.site_id}`); }}
                      >
                        {asset.site_name}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">
                      {asset.last_serviced
                        ? format(parseISO(asset.last_serviced), "dd MMM yyyy")
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-sm">
                      {asset.next_due
                        ? <span className={asset.next_due && isPast(parseISO(asset.next_due)) ? "text-destructive font-medium" : ""}>
                            {format(parseISO(asset.next_due), "dd MMM yyyy")}
                          </span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cls}>{label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {asset.last_cert_ref && (
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {asset.last_cert_ref}
                        </span>
                      )}
                    </td>
                    <td className="px-2">
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-asset history drawer */}
      <AssetHistoryPanel
        asset={selectedAsset}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </DashboardLayout>
  );
}

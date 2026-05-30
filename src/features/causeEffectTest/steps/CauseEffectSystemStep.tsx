import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { Visit } from "@/hooks/useVisits";
import {
  BS5839_CATEGORIES,
  composePanelMakeModel,
  getSiteSystemInfo,
  updateSiteSystemInfo,
  type SiteSystemInfo,
} from "@/services/siteSystemInfoService";
import type { CauseEffectTestReport } from "../useCauseEffectTestDraft";

interface Props {
  visit: Visit;
  report: CauseEffectTestReport;
  onPatch: (updates: Partial<CauseEffectTestReport>) => void;
  siteId: string;
}

interface PanelSnapshot {
  panel_manufacturer: string | null;
  panel_model: string | null;
  zones_count: number | null;
  devices_count: number | null;
  arc_connected: boolean | null;
}

// The ce_audibility_reports row doesn't store panel/zones/devices — those
// live canonically on sites. To keep the form responsive without round-
// tripping through the report row, we hold a local mirror and write back
// to sites on a 1s debounce.
export function CauseEffectSystemStep({ visit, report, onPatch, siteId }: Props) {
  const [info, setInfo] = useState<SiteSystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<PanelSnapshot>({
    panel_manufacturer: null,
    panel_model: null,
    zones_count: null,
    devices_count: null,
    arc_connected: null,
  });
  const [prefilled, setPrefilled] = useState<string[]>([]);

  useEffect(() => {
    if (!siteId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const fetched = await getSiteSystemInfo(siteId);
        if (cancelled) return;
        setInfo(fetched);
        if (fetched) {
          const split = splitPanelMakeModel(fetched.panel_make_model);
          setPanel({
            panel_manufacturer: split.make,
            panel_model: split.model,
            zones_count: fetched.num_zones,
            devices_count: fetched.num_devices,
            arc_connected: fetched.arc_connected,
          });
          const filled: string[] = [];
          if (split.make) filled.push("Panel make");
          if (split.model) filled.push("Panel model");
          if (fetched.num_zones != null) filled.push("Zones");
          if (fetched.num_devices != null) filled.push("Devices");
          if (fetched.arc_connected != null) filled.push("ARC");
          if (fetched.bs5839_category) filled.push("BS 5839 category");
          setPrefilled(filled);
        }
      } catch (e) {
        console.warn("Couldn't prefill site system info:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  // Debounced write-back to sites so edits on this step keep the
  // canonical home (the sites row) in sync without hammering the table
  // on each keystroke.
  useEffect(() => {
    if (!siteId || loading) return;
    const handle = setTimeout(() => {
      const sitesPatch: Partial<SiteSystemInfo> = {};
      const pm = composePanelMakeModel(panel.panel_manufacturer, panel.panel_model);
      if (pm !== null) sitesPatch.panel_make_model = pm;
      if (panel.zones_count != null) sitesPatch.num_zones = panel.zones_count;
      if (panel.devices_count != null) sitesPatch.num_devices = panel.devices_count;
      if (panel.arc_connected != null) sitesPatch.arc_connected = panel.arc_connected;
      if (info?.bs5839_category) sitesPatch.bs5839_category = info.bs5839_category;
      if (Object.keys(sitesPatch).length === 0) return;
      updateSiteSystemInfo(siteId, sitesPatch).catch((e) =>
        console.warn("sites write-back failed:", e),
      );
    }, 1000);
    return () => clearTimeout(handle);
  }, [siteId, loading, panel, info?.bs5839_category]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">System &amp; visit</h3>
        <p className="text-xs text-muted-foreground">
          Confirm the panel and BS 5839 category. Values pre-filled from the site record
          can be amended; edits write back to the site so they show on every report.
        </p>
      </div>

      {/* Site + visit type (read-only summary) */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-card p-3">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Site</Label>
          <p className="text-sm font-medium truncate">{visit.site?.name ?? "—"}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Visit type</Label>
          <p className="text-sm font-medium truncate">{visit.visit_type}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading site details…
        </div>
      ) : prefilled.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-900 px-3 py-2 text-xs">
          <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Pre-filled from site record</p>
            <p className="opacity-80">{prefilled.join(" · ")}. Amend if anything changed.</p>
          </div>
        </div>
      ) : null}

      {/* Engineer / report header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Engineer name</Label>
          <Input
            value={report.engineer_name ?? ""}
            onChange={(e) => onPatch({ engineer_name: e.target.value || null })}
          />
        </div>
        <div>
          <Label className="text-xs">Report date</Label>
          <Input
            type="date"
            value={report.report_date ?? ""}
            onChange={(e) => onPatch({ report_date: e.target.value || null })}
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Client name</Label>
        <Input
          value={report.client_name ?? ""}
          onChange={(e) => onPatch({ client_name: e.target.value || null })}
        />
      </div>

      {/* Panel */}
      <div className="space-y-2 pt-1">
        <Label className="text-sm font-medium">Panel</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Manufacturer</Label>
            <Input
              value={panel.panel_manufacturer ?? ""}
              onChange={(e) => setPanel((p) => ({ ...p, panel_manufacturer: e.target.value || null }))}
              placeholder="e.g. Gent"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Model</Label>
            <Input
              value={panel.panel_model ?? ""}
              onChange={(e) => setPanel((p) => ({ ...p, panel_model: e.target.value || null }))}
              placeholder="e.g. Vigilon"
            />
          </div>
        </div>
      </div>

      {/* BS 5839 category */}
      <div>
        <Label className="text-xs">BS 5839 category</Label>
        <Select
          value={info?.bs5839_category ?? ""}
          onValueChange={(v) => setInfo((prev) => (prev ? { ...prev, bs5839_category: v as any } : prev))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select category (L1 / L2 / … / M)" />
          </SelectTrigger>
          <SelectContent>
            {BS5839_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* System size */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">System size</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Zones</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={panel.zones_count ?? ""}
              onChange={(e) => setPanel((p) => ({ ...p, zones_count: e.target.value === "" ? null : Number(e.target.value) }))}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Devices</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={panel.devices_count ?? ""}
              onChange={(e) => setPanel((p) => ({ ...p, devices_count: e.target.value === "" ? null : Number(e.target.value) }))}
            />
          </div>
        </div>
      </div>

      {/* ARC */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <Label className="text-sm font-medium">ARC connected</Label>
        <div className="grid grid-cols-2 gap-2">
          {([true, false] as const).map((v) => {
            const active = panel.arc_connected === v;
            return (
              <button
                key={String(v)}
                type="button"
                onClick={() => setPanel((p) => ({ ...p, arc_connected: v }))}
                className={`h-11 rounded-md border text-sm font-medium transition-colors ${
                  active
                    ? v
                      ? "bg-green-600 text-white border-green-700"
                      : "bg-red-600 text-white border-red-700"
                    : "bg-background hover:bg-accent"
                }`}
              >
                {v ? "Yes" : "No"}
                {active && <Badge className="ml-2 bg-white/20 text-white border-0">Confirmed</Badge>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function splitPanelMakeModel(combined: string | null): { make: string | null; model: string | null } {
  if (!combined) return { make: null, model: null };
  const trimmed = combined.trim();
  if (!trimmed) return { make: null, model: null };
  const idx = trimmed.indexOf(" ");
  if (idx < 0) return { make: trimmed, model: null };
  return { make: trimmed.slice(0, idx), model: trimmed.slice(idx + 1).trim() || null };
}


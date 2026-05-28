import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { Visit } from "@/hooks/useVisits";
import { ServiceReport } from "@/services/serviceReportService";
import {
  composePanelMakeModel,
  getSiteSystemInfo,
  updateSiteSystemInfo,
  type SiteSystemInfo,
} from "@/services/siteSystemInfoService";

interface Props {
  visit: Visit;
  report: ServiceReport;
  onPatch: (updates: Partial<ServiceReport>) => void;
  siteId?: string;
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function splitPanelMakeModel(combined: string | null): { make: string | null; model: string | null } {
  if (!combined) return { make: null, model: null };
  const trimmed = combined.trim();
  if (!trimmed) return { make: null, model: null };
  const idx = trimmed.indexOf(" ");
  if (idx < 0) return { make: trimmed, model: null };
  return { make: trimmed.slice(0, idx), model: trimmed.slice(idx + 1).trim() || null };
}

export function SystemStep({ visit, report, onPatch, siteId }: Props) {
  const [prefilled, setPrefilled] = useState<string[]>([]);
  const [siteInfoLoading, setSiteInfoLoading] = useState(true);

  // Read existing site system-info once on mount; pre-fill any report fields
  // that are still null. Engineer-typed values win — we never overwrite.
  useEffect(() => {
    if (!siteId) {
      setSiteInfoLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const info = await getSiteSystemInfo(siteId);
        if (cancelled || !info) return;
        const patch: Partial<ServiceReport> = {};
        const filled: string[] = [];

        if (report.panel_manufacturer == null && report.panel_model == null && info.panel_make_model) {
          const { make, model } = splitPanelMakeModel(info.panel_make_model);
          if (make) {
            patch.panel_manufacturer = make;
            filled.push("Panel manufacturer");
          }
          if (model) {
            patch.panel_model = model;
            filled.push("Panel model");
          }
        }
        if (report.zones_count == null && info.num_zones != null) {
          patch.zones_count = info.num_zones;
          filled.push("Zones");
        }
        if (report.devices_count == null && info.num_devices != null) {
          patch.devices_count = info.num_devices;
          filled.push("Devices");
        }
        if (report.arc_connected == null && info.arc_connected != null) {
          patch.arc_connected = info.arc_connected;
          filled.push("ARC connection");
        }

        if (Object.keys(patch).length > 0) {
          onPatch(patch);
          setPrefilled(filled);
        }
      } catch (e) {
        console.warn("Couldn't prefill from site:", e);
      } finally {
        if (!cancelled) setSiteInfoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once for this site — re-running on every report change would
    // re-fire the prefill heuristic and risk overwriting fresh deletions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // Write back to sites whenever the engineer-confirmed values settle.
  useEffect(() => {
    if (!siteId) return;
    const handle = setTimeout(() => {
      const panel = composePanelMakeModel(report.panel_manufacturer, report.panel_model);
      const sitesPatch: Partial<SiteSystemInfo> = {};
      if (panel !== null) sitesPatch.panel_make_model = panel;
      if (report.zones_count != null) sitesPatch.num_zones = report.zones_count;
      if (report.devices_count != null) sitesPatch.num_devices = report.devices_count;
      if (report.arc_connected != null) sitesPatch.arc_connected = report.arc_connected;
      if (Object.keys(sitesPatch).length === 0) return;
      updateSiteSystemInfo(siteId, sitesPatch).catch((e) =>
        console.warn("sites system-info write-back failed:", e),
      );
    }, 1000);
    return () => clearTimeout(handle);
  }, [
    siteId,
    report.panel_manufacturer,
    report.panel_model,
    report.zones_count,
    report.devices_count,
    report.arc_connected,
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Site &amp; system</h3>
        <p className="text-xs text-muted-foreground">
          Confirm the site, arrival, and panel details. Values pre-filled from the site record
          can be amended.
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

      {/* Pre-fill banner */}
      {siteInfoLoading ? (
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

      {/* Arrival + mileage (absorbed from old Start step) */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Arrival time</Label>
          <Input
            type="datetime-local"
            value={toLocalInput(report.arrival_time)}
            onChange={(e) =>
              onPatch({
                arrival_time: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
        </div>
        <div>
          <Label className="text-xs">Mileage (miles)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={report.mileage_miles ?? ""}
            onChange={(e) =>
              onPatch({ mileage_miles: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>
      </div>

      {/* Panel */}
      <div className="space-y-2 pt-1">
        <Label className="text-sm font-medium">Panel</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Manufacturer</Label>
            <Input
              value={report.panel_manufacturer ?? ""}
              onChange={(e) => onPatch({ panel_manufacturer: e.target.value || null })}
              placeholder="e.g. Gent"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Model</Label>
            <Input
              value={report.panel_model ?? ""}
              onChange={(e) => onPatch({ panel_model: e.target.value || null })}
              placeholder="e.g. Vigilon"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Location</Label>
          <Input
            value={report.panel_location ?? ""}
            onChange={(e) => onPatch({ panel_location: e.target.value || null })}
            placeholder="e.g. Main reception"
          />
        </div>
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
              value={report.zones_count ?? ""}
              onChange={(e) =>
                onPatch({ zones_count: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Devices</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={report.devices_count ?? ""}
              onChange={(e) =>
                onPatch({ devices_count: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
        </div>
      </div>

      {/* ARC */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <Label className="text-sm font-medium">ARC connected at start of visit</Label>
        <div className="grid grid-cols-2 gap-2">
          {([true, false] as const).map((v) => {
            const active = report.arc_connected === v;
            return (
              <button
                key={String(v)}
                type="button"
                onClick={() => onPatch({ arc_connected: v })}
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

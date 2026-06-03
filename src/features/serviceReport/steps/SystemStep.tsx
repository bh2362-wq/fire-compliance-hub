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
import { ServiceReport } from "@/services/serviceReportService";
import {
  BS5839_CATEGORIES,
  composePanelMakeModel,
  getSiteSystemInfo,
  getSiteDeviceCount,
  updateSiteSystemInfo,
  type Bs5839Category,
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
  // bs5839_category lives only on the sites row (not on service_reports),
  // so we hold it as local state here and write it back to sites
  // directly. Keeps the engineer's confirmation inline with the other
  // system fields instead of forcing a trip back to Site → System Info.
  const [category, setCategory] = useState<Bs5839Category | null>(null);

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
        // Live device count from the asset inventory wins over the
        // stored sites.num_devices snapshot. Parallel so the prefill
        // isn't slowed by a sequential round-trip.
        const [info, liveDeviceCount] = await Promise.all([
          getSiteSystemInfo(siteId),
          getSiteDeviceCount(siteId),
        ]);
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
        if (report.devices_count == null) {
          const devicesPrefill =
            liveDeviceCount != null && liveDeviceCount > 0 ? liveDeviceCount : info.num_devices;
          if (devicesPrefill != null) {
            patch.devices_count = devicesPrefill;
            filled.push("Devices");
          }
        }
        if (report.arc_connected == null && info.arc_connected != null) {
          patch.arc_connected = info.arc_connected;
          filled.push("ARC connection");
        }
        if (info.bs5839_category) {
          setCategory(info.bs5839_category);
          filled.push("BS 5839 category");
        }

        if (Object.keys(patch).length > 0) {
          onPatch(patch);
        }
        if (filled.length > 0) {
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
  // Debounced 1s so per-keystroke typing on panel make/model doesn't
  // hammer the table. NB: bs5839_category is handled separately (immediate
  // write on the dropdown onValueChange) so it doesn't get lost when the
  // engineer picks then immediately clicks Next — the debounce timer
  // would be cleared on unmount before it fires.
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

  // Immediate, no-debounce write for the BS 5839 category. Engineers
  // routinely pick a value and click Next within a second; the
  // debounced effect above would cancel before firing. Local state
  // mirrors the new value so the dropdown reflects the choice while
  // the network request settles.
  const handleCategoryChange = (next: Bs5839Category | null) => {
    setCategory(next);
    if (!siteId) return;
    updateSiteSystemInfo(siteId, { bs5839_category: next }).catch((e) =>
      console.warn("BS 5839 category write-back failed:", e),
    );
  };

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

      {/* BS 5839 category — lives on sites, written back on change. The
          PDF's System block reads this directly; previously the wizard
          had no way to set it from inside the service-report flow so
          the field rendered as "Category: —" on every printout. */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">BS 5839 category</Label>
        <Select
          value={category ?? "__none"}
          onValueChange={(v) => handleCategoryChange(v === "__none" ? null : (v as Bs5839Category))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select category (L1 / L2 / … / M)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— Not set —</SelectItem>
            {BS5839_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
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

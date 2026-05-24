import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServiceReport } from "@/services/serviceReportService";
import {
  composePanelMakeModel,
  updateSiteSystemInfo,
} from "@/services/siteSystemInfoService";

interface Props {
  report: ServiceReport;
  onPatch: (updates: Partial<ServiceReport>) => void;
  /** Site id is passed in so this step can mirror the engineer's confirmed
   *  panel/zones/devices/ARC back to sites.* — sites is the canonical
   *  home for system info after Migration A. */
  siteId?: string;
}

export function SystemStep({ report, onPatch, siteId }: Props) {
  // Write back to sites whenever the engineer-confirmed values settle.
  // Debounced 1s so per-keystroke typing doesn't hammer the table.
  useEffect(() => {
    if (!siteId) return;
    const handle = setTimeout(() => {
      const panel = composePanelMakeModel(
        report.panel_manufacturer,
        report.panel_model,
      );
      const sitesPatch: Record<string, unknown> = {};
      if (panel !== null) sitesPatch.panel_make_model = panel;
      if (report.zones_count != null) sitesPatch.num_zones = report.zones_count;
      if (report.devices_count != null) sitesPatch.num_devices = report.devices_count;
      if (report.arc_connected != null) sitesPatch.arc_connected = report.arc_connected;
      if (Object.keys(sitesPatch).length === 0) return;
      updateSiteSystemInfo(siteId, sitesPatch).catch((e) =>
        // Surface to console only — a sites write-back failure shouldn't
        // block the service-report capture flow. The report itself saves
        // independently via useServiceReportDraft.
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
        <h3 className="text-base font-semibold">System confirmation</h3>
        <p className="text-xs text-muted-foreground">
          Confirm the panel details. ARC connection should be checked before testing.
        </p>
      </div>

      <div>
        <Label className="text-xs">Panel manufacturer</Label>
        <Input
          value={report.panel_manufacturer ?? ""}
          onChange={(e) => onPatch({ panel_manufacturer: e.target.value || null })}
        />
      </div>

      <div>
        <Label className="text-xs">Panel model</Label>
        <Input
          value={report.panel_model ?? ""}
          onChange={(e) => onPatch({ panel_model: e.target.value || null })}
        />
      </div>

      <div>
        <Label className="text-xs">Panel location</Label>
        <Input
          value={report.panel_location ?? ""}
          onChange={(e) => onPatch({ panel_location: e.target.value || null })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Zones</Label>
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
          <Label className="text-xs">Devices</Label>
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

      <div className="rounded-lg border bg-card p-3 space-y-2">
        <Label className="text-sm">ARC connected at start of visit</Label>
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
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

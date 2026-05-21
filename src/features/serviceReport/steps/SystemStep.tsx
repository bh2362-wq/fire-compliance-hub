import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServiceReport } from "@/services/serviceReportService";

interface Props {
  report: ServiceReport;
  onPatch: (updates: Partial<ServiceReport>) => void;
}

export function SystemStep({ report, onPatch }: Props) {
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

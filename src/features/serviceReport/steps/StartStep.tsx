import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Visit } from "@/hooks/useVisits";
import { ServiceReport } from "@/services/serviceReportService";

interface Props {
  visit: Visit;
  report: ServiceReport;
  onPatch: (updates: Partial<ServiceReport>) => void;
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StartStep({ visit, report, onPatch }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Start visit</h3>
        <p className="text-xs text-muted-foreground">
          Confirm arrival time and mileage. The visit type was set when this visit was scheduled.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-3 space-y-1">
        <Label className="text-xs">Site</Label>
        <p className="text-sm font-medium">{visit.site?.name ?? "—"}</p>
      </div>

      <div className="rounded-lg border bg-card p-3 space-y-1">
        <Label className="text-xs">Visit type</Label>
        <p className="text-sm font-medium">{visit.visit_type}</p>
      </div>

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
  );
}

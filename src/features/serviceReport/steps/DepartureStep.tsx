import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ServiceReport, ServiceReportSystemStatus } from "@/services/serviceReportService";

interface Props {
  report: ServiceReport;
  onPatch: (updates: Partial<ServiceReport>) => void;
}

const STATUS_OPTIONS: { key: ServiceReportSystemStatus; label: string; subtitle: string; tone: string }[] = [
  {
    key: "fully_operational",
    label: "Fully operational",
    subtitle: "System left in normal condition",
    tone: "bg-green-600 text-white border-green-700",
  },
  {
    key: "advisory_only",
    label: "Advisory only",
    subtitle: "Operational but with observations",
    tone: "bg-blue-600 text-white border-blue-700",
  },
  {
    key: "partial_operation",
    label: "Partial operation",
    subtitle: "Some zones / devices isolated",
    tone: "bg-amber-500 text-white border-amber-600",
  },
  {
    key: "not_operational",
    label: "Not operational",
    subtitle: "System left out of service",
    tone: "bg-red-600 text-white border-red-700",
  },
];

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DepartureStep({ report, onPatch }: Props) {
  const needsIsolation =
    report.system_status === "partial_operation" || report.system_status === "not_operational";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">System status on departure</h3>
        <p className="text-xs text-muted-foreground">
          Required before sign-off. If not fully operational, capture the isolation details.
        </p>
      </div>

      <div className="space-y-2">
        {STATUS_OPTIONS.map((opt) => {
          const active = report.system_status === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onPatch({ system_status: opt.key })}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${
                active ? opt.tone : "bg-background hover:bg-accent"
              }`}
            >
              <p className="text-sm font-semibold">{opt.label}</p>
              <p className={`text-xs ${active ? "opacity-90" : "text-muted-foreground"}`}>
                {opt.subtitle}
              </p>
            </button>
          );
        })}
      </div>

      {needsIsolation && (
        <div>
          <Label className="text-xs">Isolation details</Label>
          <Textarea
            value={report.isolation_details ?? ""}
            onChange={(e) => onPatch({ isolation_details: e.target.value || null })}
            rows={4}
            placeholder="What's isolated, why, who's been informed, expected restoration date"
          />
        </div>
      )}

      <div>
        <Label className="text-xs">Departure time</Label>
        <Input
          type="datetime-local"
          value={toLocalInput(report.departure_time)}
          onChange={(e) =>
            onPatch({
              departure_time: e.target.value ? new Date(e.target.value).toISOString() : null,
            })
          }
        />
      </div>
    </div>
  );
}

import { useState } from "react";
import { BatteryCharging, AlertOctagon, Wrench } from "lucide-react";
import { ServiceReport } from "@/services/serviceReportService";
import { BatteryStep } from "./BatteryStep";
import { DefectsStep } from "./DefectsStep";
import { MaterialsStep } from "./MaterialsStep";

interface Props {
  report: ServiceReport;
  onPatch: (updates: Partial<ServiceReport>) => void;
  siteId: string;
  visitId: string;
  reportId: string;
}

type Tab = "battery" | "defects" | "materials";

const TABS: { key: Tab; label: string; Icon: typeof BatteryCharging }[] = [
  { key: "battery", label: "Battery", Icon: BatteryCharging },
  { key: "defects", label: "Defects", Icon: AlertOctagon },
  { key: "materials", label: "Materials", Icon: Wrench },
];

export function FindingsStep({ report, onPatch, siteId, visitId, reportId }: Props) {
  const [tab, setTab] = useState<Tab>("defects");

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">Findings</h3>
        <p className="text-xs text-muted-foreground">
          Battery test results, defects raised, and parts consumed.
        </p>
      </div>

      <div className="flex bg-muted/50 rounded-lg p-1 gap-1">
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md transition-colors ${
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "battery" && <BatteryStep reportId={reportId} />}
        {tab === "defects" && <DefectsStep siteId={siteId} visitId={visitId} reportId={reportId} />}
        {tab === "materials" && <MaterialsStep report={report} onPatch={onPatch} />}
      </div>
    </div>
  );
}

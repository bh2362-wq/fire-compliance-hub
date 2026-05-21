import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ServiceReport } from "@/services/serviceReportService";

interface Props {
  report: ServiceReport;
  onPatch: (updates: Partial<ServiceReport>) => void;
}

// v1: free-text parts log. Catalogue-linked materials capture is deferred
// (planning brief lists it as v2 work alongside inventory integration).
export function MaterialsStep({ report, onPatch }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Materials used</h3>
        <p className="text-xs text-muted-foreground">
          List parts consumed during the visit — one per line. Quantities and serial
          numbers if available.
        </p>
      </div>

      <div>
        <Label className="text-xs">Parts used</Label>
        <Textarea
          value={report.parts_used ?? ""}
          onChange={(e) => onPatch({ parts_used: e.target.value || null })}
          rows={8}
          placeholder={"e.g.\n2 × Apollo XP95 Optical Detector (SN: A123, A124)\n1 × Sounder Base"}
        />
      </div>

      <div>
        <Label className="text-xs">Work carried out</Label>
        <Textarea
          value={report.work_carried_out ?? ""}
          onChange={(e) => onPatch({ work_carried_out: e.target.value || null })}
          rows={6}
          placeholder="Summary of the work completed on this visit"
        />
      </div>
    </div>
  );
}

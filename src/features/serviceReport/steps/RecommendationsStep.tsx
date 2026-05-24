import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ServiceReport } from "@/services/serviceReportService";

interface Props {
  report: ServiceReport;
  onPatch: (updates: Partial<ServiceReport>) => void;
}

// Chunk 5 will plug an "Generate with AI" button into this step that calls
// the generate-service-recommendations edge function. For Chunk 2, the
// engineer writes the paragraph directly.
export function RecommendationsStep({ report, onPatch }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Recommendations &amp; next service</h3>
        <p className="text-xs text-muted-foreground">
          Summarise findings and the next service date. AI-assisted generation will
          be added in a later chunk.
        </p>
      </div>

      <div>
        <Label className="text-xs">Recommendations</Label>
        <Textarea
          value={report.recommendations ?? ""}
          onChange={(e) => onPatch({ recommendations: e.target.value || null })}
          rows={6}
          placeholder="2–4 sentences summarising findings, referencing BS 5839-1:2025 clauses where relevant."
        />
      </div>

      <div>
        <Label className="text-xs">Outstanding works</Label>
        <Textarea
          value={report.outstanding_works ?? ""}
          onChange={(e) => onPatch({ outstanding_works: e.target.value || null })}
          rows={4}
          placeholder="Work that could not be completed on this visit and needs a follow-up (parts on order, access denied, defects to quote, etc.)."
        />
      </div>

      <div>
        <Label className="text-xs">Next service due</Label>
        <Input
          type="date"
          value={report.next_service_due ?? ""}
          onChange={(e) => onPatch({ next_service_due: e.target.value || null })}
        />
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Visit } from "@/hooks/useVisits";
import { ServiceReport, BS5839Checklist } from "@/services/serviceReportService";
import { useServiceReportDraft } from "./useServiceReportDraft";
import { OfflineBadge } from "./OfflineBadge";
import { StartStep } from "./steps/StartStep";
import { SystemStep } from "./steps/SystemStep";
import { ChecklistStep } from "./steps/ChecklistStep";
import { BatteryStep } from "./steps/BatteryStep";
import { DefectsStep } from "./steps/DefectsStep";
import { MaterialsStep } from "./steps/MaterialsStep";
import { DepartureStep } from "./steps/DepartureStep";
import { RecommendationsStep } from "./steps/RecommendationsStep";
import { SignOffStep } from "./steps/SignOffStep";

interface Props {
  visit: Visit;
  userId: string;
  onCompleted?: (report: ServiceReport) => void;
}

const STEP_LABELS = [
  "Start",
  "System",
  "Checklist",
  "Battery",
  "Defects",
  "Materials",
  "Departure",
  "Recommendations",
  "Sign-off",
];

export function CaptureWizard({ visit, userId, onCompleted }: Props) {
  const { toast } = useToast();
  const { report, loading, saving, patch, refetch } = useServiceReportDraft(
    visit.id,
    visit.site_id,
    userId,
  );
  const [stepIdx, setStepIdx] = useState(0);
  const [completing, setCompleting] = useState(false);

  // Auto-capture arrival_time on first load if not already set.
  useEffect(() => {
    if (report && !report.arrival_time) {
      void patch({ arrival_time: new Date().toISOString() });
    }
    // run once per report identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id]);

  const handleComplete = async () => {
    if (!report) return;
    setCompleting(true);
    try {
      const next = await new Promise<ServiceReport>((resolve, reject) => {
        patch({
          status: "completed",
          departure_time: report.departure_time ?? new Date().toISOString(),
        })
          .then(() => refetch().then(() => resolve(report)).catch(reject))
          .catch(reject);
      });
      toast({ title: "Service report completed" });
      onCompleted?.(next);
    } catch (e) {
      toast({
        title: "Could not complete",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setCompleting(false);
    }
  };

  const progressPct = useMemo(
    () => Math.round(((stepIdx + 1) / STEP_LABELS.length) * 100),
    [stepIdx],
  );

  if (loading || !report) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Adapter so steps with focused signatures still go through `patch`.
  const patchScalars = (updates: Partial<ServiceReport>) => {
    void patch(updates);
  };
  const patchChecklist = (next: BS5839Checklist) => {
    void patch({ checklist: next });
  };

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <header className="sticky top-0 z-20 bg-background border-b -mx-4 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Step {stepIdx + 1} of {STEP_LABELS.length} · {STEP_LABELS[stepIdx]}
          </p>
          <div className="flex items-center gap-3">
            {saving && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Save className="h-3 w-3 animate-pulse" /> Saving…
              </span>
            )}
            <OfflineBadge />
          </div>
        </div>
        <Progress value={progressPct} className="mt-2 h-1.5" />
      </header>

      <main className="px-4 pt-4">
        {stepIdx === 0 && <StartStep visit={visit} report={report} onPatch={patchScalars} />}
        {stepIdx === 1 && <SystemStep report={report} onPatch={patchScalars} />}
        {stepIdx === 2 && (
          <ChecklistStep checklist={report.checklist} onChange={patchChecklist} />
        )}
        {stepIdx === 3 && <BatteryStep reportId={report.id} />}
        {stepIdx === 4 && (
          <DefectsStep siteId={visit.site_id} visitId={visit.id} reportId={report.id} />
        )}
        {stepIdx === 5 && <MaterialsStep report={report} onPatch={patchScalars} />}
        {stepIdx === 6 && <DepartureStep report={report} onPatch={patchScalars} />}
        {stepIdx === 7 && <RecommendationsStep report={report} onPatch={patchScalars} />}
        {stepIdx === 8 && (
          <SignOffStep
            report={report}
            onPatch={patchScalars}
            onComplete={handleComplete}
            completing={completing}
          />
        )}
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-background border-t px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-2">
          <Button
            variant="outline"
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0}
            className="flex-1"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          {stepIdx < STEP_LABELS.length - 1 && (
            <Button
              onClick={() => setStepIdx((i) => Math.min(STEP_LABELS.length - 1, i + 1))}
              className="flex-1"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

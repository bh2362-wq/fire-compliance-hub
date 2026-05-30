import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Visit } from "@/hooks/useVisits";
import { OfflineBadge } from "@/features/serviceReport/OfflineBadge";
import { DevicesStep } from "@/features/serviceReport/steps/DevicesStep";
import { useCauseEffectTestDraft } from "./useCauseEffectTestDraft";
import { CauseEffectSystemStep } from "./steps/CauseEffectSystemStep";
import { OutputFunctionsStep } from "./steps/OutputFunctionsStep";
import { AudibilityStep } from "./steps/AudibilityStep";
import { FindingsRemedialsStep } from "./steps/FindingsRemedialsStep";
import { CauseEffectSignOffStep } from "./steps/CauseEffectSignOffStep";

interface Props {
  visit: Visit;
  userId: string;
  onCompleted?: () => void;
}

const STEP_LABELS = [
  "System",
  "C&E devices",
  "Output functions",
  "Audibility",
  "Findings & remedials",
  "Sign-off",
];

export function CauseEffectTestWizard({ visit, userId, onCompleted }: Props) {
  const { toast } = useToast();
  const { report, loading, saving, patch, error } = useCauseEffectTestDraft(
    visit.id,
    visit.site_id,
    userId,
  );
  const [stepIdx, setStepIdx] = useState(0);
  const [completing, setCompleting] = useState(false);

  const progressPct = useMemo(
    () => Math.round(((stepIdx + 1) / STEP_LABELS.length) * 100),
    [stepIdx],
  );

  const handleComplete = async () => {
    if (!report) return;
    setCompleting(true);
    try {
      await patch({ status: "completed" });
      toast({ title: "C&E test report completed" });
      onCompleted?.();
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

  // Error before spinner gate — when the draft fetch errors (e.g. the
  // ce_audibility_reports migration hasn't been applied on this env yet)
  // `loading` flips back to false but `report` stays null. The previous
  // `loading || !report` ordering hid the error behind an endless spinner.
  if (error) {
    const detail = error.message || String(error);
    const looksLikeMissingTable = /relation .*ce_audibility_reports.* does not exist|does not exist.*ce_audibility_reports/i.test(detail);
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4">
        <p className="text-sm font-medium text-destructive">Couldn't open the C&amp;E test draft.</p>
        <p className="text-xs text-muted-foreground break-words">{detail}</p>
        {looksLikeMissingTable && (
          <p className="text-xs text-muted-foreground">
            The <code>ce_audibility_reports</code> tables need to be migrated on this
            environment first. Run the latest Supabase migration, then reload.
          </p>
        )}
      </div>
    );
  }

  if (loading || !report) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Adapter so steps with focused signatures still go through `patch`.
  const patchScalars = (updates: Parameters<typeof patch>[0]) => {
    void patch(updates);
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
        {stepIdx === 0 && (
          <CauseEffectSystemStep
            visit={visit}
            report={report}
            onPatch={patchScalars}
            siteId={visit.site_id}
          />
        )}
        {stepIdx === 1 && <DevicesStep visitId={visit.id} siteId={visit.site_id} />}
        {stepIdx === 2 && <OutputFunctionsStep reportId={report.id} />}
        {stepIdx === 3 && <AudibilityStep report={report} onPatch={patchScalars} reportId={report.id} />}
        {stepIdx === 4 && (
          <FindingsRemedialsStep report={report} onPatch={patchScalars} reportId={report.id} />
        )}
        {stepIdx === 5 && (
          <CauseEffectSignOffStep
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

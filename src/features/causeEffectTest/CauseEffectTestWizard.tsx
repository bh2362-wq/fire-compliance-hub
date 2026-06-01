import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Visit } from "@/hooks/useVisits";
import { WizardShell, WizardLoadingState } from "@/features/_shared/WizardShell";
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
    return <WizardLoadingState />;
  }

  // Adapter so steps with focused signatures still go through `patch`.
  const patchScalars = (updates: Parameters<typeof patch>[0]) => {
    void patch(updates);
  };

  return (
    <WizardShell
      stepLabels={STEP_LABELS}
      stepIdx={stepIdx}
      setStepIdx={setStepIdx}
      saving={saving}
    >
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
    </WizardShell>
  );
}

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { WizardShell, WizardLoadingState } from "@/features/_shared/WizardShell";
import { useASDDraft, ASDAsset, ASDDraft } from "./useASDDraft";
import { DetailsStep } from "./steps/DetailsStep";
import { ChecklistStep } from "./steps/ChecklistStep";
import { SummaryStep } from "./steps/SummaryStep";
import { NotesStep } from "./steps/NotesStep";
import { SignOffStep } from "./steps/SignOffStep";

interface Visit {
  id: string;
  site_id: string;
  visit_date: string;
  visit_type: string;
}

interface Props {
  visit: Visit;
  assets: ASDAsset[];
  userId: string;
  onCompleted?: () => void;
}

const STEP_LABELS = ["Details", "Checklist", "Summary", "Notes", "Sign-off"];

export function ASDServiceWizard({ visit, assets, userId, onCompleted }: Props) {
  const { toast } = useToast();
  const { draft, loading, saving, error, patch, complete } = useASDDraft(visit, assets, userId);
  const [stepIdx, setStepIdx] = useState(0);
  const [completing, setCompleting] = useState(false);

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <p className="text-sm font-medium text-destructive">Couldn't open this report.</p>
        <p className="text-xs text-muted-foreground break-words">{error.message}</p>
      </div>
    );
  }

  if (loading || !draft) {
    return <WizardLoadingState />;
  }

  const patchScalars = (updates: Partial<ASDDraft>) => {
    void patch(updates);
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await complete();
      toast({ title: "ASD service report completed" });
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

  return (
    <WizardShell
      stepLabels={STEP_LABELS}
      stepIdx={stepIdx}
      setStepIdx={setStepIdx}
      saving={saving}
    >
      {stepIdx === 0 && <DetailsStep draft={draft} onPatch={patchScalars} assets={assets} />}
      {stepIdx === 1 && <ChecklistStep draft={draft} onPatch={patchScalars} />}
      {stepIdx === 2 && <SummaryStep draft={draft} onPatch={patchScalars} />}
      {stepIdx === 3 && <NotesStep draft={draft} onPatch={patchScalars} />}
      {stepIdx === 4 && (
        <SignOffStep
          draft={draft}
          onPatch={patchScalars}
          onComplete={handleComplete}
          completing={completing}
        />
      )}
    </WizardShell>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { WizardShell, WizardLoadingState } from "@/features/_shared/WizardShell";
import { useCommissioningDraft } from "./useCommissioningDraft";
import { Step1ClientSystem } from "./steps/Step1ClientSystem";
import { Step2Examinations } from "./steps/Step2Examinations";
import { Step3Checklist } from "./steps/Step3Checklist";
import { Step4Variations } from "./steps/Step4Variations";
import { Step5IncompleteWork } from "./steps/Step5IncompleteWork";
import { Step6Signoff } from "./steps/Step6Signoff";

interface Props {
  visitId: string;
}

const STEP_LABELS = [
  "Client & System",
  "Examinations",
  "§39 Checklist",
  "Variations & refs",
  "Incomplete work",
  "Sign-off",
];

export function CommissioningWizard({ visitId }: Props) {
  const draft = useCommissioningDraft(visitId);
  const [stepIdx, setStepIdx] = useState(0);

  if (draft.loading) return <WizardLoadingState />;
  if (draft.error) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <p className="text-sm font-medium text-destructive">
          Couldn't open this commissioning cert.
        </p>
        <p className="text-xs text-muted-foreground break-words">
          {draft.error.message}
        </p>
      </div>
    );
  }

  // Manual save button — every step except the last. Sign-off
  // (Step 6) has its own "Save & download" buttons, so we don't show
  // a Save button there too.
  const handleSave = async () => {
    try {
      await draft.save();
      toast.success("Draft saved");
    } catch (e) {
      toast.error("Couldn't save draft", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <WizardShell
      stepLabels={STEP_LABELS}
      stepIdx={stepIdx}
      setStepIdx={setStepIdx}
      saving={draft.saving}
      headerActions={
        stepIdx < STEP_LABELS.length - 1 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={draft.saving}
            className="gap-1"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </Button>
        ) : undefined
      }
    >
      {stepIdx === 0 && <Step1ClientSystem draft={draft} />}
      {stepIdx === 1 && <Step2Examinations draft={draft} />}
      {stepIdx === 2 && <Step3Checklist draft={draft} />}
      {stepIdx === 3 && <Step4Variations draft={draft} />}
      {stepIdx === 4 && <Step5IncompleteWork draft={draft} />}
      {stepIdx === 5 && <Step6Signoff draft={draft} />}
    </WizardShell>
  );
}

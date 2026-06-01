import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { WizardShell, WizardLoadingState } from "@/features/_shared/WizardShell";
import { useASDDraft, ASDAsset, ASDDraft } from "./useASDDraft";
import { DetailsStep } from "./steps/DetailsStep";
import { ChecklistStep } from "./steps/ChecklistStep";
import { SummaryStep } from "./steps/SummaryStep";
import { NotesStep } from "./steps/NotesStep";
import { SignOffStep } from "./steps/SignOffStep";
import { PasteAINotesDialog } from "@/components/notes-paste/PasteAINotesDialog";

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

  const [pasteOpen, setPasteOpen] = useState(false);

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
    <>
      <WizardShell
        stepLabels={STEP_LABELS}
        stepIdx={stepIdx}
        setStepIdx={setStepIdx}
        saving={saving}
        headerActions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setPasteOpen(true)}
            title="Paste AI notes (defects + field updates)"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Paste notes</span>
          </Button>
        }
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

      <PasteAINotesDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        reportType="asd"
        siteId={visit.site_id}
        visitId={visit.id}
        reportId={draft.id}
        currentValues={{
          defects_found: draft.defects_found,
          recommendations: draft.recommendations,
          work_carried_out: draft.work_carried_out,
          system_condition: draft.system_condition,
          notes: draft.additional_notes,
        }}
        onApply={async ({ fieldUpdates }) => {
          // Map AI's generic field names to ASD's draft column names.
          const updates: Partial<ASDDraft> = {};
          if (fieldUpdates.defects_found !== undefined) updates.defects_found = fieldUpdates.defects_found;
          if (fieldUpdates.recommendations !== undefined) updates.recommendations = fieldUpdates.recommendations;
          if (fieldUpdates.work_carried_out !== undefined) updates.work_carried_out = fieldUpdates.work_carried_out;
          if (fieldUpdates.system_condition !== undefined) updates.system_condition = fieldUpdates.system_condition;
          if (fieldUpdates.notes !== undefined) updates.additional_notes = fieldUpdates.notes;
          if (Object.keys(updates).length > 0) await patch(updates);
        }}
      />
    </>
  );
}

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { WizardShell, WizardLoadingState } from "@/features/_shared/WizardShell";
import {
  useWorkReportDraft,
  WorkReportDraft,
  WorkReportVisit,
} from "./useWorkReportDraft";
import { JobStep } from "./steps/JobStep";
import { WorksStep } from "./steps/WorksStep";
import { MaterialsStep } from "./steps/MaterialsStep";
import { PhotosStep } from "./steps/PhotosStep";
import { SignStep } from "./steps/SignStep";

interface Props {
  visit: WorkReportVisit;
  userId: string;
  siteName: string;
  siteContactName: string | null;
  siteFullAddress: string;
  onCompleted?: () => void;
}

const STEP_LABELS = ["Job", "Works", "Materials", "Photos", "Sign-off"];

export function WorkReportWizard({
  visit,
  userId,
  siteName,
  siteContactName,
  siteFullAddress,
  onCompleted,
}: Props) {
  const { toast } = useToast();
  const { draft, loading, saving, error, patch, complete } = useWorkReportDraft(visit, userId);
  const [stepIdx, setStepIdx] = useState(0);
  const [completing, setCompleting] = useState(false);

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-3">
        <p className="text-sm font-medium text-destructive">Couldn't open this work report.</p>
        <p className="text-xs text-muted-foreground break-words">{error.message}</p>
      </div>
    );
  }

  if (loading || !draft) {
    return <WizardLoadingState />;
  }

  const patchScalars = (updates: Partial<WorkReportDraft>) => {
    void patch(updates);
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await complete();
      toast({ title: "Work report completed" });
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
      {stepIdx === 0 && (
        <JobStep
          draft={draft}
          onPatch={patchScalars}
          siteName={siteName}
          siteContactName={siteContactName}
          siteFullAddress={siteFullAddress}
        />
      )}
      {stepIdx === 1 && <WorksStep draft={draft} onPatch={patchScalars} />}
      {stepIdx === 2 && <MaterialsStep />}
      {stepIdx === 3 && (
        <PhotosStep
          photoCount={draft.photos.length}
          fileCount={draft.report_files.length}
        />
      )}
      {stepIdx === 4 && (
        <SignStep
          draft={draft}
          onPatch={patchScalars}
          onComplete={handleComplete}
          completing={completing}
          visitDate={visit.visit_date}
        />
      )}
    </WizardShell>
  );
}

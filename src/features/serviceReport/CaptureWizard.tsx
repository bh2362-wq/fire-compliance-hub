import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Visit } from "@/hooks/useVisits";
import { ServiceReport, BS5839Checklist } from "@/services/serviceReportService";
import { useServiceReportDraft } from "./useServiceReportDraft";
import { WizardShell, WizardLoadingState } from "@/features/_shared/WizardShell";
import { SystemStep } from "./steps/SystemStep";
import { DevicesStep } from "./steps/DevicesStep";
import { ChecklistStep } from "./steps/ChecklistStep";
import { FindingsStep } from "./steps/FindingsStep";
import { DepartureStep } from "./steps/DepartureStep";
import { SignOffStep } from "./steps/SignOffStep";

interface Props {
  visit: Visit;
  userId: string;
  onCompleted?: (report: ServiceReport) => void;
}

const STEP_LABELS = [
  "System",
  "Devices",
  "Checklist",
  "Findings",
  "Departure",
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

  if (loading || !report) {
    return <WizardLoadingState />;
  }

  // Adapter so steps with focused signatures still go through `patch`.
  const patchScalars = (updates: Partial<ServiceReport>) => {
    void patch(updates);
  };
  const patchChecklist = (next: BS5839Checklist) => {
    void patch({ checklist: next });
  };

  return (
    <WizardShell
      stepLabels={STEP_LABELS}
      stepIdx={stepIdx}
      setStepIdx={setStepIdx}
      saving={saving}
    >
      {stepIdx === 0 && (
        <SystemStep visit={visit} report={report} onPatch={patchScalars} siteId={visit.site_id} />
      )}
      {stepIdx === 1 && <DevicesStep visitId={visit.id} siteId={visit.site_id} />}
      {stepIdx === 2 && (
        <ChecklistStep checklist={report.checklist} onChange={patchChecklist} />
      )}
      {stepIdx === 3 && (
        <FindingsStep
          report={report}
          onPatch={patchScalars}
          siteId={visit.site_id}
          visitId={visit.id}
          reportId={report.id}
        />
      )}
      {stepIdx === 4 && <DepartureStep report={report} onPatch={patchScalars} />}
      {stepIdx === 5 && (
        <SignOffStep
          report={report}
          onPatch={patchScalars}
          onComplete={handleComplete}
          completing={completing}
        />
      )}
    </WizardShell>
  );
}

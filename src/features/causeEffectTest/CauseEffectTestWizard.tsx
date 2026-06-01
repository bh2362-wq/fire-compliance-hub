import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { Visit } from "@/hooks/useVisits";
import { WizardShell, WizardLoadingState } from "@/features/_shared/WizardShell";
import { DevicesStep } from "@/features/serviceReport/steps/DevicesStep";
import { useCauseEffectTestDraft } from "./useCauseEffectTestDraft";
import { CauseEffectSystemStep } from "./steps/CauseEffectSystemStep";
import { OutputFunctionsStep } from "./steps/OutputFunctionsStep";
import { AudibilityStep } from "./steps/AudibilityStep";
import { FindingsRemedialsStep } from "./steps/FindingsRemedialsStep";
import { CauseEffectSignOffStep } from "./steps/CauseEffectSignOffStep";
import { PasteAINotesDialog } from "@/components/notes-paste/PasteAINotesDialog";
import { supabase } from "@/integrations/supabase/client";

// Heuristic — pick the ce_issues.kind a defect should land under by
// scanning its text for cause-effect-specific keywords (interface,
// output, lift, BMS, door holder, shutdown). Anything else is treated
// as an audibility issue, which is what most extracted C&E defects
// turn out to be (sound levels, missing VADs, etc).
function classifyCEKind(text: string): "audibility" | "cause_effect" {
  const hay = text.toLowerCase();
  if (
    /\b(lift|bms|cause and effect|interface|output|door holder|shutdown|relay)\b/.test(hay)
  ) {
    return "cause_effect";
  }
  return "audibility";
}

// Map our cat 1/2/3 to ce_issues.severity. The DB column has a
// CHECK constraint that only allows ('critical', 'non_critical') —
// don't expand without updating the migration. cat 1 → critical
// (immediate life-safety risk); cat 2 + 3 both → non_critical
// (impaired but operational).
const CE_SEVERITY: Record<1 | 2 | 3, "critical" | "non_critical"> = {
  1: "critical",
  2: "non_critical",
  3: "non_critical",
};

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
  const [pasteOpen, setPasteOpen] = useState(false);
  // Bumped after a successful paste-apply to force FindingsRemedialsStep
  // to refetch its ce_issues + ce_remedials lists (the step caches them
  // in local state and only fetches on mount otherwise).
  const [findingsRefreshKey, setFindingsRefreshKey] = useState(0);

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
          title="Paste AI notes (defects + observations)"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Paste notes</span>
        </Button>
      }
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
        <FindingsRemedialsStep
          report={report}
          onPatch={patchScalars}
          reportId={report.id}
          refreshKey={findingsRefreshKey}
        />
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

    {/* C&E only has general_observations + notes as text fields. We map
        the AI's `notes` addendum to general_observations (semantically
        the closest match) and ignore the other addenda. Defect extraction
        is the main value-add here — they go to site_defects same as
        DefectsStep in BS5839. */}
    <PasteAINotesDialog
      open={pasteOpen}
      onOpenChange={setPasteOpen}
      reportType="ce"
      siteId={visit.site_id}
      visitId={visit.id}
      reportId={report.id}
      currentValues={{
        notes: report.general_observations,
      }}
      onApply={async ({ defects, fieldUpdates }) => {
        // C&E defects DON'T go to site_defects — the C&E wizard reads its
        // findings list from ce_issues (separate table per the C&E data
        // model). Classify each as audibility vs cause_effect and insert.
        let inserted = 0;
        let failed = 0;
        for (const d of defects) {
          const haystack = `${d.description} ${d.recommended_action ?? ""} ${d.location ?? ""}`;
          const kind = classifyCEKind(haystack);
          try {
            const { error: insErr } = await (supabase as unknown as { from: (t: string) => any })
              .from("ce_issues")
              .insert({
                report_id: report.id,
                kind,
                location: d.location,
                description: d.description,
                severity: CE_SEVERITY[d.category],
                action_required: d.recommended_action,
              });
            if (insErr) {
              console.error("ce_issues insert:", insErr);
              failed++;
            } else {
              inserted++;
            }
          } catch (e) {
            console.error("Failed to create ce_issues row:", e);
            failed++;
          }
        }
        if (failed > 0) {
          toast({
            title: `${failed} of ${defects.length} defects failed to save`,
            description: "Check the browser console for the underlying error.",
            variant: "destructive",
          });
        }
        if (fieldUpdates.notes !== undefined) {
          await patch({ general_observations: fieldUpdates.notes });
        }
        // Tell the Findings step to refetch so the new rows appear without
        // a full page reload.
        if (inserted > 0) setFindingsRefreshKey((k) => k + 1);
      }}
    />
    </>
  );
}

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Visit } from "@/hooks/useVisits";
import { OfflineBadge } from "@/features/serviceReport/OfflineBadge";
import { useCauseEffectTestDraft } from "./useCauseEffectTestDraft";

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

/**
 * Skeleton wizard for the Cause & Effect + Audibility test report.
 *
 * Chrome mirrors the BS 5839 wizard (sticky progress header, fixed
 * footer with Back/Next, auto-save indicator) so engineers don't have
 * to relearn the navigation. Each step is currently a placeholder
 * describing what will go there — the actual capture UIs land in PR 2
 * once this scaffolding is merged and deployed.
 */
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

  if (loading || !report) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4">
        <p className="text-sm text-destructive">
          Couldn't load draft: {error.message}
        </p>
      </div>
    );
  }

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
          <PlaceholderStep
            title="System & visit"
            description={
              <>
                Will mirror the BS 5839 System step — site, visit type, panel
                make/model, zones, devices, ARC connection, BS 5839 category
                — all pre-filled from <code>sites</code> where the value
                already exists. The category drop-down (L1/L2/L3/L4/L5/M)
                lives here too.
              </>
            }
          />
        )}
        {stepIdx === 1 && (
          <PlaceholderStep
            title="Cause & effect devices tested"
            description={
              <>
                Reuses <code>parsed_device_tests</code>. Engineer ticks each
                zone's representative device with the time it was activated;
                rows align with the §3.2 table on the printed report.
              </>
            }
          />
        )}
        {stepIdx === 2 && (
          <PlaceholderStep
            title="Output functions verified"
            description={
              <>
                Seeded with the standard rows from §3.3 (Alarm Sounders, VADs,
                Fire Brigade Signal, ARC, Fire Door Releases, HVAC Shutdown,
                Smoke Control, Lift Homing, EM Lock Releases), each with
                Pass/Fail/N/A + free-text actual response. Writes to{" "}
                <code>ce_output_checks</code>.
              </>
            }
          />
        )}
        {stepIdx === 3 && (
          <PlaceholderStep
            title="Audibility readings"
            description={
              <>
                Sound-level meter free-text (make/model, serial, calibration
                due), then an add-row table of measurements: location, floor,
                ambient dB, alarm dB, required dB (defaults to 65, 75 for
                sleeping accommodation). Auto-computes Pass/Fail. Writes to{" "}
                <code>ce_audibility_readings</code>.
              </>
            }
          />
        )}
        {stepIdx === 4 && (
          <PlaceholderStep
            title="Findings & remedial works"
            description={
              <>
                Combines §5 (C&amp;E issues, audibility issues, general
                observations) and §6 (remedial work rows with priority,
                description, location, estimated cost). Critical issues can
                promote into <code>site_defects</code>.
              </>
            }
          />
        )}
        {stepIdx === 5 && (
          <PlaceholderStep
            title="Compliance &amp; sign-off"
            description={
              <>
                Single compliance toggle (BS 5839-1:2017), recommendations,
                next-test-due date, engineer + client signatures (canvas).
                Complete button promotes <code>status</code> to{" "}
                <code>completed</code>.
              </>
            }
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
          {stepIdx < STEP_LABELS.length - 1 ? (
            <Button
              onClick={() => setStepIdx((i) => Math.min(STEP_LABELS.length - 1, i + 1))}
              className="flex-1"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={completing} className="flex-1">
              {completing ? "Completing…" : "Complete (skeleton)"}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function PlaceholderStep({
  title,
  description,
}: {
  title: string;
  description: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">Placeholder — filled in next PR.</p>
      </div>
      <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm leading-relaxed">
        {description}
      </div>
    </div>
  );
}

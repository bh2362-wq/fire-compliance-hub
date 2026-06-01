import { ReactNode, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import { OfflineBadge } from "./OfflineBadge";

interface WizardShellProps {
  /** Ordered list of step labels — drives the step counter and progress %. */
  stepLabels: string[];
  /** Current step index (0-based). */
  stepIdx: number;
  /** Setter used by the Back/Next nav. */
  setStepIdx: (next: number) => void;
  /** Saving spinner in the header (drives the "Saving…" indicator). */
  saving?: boolean;
  /** Step body — typically branches on `stepIdx` to render the right step. */
  children: ReactNode;
  /**
   * Optional override for the Next-button area on the last step. When the
   * wizard wants to render a different action (e.g. "Complete report"),
   * provide it here and we'll swap it in for the Next button.
   */
  finalAction?: ReactNode;
}

/**
 * Shared wizard chrome — sticky header with step counter + progress bar,
 * sticky footer with Back/Next, and the offline/sync badge. Extracted from
 * the BS 5839 service-report and C&E wizards so each new feature wizard
 * (Disabled Refuge, ASD service, etc.) inherits the same shell instead of
 * reinventing it.
 */
export function WizardShell({
  stepLabels,
  stepIdx,
  setStepIdx,
  saving,
  children,
  finalAction,
}: WizardShellProps) {
  const total = stepLabels.length;
  const isLast = stepIdx >= total - 1;
  const progressPct = useMemo(
    () => Math.round(((stepIdx + 1) / total) * 100),
    [stepIdx, total],
  );

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <header className="sticky top-0 z-20 bg-background border-b -mx-4 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Step {stepIdx + 1} of {total} · {stepLabels[stepIdx]}
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

      <main className="px-4 pt-4">{children}</main>

      <footer className="fixed bottom-0 inset-x-0 bg-background border-t px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-2">
          <Button
            variant="outline"
            onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
            disabled={stepIdx === 0}
            className="flex-1"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          {isLast ? (
            finalAction ?? null
          ) : (
            <Button
              onClick={() => setStepIdx(Math.min(total - 1, stepIdx + 1))}
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

/** Centered loading spinner used while the draft row is being fetched. */
export function WizardLoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

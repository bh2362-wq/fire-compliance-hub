import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, FileDown, FileText, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCalloutWizard } from "./useCalloutWizard";
import { Step1Intake } from "./steps/Step1Intake";
import { Step2OnArrival } from "./steps/Step2OnArrival";
import { Step3Investigation } from "./steps/Step3Investigation";
import { Step4Materials } from "./steps/Step4Materials";
import { Step5Departure } from "./steps/Step5Departure";
import { Step6SignOff } from "./steps/Step6SignOff";
import { buildCalloutReportInput } from "@/services/calloutReportService";
import { generateCalloutReportPDF } from "@/lib/calloutReportPdfGenerator";
import {
  downloadCalloutReportDocx,
  downloadCalloutReportPdfViaCloud,
} from "@/services/calloutDocxService";

// CalloutWizard — replaces the old VisitCalloutPanel 4-section form
// with a 6-step flow that mirrors the on-site sequence:
//
//   1. Intake — who called, when, what for
//   2. On arrival — system state + zones + §2 photos
//   3. Investigation & actions
//   4. Materials & time
//   5. Departure & follow-up
//   6. Sign-off — engineer + client signatures
//
// Embeds inline in VisitEditDialog (no sticky chrome since the dialog
// already owns the scroll container). Step nav is free — engineers
// don't always work linearly and the schema accepts partial state at
// every step.

const STEPS = [
  { label: "Intake", short: "1" },
  { label: "On arrival", short: "2" },
  { label: "Investigation", short: "3" },
  { label: "Materials & time", short: "4" },
  { label: "Departure", short: "5" },
  { label: "Sign-off", short: "6" },
];

interface Props {
  visitId: string;
}

export function CalloutWizard({ visitId }: Props) {
  const state = useCalloutWizard(visitId);
  const [stepIdx, setStepIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generatingDocx, setGeneratingDocx] = useState(false);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading…
      </div>
    );
  }

  const handleSave = async () => {
    try {
      await state.save();
      toast.success("Callout details saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // Save first so the PDF reflects the in-memory edits the engineer
      // just made — avoids the "I clicked Generate but my last edit
      // isn't in the file" surprise.
      await state.save();
      try {
        // Preferred path: cloud DOCX→PDF via MS Graph, same chain as
        // C&E and quotes. Gives an Office-rendered PDF that matches
        // the .docx pixel-for-pixel.
        await downloadCalloutReportPdfViaCloud(visitId);
        toast.success("Callout Report downloaded");
      } catch (cloudErr) {
        // Cloud chain unavailable (storage RLS, MS Graph creds, deploy
        // lag, etc). Fall back to the legacy in-browser jsPDF
        // generator so the engineer always gets *a* PDF. Same fallback
        // strategy as useCauseEffectGeneration.
        const msg = cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
        console.error("[Callout PDF] cloud path failed; falling back to jsPDF:", cloudErr);
        toast.warning("Using legacy PDF format", {
          description: `Cloud generator unavailable: ${msg}`,
          duration: 10_000,
        });
        const input = await buildCalloutReportInput(visitId);
        await generateCalloutReportPDF(input);
      }
    } catch (e) {
      toast.error((e as Error).message || "Could not generate PDF");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateDocx = async () => {
    setGeneratingDocx(true);
    try {
      // Save first so the file reflects the in-memory edits. Same
      // reasoning as handleGenerate above.
      await state.save();
      await downloadCalloutReportDocx(visitId);
      toast.success("Callout Report DOCX downloaded");
    } catch (e) {
      toast.error((e as Error).message || "Could not generate DOCX");
    } finally {
      setGeneratingDocx(false);
    }
  };

  const isLast = stepIdx === STEPS.length - 1;

  return (
    <div className="space-y-4">
      {/* Stepper — clickable dots so engineers can jump back to fix a
          field without clicking Back five times. */}
      <ol className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const active = i === stepIdx;
          const done = i < stepIdx;
          return (
            <li key={s.label} className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setStepIdx(i)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors",
                  active && "bg-primary text-primary-foreground font-medium",
                  !active && done && "bg-muted text-foreground",
                  !active && !done && "text-muted-foreground hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "inline-flex w-4 h-4 items-center justify-center rounded-full text-[10px]",
                    active && "bg-primary-foreground/20",
                    !active && done && "bg-foreground/10",
                    !active && !done && "border border-current",
                  )}
                >
                  {s.short}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="text-muted-foreground/40">·</span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Active step body */}
      <div>
        {stepIdx === 0 && <Step1Intake state={state} />}
        {stepIdx === 1 && <Step2OnArrival visitId={visitId} state={state} />}
        {stepIdx === 2 && <Step3Investigation state={state} />}
        {stepIdx === 3 && <Step4Materials state={state} />}
        {stepIdx === 4 && <Step5Departure state={state} />}
        {stepIdx === 5 && <Step6SignOff state={state} />}
      </div>

      {/* Nav + actions. Save is always available; Generate is shown
          alongside on the final step (matches the old panel's UX) and
          also from any step so the engineer can grab a draft PDF. */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
          disabled={stepIdx === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateDocx}
            disabled={generating || generatingDocx || state.saving}
          >
            {generatingDocx ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Generating DOCX…
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-1" />
                Save &amp; download DOCX
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={generating || generatingDocx || state.saving}
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Generating PDF…
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4 mr-1" />
                Save &amp; download PDF
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={state.saving || generating || generatingDocx}
          >
            {state.saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1" />
                Save
              </>
            )}
          </Button>
          {!isLast && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1))}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Loader2, Pause, Play, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { DefectAnalysis } from "./useLiveDefectAnalysis";
import type { AiUsageSnapshot } from "@/services/aiUsageService";
import { formatGBP as formatUsageGBP } from "@/services/aiUsageService";
import {
  scorePart,
  scoreDefect,
  countNonHighParts,
  CONFIDENCE_COLOURS,
  CONFIDENCE_LABEL,
} from "./aiConfidence";
import { createDraftQuoteFromAnalysis } from "@/services/draftQuoteFromDefectsService";

interface Props {
  analysis: DefectAnalysis | null;
  loading: boolean;
  error: Error | null;
  paused: boolean;
  setPaused: (v: boolean) => void;
  refresh: () => void;
  /** Cost meter data — null until first usage fetch lands. */
  usage: AiUsageSnapshot | null;

  // Required to persist as a draft quote.
  siteId: string;
  visitId: string;
  reportId: string;
  customerId: string | null;
  userId: string;
  siteName: string;
}

const CATEGORY_COLOURS: Record<1 | 2 | 3, string> = {
  1: "bg-red-100 text-red-800 border-red-200",
  2: "bg-amber-100 text-amber-800 border-amber-200",
  3: "bg-blue-100 text-blue-800 border-blue-200",
};

function formatGBP(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

/**
 * Sticky pill above the wizard footer that shows AI-detected defect count
 * + running total. Tapping opens a bottom sheet with the full draft quote
 * breakdown + a "Save as draft quote" action.
 *
 * Renders nothing until the first analysis comes back (so the wizard chrome
 * stays clean for engineers who don't have any defects to flag yet). Once
 * shown, persists between steps so engineers can drop back to free-text
 * fields and see the panel react.
 */
export function LiveDefectQuotePanel({
  analysis,
  loading,
  error,
  paused,
  setPaused,
  refresh,
  usage,
  siteId,
  visitId,
  reportId,
  customerId,
  userId,
  siteName,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // The verify-before-save checkbox gates the CTA when the analysis
  // contains any non-high-confidence parts. Reset whenever the analysis
  // changes (new defects = new things to verify).
  const [verified, setVerified] = useState(false);
  const nonHighParts = analysis ? countNonHighParts(analysis.defects) : 0;
  const requireVerify = nonHighParts > 0;
  // Any new analysis result invalidates the engineer's prior verification.
  useEffect(() => {
    setVerified(false);
  }, [analysis?.content_hash]);

  // Hide the pill entirely until we have something to surface. Loading is
  // shown as a faint "Thinking…" so engineers know AI is working.
  const showPill = !!analysis || loading || !!error;
  if (!showPill) return null;

  const defectCount = analysis?.defects.length ?? 0;
  const subtotal = analysis?.totals.subtotal ?? 0;

  const handleSave = async () => {
    if (!analysis || analysis.defects.length === 0) return;
    setSaving(true);
    try {
      const { id, quotation_number } = await createDraftQuoteFromAnalysis({
        analysis,
        siteId,
        visitId,
        reportId,
        customerId,
        userId,
        siteName,
      });
      toast({
        title: `Draft quote ${quotation_number} created`,
        description: "Open in Quotes to review + send.",
      });
      setOpen(false);
      // Don't auto-navigate — engineer is mid-report. Office reviews later.
      // But surface a one-tap "Open quote" via the toast description on web.
      void id;
    } catch (e) {
      toast({
        title: "Could not save draft quote",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Sticky pill — positioned above the wizard's fixed footer (which is
          bottom:0 + ~64px tall). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[68px] inset-x-0 mx-auto z-30 max-w-md w-[calc(100%-2rem)] rounded-full bg-primary text-primary-foreground shadow-lg px-4 py-3 flex items-center justify-between gap-3 text-sm hover:opacity-95 active:scale-[0.98] transition"
      >
        <span className="flex items-center gap-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : error ? (
            <Wand2 className="h-4 w-4 text-amber-200" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span className="font-medium">
            {loading
              ? "Analysing report…"
              : error
              ? "AI paused — tap to retry"
              : defectCount === 0
              ? "No remedials detected"
              : `${defectCount} defect${defectCount === 1 ? "" : "s"} · ${formatGBP(subtotal)}`}
          </span>
        </span>
        {!loading && !error && defectCount > 0 && (
          <span className="text-xs opacity-80">Tap to view</span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Draft remedial quote
            </SheetTitle>
            <SheetDescription>
              AI analysis of the live report. Updates as you type — review and save when ready.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaused(!paused)}
              title={paused ? "Resume live analysis" : "Pause live analysis"}
            >
              {paused ? (
                <>
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5 mr-1.5" />
                  Pause
                </>
              )}
            </Button>
            {analysis && (
              <Badge variant="outline" className="ml-auto text-[10px]">
                Updated {Math.round((Date.now() - analysis.generated_at) / 1000)}s ago
              </Badge>
            )}
          </div>

          {usage && (
            <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-[11px] flex items-center justify-between gap-2 text-muted-foreground">
              <span>
                Today: <span className="text-foreground font-medium">{formatUsageGBP(usage.spentTodayGbp)}</span>{" "}
                · {usage.runsToday}/{usage.dailyRunCap} runs
              </span>
              {analysis && (
                <span title="Approximate cost of the most recent AI call">
                  Last call: <span className="text-foreground font-medium">{formatUsageGBP(analysis.last_call_cost_gbp)}</span>
                </span>
              )}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {error.message}
            </div>
          )}

          {!analysis && !loading && !error && (
            <p className="mt-6 text-sm text-muted-foreground">Waiting for first analysis…</p>
          )}

          {analysis && (
            <div className="mt-4 space-y-4">
              {analysis.scope_introduction && (
                <div className="rounded border bg-muted/40 p-3 text-sm leading-relaxed">
                  {analysis.scope_introduction}
                </div>
              )}

              {analysis.defects.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No remedial works detected from the current report state.
                </p>
              ) : (
                <div className="space-y-3">
                  {analysis.defects.map((d, i) => {
                    const defectLevel = scoreDefect(d);
                    return (
                    <div key={i} className="rounded border bg-card p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={CATEGORY_COLOURS[d.category]}>
                            Cat {d.category}
                          </Badge>
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${CONFIDENCE_COLOURS[defectLevel]}`}
                            title={CONFIDENCE_LABEL[defectLevel]}
                            aria-label={CONFIDENCE_LABEL[defectLevel]}
                          />
                          {d.source === "extracted" && (
                            <Badge variant="outline" className="text-[10px]">
                              From notes
                            </Badge>
                          )}
                          {d.location && (
                            <span className="text-xs text-muted-foreground">{d.location}</span>
                          )}
                        </div>
                        <span className="text-sm font-semibold">{formatGBP(d.subtotal)}</span>
                      </div>
                      <p className="text-sm">{d.description}</p>
                      {d.scope_note && (
                        <p className="text-xs text-muted-foreground italic">{d.scope_note}</p>
                      )}
                      {d.suggested_parts.length > 0 && (
                        <ul className="text-xs space-y-1 mt-1">
                          {d.suggested_parts.map((p, j) => {
                            const conf = scorePart(p);
                            return (
                            <li key={j} className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 truncate">
                                <span
                                  className={`shrink-0 h-1.5 w-1.5 rounded-full ${CONFIDENCE_COLOURS[conf.level]}`}
                                  title={conf.reason}
                                  aria-label={conf.reason}
                                />
                                <span className="truncate">
                                  <span className="font-mono">{p.part_number}</span>{" "}
                                  <span className="text-muted-foreground">— {p.description}</span>
                                  {!p.catalog_match && (
                                    <Badge variant="outline" className="ml-1 text-[10px] text-amber-700 border-amber-300">
                                      Est.
                                    </Badge>
                                  )}
                                </span>
                              </span>
                              <span className="shrink-0 text-muted-foreground">
                                {p.qty} × {formatGBP(p.unit_price)}
                              </span>
                            </li>
                            );
                          })}
                        </ul>
                      )}
                      {d.labour_hours > 0 && (
                        <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                          <span>Labour — {d.labour_hours.toFixed(2)} hr</span>
                          <span>{formatGBP(d.labour_cost)}</span>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}

              <div className="rounded-lg border-t pt-3 mt-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Parts</span>
                  <span>{formatGBP(analysis.totals.parts)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Labour</span>
                  <span>{formatGBP(analysis.totals.labour)}</span>
                </div>
                <div className="flex items-center justify-between font-semibold pt-1 border-t">
                  <span>Subtotal (ex VAT)</span>
                  <span>{formatGBP(analysis.totals.subtotal)}</span>
                </div>
              </div>

              {requireVerify && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                  <p className="text-xs text-amber-900">
                    <strong>{nonHighParts} line{nonHighParts === 1 ? "" : "s"}</strong> need a
                    manual check before this becomes a real quote. Amber dots = catalog match
                    with unusual price/format. Red dots = AI estimate. Open the office Quotes
                    section to edit prices + swap to real catalog parts if needed.
                  </p>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="verify-parts"
                      checked={verified}
                      onCheckedChange={(v) => setVerified(v === true)}
                    />
                    <Label htmlFor="verify-parts" className="text-xs cursor-pointer">
                      I've reviewed the flagged lines and they look reasonable.
                    </Label>
                  </div>
                </div>
              )}

              <Button
                onClick={handleSave}
                disabled={
                  saving ||
                  analysis.defects.length === 0 ||
                  loading ||
                  (requireVerify && !verified)
                }
                className="w-full"
                size="lg"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>Save as draft quote</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Saved drafts appear in the Quotes section for the office to finalise and send.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

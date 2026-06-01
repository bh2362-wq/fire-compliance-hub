import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DefectCategory } from "@/services/defectService";
import { getCachedExtraction, hashExtractionInput, setCachedExtraction } from "./extractionCache";

export type PasteReportType = "bs5839" | "asd" | "drm" | "work" | "ce";

interface ExtractedDefect {
  description: string;
  category: 1 | 2 | 3;
  location: string | null;
  recommended_action: string | null;
}

interface ExtractedFields {
  defects_found_addendum?: string | null;
  recommendations_addendum?: string | null;
  work_carried_out_addendum?: string | null;
  system_condition_addendum?: string | null;
  notes_addendum?: string | null;
}

interface ExtractOutput {
  defects: ExtractedDefect[];
  fields: ExtractedFields;
  summary: string;
}

/**
 * Mapping from the wizard's report-row columns to the AI's addendum keys.
 * The text-field column names differ across report types (BS5839 uses
 * `defects_found` / `recommendations`; Work Report mirrors a similar set
 * into its notes JSON; etc.). The caller provides `currentValues` keyed by
 * the AI's addendum names so the dialog can show a sensible
 * preview-and-merge view without knowing per-type column conventions.
 */
export interface CurrentFieldValues {
  defects_found?: string | null;
  recommendations?: string | null;
  work_carried_out?: string | null;
  system_condition?: string | null;
  notes?: string | null;
}

/** What the caller will apply when the engineer hits "Apply selected". */
export interface PasteApplyResult {
  /** Defects the engineer ticked, ready to write to site_defects. */
  defects: ExtractedDefect[];
  /** Each selected addendum, already concatenated with the existing
      value (existing + "\n\n" + addendum). Caller patches these straight
      onto the report row. Keys are the AI's field names. */
  fieldUpdates: {
    defects_found?: string;
    recommendations?: string;
    work_carried_out?: string;
    system_condition?: string;
    notes?: string;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportType: PasteReportType;
  /** For creating site_defects rows. */
  siteId: string;
  visitId: string;
  reportId: string;
  currentValues: CurrentFieldValues;
  /**
   * Called after the engineer has ticked items + hit Apply, AFTER the
   * defects have already been written to site_defects. The caller patches
   * the report row with `fieldUpdates`. The dialog closes itself.
   */
  onApply: (result: PasteApplyResult) => Promise<void>;
}

const FIELD_LABELS: Record<keyof ExtractedFields, string> = {
  defects_found_addendum: "Defects found",
  recommendations_addendum: "Recommendations",
  work_carried_out_addendum: "Work carried out",
  system_condition_addendum: "System condition",
  notes_addendum: "Notes",
};

const FIELD_TO_REPORT: Record<keyof ExtractedFields, keyof PasteApplyResult["fieldUpdates"]> = {
  defects_found_addendum: "defects_found",
  recommendations_addendum: "recommendations",
  work_carried_out_addendum: "work_carried_out",
  system_condition_addendum: "system_condition",
  notes_addendum: "notes",
};

const CATEGORY_COLOURS: Record<DefectCategory, string> = {
  1: "bg-red-100 text-red-800 border-red-200",
  2: "bg-amber-100 text-amber-800 border-amber-200",
  3: "bg-blue-100 text-blue-800 border-blue-200",
};

type Stage = "paste" | "extracting" | "review" | "applying";

export function PasteAINotesDialog({
  open,
  onOpenChange,
  reportType,
  siteId,
  visitId,
  reportId,
  currentValues,
  onApply,
}: Props) {
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("paste");
  const [text, setText] = useState("");
  const [extracted, setExtracted] = useState<ExtractOutput | null>(null);
  const [defectsSelected, setDefectsSelected] = useState<boolean[]>([]);
  const [fieldsSelected, setFieldsSelected] = useState<
    Partial<Record<keyof ExtractedFields, boolean>>
  >({});

  // Reset everything whenever the dialog reopens. Avoids the engineer
  // seeing stale preview state if they bail and come back later.
  useEffect(() => {
    if (!open) return;
    setStage("paste");
    setText("");
    setExtracted(null);
    setDefectsSelected([]);
    setFieldsSelected({});
  }, [open]);

  const populatedFields = useMemo(() => {
    if (!extracted) return [];
    const out: Array<{ key: keyof ExtractedFields; value: string }> = [];
    for (const k of Object.keys(FIELD_LABELS) as Array<keyof ExtractedFields>) {
      const v = extracted.fields[k];
      if (typeof v !== "string" || v.trim().length === 0) continue;
      // Only show fields the parent wizard can actually persist. The wizard
      // declares its supported fields by including the AI's report-column
      // name as a key in `currentValues` (even if the value is "" / null).
      // Without this filter, the dialog would let the engineer tick fields
      // that get silently dropped on apply — exactly the C&E case where
      // only `notes` maps to a real column.
      const reportKey = FIELD_TO_REPORT[k];
      if (!(reportKey in currentValues)) continue;
      out.push({ key: k, value: v });
    }
    return out;
  }, [extracted, currentValues]);

  const handleExtract = async () => {
    if (text.trim().length < 20) {
      toast({ title: "Paste a bit more", description: "Need at least a couple of sentences for the AI to work with.", variant: "destructive" });
      return;
    }

    // Cache check — same notes_text + same report_type → reuse the prior
    // AI output. Saves a Claude call AND gives instant feedback when the
    // engineer pastes the same thing twice (apply failed, retried, etc).
    const cacheHash = hashExtractionInput(reportType, text);
    const cached = getCachedExtraction<ExtractOutput>(cacheHash);
    if (cached) {
      setExtracted(cached);
      setDefectsSelected((cached.defects ?? []).map(() => true));
      const cachedDefaults: Partial<Record<keyof ExtractedFields, boolean>> = {};
      for (const k of Object.keys(FIELD_LABELS) as Array<keyof ExtractedFields>) {
        const v = cached.fields?.[k];
        if (typeof v === "string" && v.trim().length > 0) cachedDefaults[k] = true;
      }
      setFieldsSelected(cachedDefaults);
      setStage("review");
      toast({
        title: "Reused previous extraction",
        description: "Same notes as before — loaded the cached AI result instead of re-calling.",
      });
      return;
    }

    setStage("extracting");
    try {
      const { data, error } = await supabase.functions.invoke("extract-report-notes", {
        body: { report_type: reportType, notes_text: text },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const output = data as ExtractOutput;
      setExtracted(output);
      setDefectsSelected(((output.defects ?? []) as ExtractedDefect[]).map(() => true));
      const fieldDefaults: Partial<Record<keyof ExtractedFields, boolean>> = {};
      for (const k of Object.keys(FIELD_LABELS) as Array<keyof ExtractedFields>) {
        const v = (output.fields as ExtractedFields)?.[k];
        if (typeof v === "string" && v.trim().length > 0) fieldDefaults[k] = true;
      }
      setFieldsSelected(fieldDefaults);
      setStage("review");
      // Cache for next time.
      setCachedExtraction(cacheHash, output);
    } catch (e) {
      toast({ title: "Extraction failed", description: (e as Error).message, variant: "destructive" });
      setStage("paste");
    }
  };

  const handleApply = async () => {
    if (!extracted) return;
    setStage("applying");
    try {
      // Selected defects — delegated to the caller via onApply so each
      // wizard can route them to the right table. BS5839 / ASD / DRM /
      // Work want site_defects; C&E uses its own ce_issues. The dialog
      // stays persistence-agnostic.
      const defectsToCreate = extracted.defects.filter((_, i) => defectsSelected[i]);

      // Selected field addenda — concatenated onto existing report text
      // with a paragraph break so AI prose reads as a continuation.
      // Skip addenda whose report key isn't in currentValues (the wizard
      // has told us it can't persist that field).
      const fieldUpdates: PasteApplyResult["fieldUpdates"] = {};
      for (const [key, selected] of Object.entries(fieldsSelected) as Array<
        [keyof ExtractedFields, boolean]
      >) {
        if (!selected) continue;
        const addendum = extracted.fields[key];
        if (typeof addendum !== "string" || addendum.trim().length === 0) continue;
        const reportKey = FIELD_TO_REPORT[key];
        if (!(reportKey in currentValues)) continue;
        const existing = currentValues[reportKey] ?? "";
        fieldUpdates[reportKey] =
          existing.trim().length > 0 ? `${existing.trim()}\n\n${addendum.trim()}` : addendum.trim();
      }

      await onApply({ defects: defectsToCreate, fieldUpdates });

      toast({
        title: "Applied",
        description: `${defectsToCreate.length} defect${defectsToCreate.length === 1 ? "" : "s"} + ${Object.keys(fieldUpdates).length} field${Object.keys(fieldUpdates).length === 1 ? "" : "s"} updated.`,
      });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Apply failed", description: (e as Error).message, variant: "destructive" });
      setStage("review");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-lg">
        <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Paste notes from ChatGPT
          </DialogTitle>
          <DialogDescription>
            Paste your AI chat summary or freeform notes — we'll extract defects + suggested
            updates for each report field. You pick what to apply.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-4">
          {stage === "paste" || stage === "extracting" ? (
            <>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the AI summary or your visit notes here. The fuller the input, the better the extraction."
                className="min-h-[260px]"
                disabled={stage === "extracting"}
              />
              <p className="text-xs text-muted-foreground">
                Defects you tick on the next screen become real entries in the site defect register.
                Field updates are appended to existing text, never replace it.
              </p>
            </>
          ) : extracted ? (
            <>
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <span className="font-medium">Summary: </span>
                {extracted.summary || "No summary returned."}
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Defects ({extracted.defects.length})
                </h3>
                {extracted.defects.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No actionable defects extracted.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {extracted.defects.map((d, i) => (
                      <li key={i} className="rounded-lg border bg-card p-3 flex gap-3">
                        <Checkbox
                          checked={defectsSelected[i] ?? false}
                          onCheckedChange={(v) => {
                            const next = [...defectsSelected];
                            next[i] = v === true;
                            setDefectsSelected(next);
                          }}
                          className="mt-0.5 h-5 w-5"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={CATEGORY_COLOURS[d.category]}>
                              Cat {d.category}
                            </Badge>
                            {d.location && (
                              <span className="text-xs text-muted-foreground">{d.location}</span>
                            )}
                          </div>
                          <p className="text-sm">{d.description}</p>
                          {d.recommended_action && (
                            <p className="text-xs text-muted-foreground italic">
                              Recommended: {d.recommended_action}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Field updates</h3>
                {populatedFields.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No field text suggested.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {populatedFields.map(({ key, value }) => {
                      const existing = currentValues[FIELD_TO_REPORT[key]] ?? "";
                      return (
                        <li key={key} className="rounded-lg border bg-card p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`field-${key}`}
                              checked={fieldsSelected[key] ?? false}
                              onCheckedChange={(v) =>
                                setFieldsSelected((prev) => ({ ...prev, [key]: v === true }))
                              }
                              className="h-5 w-5"
                            />
                            <Label htmlFor={`field-${key}`} className="text-sm font-medium cursor-pointer">
                              {FIELD_LABELS[key]}
                            </Label>
                          </div>
                          <div className="text-xs space-y-1 ml-7">
                            {existing.trim().length > 0 && (
                              <>
                                <p className="text-muted-foreground">Will be appended to:</p>
                                <p className="line-clamp-2 italic text-muted-foreground">
                                  {existing}
                                </p>
                                <p className="text-muted-foreground">— —</p>
                              </>
                            )}
                            <p>{value}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter className="px-4 sm:px-6 py-3 border-t shrink-0 flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={stage === "extracting" || stage === "applying"}
            className="sm:flex-initial"
          >
            Cancel
          </Button>
          {(stage === "paste" || stage === "extracting") && (
            <Button
              onClick={handleExtract}
              disabled={stage === "extracting" || text.trim().length < 20}
              className="flex-1 sm:flex-initial"
            >
              {stage === "extracting" ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Extracting…
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Extract
                </>
              )}
            </Button>
          )}
          {stage === "review" || stage === "applying" ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setStage("paste")}
                disabled={stage === "applying"}
              >
                Edit text
              </Button>
              <Button
                onClick={handleApply}
                disabled={stage === "applying"}
                className="flex-1 sm:flex-initial"
              >
                {stage === "applying" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Applying…
                  </>
                ) : (
                  "Apply selected"
                )}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

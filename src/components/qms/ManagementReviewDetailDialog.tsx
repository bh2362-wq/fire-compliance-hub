import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Save, CheckCircle2, Loader2, Trash2, Plus, FileText, ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchManagementReview, updateManagementReview, QMSManagementReview,
} from "@/services/qmsService";

// Full ISO 9001 clause 9.3 review editor.
//   - 12 inputs (clause 9.3.2) — each can be ticked + given a note.
//     We persist the whole set onto `kpi_data` (jsonb) as
//     { inputs: { [key]: { covered: boolean, note: string } } }.
//     That keeps the agreed-upon column intact and lets the
//     dashboard pull it later for a clause-coverage view.
//   - 6 outputs (clause 9.3.3) — free-form text per output, stored on
//     `decisions` jsonb as an ordered list.
//   - Action items — typed list, each with title / assignee / deadline,
//     stored on `action_items` jsonb. The CAPAs page already does its
//     own thing; this is the cheaper inline list per review.
//   - Minutes — free text (`minutes` column).
//   - Status transitions:
//       scheduled  → "Start review"   → in_progress
//       in_progress → "Mark complete" → completed (asks for
//                                       next_review_date if blank)
//
// Locked mode: when status='completed' everything is read-only. The
// dialog still opens so an auditor can inspect what was decided.

const INPUTS_9_3_2 = [
  { key: "previous_actions",    label: "Status of actions from previous reviews" },
  { key: "external_internal",   label: "Changes in external and internal issues" },
  { key: "customer_satisfaction", label: "Customer satisfaction and feedback" },
  { key: "quality_objectives",  label: "Quality objectives and performance" },
  { key: "process_performance", label: "Process performance and product conformity" },
  { key: "ncrs_capas",          label: "Nonconformities and corrective actions" },
  { key: "monitoring_results",  label: "Monitoring and measurement results" },
  { key: "audit_results",       label: "Audit results" },
  { key: "supplier_performance", label: "Supplier performance" },
  { key: "resource_adequacy",   label: "Resource adequacy" },
  { key: "risk_effectiveness",  label: "Risk and opportunity actions effectiveness" },
  { key: "improvement_opportunities", label: "Improvement opportunities" },
];

const OUTPUTS_9_3_3 = [
  { key: "improvement",          label: "Improvement opportunities" },
  { key: "qms_changes",          label: "Need for changes to the QMS" },
  { key: "resource_needs",       label: "Resource needs" },
  { key: "decisions_actions",    label: "Decisions and actions taken" },
  { key: "objectives_updates",   label: "Updated quality objectives" },
  { key: "responsibilities",     label: "Assigned responsibilities and deadlines" },
];

interface InputState { covered: boolean; note: string }
interface ActionItem { id: string; title: string; assignee: string; deadline: string; done: boolean }

interface Props {
  reviewId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export function ManagementReviewDetailDialog({ reviewId, open, onOpenChange, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [review, setReview] = useState<QMSManagementReview | null>(null);

  const [inputs, setInputs] = useState<Record<string, InputState>>({});
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [minutes, setMinutes] = useState("");
  const [nextReviewDate, setNextReviewDate] = useState("");

  // Hydrate every time the dialog opens for a different review.
  useEffect(() => {
    if (!open || !reviewId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const row = await fetchManagementReview(reviewId);
        if (cancelled) return;
        setReview(row);

        const rawInputs = (row.kpi_data?.inputs ?? {}) as Record<string, InputState>;
        const initial: Record<string, InputState> = {};
        for (const i of INPUTS_9_3_2) {
          initial[i.key] = rawInputs[i.key] ?? { covered: false, note: "" };
        }
        setInputs(initial);

        const rawDecisions = (row.decisions ?? []) as Array<{ key: string; text: string }>;
        const decisionMap: Record<string, string> = {};
        for (const d of rawDecisions) {
          if (d && typeof d === "object" && "key" in d) decisionMap[d.key] = d.text ?? "";
        }
        const outInit: Record<string, string> = {};
        for (const o of OUTPUTS_9_3_3) outInit[o.key] = decisionMap[o.key] ?? "";
        setOutputs(outInit);

        const rawActions = (row.action_items ?? []) as ActionItem[];
        setActionItems(Array.isArray(rawActions) ? rawActions : []);
        setMinutes(row.minutes ?? "");
        setNextReviewDate(row.next_review_date ?? "");
      } catch (e) {
        toast.error("Couldn't load review", { description: (e as Error).message ?? "Unknown error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, reviewId]);

  const locked = review?.status === "completed";

  const buildPatch = (statusOverride?: "scheduled" | "in_progress" | "completed") => ({
    status: statusOverride ?? (review?.status as "scheduled" | "in_progress" | "completed"),
    kpi_data: { ...(review?.kpi_data ?? {}), inputs } as Record<string, unknown>,
    decisions: OUTPUTS_9_3_3.map((o) => ({ key: o.key, label: o.label, text: outputs[o.key] ?? "" })),
    action_items: actionItems,
    minutes: minutes || null,
    next_review_date: nextReviewDate || null,
  });

  const handleSave = async () => {
    if (!review) return;
    setSaving(true);
    try {
      // First save automatically transitions a 'scheduled' row to
      // 'in_progress' so the page Card stops showing the schedule-only
      // affordance and reflects the active editing state.
      const nextStatus = review.status === "scheduled" ? "in_progress" : (review.status as "scheduled" | "in_progress" | "completed");
      await updateManagementReview(review.id, buildPatch(nextStatus));
      toast.success("Review saved");
      onChanged?.();
      // Local-update so the rest of the UI reflects the new status
      // without a full refetch.
      setReview({ ...review, status: nextStatus });
    } catch (e) {
      const obj = e as { message?: string; details?: string; code?: string };
      toast.error("Save failed", {
        description: [obj.message, obj.details, obj.code ? `[${obj.code}]` : null].filter(Boolean).join(" — "),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!review) return;
    if (!nextReviewDate) {
      toast.error("Pick a Next review date before completing", {
        description: "ISO 9001 needs the schedule for the next cycle on record.",
      });
      return;
    }
    setCompleting(true);
    try {
      await updateManagementReview(review.id, buildPatch("completed"));
      toast.success("Management review completed", {
        description: `${review.review_number} closed. Next review: ${nextReviewDate}.`,
      });
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      toast.error("Couldn't mark complete", { description: (e as Error).message ?? "Unknown error" });
    } finally {
      setCompleting(false);
    }
  };

  const addAction = () => {
    setActionItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: "", assignee: "", deadline: "", done: false },
    ]);
  };
  const updateAction = (id: string, patch: Partial<ActionItem>) => {
    setActionItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };
  const removeAction = (id: string) => {
    setActionItems((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FileText className="w-5 h-5" />
            {review?.review_number ?? "Management review"}
            {review && (
              <Badge variant="outline" className="capitalize">{review.status.replace("_", " ")}</Badge>
            )}
            {locked && <Badge variant="secondary">Read-only</Badge>}
          </DialogTitle>
          <DialogDescription>
            ISO 9001 clause 9.3 — capture inputs, outputs, decisions and the actions out.
            {locked ? " This review is closed; reopen via Edit if a correction is needed." : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !review ? (
          <p className="text-sm text-muted-foreground">Review not found.</p>
        ) : (
          <div className="space-y-6">
            {/* Inputs (9.3.2) */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <ListChecks className="w-4 h-4" /> Inputs (clause 9.3.2)
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Tick each input as covered during the meeting; add a one-line evidence note.
              </p>
              <div className="space-y-2">
                {INPUTS_9_3_2.map((i) => {
                  const s = inputs[i.key] ?? { covered: false, note: "" };
                  return (
                    <div key={i.key} className="rounded-md border border-border p-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border accent-primary"
                          checked={s.covered}
                          onChange={(e) => setInputs((prev) => ({ ...prev, [i.key]: { ...s, covered: e.target.checked } }))}
                          disabled={locked}
                        />
                        <span className="font-medium">{i.label}</span>
                      </label>
                      <Input
                        value={s.note}
                        onChange={(e) => setInputs((prev) => ({ ...prev, [i.key]: { ...s, note: e.target.value } }))}
                        placeholder="Evidence / discussion summary"
                        disabled={locked}
                        className="mt-2 h-8 text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Outputs (9.3.3) */}
            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Outputs (clause 9.3.3)
              </h3>
              <div className="space-y-2">
                {OUTPUTS_9_3_3.map((o) => (
                  <div key={o.key}>
                    <Label className="text-xs">{o.label}</Label>
                    <Textarea
                      value={outputs[o.key] ?? ""}
                      onChange={(e) => setOutputs((prev) => ({ ...prev, [o.key]: e.target.value }))}
                      placeholder="What did the review decide for this output?"
                      rows={2}
                      disabled={locked}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Action items */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Action items</h3>
                {!locked && (
                  <Button variant="outline" size="sm" onClick={addAction}>
                    <Plus className="w-4 h-4 mr-1.5" /> Add action
                  </Button>
                )}
              </div>
              {actionItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">No actions assigned yet.</p>
              ) : (
                <div className="space-y-2">
                  {actionItems.map((a) => (
                    <div key={a.id} className="rounded-md border border-border p-2 space-y-2">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 mt-2 rounded border-border accent-primary"
                          checked={a.done}
                          onChange={(e) => updateAction(a.id, { done: e.target.checked })}
                          disabled={locked}
                        />
                        <Input
                          value={a.title}
                          onChange={(e) => updateAction(a.id, { title: e.target.value })}
                          placeholder="Action description"
                          disabled={locked}
                          className="flex-1"
                        />
                        {!locked && (
                          <Button variant="ghost" size="icon" onClick={() => removeAction(a.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 pl-6">
                        <Input
                          value={a.assignee}
                          onChange={(e) => updateAction(a.id, { assignee: e.target.value })}
                          placeholder="Assignee"
                          disabled={locked}
                          className="h-8 text-xs"
                        />
                        <Input
                          type="date"
                          value={a.deadline}
                          onChange={(e) => updateAction(a.id, { deadline: e.target.value })}
                          disabled={locked}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Minutes + next review date */}
            <section className="grid md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="mr-minutes" className="text-xs">Minutes</Label>
                <Textarea
                  id="mr-minutes"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="Narrative minutes from the meeting…"
                  rows={4}
                  disabled={locked}
                />
              </div>
              <div>
                <Label htmlFor="mr-next" className="text-xs">Next review date</Label>
                <Input
                  id="mr-next"
                  type="date"
                  value={nextReviewDate}
                  onChange={(e) => setNextReviewDate(e.target.value)}
                  disabled={locked}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Required to mark the review complete.
                </p>
              </div>
            </section>
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || completing}>
            Close
          </Button>
          {review && !locked && (
            <>
              <Button onClick={handleSave} disabled={saving || completing || loading}>
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Save progress
              </Button>
              <Button
                variant="default"
                onClick={handleComplete}
                disabled={saving || completing || loading}
                className="bg-success hover:bg-success/90 text-success-foreground"
              >
                {completing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                Mark complete
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

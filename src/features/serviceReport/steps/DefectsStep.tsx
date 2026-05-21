import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  SiteDefect,
  DefectCategory,
  DEFECT_CATEGORY_LABELS,
  DEFECT_CATEGORY_DESCRIPTIONS,
  createDefect,
  deleteDefect,
  listDefects,
} from "@/services/defectService";

interface Props {
  siteId: string;
  visitId: string;
  reportId: string;
}

const CATEGORY_COLORS: Record<DefectCategory, string> = {
  1: "bg-red-100 text-red-800 border-red-200",
  2: "bg-amber-100 text-amber-800 border-amber-200",
  3: "bg-blue-100 text-blue-800 border-blue-200",
};

export function DefectsStep({ siteId, visitId, reportId }: Props) {
  const { toast } = useToast();
  const [defects, setDefects] = useState<SiteDefect[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // Inline draft for the new-defect form.
  const [draftCategory, setDraftCategory] = useState<DefectCategory>(2);
  const [draftLocation, setDraftLocation] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAction, setDraftAction] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Filter to defects on this site for this visit (created here or pre-existing
      // imports). The persistent register keeps wider history.
      const all = await listDefects({ siteId });
      setDefects(all.filter((d) => d.visit_id === visitId || d.report_id === reportId));
    } catch (e) {
      toast({
        title: "Could not load defects",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [siteId, visitId, reportId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    if (!draftDescription.trim()) {
      toast({ title: "Description required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const composed = draftAction.trim()
        ? `${draftDescription.trim()}\nRecommended: ${draftAction.trim()}`
        : draftDescription.trim();
      await createDefect({
        site_id: siteId,
        visit_id: visitId,
        report_id: reportId,
        description: composed,
        location: draftLocation || null,
        category: draftCategory,
        status: "open",
      });
      setDraftCategory(2);
      setDraftLocation("");
      setDraftDescription("");
      setDraftAction("");
      setAdding(false);
      await load();
      toast({ title: "Defect added" });
    } catch (e) {
      toast({
        title: "Could not save defect",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteDefect(id);
      await load();
    } catch (e) {
      toast({
        title: "Could not remove defect",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Defects identified on site</h3>
        <p className="text-xs text-muted-foreground">
          Each defect is added to the site register and can be flagged for a remedial quote.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : defects.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No defects added yet.</p>
      ) : (
        <ul className="space-y-2">
          {defects.map((d) => (
            <li key={d.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <Badge variant="outline" className={CATEGORY_COLORS[d.category]}>
                  {DEFECT_CATEGORY_LABELS[d.category]}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(d.id)}
                  aria-label="Remove defect"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {d.location && (
                <p className="text-xs text-muted-foreground">Location: {d.location}</p>
              )}
              <p className="text-sm whitespace-pre-line">{d.description}</p>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="rounded-lg border bg-card p-3 space-y-3">
          <div>
            <Label className="text-xs">Category</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([1, 2, 3] as DefectCategory[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraftCategory(c)}
                  className={`h-12 rounded-md border text-sm font-medium transition-colors ${
                    draftCategory === c
                      ? c === 1
                        ? "bg-red-600 text-white border-red-700"
                        : c === 2
                        ? "bg-amber-500 text-white border-amber-600"
                        : "bg-blue-600 text-white border-blue-700"
                      : "bg-background hover:bg-accent"
                  }`}
                >
                  Cat {c}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {DEFECT_CATEGORY_DESCRIPTIONS[draftCategory]}
            </p>
          </div>

          <div>
            <Label className="text-xs">Location / device</Label>
            <Input
              value={draftLocation}
              onChange={(e) => setDraftLocation(e.target.value)}
              placeholder="e.g. Zone 3, Detector L1.21"
            />
          </div>

          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              placeholder="What was found"
              rows={3}
            />
          </div>

          <div>
            <Label className="text-xs">Recommended action</Label>
            <Textarea
              value={draftAction}
              onChange={(e) => setDraftAction(e.target.value)}
              placeholder="What needs doing"
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAdding(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={submitting} className="flex-1">
              {submitting ? "Saving…" : "Add defect"}
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setAdding(true)} variant="outline" className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Add defect
        </Button>
      )}
    </div>
  );
}

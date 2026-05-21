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
import {
  listMutations,
  queueMutation,
  removeMutation,
  QueuedMutationRecord,
} from "@/lib/offlineQueue";
import { runSync } from "@/lib/syncWorker";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { PhotoCapture } from "../PhotoCapture";

interface Props {
  siteId: string;
  visitId: string;
  reportId: string;
}

// Optimistic union row: either a server-side SiteDefect or a still-queued
// defect-create. Both expose the same display fields and a stable `id` (the
// client UUID, which the server adopts on sync).
type DisplayDefect = {
  id: string;
  description: string;
  location: string | null;
  category: DefectCategory;
  pendingSync: boolean;
  queueEntryId: string | null; // present when still in the IndexedDB queue
};

const CATEGORY_COLORS: Record<DefectCategory, string> = {
  1: "bg-red-100 text-red-800 border-red-200",
  2: "bg-amber-100 text-amber-800 border-amber-200",
  3: "bg-blue-100 text-blue-800 border-blue-200",
};

function fromServer(d: SiteDefect): DisplayDefect {
  return {
    id: d.id,
    description: d.description,
    location: d.location,
    category: d.category,
    pendingSync: false,
    queueEntryId: null,
  };
}

function fromQueue(rec: QueuedMutationRecord): DisplayDefect | null {
  if (rec.mutation.kind !== "defect-create") return null;
  const p = rec.mutation.payload;
  return {
    id: rec.mutation.id,
    description: p.description,
    location: p.location,
    category: p.category,
    pendingSync: true,
    queueEntryId: rec.id,
  };
}

export function DefectsStep({ siteId, visitId, reportId }: Props) {
  const { toast } = useToast();
  const online = useOnlineStatus();
  const [defects, setDefects] = useState<DisplayDefect[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const [draftCategory, setDraftCategory] = useState<DefectCategory>(2);
  const [draftLocation, setDraftLocation] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAction, setDraftAction] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Server defects (may be empty when offline).
      let server: DisplayDefect[] = [];
      if (online) {
        try {
          const all = await listDefects({ siteId });
          server = all
            .filter((d) => d.visit_id === visitId || d.report_id === reportId)
            .map(fromServer);
        } catch {
          server = [];
        }
      }

      // Queued defect-creates for this report.
      const queued = await listMutations().catch(() => [] as QueuedMutationRecord[]);
      const fromQueueRows = queued
        .filter(
          (r) =>
            r.mutation.kind === "defect-create" && r.mutation.payload.report_id === reportId,
        )
        .map(fromQueue)
        .filter((x): x is DisplayDefect => x !== null);

      // De-dupe: if a queued item has the same id as a server item (i.e. sync
      // ran but the queue entry hasn't been removed yet), prefer the server row.
      const serverIds = new Set(server.map((d) => d.id));
      const merged = [...server, ...fromQueueRows.filter((d) => !serverIds.has(d.id))];
      setDefects(merged);
    } catch (e) {
      toast({
        title: "Could not load defects",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [siteId, visitId, reportId, online, toast]);

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
      const id = crypto.randomUUID();
      const composed = draftAction.trim()
        ? `${draftDescription.trim()}\nRecommended: ${draftAction.trim()}`
        : draftDescription.trim();
      const payload = {
        site_id: siteId,
        visit_id: visitId,
        report_id: reportId,
        description: composed,
        location: draftLocation || null,
        category: draftCategory,
        status: "open" as const,
      };

      if (online) {
        try {
          await createDefect({ id, ...payload } as never);
        } catch {
          await queueMutation({ kind: "defect-create", id, payload });
        }
      } else {
        await queueMutation({ kind: "defect-create", id, payload });
      }

      setDraftCategory(2);
      setDraftLocation("");
      setDraftDescription("");
      setDraftAction("");
      setAdding(false);
      await load();
      if (online) void runSync();
      toast({ title: online ? "Defect added" : "Defect queued offline" });
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

  const handleRemove = async (d: DisplayDefect) => {
    try {
      if (d.queueEntryId) {
        // Still in the queue — just drop the mutation.
        await removeMutation(d.queueEntryId);
        await load();
        return;
      }
      await deleteDefect(d.id);
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
          Each defect is added to the site register. Attach photos for evidence.
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
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={CATEGORY_COLORS[d.category]}>
                    {DEFECT_CATEGORY_LABELS[d.category]}
                  </Badge>
                  {d.pendingSync && (
                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                      Pending sync
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(d)}
                  aria-label="Remove defect"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {d.location && (
                <p className="text-xs text-muted-foreground">Location: {d.location}</p>
              )}
              <p className="text-sm whitespace-pre-line">{d.description}</p>
              <PhotoCapture
                defectId={d.id}
                reportId={reportId}
                visitId={visitId}
                siteId={siteId}
              />
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

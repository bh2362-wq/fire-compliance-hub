import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Sparkles, Plus, Trash2, Send, Loader2, AlertOctagon, AlertTriangle, Info, Briefcase, Package, Receipt,
  Copy, Merge, MoveRight, GripVertical,
} from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { updateDefect, type Defect } from "@/services/defectService";
import {
  useQuoteGeneration,
  defectsToWorkItems,
  type CostLine,
  type CategorisedLineItems,
} from "@/hooks/useQuoteGeneration";
import { inheritMetadataFromPriorQuote } from "@/services/quoteMetadataInheritanceService";
import { stripScopeMarkdown, parseScopeNumberedItems } from "@/lib/scopeMarkdown";
import { AIRewriteButton } from "@/components/reports/AIRewriteButton";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defects: Defect[];
  /** Receives the new quotation id so callers can do source-specific
      backlinking (e.g. update ce_remedials.quotation_id when sourced
      from a C&E remedials list). Existing defect-page caller can
      keep ignoring the argument. */
  onQuoteCreated: (quotationId?: string) => void;
  /** When true, skips the per-defect site_defects.status='quoted'
      writeback. Use this when the "defects" array isn't really
      site_defects rows — e.g. when ce_remedials are passed in
      Defect shape for the quote UI. */
  skipDefectLink?: boolean;
  /** Override default badge / heading wording when the source isn't
      defects (e.g. "remedials"). */
  itemLabel?: { singular: string; plural: string };
  /** When the dialog is opened from a C&E report's remedials list,
      pass the report id here. It gets stamped onto the new quotation
      so the quote view can show a "Sourced from C&E" link and the
      email-send flow can offer to attach the source report PDF. */
  sourceCauseEffectReportId?: string;
}

function catIcon(cat: number) {
  if (cat === 1) return <AlertOctagon className="w-3 h-3 text-destructive flex-shrink-0" />;
  if (cat === 2) return <AlertTriangle className="w-3 h-3 text-orange-500 flex-shrink-0" />;
  return <Info className="w-3 h-3 text-yellow-600 flex-shrink-0" />;
}

type BucketKey = keyof CategorisedLineItems;

const BUCKET_META: Record<BucketKey, { label: string; icon: typeof Briefcase; showRegRef: boolean }> = {
  labour:    { label: "Labour",    icon: Briefcase, showRegRef: false },
  materials: { label: "Materials", icon: Package,   showRegRef: true  },
  extras:    { label: "Extras",    icon: Receipt,   showRegRef: false },
};

// Detects "column does not exist" PostgrestErrors for a specific
// column name. Used to fall back to a leaner insert when a recently-
// added column hasn't landed in this environment's schema yet (same
// pattern as PR #112's parity-column hotfix on Reports.tsx).
function isMissingColumnError(err: unknown, column: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as Record<string, unknown>;
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
  // 42703 = Postgres undefined_column (raw DB error).
  // PGRST204 = PostgREST "Could not find the column ... in the schema cache" —
  //            same root cause, different surface. The message variants are
  //            "does not exist" (Postgres) and "could not find" (PostgREST).
  const codeMatch  = code === "42703" || code === "PGRST204";
  const phraseMatch = message.includes("does not exist") || message.includes("could not find");
  if (!codeMatch && !phraseMatch) return false;
  return message.includes(column.toLowerCase());
}

// Unwraps thrown errors into a toast-friendly string. Handles:
//   - Error instances (just return .message)
//   - Supabase PostgrestError shape (plain object with message /
//     details / hint / code) — picks the most specific field present
//     and tacks on the code for debugging when one's set
//   - anything else (returns the fallback)
function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err !== "object" || err === null) return fallback;
  const e = err as Record<string, unknown>;
  const message = typeof e.message === "string" ? e.message : null;
  const details = typeof e.details === "string" ? e.details : null;
  const hint = typeof e.hint === "string" ? e.hint : null;
  const code = typeof e.code === "string" ? e.code : null;
  const primary = details || message || hint;
  if (!primary) return code ? `${fallback} (${code})` : fallback;
  return code ? `${primary} (${code})` : primary;
}

// ── Sortable line row ──────────────────────────────────────────────────────
//
// Defined at module scope so dnd-kit doesn't see a new component identity
// every render (would tank the drag overlay). Stable _uid drives the
// useSortable id so selection / collapse / drag all survive reorders.

interface SortableLineRowProps {
  row: CostLine;
  bucket: BucketKey;
  index: number;
  showRegRef: boolean;
  isSelected: boolean;
  tbc: boolean;
  onToggleSelect: (uid: string) => void;
  onUpdate: (bucket: BucketKey, index: number, field: keyof CostLine, value: string | number) => void;
  onRemove: (bucket: BucketKey, index: number) => void;
  onDuplicate: (bucket: BucketKey, index: number) => void;
}

function SortableLineRow({
  row, bucket, index, showRegRef, isSelected, tbc,
  onToggleSelect, onUpdate, onRemove, onDuplicate,
}: SortableLineRowProps) {
  const uid = row._uid ?? `${bucket}:${index}`;
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: uid });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border bg-card p-2.5 space-y-2 transition-colors ${
        isSelected ? "border-primary/60 bg-primary/5" : ""
      } ${tbc ? "ring-1 ring-amber-500/40" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label="Drag to reorder"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground mt-1 flex-shrink-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => row._uid && onToggleSelect(row._uid)}
          className="mt-1 flex-shrink-0"
          aria-label="Select line"
        />
        <span className="text-[10px] font-bold text-muted-foreground w-5 mt-1 flex-shrink-0">
          {index + 1}.
        </span>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-2">
            <Input
              value={row.description}
              onChange={(e) => onUpdate(bucket, index, "description", e.target.value)}
              placeholder="Description"
              className="text-sm h-8 flex-1 min-w-0"
            />
            {/* Per-row "Improve with AI" — same compact button as the
                Quote edit dialog (PR #221). Rewrites just this row's
                description via rewrite-text. Preview-and-accept flow
                keeps the engineer in control of AI changes to precise
                technical wording. */}
            <AIRewriteButton
              text={row.description ?? ""}
              type="quotation_items"
              compact
              disabled={!row.description?.trim()}
              onRewrite={(newText) => onUpdate(bucket, index, "description", newText)}
            />
            {tbc && (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 text-[10px] gap-1 shrink-0">
                <AlertTriangle className="h-3 w-3" />TBC
              </Badge>
            )}
          </div>
          <div className={`grid gap-2 ${showRegRef ? "grid-cols-5" : "grid-cols-4"}`}>
            <div>
              <Label className="text-[10px] text-muted-foreground">Qty</Label>
              <Input
                type="number" min={1}
                value={row.quantity}
                onChange={(e) => onUpdate(bucket, index, "quantity", Number(e.target.value) || 1)}
                className="h-7 text-sm"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Unit £</Label>
              <Input
                type="number" min={0} step={0.01}
                value={row.unit_price}
                onChange={(e) => onUpdate(bucket, index, "unit_price", parseFloat(e.target.value) || 0)}
                className="h-7 text-sm"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Line £</Label>
              <div className="h-7 flex items-center text-sm font-semibold">
                £{((Number(row.quantity) || 1) * (Number(row.unit_price) || 0)).toFixed(2)}
              </div>
            </div>
            <div className="col-span-1">
              <Label className="text-[10px] text-muted-foreground">Notes</Label>
              <Input
                value={row.notes}
                onChange={(e) => onUpdate(bucket, index, "notes", e.target.value)}
                placeholder="Engineer notes"
                className="h-7 text-xs"
              />
            </div>
            {showRegRef && (
              <div>
                <Label className="text-[10px] text-muted-foreground">Reg ref</Label>
                <Input
                  value={row.regulation_reference || ""}
                  onChange={(e) => onUpdate(bucket, index, "regulation_reference", e.target.value)}
                  placeholder="BS 5839-1 Cl."
                  className="h-7 text-xs"
                />
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => onDuplicate(bucket, index)}
            title="Duplicate line"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(bucket, index)}
            title="Delete line"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Belt-and-braces markdown cleanup, applied at INSERT time so the saved
// `introduction` and `scope[]` are already presentation-clean. The DOCX
// edge function (generate-quote-docx) ALSO runs an AI rewriter pre-render
// — but Supabase edge functions don't auto-deploy on merge to main, so
// until a human ships the function the engineer would get raw "**bold**"
// wall-of-text PDFs (which is exactly what happened with QUO-00499).
// Doing the cleanup here too means a fresh quote renders cleanly even on
// the OLD deployed edge function, and the rewriter's prompt explicitly
// says "preserve voice when input is already clean prose" so pre-cleaning
// doesn't fight it.
//
// Helpers live in src/lib/scopeMarkdown.ts so QuotationDetailDialog can
// share them (it derives a scope[] from introduction when the scope
// column is empty — covers quotes inserted before this PR landed).

export function AIDefectQuoteDialog({
  open, onOpenChange, defects, onQuoteCreated,
  skipDefectLink = false,
  itemLabel = { singular: "defect", plural: "defects" },
  sourceCauseEffectReportId,
}: Props) {
  const navigate = useNavigate();
  const {
    status, error, scopeContent, setScopeContent, lineItems, setLineItems, generate, reset, toLineItemRows, totals,
  } = useQuoteGeneration();
  const [creating, setCreating] = useState(false);

  const primarySite = defects[0];
  const siteName = primarySite?.site_name || "site";
  const siteId = primarySite?.site_id || "";

  // Default Quote Title — kept minimal. Engineer routinely overrides
  // with descriptive titles like "Fire Alarm Remedial Works and Cause
  // & Effect Testing"; the prior "Remedial Works — {siteName}" default
  // duplicated the Site cell in the PDF and broke ugly ("Remedial
  // Works — site") when siteName fell back to the literal placeholder.
  const defaultTitle = "Remedial";
  const [quoteTitle, setQuoteTitle] = useState(defaultTitle);

  function handleClose() {
    reset();
    setQuoteTitle(defaultTitle);
    onOpenChange(false);
  }

  async function handleGenerate() {
    const workItems = defectsToWorkItems(
      defects.map(d => ({ description: d.description, location: d.location ?? null, category: d.category })),
    );
    await generate({ siteName }, workItems);
    if (!quoteTitle) setQuoteTitle(defaultTitle);
  }

  // ── Stable IDs, selection, drag sensors ──────────────────────────────────────
  //
  // Editor-level state. Every row gets a _uid stamped when it lands in the
  // editor so multi-select, drag-reorder and merge survive any of those
  // operations. _uid is stripped before INSERT in toLineItemRows — the
  // DB never sees it.

  const newUid = () =>
    (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `r-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

  useEffect(() => {
    // Stamp _uid on any rows that arrived without one. Runs whenever the
    // hook re-populates lineItems (after Generate or Re-generate).
    let dirty = false;
    const next: CategorisedLineItems = {
      labour:    lineItems.labour,
      materials: lineItems.materials,
      extras:    lineItems.extras,
    };
    (Object.keys(next) as BucketKey[]).forEach((b) => {
      if (next[b].some((r) => !r._uid)) {
        dirty = true;
        next[b] = next[b].map((r) => r._uid ? r : { ...r, _uid: newUid() });
      }
    });
    if (dirty) setLineItems(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItems]);

  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const toggleSelected = (uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };
  const clearSelection = () => setSelectedUids(new Set());

  // Selection grouped by bucket — drives the toolbar (Merge only works within
  // a single bucket) and the bulk actions.
  const selectionByBucket = useMemo(() => {
    const out: Record<BucketKey, string[]> = { labour: [], materials: [], extras: [] };
    (Object.keys(out) as BucketKey[]).forEach((b) => {
      lineItems[b].forEach((r) => {
        if (r._uid && selectedUids.has(r._uid)) out[b].push(r._uid);
      });
    });
    return out;
  }, [lineItems, selectedUids]);

  const selectedCount = selectedUids.size;
  const onlyBucketWithSelection = (() => {
    const buckets = (Object.keys(selectionByBucket) as BucketKey[])
      .filter((b) => selectionByBucket[b].length > 0);
    return buckets.length === 1 ? buckets[0] : null;
  })();

  // dnd-kit sensors. Tightened activation distance so a quick tap on the
  // grip doesn't accidentally start a drag while the user is selecting.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Bucket editing helpers ───────────────────────────────────────────────────

  function updateBucketLine(bucket: BucketKey, index: number, field: keyof CostLine, value: string | number) {
    setLineItems((prev) => ({
      ...prev,
      [bucket]: prev[bucket].map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    }));
  }
  function removeBucketLine(bucket: BucketKey, index: number) {
    const uid = lineItems[bucket][index]?._uid;
    setLineItems({ ...lineItems, [bucket]: lineItems[bucket].filter((_, i) => i !== index) });
    if (uid) {
      setSelectedUids((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    }
  }
  function addBucketLine(bucket: BucketKey) {
    const empty: CostLine = { description: "", quantity: 1, unit_price: 0, notes: "", _uid: newUid() };
    setLineItems({ ...lineItems, [bucket]: [...lineItems[bucket], empty] });
  }
  function duplicateBucketLine(bucket: BucketKey, index: number) {
    const src = lineItems[bucket][index];
    if (!src) return;
    const copy: CostLine = { ...src, _uid: newUid() };
    const next = [...lineItems[bucket]];
    next.splice(index + 1, 0, copy);
    setLineItems({ ...lineItems, [bucket]: next });
  }

  // Bulk actions — driven by selectedUids.
  function bulkDeleteSelected() {
    if (selectedCount === 0) return;
    const next: CategorisedLineItems = {
      labour:    lineItems.labour.filter((r) => !r._uid || !selectedUids.has(r._uid)),
      materials: lineItems.materials.filter((r) => !r._uid || !selectedUids.has(r._uid)),
      extras:    lineItems.extras.filter((r) => !r._uid || !selectedUids.has(r._uid)),
    };
    setLineItems(next);
    clearSelection();
  }
  function bulkMoveSelectedTo(target: BucketKey) {
    if (selectedCount === 0) return;
    const moving: CostLine[] = [];
    const next: CategorisedLineItems = {
      labour:    lineItems.labour.filter((r) => {
        if (r._uid && selectedUids.has(r._uid)) { moving.push(r); return false; }
        return true;
      }),
      materials: lineItems.materials.filter((r) => {
        if (r._uid && selectedUids.has(r._uid)) { moving.push(r); return false; }
        return true;
      }),
      extras:    lineItems.extras.filter((r) => {
        if (r._uid && selectedUids.has(r._uid)) { moving.push(r); return false; }
        return true;
      }),
    };
    next[target] = [...next[target], ...moving];
    setLineItems(next);
    // Keep selection so the user can immediately re-act on the moved rows.
  }
  function mergeSelectedInBucket() {
    if (!onlyBucketWithSelection) {
      toast.warning("Select 2 or more lines in a single section to merge.");
      return;
    }
    const bucket = onlyBucketWithSelection;
    const uids = new Set(selectionByBucket[bucket]);
    if (uids.size < 2) {
      toast.warning("Pick at least two lines to merge.");
      return;
    }
    const rows = lineItems[bucket].filter((r) => r._uid && uids.has(r._uid));
    const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 1), 0);
    const totalLine = rows.reduce(
      (s, r) => s + (Number(r.quantity) || 1) * (Number(r.unit_price) || 0), 0,
    );
    // Weighted average unit price so the line total stays correct after merge.
    const newUnit = totalQty > 0 ? totalLine / totalQty : 0;
    const merged: CostLine = {
      _uid: newUid(),
      description: rows.map((r) => r.description).filter(Boolean).join(" + "),
      quantity: totalQty,
      unit_price: Number(newUnit.toFixed(2)),
      notes: rows.map((r) => r.notes).filter(Boolean).join(" · "),
      regulation_reference: rows.map((r) => r.regulation_reference).filter(Boolean).join(", ") || undefined,
    };
    // Insert at the first selected row's position, drop the rest.
    const firstIdx = lineItems[bucket].findIndex((r) => r._uid && uids.has(r._uid));
    const survivors = lineItems[bucket].filter((r) => !r._uid || !uids.has(r._uid));
    const next = [...survivors];
    next.splice(Math.max(0, firstIdx), 0, merged);
    setLineItems({ ...lineItems, [bucket]: next });
    clearSelection();
  }

  // Drag-reorder handler. dnd-kit fires onDragEnd with active+over uids.
  function onDragEnd(bucket: BucketKey, ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const rows = lineItems[bucket];
    const oldIdx = rows.findIndex((r) => r._uid === active.id);
    const newIdx = rows.findIndex((r) => r._uid === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    setLineItems({ ...lineItems, [bucket]: arrayMove(rows, oldIdx, newIdx) });
  }

  // TBC detection — £0 unit or "Engineer to confirm" wording. Used for the
  // per-row badge and the top-of-section warning banner.
  function isTbc(row: CostLine): boolean {
    if ((Number(row.unit_price) || 0) === 0) return true;
    return (row.description ?? "").toLowerCase().includes("engineer to confirm");
  }
  const tbcCount = (Object.keys(lineItems) as BucketKey[])
    .reduce((s, b) => s + lineItems[b].filter(isTbc).length, 0);

  const totalLines = lineItems.labour.length + lineItems.materials.length + lineItems.extras.length;

  // ── Create quote ──────────────────────────────────────────────────────────────

  async function handleCreateQuote() {
    if (totalLines === 0) { toast.error("Add at least one line item"); return; }
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: siteData, error: siteErr } = await supabase
        .from("sites").select("customer_id").eq("id", siteId).maybeSingle();
      if (siteErr) throw siteErr;

      // RPC error wasn't being caught — if the function errors or
      // returns null (sequence exhausted, RLS denial), we'd happily
      // INSERT with quotation_number = NULL and the insert would then
      // fail with a generic NOT-NULL violation. Surface the real
      // problem upfront instead.
      const { data: quotationNumber, error: numErr } = await supabase.rpc("get_next_quotation_number");
      if (numErr) throw numErr;
      if (!quotationNumber) {
        throw new Error(
          "Quotation number generator returned no value — check the get_next_quotation_number RPC",
        );
      }

      // Inherit fire-alarm spec metadata from the most recent prior quote on
      // this site so the shared DOCX template renders full header/system
      // summary blocks rather than empty-state branches. NULL fields stay NULL.
      const inherited = siteId ? await inheritMetadataFromPriorQuote(siteId) : { values: {}, sourceQuotationNumber: null, fieldsFound: [] };

      // Clean the markdown scope BEFORE the row hits Postgres. The DOCX
      // template renders quotations.introduction verbatim in §1 and the
      // quotations.scope[] array as the §2.2 numbered list — pre-cleaning
      // here means both sections look right even if the AI rewriter in
      // generate-quote-docx hasn't been redeployed (Supabase Functions
      // ship out-of-band from main).
      const cleanedIntroduction = stripScopeMarkdown(scopeContent);
      const parsedScopeItems = parseScopeNumberedItems(scopeContent);

      const insertPayload: Record<string, unknown> = {
        site_id: siteId,
        customer_id: siteData?.customer_id ?? null,
        title: quoteTitle,
        introduction: cleanedIntroduction,
        // Only set scope when parsing actually pulled items out — otherwise
        // leave NULL so the DOCX template's empty-state branch fires
        // instead of rendering an empty list.
        ...(parsedScopeItems.length > 0 ? { scope: parsedScopeItems } : {}),
        status: "draft",
        quotation_number: quotationNumber,
        total_amount: totals.exVat,
        created_by: user.id,
        // Defect-driven quotes are remedial works by nature.
        works_type: "reactive_remedial",
        job_category: "reactive_remedial",
        // Reverse link back to the C&E report when this dialog was
        // opened from one — column added in migration
        // 20260603120000_quotations_source_ce_report.sql.
        ...(sourceCauseEffectReportId ? { source_cause_effect_report_id: sourceCauseEffectReportId } : {}),
        // Spread inherited metadata (only non-null fields are present).
        ...inherited.values,
        notes: `Remedial works quotation generated from ${defects.length} ${defects.length !== 1 ? itemLabel.plural : itemLabel.singular} identified during site inspection. Source IDs: ${defects.map(d => d.id).join(", ")}${inherited.sourceQuotationNumber ? `\nMetadata inherited from ${inherited.sourceQuotationNumber} (${inherited.fieldsFound.length} field${inherited.fieldsFound.length !== 1 ? "s" : ""}).` : ""}`,
      };

      // Two-step tolerant insert — try with source_cause_effect_report_id
      // first, retry without it if the column doesn't exist on this
      // environment. Same hotfix pattern as PR #112 for ce parity
      // columns: the migration 20260603120000 might not have applied
      // yet on every Supabase project this app talks to. The reverse
      // link is nice-to-have; the quote itself should still create.
      let { data: quotation, error: qErr } = await supabase
        .from("quotations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(insertPayload as any)
        .select()
        .single();
      if (qErr && sourceCauseEffectReportId && isMissingColumnError(qErr, "source_cause_effect_report_id")) {
        console.warn(
          "[AIDefectQuoteDialog] quotations.source_cause_effect_report_id missing — " +
          "falling back to insert without the reverse link. Run migration " +
          "20260603120000_quotations_source_ce_report.sql to enable it.",
        );
        const { source_cause_effect_report_id: _, ...payloadWithoutLink } = insertPayload as { source_cause_effect_report_id?: unknown } & Record<string, unknown>;
        void _;
        ({ data: quotation, error: qErr } = await supabase
          .from("quotations")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(payloadWithoutLink as any)
          .select()
          .single());
      }
      if (qErr) throw qErr;

      const rows = toLineItemRows(quotation.id);
      if (rows.length > 0) {
        const { error: liErr } = await supabase.from("quotation_line_items").insert(rows);
        if (liErr) throw liErr;
      }

      // Only writeback to site_defects when the caller actually passed
      // site_defects rows. C&E remedials use the same dialog but their
      // IDs reference ce_remedials, not site_defects — caller handles
      // its own backlink via the onQuoteCreated callback.
      if (!skipDefectLink) {
        await Promise.all(defects.map(d =>
          updateDefect(d.id, { status: "quoted", quotation_id: quotation.id }).catch(console.error),
        ));
      }

      toast.success(`Quote ${quotationNumber} created — opening now`);
      handleClose();
      onQuoteCreated(quotation.id);
      navigate(`/dashboard/quotations`);
    } catch (err: unknown) {
      // Always log the raw error to console so we can see Supabase's
      // PostgrestError shape (code/details/hint) in DevTools even when
      // the toast text is short.
      console.error("[AIDefectQuoteDialog] create-quote failed:", err);
      // PostgrestError isn't an Error instance — it's a plain object
      // with message/code/details/hint. Without this branch the toast
      // fell back to the generic "Failed to create quotation" string
      // and swallowed the real reason (NOT-NULL violation on
      // quotation_number, RLS denial, etc).
      toast.error(extractErrorMessage(err, "Failed to create quotation"));
    } finally {
      setCreating(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90dvh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Remedial Works Quote
            <Badge variant="outline" className="text-[10px] ml-1">
              {defects.length} {defects.length !== 1 ? itemLabel.plural : itemLabel.singular} selected
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Selected defects summary */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {itemLabel.plural[0].toUpperCase() + itemLabel.plural.slice(1)} being quoted
            </p>
            {defects
              .slice().sort((a, b) => a.category - b.category)
              .map(d => (
                <div key={d.id} className="flex items-start gap-2 text-xs">
                  {catIcon(d.category)}
                  <span className="text-muted-foreground">
                    <span className="text-foreground font-medium">{d.description}</span>
                    {d.location && <span className="ml-1 text-muted-foreground">@ {d.location}</span>}
                    {d.site_name && <span className="ml-1 text-muted-foreground">— {d.site_name}</span>}
                  </span>
                </div>
              ))}
          </div>

          {/* Step: idle — generate button */}
          {status === "idle" && (
            <Button onClick={handleGenerate} size="lg" className="w-full gap-2">
              <Sparkles className="h-4 w-4" />
              Generate Scope + Costs with AI
            </Button>
          )}

          {/* Step: generating */}
          {status === "generating" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Drafting scope and estimating costs…</p>
              <p className="text-xs">Claude is writing a BS 5839-1 narrative, then estimating labour + materials + extras</p>
            </div>
          )}

          {/* Step: error */}
          {status === "error" && (
            <div className="space-y-2">
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {error || "Generation failed"}
              </div>
              <Button variant="outline" onClick={handleGenerate} className="w-full">Try again</Button>
            </div>
          )}

          {/* Step: ready — review */}
          {status === "ready" && (
            <div className="space-y-5">
              {/* Quote title */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Quote Title</Label>
                <Input value={quoteTitle} onChange={e => setQuoteTitle(e.target.value)} className="font-medium" />
              </div>

              {/* Scope content — markdown editor */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Scope of Works
                  <span className="font-normal text-muted-foreground ml-2">
                    — markdown numbered list, edit before saving
                  </span>
                </Label>
                <Textarea
                  rows={Math.min(20, Math.max(8, scopeContent.split("\n").length))}
                  value={scopeContent}
                  onChange={e => setScopeContent(e.target.value)}
                  className="text-sm font-mono"
                />
              </div>

              {/* TBC warning banner — fires when any line is £0 unit or
                  contains "Engineer to confirm" wording. Surfaces the
                  pre-save review the engineer keeps forgetting. */}
              {tbcCount > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 flex items-start gap-2 text-xs">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p>
                    <strong>{tbcCount}</strong> line{tbcCount !== 1 ? "s" : ""} marked TBC
                    ({" "}£0 unit cost or "Engineer to confirm"{" "}wording).
                    Review and price before saving — they pass through to the quotation as-is.
                  </p>
                </div>
              )}

              {/* Selection toolbar — appears when any rows are checked. */}
              {selectedCount > 0 && (
                <div className="rounded-lg border bg-primary/5 p-2 flex items-center gap-1.5 flex-wrap text-xs sticky top-0 z-10 backdrop-blur">
                  <Badge variant="secondary" className="text-[10px]">{selectedCount} selected</Badge>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 gap-1 text-xs"
                    onClick={mergeSelectedInBucket}
                    disabled={!onlyBucketWithSelection || selectionByBucket[onlyBucketWithSelection!].length < 2}
                    title={onlyBucketWithSelection
                      ? `Merge ${selectionByBucket[onlyBucketWithSelection].length} lines in ${BUCKET_META[onlyBucketWithSelection].label}`
                      : "Select 2+ lines in a single section to merge"}
                  >
                    <Merge className="h-3.5 w-3.5" />Merge
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                        <MoveRight className="h-3.5 w-3.5" />Move to…
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {(Object.keys(BUCKET_META) as BucketKey[]).map(b => (
                        <DropdownMenuItem key={b} onClick={() => bulkMoveSelectedTo(b)}>
                          {BUCKET_META[b].label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                    onClick={bulkDeleteSelected}
                  >
                    <Trash2 className="h-3.5 w-3.5" />Delete
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 text-xs ml-auto"
                    onClick={clearSelection}
                  >
                    Clear
                  </Button>
                </div>
              )}

              {/* Line item buckets — each its own dnd-kit context so drags
                  stay scoped to one section. */}
              {(Object.keys(BUCKET_META) as BucketKey[]).map(bucket => {
                const meta = BUCKET_META[bucket];
                const rows = lineItems[bucket];
                const Icon = meta.icon;
                const bucketTotal = rows.reduce(
                  (s, r) => s + (Number(r.quantity) || 1) * (Number(r.unit_price) || 0), 0,
                );
                const rowUids = rows.map((r, i) => r._uid ?? `${bucket}:${i}`);
                return (
                  <div key={bucket} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-xs font-semibold">{meta.label}</Label>
                        <span className="text-[10px] text-muted-foreground">
                          {rows.length} item{rows.length !== 1 ? "s" : ""} · £{bucketTotal.toFixed(2)}
                        </span>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => addBucketLine(bucket)}>
                        <Plus className="h-3.5 w-3.5" />Add Row
                      </Button>
                    </div>

                    {rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic px-1 py-2">
                        No {meta.label.toLowerCase()} lines.
                      </p>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => onDragEnd(bucket, e)}
                      >
                        <SortableContext items={rowUids} strategy={verticalListSortingStrategy}>
                          <div className="space-y-2">
                            {rows.map((row, idx) => (
                              <SortableLineRow
                                key={row._uid ?? `${bucket}:${idx}`}
                                row={row}
                                bucket={bucket}
                                index={idx}
                                showRegRef={meta.showRegRef}
                                isSelected={!!row._uid && selectedUids.has(row._uid)}
                                tbc={isTbc(row)}
                                onToggleSelect={toggleSelected}
                                onUpdate={updateBucketLine}
                                onRemove={removeBucketLine}
                                onDuplicate={duplicateBucketLine}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </div>
                );
              })}

              {/* Totals */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between flex-wrap gap-3 text-sm">
                  <div className="flex gap-6">
                    <div>
                      <span className="text-muted-foreground text-xs">Labour</span>
                      <p className="font-semibold">£{totals.labour.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Materials</span>
                      <p className="font-semibold">£{totals.materials.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Extras</span>
                      <p className="font-semibold">£{totals.extras.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground text-xs">Total (ex VAT)</span>
                    <p className="text-lg font-bold">£{totals.exVat.toFixed(2)}</p>
                  </div>
                </div>
                {totals.exVat === 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Prices are £0 — update them above before sending, or create the quote and edit pricing later.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t px-6 py-4 flex items-center gap-2 flex-shrink-0 bg-background">
          <Button variant="outline" onClick={handleClose} disabled={creating}>Cancel</Button>
          {status === "ready" && (
            <>
              <Button variant="ghost" onClick={handleGenerate} disabled={creating}>Re-generate</Button>
              <Button
                className="ml-auto gap-2"
                onClick={handleCreateQuote}
                disabled={creating || totalLines === 0}
              >
                {creating
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Creating…</>
                  : <><Send className="h-4 w-4" />Create Quote</>}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

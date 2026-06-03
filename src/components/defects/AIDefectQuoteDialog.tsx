import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Plus, Trash2, Send, Loader2, AlertOctagon, AlertTriangle, Info, Briefcase, Package, Receipt,
} from "lucide-react";
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

  const defaultTitle = useMemo(() => `Remedial Works — ${siteName}`, [siteName]);
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

  // ── Bucket editing helpers ───────────────────────────────────────────────────

  function updateBucketLine(bucket: BucketKey, index: number, field: keyof CostLine, value: string | number) {
    setLineItems({
      ...lineItems,
      [bucket]: lineItems[bucket].map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    });
  }
  function removeBucketLine(bucket: BucketKey, index: number) {
    setLineItems({ ...lineItems, [bucket]: lineItems[bucket].filter((_, i) => i !== index) });
  }
  function addBucketLine(bucket: BucketKey) {
    const empty: CostLine = { description: "", quantity: 1, unit_price: 0, notes: "" };
    setLineItems({ ...lineItems, [bucket]: [...lineItems[bucket], empty] });
  }

  const totalLines = lineItems.labour.length + lineItems.materials.length + lineItems.extras.length;

  // ── Create quote ──────────────────────────────────────────────────────────────

  async function handleCreateQuote() {
    if (totalLines === 0) { toast.error("Add at least one line item"); return; }
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: siteData } = await supabase
        .from("sites").select("customer_id").eq("id", siteId).maybeSingle();

      const { data: quotationNumber } = await supabase.rpc("get_next_quotation_number");

      // Inherit fire-alarm spec metadata from the most recent prior quote on
      // this site so the shared DOCX template renders full header/system
      // summary blocks rather than empty-state branches. NULL fields stay NULL.
      const inherited = siteId ? await inheritMetadataFromPriorQuote(siteId) : { values: {}, sourceQuotationNumber: null, fieldsFound: [] };

      const insertPayload: Record<string, unknown> = {
        site_id: siteId,
        customer_id: siteData?.customer_id ?? null,
        title: quoteTitle,
        introduction: scopeContent,
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

      const { data: quotation, error: qErr } = await supabase
        .from("quotations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(insertPayload as any)
        .select()
        .single();
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
      const message = err instanceof Error ? err.message : "Failed to create quotation";
      toast.error(message);
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

              {/* Line item buckets */}
              {(Object.keys(BUCKET_META) as BucketKey[]).map(bucket => {
                const meta = BUCKET_META[bucket];
                const rows = lineItems[bucket];
                const Icon = meta.icon;
                const bucketTotal = rows.reduce(
                  (s, r) => s + (Number(r.quantity) || 1) * (Number(r.unit_price) || 0), 0,
                );
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
                      <div className="space-y-2">
                        {rows.map((row, idx) => (
                          <div key={idx} className="rounded-md border bg-card p-2.5 space-y-2">
                            <div className="flex items-start gap-2">
                              <span className="text-[10px] font-bold text-muted-foreground w-5 mt-1 flex-shrink-0">
                                {idx + 1}.
                              </span>
                              <div className="flex-1 space-y-2">
                                <Input
                                  value={row.description}
                                  onChange={e => updateBucketLine(bucket, idx, "description", e.target.value)}
                                  placeholder="Description"
                                  className="text-sm h-8"
                                />
                                <div className={`grid gap-2 ${meta.showRegRef ? "grid-cols-5" : "grid-cols-4"}`}>
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground">Qty</Label>
                                    <Input
                                      type="number" min={1}
                                      value={row.quantity}
                                      onChange={e => updateBucketLine(bucket, idx, "quantity", Number(e.target.value) || 1)}
                                      className="h-7 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground">Unit £</Label>
                                    <Input
                                      type="number" min={0} step={0.01}
                                      value={row.unit_price}
                                      onChange={e => updateBucketLine(bucket, idx, "unit_price", parseFloat(e.target.value) || 0)}
                                      className="h-7 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground">Line £</Label>
                                    <div className="h-7 flex items-center text-sm font-semibold">
                                      £{((Number(row.quantity) || 1) * (Number(row.unit_price) || 0)).toFixed(2)}
                                    </div>
                                  </div>
                                  <div className={meta.showRegRef ? "col-span-1" : "col-span-1"}>
                                    <Label className="text-[10px] text-muted-foreground">Notes</Label>
                                    <Input
                                      value={row.notes}
                                      onChange={e => updateBucketLine(bucket, idx, "notes", e.target.value)}
                                      placeholder="Engineer notes"
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  {meta.showRegRef && (
                                    <div>
                                      <Label className="text-[10px] text-muted-foreground">Reg ref</Label>
                                      <Input
                                        value={row.regulation_reference || ""}
                                        onChange={e => updateBucketLine(bucket, idx, "regulation_reference", e.target.value)}
                                        placeholder="BS 5839-1 Cl."
                                        className="h-7 text-xs"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                                onClick={() => removeBucketLine(bucket, idx)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
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

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2, Send, AlertTriangle, Briefcase, Package, Receipt, ArrowRight, Search } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { stripScopeMarkdown, parseScopeNumberedItems } from "@/lib/scopeMarkdown";
import { PriceLookupDialog, type PriceLookupApply } from "./PriceLookupDialog";

interface CostLine {
  description: string;
  quantity: number;
  unit_price: number;
  notes: string;
}

interface CategorisedLineItems {
  labour: CostLine[];
  materials: CostLine[];
  extras: CostLine[];
}

interface InventoryQuoteResult {
  interpretation: string;
  scope_content: string;
  line_items: CategorisedLineItems;
  labour_estimate: { engineers: number; days: number } | null;
  device_count: number;
  unique_types: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId: string;
  siteName: string;
  /** Site's panel manufacturer for biasing price lookups. Optional. */
  panelMakeModel?: string | null;
}

type Status = "idle" | "generating" | "ready" | "error" | "creating";

// ── Helpers — reuse the LineItem grouping for the read-only review ──────────

const BUCKETS = [
  { key: "labour" as const,    label: "Labour",    icon: Briefcase },
  { key: "materials" as const, label: "Materials", icon: Package },
  { key: "extras" as const,    label: "Extras",    icon: Receipt },
];

function isTbcLine(row: CostLine): boolean {
  if ((Number(row.unit_price) || 0) === 0) return true;
  return (row.description ?? "").toLowerCase().includes("engineer to confirm");
}

// Build the rows to insert into quotation_line_items. Mirrors the structure
// AIDefectQuoteDialog uses (PR #210, PR #216) — labour rows put cost into
// labour_cost only, non-labour into unit_price + cost_price. total_price is
// computed here so the parent's total_amount is correct on insert.
function buildLineItemRows(quotationId: string, lineItems: CategorisedLineItems) {
  const rows: Array<Record<string, unknown>> = [];
  let sort = 0;
  const push = (items: CostLine[], isLabour: boolean) => {
    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      const unit = Number(item.unit_price) || 0;
      rows.push({
        quotation_id: quotationId,
        is_section: false,
        description: item.description,
        quantity: qty,
        unit_price: isLabour ? 0 : unit,
        cost_price: isLabour ? 0 : unit,
        labour_cost: isLabour ? unit : 0,
        labour_included: isLabour,
        total_price: qty * unit,
        notes: item.notes || null,
        sort_order: sort++,
      });
    }
  };
  push(lineItems.labour,    true);
  push(lineItems.materials, false);
  push(lineItems.extras,    false);
  return rows;
}

function totalFor(lineItems: CategorisedLineItems): number {
  const sum = (rows: CostLine[]) =>
    rows.reduce((s, r) => s + (Number(r.quantity) || 1) * (Number(r.unit_price) || 0), 0);
  return sum(lineItems.labour) + sum(lineItems.materials) + sum(lineItems.extras);
}

// ────────────────────────────────────────────────────────────────────────────

export function InventoryQuoteDialog({ open, onOpenChange, siteId, siteName, panelMakeModel }: Props) {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InventoryQuoteResult | null>(null);
  // Price-lookup dialog state — opens when an engineer clicks the
  // Lookup button on a TBC row in the review screen. We track which
  // bucket+index is being edited so the onApply callback knows where
  // to write the chosen price back.
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupTarget, setLookupTarget] = useState<{ bucket: keyof CategorisedLineItems; index: number; query: string } | null>(null);

  const reset = () => {
    setPrompt("");
    setStatus("idle");
    setError(null);
    setResult(null);
    setLookupOpen(false);
    setLookupTarget(null);
  };

  // Update a single line item in the result — used both by the price
  // lookup apply callback and by future inline-edit UI on the review
  // screen. Mutating the result state lets the engineer fix prices
  // before "Create Quote" without having to re-prompt.
  function patchLine(bucket: keyof CategorisedLineItems, index: number, patch: Partial<CostLine>) {
    setResult((prev) => {
      if (!prev) return prev;
      const next = { ...prev, line_items: { ...prev.line_items } };
      next.line_items[bucket] = next.line_items[bucket].map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      );
      return next;
    });
  }

  function openLookupForRow(bucket: keyof CategorisedLineItems, index: number) {
    const row = result?.line_items[bucket][index];
    if (!row) return;
    setLookupTarget({ bucket, index, query: row.description });
    setLookupOpen(true);
  }

  function handleLookupApply(picked: PriceLookupApply) {
    if (!lookupTarget) return;
    patchLine(lookupTarget.bucket, lookupTarget.index, {
      description: picked.description,
      unit_price: picked.unit_price,
      // Clear the TBC note when the engineer accepts a price — the
      // amber TBC ring will drop on the next render.
      notes: picked.source === "online"
        ? `Price sourced online (${picked.supplier ?? "unknown supplier"}) — verify before sending`
        : `Price from internal ${picked.supplier ?? "list"}`,
    });
    setLookupOpen(false);
    setLookupTarget(null);
    toast.success("Price applied to line");
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  async function handleGenerate() {
    const trimmed = prompt.trim();
    if (trimmed.length < 3) {
      setError("Type a request first — e.g. 'replace all detectors on Loop 1'");
      return;
    }
    setStatus("generating");
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("quote-from-site-inventory", {
        body: { site_id: siteId, prompt: trimmed, site_name: siteName || null },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!data || typeof data.scope_content !== "string" || !data.line_items) {
        throw new Error("Unexpected response shape from quote-from-site-inventory");
      }
      setResult(data as InventoryQuoteResult);
      setStatus("ready");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to generate";
      setError(msg);
      setStatus("error");
    }
  }

  async function handleCreateQuote() {
    if (!result) return;
    setStatus("creating");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: siteRow, error: siteErr } = await supabase
        .from("sites").select("customer_id").eq("id", siteId).maybeSingle();
      if (siteErr) throw siteErr;
      const { data: quotationNumber, error: numErr } = await supabase
        .rpc("get_next_quotation_number");
      if (numErr) throw numErr;
      if (!quotationNumber) throw new Error("Quotation number generator returned no value");

      // Cleaned introduction + parsed scope[] mirror the contract PR #217
      // wired up for the AI Defect Quote flow (so the PDF renderer reads
      // a clean introduction and the §2.2 list is populated at INSERT
      // rather than depending on the edge-function rewriter).
      const cleanedIntroduction = stripScopeMarkdown(result.scope_content);
      const parsedScopeItems = parseScopeNumberedItems(result.scope_content);

      const insertPayload: Record<string, unknown> = {
        site_id: siteId,
        customer_id: (siteRow as { customer_id?: string | null } | null)?.customer_id ?? null,
        title: "Remedial",   // PR #227 — kept minimal; engineer edits if they want
        introduction: cleanedIntroduction,
        ...(parsedScopeItems.length > 0 ? { scope: parsedScopeItems } : {}),
        status: "draft",
        quotation_number: quotationNumber,
        total_amount: totalFor(result.line_items),
        created_by: user.id,
        works_type: "reactive_remedial",
        job_category: "reactive_remedial",
        notes: `Quote generated from site inventory via AI prompt: "${prompt.trim()}". Interpretation: ${result.interpretation}. ${result.device_count} devices across ${result.unique_types} type${result.unique_types === 1 ? "" : "s"}.`,
      };

      const { data: quoteRow, error: insErr } = await supabase
        .from("quotations").insert(insertPayload as never).select("id").single();
      if (insErr) throw insErr;
      const quotationId = (quoteRow as { id: string }).id;

      const lineRows = buildLineItemRows(quotationId, result.line_items);
      if (lineRows.length > 0) {
        const { error: lineErr } = await supabase
          .from("quotation_line_items").insert(lineRows as never);
        if (lineErr) throw lineErr;
      }

      toast.success(`Quote ${quotationNumber} created`);
      onOpenChange(false);
      reset();
      // Navigate to the Quotations page; engineer can open + refine via
      // the existing QuotationDetailDialog (multi-select / merge / Improve
      // with AI / Scope tab — all the editor surfaces).
      navigate("/dashboard/quotations");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create quote";
      toast.error(msg);
      setStatus("ready");
    }
  }

  const total = result ? totalFor(result.line_items) : 0;
  const tbcCount = result
    ? BUCKETS.reduce((s, b) => s + result.line_items[b.key].filter(isTbcLine).length, 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => v ? onOpenChange(v) : handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Quote from inventory (AI)
          </DialogTitle>
          <DialogDescription>
            Describe what the customer wants. AI will pull matching devices
            from this site's inventory, look up prices, and draft a quote
            for you to review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Customer's request</Label>
            <Textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`e.g. "Replace all detectors on Loop 1 and 2"\nor "Swap every sounder on the second floor"\nor "Quote to replace all multi-criteria detectors at end-of-life"`}
              className="text-sm"
              disabled={status === "generating" || status === "creating"}
            />
            <p className="text-[10px] text-muted-foreground">
              Site: <strong>{siteName}</strong> · AI reads this site's `devices` inventory and the three pricing tables.
            </p>
          </div>

          {status === "idle" || status === "error" ? (
            <div className="space-y-2">
              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}
              <Button className="w-full gap-2" onClick={handleGenerate} disabled={!prompt.trim()}>
                <Sparkles className="h-4 w-4" />
                Generate quote draft
              </Button>
            </div>
          ) : status === "generating" ? (
            <div className="rounded-lg border bg-muted/30 p-6 flex items-center justify-center gap-3 text-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
              Reading inventory, looking up prices, and drafting the quote…
            </div>
          ) : result && (status === "ready" || status === "creating") ? (
            <div className="space-y-4">
              {/* Interpretation banner */}
              <div className="rounded-lg border bg-primary/5 p-3 text-xs">
                <span className="font-semibold">AI interpreted: </span>
                {result.interpretation || "(no interpretation provided)"}
                <span className="text-muted-foreground ml-2">
                  · {result.device_count} device{result.device_count === 1 ? "" : "s"} · {result.unique_types} type{result.unique_types === 1 ? "" : "s"}
                  {result.labour_estimate ? ` · ${result.labour_estimate.engineers} engineer${result.labour_estimate.engineers === 1 ? "" : "s"} × ${result.labour_estimate.days} day${result.labour_estimate.days === 1 ? "" : "s"}` : ""}
                </span>
              </div>

              {tbcCount > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 flex items-start gap-2 text-xs">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p>
                    <strong>{tbcCount}</strong> line{tbcCount === 1 ? "" : "s"} marked TBC
                    (£0 unit or "Engineer to confirm"). Review pricing in the quote editor after creation.
                  </p>
                </div>
              )}

              {/* Line items, read-only — engineer refines in
                  QuotationDetailDialog after Create Quote. */}
              {BUCKETS.map((b) => {
                const rows = result.line_items[b.key];
                if (rows.length === 0) return null;
                const Icon = b.icon;
                const bucketTotal = rows.reduce((s, r) => s + (Number(r.quantity) || 1) * (Number(r.unit_price) || 0), 0);
                return (
                  <Card key={b.key}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">{b.label}</span>
                          <span className="text-muted-foreground">
                            {rows.length} item{rows.length === 1 ? "" : "s"} · £{bucketTotal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {rows.map((r, i) => {
                          const tbc = isTbcLine(r);
                          const line = (Number(r.quantity) || 1) * (Number(r.unit_price) || 0);
                          return (
                            <div key={i} className={`rounded-md border bg-card p-2 text-xs ${tbc ? "ring-1 ring-amber-500/30" : ""}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium">{r.description}</p>
                                  {r.notes && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{r.notes}</p>
                                  )}
                                </div>
                                {tbc && (
                                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 text-[10px] gap-1 shrink-0">
                                    <AlertTriangle className="h-3 w-3" />TBC
                                  </Badge>
                                )}
                                <div className="text-right text-[11px] whitespace-nowrap shrink-0">
                                  <div>{Number(r.quantity) || 1} × £{(Number(r.unit_price) || 0).toFixed(2)}</div>
                                  <div className="font-semibold">£{line.toFixed(2)}</div>
                                  {/* TBC lines get a Lookup button so the
                                      engineer can resolve unmatched prices
                                      against internal lists and online
                                      sources before Create Quote. Non-TBC
                                      rows can still re-look-up via the
                                      same button if they want a different
                                      part — keeps the UI consistent. */}
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-6 px-1.5 mt-0.5 text-[10px] gap-1"
                                    onClick={() => openLookupForRow(b.key, i)}
                                    disabled={status === "creating"}
                                  >
                                    <Search className="h-3 w-3" />
                                    {tbc ? "Lookup price" : "Change"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Scope */}
              {result.scope_content.trim() && (
                <Card>
                  <CardContent className="p-3 space-y-1">
                    <div className="text-xs font-semibold">Scope of Works</div>
                    <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground">
                      {result.scope_content.trim()}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {/* Totals */}
              <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total (ex VAT)</span>
                <span className="text-lg font-bold">£{total.toFixed(2)}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => { setStatus("idle"); setResult(null); }} disabled={status === "creating"}>
                  Try a different prompt
                </Button>
                <Button onClick={handleCreateQuote} disabled={status === "creating"} className="gap-2">
                  {status === "creating" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Create Quote
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>

      {/* Nested price lookup — opens off a per-row Lookup button. The
          parent InventoryQuoteDialog stays mounted so its result state
          isn't lost when the engineer closes the lookup. */}
      <PriceLookupDialog
        open={lookupOpen}
        onOpenChange={(v) => {
          setLookupOpen(v);
          if (!v) setLookupTarget(null);
        }}
        initialQuery={lookupTarget?.query ?? ""}
        manufacturerHint={panelMakeModel ?? null}
        onApply={handleLookupApply}
      />
    </Dialog>
  );
}

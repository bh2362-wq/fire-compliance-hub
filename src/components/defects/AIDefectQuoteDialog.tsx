import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Trash2, Send, Loader2, AlertOctagon, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { updateDefect, type Defect } from "@/services/defectService";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  item_name: string;
  description: string;
  quantity: number;
  cost_price: number;
  labour_cost: number;
  regulation_reference: string;
  notes: string;
  priority: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defects: Defect[];
  onQuoteCreated: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function catIcon(cat: number) {
  if (cat === 1) return <AlertOctagon className="w-3 h-3 text-destructive flex-shrink-0" />;
  if (cat === 2) return <AlertTriangle className="w-3 h-3 text-orange-500 flex-shrink-0" />;
  return <Info className="w-3 h-3 text-yellow-600 flex-shrink-0" />;
}

function catLabel(cat: number) {
  if (cat === 1) return "Cat 1 — Immediate";
  if (cat === 2) return "Cat 2 — Urgent";
  return "Cat 3 — Advisory";
}

// ── Component ──────────────────────────────────────────────────────────────────

export function AIDefectQuoteDialog({ open, onOpenChange, defects, onQuoteCreated }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState<"idle" | "generating" | "review">("idle");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [quoteTitle, setQuoteTitle] = useState("");
  const [quoteSummary, setQuoteSummary] = useState("");
  const [creating, setCreating] = useState(false);

  // Group defects by site for the prompt
  const primarySite = defects[0];
  const siteName = primarySite?.site_name || "site";
  const siteId = primarySite?.site_id || "";

  function handleClose() {
    setStep("idle");
    setLineItems([]);
    setQuoteTitle("");
    setQuoteSummary("");
    onOpenChange(false);
  }

  async function handleGenerate() {
    setStep("generating");
    try {
      const defectList = defects
        .sort((a, b) => a.category - b.category) // Cat 1 first
        .map((d, i) =>
          `${i + 1}. [${catLabel(d.category)}] ${d.description}` +
          (d.location ? ` — Location: ${d.location}` : "") +
          (d.notes ? ` — Notes: ${d.notes}` : "")
        )
        .join("\n");

      const hasCat1 = defects.some(d => d.category === 1);
      const hasCat2 = defects.some(d => d.category === 2);
      const urgency = hasCat1 ? "URGENT — Cat 1 immediate danger defects present" : hasCat2 ? "Cat 2 urgent defects present" : "Advisory defects";

      const { data: fnData, error: fnError } = await supabase.functions.invoke("claude-chat", {
        body: {
          model: "claude-sonnet-4-20250514",
          system: `You are a fire alarm engineering quotation specialist for BHO Fire & Security Ltd, a UK fire alarm contractor based in Kent. 
Generate professional remedial works quotation content from defect descriptions found during a BS 5839-1 inspection.

Rules:
- Group logically related defects into single line items where appropriate (e.g. multiple panel downloads = one line item)
- Each line item must have a clear, professional trade description
- Regulation references should cite specific BS 5839-1:2017+A2:2019 or BS 5839-1:2025 clauses where relevant
- Leave cost_price and labour_cost as 0 — the engineer will fill in actual prices
- Cat 1 defects should appear first and be marked priority "Cat1-Immediate"
- Be specific and technical — this goes directly to the client

Return ONLY this exact JSON structure, no other text:
{
  "quote_title": "Remedial Works — [site name] — [brief scope]",
  "summary": "Two to three sentence professional summary of the remedial works required and urgency level.",
  "line_items": [
    {
      "item_name": "Short trade name, max 8 words",
      "description": "Full professional description of the scope of work for this item, including what will be done and why",
      "quantity": 1,
      "cost_price": 0,
      "labour_cost": 0,
      "regulation_reference": "BS 5839-1:2025 Cl. XX or leave blank if not specific",
      "notes": "Any relevant notes for the engineer pricing this item",
      "priority": "Cat1-Immediate | Cat2-Urgent | Cat3-Advisory"
    }
  ]
}`,
          messages: [{
            role: "user",
            content: `Generate a remedial works quotation for the following defects found at ${siteName}.\n\nUrgency: ${urgency}\n\nDefects:\n${defectList}`,
          }],
        },
      });

      if (fnError) {
        throw new Error(`AI request failed: ${fnError.message}`);
      }

      const rawText: string = typeof fnData?.content === "string"
        ? fnData.content
        : Array.isArray(fnData?.content)
          ? fnData.content.find((c: { type: string }) => c.type === "text")?.text || ""
          : "";

      let parsed: { quote_title: string; summary: string; line_items: LineItem[] };
      try {
        parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      } catch {
        throw new Error("AI returned an unexpected format — please try again");
      }

      setQuoteTitle(parsed.quote_title || `Remedial Works — ${siteName}`);
      setQuoteSummary(parsed.summary || "");
      setLineItems((parsed.line_items || []).map(item => ({ ...item, id: uid() })));
      setStep("review");
      toast.success(`${parsed.line_items?.length || 0} line items generated — review and adjust before creating`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error(message);
      setStep("idle");
    }
  }

  // ── Line item editing ────────────────────────────────────────────────────────

  function updateItem<K extends keyof LineItem>(id: string, field: K, value: LineItem[K]) {
    setLineItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  }

  function removeItem(id: string) {
    setLineItems(prev => prev.filter(item => item.id !== id));
  }

  function addItem() {
    setLineItems(prev => [...prev, {
      id: uid(),
      item_name: "",
      description: "",
      quantity: 1,
      cost_price: 0,
      labour_cost: 0,
      regulation_reference: "",
      notes: "",
      priority: "Cat3-Advisory",
    }]);
  }

  // ── Totals ────────────────────────────────────────────────────────────────────

  const totalMaterials = lineItems.reduce((s, i) => s + Number(i.cost_price) * Number(i.quantity), 0);
  const totalLabour    = lineItems.reduce((s, i) => s + Number(i.labour_cost) * Number(i.quantity), 0);
  const totalAmount    = totalMaterials + totalLabour;

  // ── Create quote ──────────────────────────────────────────────────────────────

  async function handleCreateQuote() {
    if (!lineItems.length) { toast.error("Add at least one line item"); return; }
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // Get customer_id from the first defect's site
      const { data: siteData } = await supabase
        .from("sites")
        .select("customer_id, name")
        .eq("id", siteId)
        .maybeSingle();

      const quotationNumber = `REM-${Date.now().toString().slice(-8)}`;

      // Create quotation
      const { data: quotation, error: qErr } = await supabase
        .from("quotations")
        .insert({
          site_id: siteId,
          customer_id: siteData?.customer_id ?? null,
          title: quoteTitle,
          summary: quoteSummary,
          status: "draft",
          quotation_number: quotationNumber,
          total_amount: totalAmount,
          created_by: user.id,
          notes: `Remedial works quotation generated from ${defects.length} defect${defects.length !== 1 ? "s" : ""} identified during site inspection. Defect IDs: ${defects.map(d => d.id).join(", ")}`,
        })
        .select()
        .single();

      if (qErr) throw qErr;

      // Create line items
      const lineItemRows = lineItems.map((item, idx) => ({
        quotation_id: quotation.id,
        item_name: item.item_name,
        description: item.description,
        quantity: Number(item.quantity),
        cost_price: Number(item.cost_price),
        labour_cost: Number(item.labour_cost),
        labour_included: Number(item.labour_cost) > 0,
        regulation_reference: item.regulation_reference || null,
        notes: item.notes || null,
        priority: item.priority,
        sort_order: idx,
      }));

      const { error: liErr } = await supabase
        .from("quotation_line_items")
        .insert(lineItemRows);

      if (liErr) throw liErr;

      // Mark all selected defects as "quoted" and link quotation_id
      await Promise.all(defects.map(d =>
        updateDefect(d.id, { status: "quoted", quotation_id: quotation.id })
          .catch(console.error)
      ));

      toast.success(`Quote ${quotationNumber} created — opening now`);
      handleClose();
      onQuoteCreated();

      // Navigate to the quotation
      navigate(`/dashboard/quotations/${quotation.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create quotation";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const priorityColor: Record<string, string> = {
    "Cat1-Immediate": "border-red-300/60 bg-red-50 dark:bg-red-950/20",
    "Cat2-Urgent":    "border-orange-300/60 bg-orange-50 dark:bg-orange-950/20",
    "Cat3-Advisory":  "border-border bg-card",
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Remedial Works Quote
            <Badge variant="outline" className="text-[10px] ml-1">
              {defects.length} defect{defects.length !== 1 ? "s" : ""} selected
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Selected defects summary */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Defects being quoted
            </p>
            {defects
              .sort((a, b) => a.category - b.category)
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
          {step === "idle" && (
            <Button
              onClick={handleGenerate}
              size="lg"
              className="w-full gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Generate Skeleton Quote with AI
            </Button>
          )}

          {/* Step: generating */}
          {step === "generating" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Analysing defects and generating quote…</p>
              <p className="text-xs">Claude is reading your defects and drafting professional line items</p>
            </div>
          )}

          {/* Step: review */}
          {step === "review" && (
            <div className="space-y-4">
              {/* Quote title */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Quote Title</Label>
                <Input
                  value={quoteTitle}
                  onChange={e => setQuoteTitle(e.target.value)}
                  className="font-medium"
                />
              </div>

              {/* Summary */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Cover Summary <span className="font-normal text-muted-foreground">(shown to client)</span>
                </Label>
                <Textarea
                  rows={3}
                  value={quoteSummary}
                  onChange={e => setQuoteSummary(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Line items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">
                    Line Items
                    <span className="font-normal text-muted-foreground ml-2">
                      — edit descriptions, add prices, adjust quantities
                    </span>
                  </Label>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addItem}>
                    <Plus className="h-3.5 w-3.5" />Add Row
                  </Button>
                </div>

                {lineItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className={cn("rounded-lg border p-3 space-y-2.5", priorityColor[item.priority] || "border-border")}
                  >
                    {/* Row header */}
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground w-5 mt-1 flex-shrink-0">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 space-y-2">
                        <Input
                          value={item.item_name}
                          onChange={e => updateItem(item.id, "item_name", e.target.value)}
                          placeholder="Item name (e.g. Replace VESDA Unit)"
                          className="font-semibold text-sm h-8"
                        />
                        <Textarea
                          rows={2}
                          value={item.description}
                          onChange={e => updateItem(item.id, "description", e.target.value)}
                          placeholder="Full description of work to be carried out…"
                          className="text-xs"
                        />

                        {/* Pricing row */}
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Qty</Label>
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={e => updateItem(item.id, "quantity", Number(e.target.value) || 1)}
                              className="h-7 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Materials £</Label>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.cost_price}
                              onChange={e => updateItem(item.id, "cost_price", parseFloat(e.target.value) || 0)}
                              className="h-7 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Labour £</Label>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={item.labour_cost}
                              onChange={e => updateItem(item.id, "labour_cost", parseFloat(e.target.value) || 0)}
                              className="h-7 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Line total</Label>
                            <div className="h-7 flex items-center text-sm font-semibold text-foreground">
                              £{((Number(item.cost_price) + Number(item.labour_cost)) * Number(item.quantity)).toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {/* Reg ref + priority */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Regulation Reference</Label>
                            <Input
                              value={item.regulation_reference}
                              onChange={e => updateItem(item.id, "regulation_reference", e.target.value)}
                              placeholder="e.g. BS 5839-1:2025 Cl. 25"
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Priority</Label>
                            <select
                              value={item.priority}
                              onChange={e => updateItem(item.id, "priority", e.target.value)}
                              className="w-full h-7 text-xs rounded-md border border-input bg-background px-2"
                            >
                              <option value="Cat1-Immediate">Cat 1 — Immediate</option>
                              <option value="Cat2-Urgent">Cat 2 — Urgent</option>
                              <option value="Cat3-Advisory">Cat 3 — Advisory</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between flex-wrap gap-3 text-sm">
                  <div className="flex gap-6">
                    <div>
                      <span className="text-muted-foreground text-xs">Materials</span>
                      <p className="font-semibold">£{totalMaterials.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Labour</span>
                      <p className="font-semibold">£{totalLabour.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground text-xs">Total (ex VAT)</span>
                    <p className="text-lg font-bold">
                      £{totalAmount.toFixed(2)}
                    </p>
                  </div>
                </div>
                {totalAmount === 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Prices are £0 — you can update them after the quote is created, or fill them in above first.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t px-6 py-4 flex items-center gap-2 flex-shrink-0 bg-background">
          <Button variant="outline" onClick={handleClose} disabled={creating}>
            Cancel
          </Button>
          {step === "review" && (
            <>
              <Button variant="ghost" onClick={() => { setStep("idle"); setLineItems([]); }} disabled={creating}>
                Re-generate
              </Button>
              <Button
                className="ml-auto gap-2"
                onClick={handleCreateQuote}
                disabled={creating || lineItems.length === 0}
              >
                {creating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Creating…</>
                ) : (
                  <><Send className="h-4 w-4" />Create Quote</>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

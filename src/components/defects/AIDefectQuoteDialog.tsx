import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, Trash2, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Defect {
  id: string;
  description: string;
  category: number | string;
  location?: string | null;
  status?: string;
}

interface LineItem {
  item_name: string;
  description: string;
  quantity: number;
  cost_price: number;
  labour_cost: number;
  regulation_reference: string;
  notes: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defects: Defect[];
  siteId: string;
  siteName: string;
  customerId?: string | null;
  onQuoteCreated: (quotationId: string) => void;
}

export function AIDefectQuoteDialog({
  open,
  onOpenChange,
  defects,
  siteId,
  siteName,
  customerId,
  onQuoteCreated,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [quoteTitle, setQuoteTitle] = useState(`Remedial Works – ${siteName}`);
  const [summary, setSummary] = useState("");
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<"idle" | "review">("idle");

  useEffect(() => {
    if (open) {
      setStep("idle");
      setLineItems([]);
      setSummary("");
      setQuoteTitle(`Remedial Works – ${siteName}`);
    }
  }, [open, siteName]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-defect-quote", {
        body: {
          siteName,
          defects: defects.map((d) => ({
            id: d.id,
            description: d.description,
            category: d.category,
            location: d.location ?? null,
          })),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const items: LineItem[] = ((data as any)?.line_items || []).map((i: any) => ({
        item_name: i.item_name || "",
        description: i.description || "",
        quantity: Number(i.quantity) || 1,
        cost_price: Number(i.cost_price) || 0,
        labour_cost: Number(i.labour_cost) || 0,
        regulation_reference: i.regulation_reference || "",
        notes: i.notes || "",
      }));
      setLineItems(items);
      setSummary((data as any)?.summary || "");
      setStep("review");
      toast.success(`${items.length} line items generated`);
    } catch (err: any) {
      toast.error(err.message || "Generation failed — try again");
    } finally {
      setGenerating(false);
    }
  }

  function updateItem(idx: number, field: keyof LineItem, value: string | number) {
    setLineItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  function removeItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addItem() {
    setLineItems((prev) => [
      ...prev,
      { item_name: "", description: "", quantity: 1, cost_price: 0, labour_cost: 0, regulation_reference: "", notes: "" },
    ]);
  }

  async function handleCreateQuote() {
    if (!lineItems.length) return;
    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const totalAmount = lineItems.reduce(
        (sum, item) => sum + (Number(item.cost_price) + Number(item.labour_cost)) * Number(item.quantity),
        0
      );

      const { data: quotationNumber, error: numErr } = await supabase.rpc("get_next_quotation_number");
      if (numErr) throw numErr;

      const { data: quotation, error: qErr } = await supabase
        .from("quotations")
        .insert({
          quotation_number: quotationNumber,
          site_id: siteId,
          customer_id: customerId ?? null,
          title: quoteTitle,
          summary,
          status: "draft",
          total_amount: totalAmount,
          created_by: user.id,
          notes: `Generated from ${defects.length} defect${defects.length !== 1 ? "s" : ""} identified during site inspection. Defect IDs: ${defects.map((d) => d.id).join(", ")}`,
        })
        .select()
        .single();
      if (qErr) throw qErr;

      const priority =
        String(defects[0]?.category) === "1"
          ? "Cat1"
          : String(defects[0]?.category) === "2"
          ? "Cat2"
          : "Cat3";

      const lineItemRows = lineItems.map((item, idx) => {
        const total = (Number(item.cost_price) + Number(item.labour_cost)) * Number(item.quantity);
        return {
          quotation_id: quotation.id,
          item_name: item.item_name,
          description: item.description,
          quantity: item.quantity,
          unit_price: Number(item.cost_price) + Number(item.labour_cost),
          total_price: total,
          cost_price: item.cost_price,
          labour_cost: item.labour_cost,
          labour_included: item.labour_cost > 0,
          regulation_reference: item.regulation_reference,
          notes: item.notes,
          priority,
          sort_order: idx,
          source_type: "defect",
        };
      });

      const { error: liErr } = await supabase.from("quotation_line_items").insert(lineItemRows);
      if (liErr) throw liErr;

      toast.success("Quotation created");
      onOpenChange(false);
      onQuoteCreated(quotation.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to create quotation");
    } finally {
      setCreating(false);
    }
  }

  const totalMaterials = lineItems.reduce((s, i) => s + Number(i.cost_price) * Number(i.quantity), 0);
  const totalLabour = lineItems.reduce((s, i) => s + Number(i.labour_cost) * Number(i.quantity), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Remedial Works Quote
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Selected Defects ({defects.length})
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {defects.map((d) => (
                <div key={d.id} className="flex items-start gap-2 text-sm">
                  <Badge variant="outline" className="flex-shrink-0">Cat {d.category}</Badge>
                  <span className="line-clamp-2">{d.description}</span>
                </div>
              ))}
            </div>
          </div>

          {step === "idle" && (
            <Button className="w-full gap-2" onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating quote items…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Quote with AI
                </>
              )}
            </Button>
          )}

          {step === "review" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quote Title</label>
                <Input value={quoteTitle} onChange={(e) => setQuoteTitle(e.target.value)} />
              </div>

              {summary && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</label>
                  <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Line Items</p>
                  <Button variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Add Row
                  </Button>
                </div>
                {lineItems.map((item, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2 bg-card">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          placeholder="Item name"
                          value={item.item_name}
                          onChange={(e) => updateItem(idx, "item_name", e.target.value)}
                          className="text-sm font-medium"
                        />
                        <Textarea
                          rows={2}
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                          className="text-xs"
                        />
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground">Qty</label>
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Materials £</label>
                            <Input
                              type="number"
                              min={0}
                              value={item.cost_price}
                              onChange={(e) => updateItem(idx, "cost_price", Number(e.target.value))}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Labour £</label>
                            <Input
                              type="number"
                              min={0}
                              value={item.labour_cost}
                              onChange={(e) => updateItem(idx, "labour_cost", Number(e.target.value))}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Line total</label>
                            <div className="h-9 flex items-center text-sm font-medium">
                              £{((Number(item.cost_price) + Number(item.labour_cost)) * Number(item.quantity)).toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <Input
                          placeholder="Regulation reference e.g. BS 5839-1:2017 Cl. 45"
                          value={item.regulation_reference}
                          onChange={(e) => updateItem(idx, "regulation_reference", e.target.value)}
                          className="text-xs"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(idx)}
                        className="text-destructive flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border text-sm">
                <div className="flex gap-6">
                  <div>
                    <span className="text-muted-foreground">Materials: </span>
                    <span className="font-semibold">£{totalMaterials.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Labour: </span>
                    <span className="font-semibold">£{totalLabour.toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-base font-bold">Total: £{(totalMaterials + totalLabour).toFixed(2)}</div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("idle")}>
                  Re-generate
                </Button>
                <Button className="flex-1" onClick={handleCreateQuote} disabled={creating || !lineItems.length}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />Create Quotation
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

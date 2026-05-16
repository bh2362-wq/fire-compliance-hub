import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Search, Merge, Loader2, Sparkles, FileText,
  Globe, CheckCircle2, Edit3, RotateCcw,
} from "lucide-react";
import {
  getPriceListWithItems, updatePriceItem, mergeItems, searchDevicePrices,
  updatePriceListTotals, DevicePriceItem, DevicePriceList,
} from "@/services/devicePricingService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DevicePriceResultsDialog } from "./DevicePriceResultsDialog";
import { PushToQuotationDialog } from "./PushToQuotationDialog";

interface DevicePricingWorkbenchProps {
  priceListId: string;
  onBack: () => void;
}

interface EditState {
  description: string;
  model_number: string;
  dirty: boolean; // changed from original
}

export function DevicePricingWorkbench({ priceListId, onBack }: DevicePricingWorkbenchProps) {
  const [priceList,       setPriceList]       = useState<DevicePriceList | null>(null);
  const [items,           setItems]           = useState<DevicePriceItem[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [searchingAll,    setSearchingAll]    = useState(false);
  const [searchingItem,   setSearchingItem]   = useState<string | null>(null);
  const [verifyingItem,   setVerifyingItem]   = useState<string | null>(null);
  const [priceDialogItem, setPriceDialogItem] = useState<DevicePriceItem | null>(null);
  const [pushToQuoteOpen, setPushToQuoteOpen] = useState(false);
  // Per-row edit state for descriptions
  const [edits, setEdits] = useState<Record<string, EditState>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { priceList: pl, items: it, error } = await getPriceListWithItems(priceListId);
    if (error) toast.error("Failed to load price list");
    setPriceList(pl);
    setItems(it);
    setEdits({});
    setLoading(false);
  }, [priceListId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Edit helpers ────────────────────────────────────────────────────────────
  function getEdit(item: DevicePriceItem): EditState {
    return edits[item.id] ?? {
      description:  item.description,
      model_number: item.model_number || "",
      dirty:        false,
    };
  }

  function setEdit(id: string, patch: Partial<EditState>) {
    setEdits(prev => ({
      ...prev,
      [id]: { ...getEditById(id), ...patch, dirty: true },
    }));
  }

  function getEditById(id: string): EditState {
    const item = items.find(i => i.id === id);
    return edits[id] ?? {
      description:  item?.description || "",
      model_number: item?.model_number || "",
      dirty:        false,
    };
  }

  function resetEdit(id: string) {
    setEdits(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // ── Field change (numeric) ──────────────────────────────────────────────────
  const handleFieldChange = async (id: string, field: string, value: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const updates: Record<string, number> = { [field]: value };
    const costPrice  = field === "cost_price"      ? value : item.cost_price;
    const markup     = field === "markup_percent"  ? value : item.markup_percent;
    const qty        = field === "quantity"        ? value : item.quantity;
    const labour     = field === "labour_cost"     ? value : item.labour_cost;
    updates.sell_price = costPrice * (1 + markup / 100) * qty + labour;
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
    await updatePriceItem(id, updates);
    await updatePriceListTotals(priceListId);
  };

  // ── Merge ────────────────────────────────────────────────────────────────────
  const handleMerge = async () => {
    if (selectedIds.size < 2) { toast.error("Select at least 2 items to merge"); return; }
    const { error } = await mergeItems(priceListId, Array.from(selectedIds), items);
    if (error) toast.error(error.message);
    else { toast.success("Items merged"); setSelectedIds(new Set()); fetchData(); }
  };

  // ── Catalog-first lookup ──────────────────────────────────────────────────────
  const lookupFromCatalog = async (model_number: string | undefined, description: string) => {
    const query = model_number?.trim() || description.trim();
    if (!query) return null;
    const { data } = await supabase.functions.invoke("lookup-material", {
      body: { query, limit: 3 },
    });
    if (!data?.suggestions?.length) return null;
    const top = data.suggestions[0];
    const price = Number(top.retail_price) || 0;
    if (price <= 0) return null;
    // Confidence check
    const words = query.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
    const descLow = (top.description || "").toLowerCase();
    const matched = words.filter((w: string) => descLow.includes(w)).length;
    const ratio = words.length > 0 ? matched / words.length : 0;
    return ratio >= 0.4 ? { price, description: top.description, part_number: top.part_number, source: top.source } : null;
  };

  // ── AI search all (catalog-first, AI fallback) ────────────────────────────────
  const handleSearchAll = async () => {
    const pendingItems = items.filter(i =>
      i.ai_search_status === "pending" || i.ai_search_status === "error"
    );
    if (pendingItems.length === 0) { toast.info("All items already priced"); return; }
    setSearchingAll(true);

    let catalogHits = 0, aiHits = 0;

    for (const item of pendingItems) {
      // Step 1 — check Huvo catalog first
      const catalogMatch = await lookupFromCatalog(item.model_number || undefined, item.description);
      if (catalogMatch) {
        const updates = {
          cost_price:       catalogMatch.price,
          sell_price:       catalogMatch.price * (1 + item.markup_percent / 100) * item.quantity + item.labour_cost,
          ai_search_status: "completed" as const,
          ai_price_results: [{ name: "Huvo Catalog", estimated_price: catalogMatch.price, source: catalogMatch.source, description: catalogMatch.description }],
        };
        await updatePriceItem(item.id, updates);
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i));
        catalogHits++;
        continue;
      }

      // Step 2 — fall back to AI estimate
      const { results, error } = await searchDevicePrices([{
        model_number: item.model_number || undefined,
        description:  item.description,
        quantity:     item.quantity,
      }]);
      if (!error && results[0]) {
        const bestPrice = results[0].estimated_trade_price || 0;
        const updates = {
          cost_price:       bestPrice,
          sell_price:       bestPrice * (1 + item.markup_percent / 100) * item.quantity + item.labour_cost,
          ai_search_status: "completed" as const,
          ai_price_results: results[0].suppliers || [],
        };
        await updatePriceItem(item.id, updates);
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i));
        aiHits++;
      }
    }

    await updatePriceListTotals(priceListId);
    toast.success(`Priced ${catalogHits + aiHits} items — ${catalogHits} from Huvo catalog, ${aiHits} AI estimates`);
    setSearchingAll(false);
    fetchData();
  };

  // ── Single item search (catalog-first, AI fallback) ─────────────────────────
  const handleSearchSingle = async (item: DevicePriceItem) => {
    setSearchingItem(item.id);
    const edit = getEdit(item);
    const modelNum = edit.model_number || item.model_number || undefined;
    const desc     = edit.description  || item.description;

    // Step 1 — Huvo catalog
    const catalogMatch = await lookupFromCatalog(modelNum, desc);
    if (catalogMatch) {
      const updates = {
        cost_price:       catalogMatch.price,
        sell_price:       catalogMatch.price * (1 + item.markup_percent / 100) * item.quantity + item.labour_cost,
        ai_search_status: "completed" as const,
        ai_price_results: [{ name: "Huvo Catalog", estimated_price: catalogMatch.price, source: catalogMatch.source, description: catalogMatch.description }],
      };
      await updatePriceItem(item.id, updates);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i));
      await updatePriceListTotals(priceListId);
      toast.success(`Matched from Huvo catalog — £${catalogMatch.price.toFixed(2)}`);
      setSearchingItem(null);
      return;
    }

    // Step 2 — AI estimate fallback
    const { results, error } = await searchDevicePrices([{ model_number: modelNum, description: desc, quantity: item.quantity }]);
    if (error) {
      await updatePriceItem(item.id, { ai_search_status: "error" });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ai_search_status: "error" } : i));
      toast.error(error.message);
      setSearchingItem(null);
      return;
    }
    const result = results[0];
    const bestPrice = Number(result?.estimated_trade_price) || 0;
    if (result && bestPrice > 0) {
      const updates = {
        cost_price:       bestPrice,
        sell_price:       bestPrice * (1 + item.markup_percent / 100) * item.quantity + item.labour_cost,
        ai_search_status: "completed" as const,
        ai_price_results: result.suppliers || [],
      };
      await updatePriceItem(item.id, updates);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i));
      await updatePriceListTotals(priceListId);
      toast.info(`AI estimate — £${bestPrice.toFixed(2)} (not in Huvo catalog)`);
    } else {
      await updatePriceItem(item.id, { ai_search_status: "not_found" });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ai_search_status: "not_found" } : i));
      toast.warning("No match in Huvo catalog or AI sources — enter price manually");
    }
    setSearchingItem(null);
  };

  // ── WEB VERIFY — real web search via Anthropic ────────────────────────────
  const handleWebVerify = async (item: DevicePriceItem) => {
    const edit = getEdit(item);
    const description  = edit.description  || item.description;
    const model_number = edit.model_number || item.model_number || "";

    if (!description && !model_number) {
      toast.error("Enter a description or model number to look up");
      return;
    }

    setVerifyingItem(item.id);
    try {
      const { data, error } = await supabase.functions.invoke("verify-device-price", {
        body: { description, model_number, quantity: item.quantity },
      });

      if (error || !data?.result) {
        throw new Error(error?.message || "No result returned");
      }

      const r = data.result;
      const bestPrice = r.best_trade_price || 0;

      const updates: any = {
        cost_price:       bestPrice,
        sell_price:       bestPrice * (1 + item.markup_percent / 100) * item.quantity + item.labour_cost,
        ai_search_status: "completed",
        ai_price_results: r.suppliers || [],
        // Update description + model if verified
        ...(r.verified_description  && { description:   r.verified_description }),
        ...(r.verified_model_number && { model_number:  r.verified_model_number }),
      };

      await updatePriceItem(item.id, updates);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i));
      await updatePriceListTotals(priceListId);

      // Clear the dirty edit state — values now match DB
      resetEdit(item.id);

      const confidence = r.confidence === "high" ? "✓ High confidence" :
                         r.confidence === "medium" ? "⚠ Medium confidence" : "ℹ Low confidence";
      toast.success(`Web lookup complete — £${bestPrice.toFixed(2)} found. ${confidence}`);

    } catch (e: any) {
      toast.error(`Web lookup failed: ${e.message}`);
    } finally {
      setVerifyingItem(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalCost   = items.reduce((s, i) => s + Number(i.cost_price) * i.quantity, 0);
  const totalSell   = items.reduce((s, i) => s + Number(i.sell_price), 0);
  const totalProfit = totalSell - totalCost;

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{priceList?.name}</h2>
            <p className="text-sm text-muted-foreground">{items.length} devices</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size >= 2 && (
            <Button variant="outline" size="sm" onClick={handleMerge}>
              <Merge className="mr-2 h-4 w-4" /> Merge ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSearchAll} disabled={searchingAll}>
            {searchingAll
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...</>
              : <><Sparkles className="mr-2 h-4 w-4" /> AI Price All</>}
          </Button>
          <Button size="sm" onClick={() => setPushToQuoteOpen(true)} disabled={items.length === 0}>
            <FileText className="mr-2 h-4 w-4" /> Push to Quote
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="Devices"    value={items.length.toString()} />
        <SummaryCard label="Total Cost" value={`£${totalCost.toFixed(2)}`} />
        <SummaryCard label="Total Sell" value={`£${totalSell.toFixed(2)}`} />
        <SummaryCard label="Profit"     value={`£${totalProfit.toFixed(2)}`}
          variant={totalProfit > 0 ? "success" : "default"} />
      </div>

      {/* Helper text */}
      <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 flex-shrink-0" />
        <span>
          If an item is not in the price list, edit the description or model number then click
          <strong className="text-foreground"> Look Up</strong> to search the web for real UK supplier prices.
        </span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-28">Model</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-16 text-center">Qty</TableHead>
                <TableHead className="w-24">Cost (£)</TableHead>
                <TableHead className="w-20">Markup %</TableHead>
                <TableHead className="w-24">Labour (£)</TableHead>
                <TableHead className="w-24">Sell (£)</TableHead>
                <TableHead className="w-36">Price Check</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => {
                const edit          = getEdit(item);
                const isDirty       = edit.dirty;
                const isSearching   = searchingItem  === item.id;
                const isVerifying   = verifyingItem  === item.id;
                const busy          = isSearching || isVerifying;
                const hasPrices     = item.ai_search_status === "completed";

                return (
                  <TableRow
                    key={item.id}
                    className={`${selectedIds.has(item.id) ? "bg-primary/5" : ""}
                      ${isDirty ? "bg-amber-50/50" : ""}`}
                  >
                    {/* Checkbox */}
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={() => toggleSelect(item.id)}
                      />
                    </TableCell>

                    {/* Model — editable */}
                    <TableCell>
                      <Input
                        value={edit.model_number}
                        onChange={(e) => setEdit(item.id, { model_number: e.target.value })}
                        placeholder="Part no."
                        className="h-8 text-xs font-mono p-1 w-full"
                      />
                    </TableCell>

                    {/* Description — editable */}
                    <TableCell className="min-w-[200px]">
                      <div className="flex items-center gap-1">
                        <Input
                          value={edit.description}
                          onChange={(e) => setEdit(item.id, { description: e.target.value })}
                          placeholder="Edit description to look up…"
                          className={`h-8 text-sm p-1 flex-1 ${isDirty ? "border-amber-400" : ""}`}
                        />
                        {isDirty && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => resetEdit(item.id)}
                            className="text-muted-foreground hover:text-foreground flex-shrink-0 h-8 w-8"
                            title="Reset to original"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>

                    {/* Qty */}
                    <TableCell className="text-center">
                      <Input
                        type="number" min={1} value={item.quantity}
                        onChange={(e) => handleFieldChange(item.id, "quantity", parseInt(e.target.value) || 1)}
                        className="h-8 w-14 text-center p-1"
                      />
                    </TableCell>

                    {/* Cost */}
                    <TableCell>
                      <Input
                        type="number" min={0} step={0.01}
                        value={Number(item.cost_price).toFixed(2)}
                        onChange={(e) => handleFieldChange(item.id, "cost_price", parseFloat(e.target.value) || 0)}
                        className="h-8 w-20 p-1"
                      />
                    </TableCell>

                    {/* Markup */}
                    <TableCell>
                      <Input
                        type="number" min={0} step={1}
                        value={Number(item.markup_percent)}
                        onChange={(e) => handleFieldChange(item.id, "markup_percent", parseFloat(e.target.value) || 0)}
                        className="h-8 w-16 p-1"
                      />
                    </TableCell>

                    {/* Labour */}
                    <TableCell>
                      <Input
                        type="number" min={0} step={0.01}
                        value={Number(item.labour_cost).toFixed(2)}
                        onChange={(e) => handleFieldChange(item.id, "labour_cost", parseFloat(e.target.value) || 0)}
                        className="h-8 w-20 p-1"
                      />
                    </TableCell>

                    {/* Sell */}
                    <TableCell className="font-medium">
                      £{Number(item.sell_price).toFixed(2)}
                    </TableCell>

                    {/* Price Check column */}
                    <TableCell>
                      {busy ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {isVerifying ? "Searching web…" : "AI search…"}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {/* Web Look Up — primary CTA when dirty or no prices */}
                          <Button
                            size="sm"
                            variant={isDirty || !hasPrices ? "default" : "outline"}
                            onClick={() => handleWebVerify(item)}
                            title="Search web for real UK trade prices"
                          >
                            <Globe className="mr-1.5 h-3.5 w-3.5" />
                            {isDirty ? "Look Up" : "Web"}
                          </Button>

                          {/* AI estimate — secondary */}
                          {!hasPrices && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSearchSingle(item)}
                              title="AI estimated price (not live)"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {/* View results */}
                          {hasPrices && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPriceDialogItem(item)}
                            >
                              <Search className="mr-1 h-3.5 w-3.5" />
                              View
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {priceDialogItem && (
        <DevicePriceResultsDialog
          item={priceDialogItem}
          open={!!priceDialogItem}
          onOpenChange={(open) => !open && setPriceDialogItem(null)}
          onSelectPrice={async (price) => {
            await handleFieldChange(priceDialogItem.id, "cost_price", price);
            setPriceDialogItem(null);
          }}
        />
      )}

      {pushToQuoteOpen && priceList && (
        <PushToQuotationDialog
          priceList={priceList}
          items={items}
          open={pushToQuoteOpen}
          onOpenChange={setPushToQuoteOpen}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label, value, variant = "default",
}: { label: string; value: string; variant?: "default" | "success" }) {
  return (
    <div className={`bg-card border border-border rounded-lg p-3 ${variant === "success" ? "border-green-200 bg-green-50/30" : ""}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-semibold ${variant === "success" ? "text-green-700" : ""}`}>{value}</p>
    </div>
  );
}

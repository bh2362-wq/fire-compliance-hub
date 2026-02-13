import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Search, Merge, Loader2, Sparkles, FileText, Download, RefreshCw,
} from "lucide-react";
import {
  getPriceListWithItems, updatePriceItem, mergeItems, searchDevicePrices,
  updatePriceListTotals, DevicePriceItem, DevicePriceList,
} from "@/services/devicePricingService";
import { toast } from "sonner";
import { DevicePriceResultsDialog } from "./DevicePriceResultsDialog";
import { PushToQuotationDialog } from "./PushToQuotationDialog";

interface DevicePricingWorkbenchProps {
  priceListId: string;
  onBack: () => void;
}

export function DevicePricingWorkbench({ priceListId, onBack }: DevicePricingWorkbenchProps) {
  const [priceList, setPriceList] = useState<DevicePriceList | null>(null);
  const [items, setItems] = useState<DevicePriceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchingAll, setSearchingAll] = useState(false);
  const [searchingItem, setSearchingItem] = useState<string | null>(null);
  const [priceDialogItem, setPriceDialogItem] = useState<DevicePriceItem | null>(null);
  const [pushToQuoteOpen, setPushToQuoteOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { priceList: pl, items: it, error } = await getPriceListWithItems(priceListId);
    if (error) toast.error("Failed to load price list");
    setPriceList(pl);
    setItems(it);
    setLoading(false);
  }, [priceListId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFieldChange = async (id: string, field: string, value: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    const updates: Record<string, number> = { [field]: value };

    // Recalculate sell price
    const costPrice = field === "cost_price" ? value : item.cost_price;
    const markup = field === "markup_percent" ? value : item.markup_percent;
    const qty = field === "quantity" ? value : item.quantity;
    const labour = field === "labour_cost" ? value : item.labour_cost;
    updates.sell_price = costPrice * (1 + markup / 100) * qty + labour;

    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
    await updatePriceItem(id, updates);
    await updatePriceListTotals(priceListId);
  };

  const handleMerge = async () => {
    if (selectedIds.size < 2) { toast.error("Select at least 2 items to merge"); return; }
    const { error } = await mergeItems(priceListId, Array.from(selectedIds), items);
    if (error) toast.error(error.message);
    else { toast.success("Items merged"); setSelectedIds(new Set()); fetchData(); }
  };

  const handleSearchAll = async () => {
    const pendingItems = items.filter(i => i.ai_search_status === "pending" || i.ai_search_status === "error");
    if (pendingItems.length === 0) { toast.info("All items already priced"); return; }

    setSearchingAll(true);
    // Batch in groups of 10
    for (let i = 0; i < pendingItems.length; i += 10) {
      const batch = pendingItems.slice(i, i + 10);
      const devices = batch.map(d => ({
        model_number: d.model_number || undefined,
        description: d.description,
        quantity: d.quantity,
      }));

      const { results, error } = await searchDevicePrices(devices);
      if (error) {
        toast.error(`Price search failed: ${error.message}`);
        break;
      }

      // Update each item with results
      for (const result of results) {
        const idx = (result.index || 1) - 1;
        const item = batch[idx];
        if (!item) continue;

        const bestPrice = result.estimated_trade_price || 0;
        const updates = {
          cost_price: bestPrice,
          sell_price: bestPrice * (1 + item.markup_percent / 100) * item.quantity + item.labour_cost,
          ai_search_status: "completed" as const,
          ai_price_results: result.suppliers || [],
        };

        await updatePriceItem(item.id, updates);
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i));
      }
    }

    await updatePriceListTotals(priceListId);
    setSearchingAll(false);
    toast.success("AI price search complete");
    fetchData();
  };

  const handleSearchSingle = async (item: DevicePriceItem) => {
    setSearchingItem(item.id);
    const { results, error } = await searchDevicePrices([{
      model_number: item.model_number || undefined,
      description: item.description,
      quantity: item.quantity,
    }]);

    if (error) {
      toast.error(error.message);
      setSearchingItem(null);
      return;
    }

    const result = results[0];
    if (result) {
      const bestPrice = result.estimated_trade_price || 0;
      const updates = {
        cost_price: bestPrice,
        sell_price: bestPrice * (1 + item.markup_percent / 100) * item.quantity + item.labour_cost,
        ai_search_status: "completed" as const,
        ai_price_results: result.suppliers || [],
      };
      await updatePriceItem(item.id, updates);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...updates } : i));
      await updatePriceListTotals(priceListId);
    }

    setSearchingItem(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalCost = items.reduce((s, i) => s + Number(i.cost_price) * i.quantity, 0);
  const totalSell = items.reduce((s, i) => s + Number(i.sell_price), 0);
  const totalProfit = totalSell - totalCost;

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
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
            {searchingAll ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching...</> : <><Sparkles className="mr-2 h-4 w-4" /> AI Price All</>}
          </Button>
          <Button size="sm" onClick={() => setPushToQuoteOpen(true)} disabled={items.length === 0}>
            <FileText className="mr-2 h-4 w-4" /> Push to Quote
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="Devices" value={items.length.toString()} />
        <SummaryCard label="Total Cost" value={`£${totalCost.toFixed(2)}`} />
        <SummaryCard label="Total Sell" value={`£${totalSell.toFixed(2)}`} />
        <SummaryCard label="Profit" value={`£${totalProfit.toFixed(2)}`} variant={totalProfit > 0 ? "success" : "default"} />
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10"></TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-16 text-center">Qty</TableHead>
                <TableHead className="w-24">Cost (£)</TableHead>
                <TableHead className="w-24">Markup %</TableHead>
                <TableHead className="w-24">Labour (£)</TableHead>
                <TableHead className="w-24">Sell (£)</TableHead>
                <TableHead className="w-24">AI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow key={item.id} className={selectedIds.has(item.id) ? "bg-primary/5" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleSelect(item.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.model_number || "—"}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{item.description}</TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number" min={1} value={item.quantity}
                      onChange={(e) => handleFieldChange(item.id, "quantity", parseInt(e.target.value) || 1)}
                      className="h-8 w-14 text-center p-1"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" min={0} step={0.01} value={Number(item.cost_price).toFixed(2)}
                      onChange={(e) => handleFieldChange(item.id, "cost_price", parseFloat(e.target.value) || 0)}
                      className="h-8 w-20 p-1"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" min={0} step={1} value={Number(item.markup_percent)}
                      onChange={(e) => handleFieldChange(item.id, "markup_percent", parseFloat(e.target.value) || 0)}
                      className="h-8 w-16 p-1"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number" min={0} step={0.01} value={Number(item.labour_cost).toFixed(2)}
                      onChange={(e) => handleFieldChange(item.id, "labour_cost", parseFloat(e.target.value) || 0)}
                      className="h-8 w-20 p-1"
                    />
                  </TableCell>
                  <TableCell className="font-medium">£{Number(item.sell_price).toFixed(2)}</TableCell>
                  <TableCell>
                    {item.ai_search_status === "completed" ? (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPriceDialogItem(item)}>
                        <Search className="mr-1 h-3 w-3" /> View
                      </Button>
                    ) : searchingItem === item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleSearchSingle(item)}>
                        <Sparkles className="mr-1 h-3 w-3" /> Search
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
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
          open={pushToQuoteOpen}
          onOpenChange={setPushToQuoteOpen}
          priceList={priceList}
          items={items}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, variant = "default" }: { label: string; value: string; variant?: "default" | "success" }) {
  return (
    <div className={`p-3 rounded-lg border ${variant === "success" ? "bg-success/5 border-success/20" : "bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${variant === "success" ? "text-success" : ""}`}>{value}</p>
    </div>
  );
}

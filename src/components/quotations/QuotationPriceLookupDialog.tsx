import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Plus, Loader2, SearchX, RefreshCw } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { searchDevicePrices } from "@/services/devicePricingService";

interface Supplier {
  name: string;
  url?: string;
  estimated_price: number;
}

interface PriceResult {
  index: number;
  model_number: string;
  product_name: string;
  estimated_trade_price: number;
  suppliers: Supplier[];
  notes?: string;
}

interface QuotationPriceLookupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchTerm: string;
  quantity: number;
  onAddToQuote: (description: string, unitPrice: number) => void;
}

export function QuotationPriceLookupDialog({
  open,
  onOpenChange,
  searchTerm,
  quantity,
  onAddToQuote,
}: QuotationPriceLookupDialogProps) {
  const [results, setResults] = useState<PriceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [refinedSearch, setRefinedSearch] = useState("");
  const [addedIndices, setAddedIndices] = useState<Set<string>>(new Set());
  const lastSearchRef = useRef("");

  const doSearch = async (term: string) => {
    if (!term.trim()) {
      toast.error("Enter a search term");
      return;
    }
    setLoading(true);
    setSearched(true);
    setResults([]);
    setAddedIndices(new Set());
    lastSearchRef.current = term;

    try {
      const { results: data, error } = await searchDevicePrices([
        { model_number: term, description: term, quantity },
      ]);

      if (error) {
        toast.error(error.message || "Lookup failed");
        return;
      }

      setResults(data || []);
      if (!data?.length) {
        toast.info("No results found — try refining your search");
      }
    } catch {
      toast.error("AI lookup failed");
    } finally {
      setLoading(false);
    }
  };

  // Auto-search when dialog opens
  useEffect(() => {
    if (open && searchTerm.trim() && lastSearchRef.current !== searchTerm) {
      doSearch(searchTerm);
    }
    if (!open) {
      setResults([]);
      setSearched(false);
      setRefinedSearch("");
      setAddedIndices(new Set());
      lastSearchRef.current = "";
    }
  }, [open, searchTerm]);

  const handleAdd = (result: PriceResult, supplier?: Supplier) => {
    const price = supplier?.estimated_price ?? result.estimated_trade_price;
    const desc = result.product_name || result.model_number;
    const key = supplier ? `${result.index}-${supplier.name}` : `${result.index}-main`;

    onAddToQuote(desc, price);
    setAddedIndices((prev) => new Set(prev).add(key));
    toast.success(`Added ${desc} at £${price.toFixed(2)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>AI Price Lookup</DialogTitle>
          <DialogDescription>
            Searching: <span className="font-semibold">{searchTerm}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Searching suppliers…
            </div>
          )}

          {!loading && searched && results.length === 0 && (
            <div className="text-center py-8 space-y-4">
              <SearchX className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">No exact match found. Try refining your search below.</p>
            </div>
          )}

          {!loading && results.map((result) => (
            <div key={result.index} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{result.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Model: {result.model_number} · Avg Trade: £{result.estimated_trade_price.toFixed(2)}
                  </p>
                  {result.notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">{result.notes}</p>
                  )}
                </div>
              </div>

              {result.suppliers?.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Supplier</TableHead>
                        <TableHead className="text-xs text-right">Unit Cost</TableHead>
                        <TableHead className="text-xs text-center">Link</TableHead>
                        <TableHead className="text-xs text-center">Add</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.suppliers.map((supplier, si) => {
                        const key = `${result.index}-${supplier.name}`;
                        const added = addedIndices.has(key);
                        return (
                          <TableRow key={si}>
                            <TableCell className="text-sm font-medium py-2">{supplier.name}</TableCell>
                            <TableCell className="text-sm text-right font-bold py-2">
                              £{Number(supplier.estimated_price).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center py-2">
                              {supplier.url ? (
                                <a
                                  href={supplier.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center text-primary hover:underline text-xs"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center py-2">
                              <Button
                                variant={added ? "secondary" : "outline"}
                                size="sm"
                                className="h-7 px-2"
                                disabled={added}
                                onClick={() => handleAdd(result, supplier)}
                              >
                                {added ? "Added" : <Plus className="h-3.5 w-3.5" />}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ))}

          {/* Refine search */}
          {searched && !loading && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Not what you're looking for? Refine your search:</p>
              <div className="flex gap-2">
                <Input
                  value={refinedSearch}
                  onChange={(e) => setRefinedSearch(e.target.value)}
                  placeholder="Enter part number or description…"
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && doSearch(refinedSearch)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => doSearch(refinedSearch)}
                  disabled={loading || !refinedSearch.trim()}
                >
                  <RefreshCw className="h-4 w-4 mr-1" /> Search Again
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, SearchX, RefreshCw, Database } from "lucide-react";
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
import { searchSupplierProducts, SupplierProduct } from "@/services/supplierProductService";

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
  const [catalogResults, setCatalogResults] = useState<SupplierProduct[]>([]);
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
    setCatalogResults([]);
    setAddedIndices(new Set());
    lastSearchRef.current = term;

    try {
      const { data: local } = await searchSupplierProducts(term, 30);
      setCatalogResults(local);
      if (local.length === 0) toast.info("No results found in catalog");
    } catch {
      toast.error("Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && searchTerm.trim() && lastSearchRef.current !== searchTerm) {
      doSearch(searchTerm);
    }
    if (!open) {
      setCatalogResults([]);
      setSearched(false);
      setRefinedSearch("");
      setAddedIndices(new Set());
      lastSearchRef.current = "";
    }
  }, [open, searchTerm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Catalog Price Lookup</DialogTitle>
          <DialogDescription>
            Searching catalog for: <span className="font-semibold">{searchTerm}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Searching catalog…
            </div>
          )}

          {!loading && searched && catalogResults.length === 0 && (
            <div className="text-center py-8 space-y-4">
              <SearchX className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">No match found in catalog. Try refining your search below.</p>
            </div>
          )}

          {!loading && catalogResults.length > 0 && (
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">Catalog Matches</p>
                <Badge variant="outline" className="text-xs gap-1"><Database className="h-3 w-3" />{catalogResults.length}</Badge>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-right">Trade Price</TableHead>
                      <TableHead className="text-xs text-center">Add</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogResults.map((p) => {
                      const key = `catalog-${p.id}`;
                      const added = addedIndices.has(key);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-sm font-medium py-2">{p.product_code}</TableCell>
                          <TableCell className="text-sm py-2 max-w-[250px]">{p.description}</TableCell>
                          <TableCell className="text-sm text-right font-bold py-2">£{Number(p.trade_price).toFixed(2)}</TableCell>
                          <TableCell className="text-center py-2">
                            <Button
                              variant={added ? "secondary" : "outline"}
                              size="sm"
                              className="h-7 px-2"
                              disabled={added}
                              onClick={() => {
                                onAddToQuote(`${p.product_code} - ${p.description}`, p.trade_price);
                                setAddedIndices((prev) => new Set(prev).add(key));
                                toast.success(`Added ${p.product_code} at £${Number(p.trade_price).toFixed(2)}`);
                              }}
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
            </div>
          )}

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

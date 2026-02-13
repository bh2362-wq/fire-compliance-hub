import { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, SearchX, FileSpreadsheet, Upload, Database } from "lucide-react";
import { toast } from "sonner";
import { searchSupplierProducts, getSupplierProductCount, SupplierProduct } from "@/services/supplierProductService";
import { CatalogUploadDialog } from "@/components/product-lookup/CatalogUploadDialog";
import { CatalogBrowser } from "@/components/product-lookup/CatalogBrowser";
import { useNavigate } from "react-router-dom";

const ProductLookup = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [catalogResults, setCatalogResults] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [catalogCount, setCatalogCount] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [browserRefreshKey, setBrowserRefreshKey] = useState(0);
  const navigate = useNavigate();

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<SupplierProduct[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshCount();
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const refreshCount = async () => {
    const count = await getSupplierProductCount();
    setCatalogCount(count);
    setBrowserRefreshKey((k) => k + 1);
  };

  const fetchSuggestions = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSuggestionsLoading(true);
    try {
      const { data } = await searchSupplierProducts(term, 15);
      setSuggestions(data);
      setShowSuggestions(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 250);
  };

  const selectSuggestion = (product: SupplierProduct) => {
    setSearchTerm(product.product_code);
    setShowSuggestions(false);
    setCatalogResults([product]);
    setSearched(true);
  };

  const doSearch = async (term: string) => {
    if (!term.trim()) { toast.error("Enter a search term"); return; }
    setShowSuggestions(false);
    setLoading(true);
    setSearched(true);
    setCatalogResults([]);

    try {
      const { data: local } = await searchSupplierProducts(term, 50);
      setCatalogResults(local);
      if (local.length === 0) toast.info("No results found in catalog");
    } catch {
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateQuoteFromCatalog = (product: SupplierProduct) => {
    navigate("/dashboard/quotations", {
      state: {
        prefillLineItem: {
          description: `${product.product_code} - ${product.description}`,
          quantity: 1,
          unit_price: product.trade_price,
          labour_cost: 0,
        },
      },
    });
    toast.success("Opening new quote with selected item");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Product Lookup</h1>
            <p className="text-muted-foreground">Search trade prices from your Huvo catalog</p>
          </div>
          <div className="flex items-center gap-2">
            {catalogCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Database className="h-3 w-3" />
                {catalogCount.toLocaleString()} products
              </Badge>
            )}
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Upload Catalog
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Search for a product</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="relative flex-1" ref={wrapperRef}>
                <Input
                  value={searchTerm}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Enter product code or description…"
                  className="w-full"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setShowSuggestions(false);
                      doSearch(searchTerm);
                    }
                    if (e.key === "Escape") setShowSuggestions(false);
                  }}
                />
                {showSuggestions && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[320px] overflow-y-auto">
                    {suggestionsLoading && (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Searching catalog…
                      </div>
                    )}
                    {suggestions.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center justify-between gap-2 border-b border-border/50 last:border-0"
                        onClick={() => selectSuggestion(product)}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-sm font-semibold text-primary">{product.product_code}</span>
                          <span className="text-sm text-muted-foreground ml-2 truncate">{product.description}</span>
                          {product.category && (
                            <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">{product.category}</Badge>
                          )}
                        </div>
                        <span className="text-sm font-bold shrink-0">£{Number(product.trade_price).toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={() => doSearch(searchTerm)} disabled={loading || !searchTerm.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Searching…
          </div>
        )}

        {!loading && searched && catalogResults.length === 0 && (
          <div className="text-center py-8 space-y-4">
            <SearchX className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No results found in catalog. Try a different search term.</p>
          </div>
        )}

        {!loading && catalogResults.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Catalog Results</CardTitle>
                <Badge variant="outline" className="text-xs">{catalogResults.length} found</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Product Code</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                      <TableHead className="text-xs text-right">Trade Price</TableHead>
                      <TableHead className="text-xs text-center">Quote</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogResults.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-sm font-medium py-2">{p.product_code}</TableCell>
                        <TableCell className="text-sm py-2 max-w-[300px]">{p.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2">{p.category || "—"}</TableCell>
                        <TableCell className="text-sm text-right font-bold py-2">£{Number(p.trade_price).toFixed(2)}</TableCell>
                        <TableCell className="text-center py-2">
                          <Button variant="outline" size="sm" className="h-7 px-2 gap-1" onClick={() => handleCreateQuoteFromCatalog(p)}>
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Create Quote</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <CatalogBrowser refreshKey={browserRefreshKey} />
      </div>

      <CatalogUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={refreshCount}
        currentCount={catalogCount}
      />
    </DashboardLayout>
  );
};

export default ProductLookup;

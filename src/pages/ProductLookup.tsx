import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ExternalLink, Loader2, Search, SearchX, RefreshCw, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { searchDevicePrices } from "@/services/devicePricingService";
import { useNavigate } from "react-router-dom";

interface Supplier {
  name: string;
  url?: string;
  estimated_price: number;
  product_code?: string;
  description?: string;
  delivery_cost?: string;
}

interface PriceResult {
  index: number;
  model_number: string;
  product_name: string;
  estimated_trade_price: number;
  suppliers: Supplier[];
  notes?: string;
}

const ProductLookup = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<PriceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();

  const doSearch = async (term: string) => {
    if (!term.trim()) {
      toast.error("Enter a search term");
      return;
    }
    setLoading(true);
    setSearched(true);
    setResults([]);

    try {
      const { results: data, error } = await searchDevicePrices([
        { model_number: term, description: term, quantity: 1 },
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

  const handleCreateQuote = (result: PriceResult, supplier: Supplier) => {
    const lineItem = {
      description: result.product_name || result.model_number,
      quantity: 1,
      unit_price: supplier.estimated_price,
      labour_cost: 0,
    };
    navigate("/dashboard/quotations", {
      state: { prefillLineItem: lineItem },
    });
    toast.success("Opening new quote with selected item");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Product Lookup</h1>
          <p className="text-muted-foreground">Search trade prices across UK suppliers</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Search for a product</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Enter model number or description…"
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && doSearch(searchTerm)}
              />
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
            Searching suppliers…
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-8 space-y-4">
            <SearchX className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No results found. Try a different search term.</p>
          </div>
        )}

        {!loading && results.map((result) => (
          <Card key={result.index}>
            <CardHeader className="pb-2">
              <div>
                <CardTitle className="text-base">{result.product_name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Model: {result.model_number} · Avg Trade: £{result.estimated_trade_price.toFixed(2)}
                </p>
                {result.notes && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{result.notes}</p>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {result.suppliers?.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Supplier</TableHead>
                        <TableHead className="text-xs">Product Code</TableHead>
                        <TableHead className="text-xs hidden sm:table-cell">Description</TableHead>
                        <TableHead className="text-xs text-right">Unit Cost</TableHead>
                        <TableHead className="text-xs text-right hidden sm:table-cell">Delivery</TableHead>
                        <TableHead className="text-xs text-center">Link</TableHead>
                        <TableHead className="text-xs text-center">Quote</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.suppliers.map((supplier, si) => (
                        <TableRow key={si}>
                          <TableCell className="text-sm font-medium py-2">{supplier.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground py-2">
                            {result.model_number && <span className="font-medium text-foreground">{result.model_number}</span>}
                            {result.model_number && supplier.product_code && <span className="mx-1">·</span>}
                            {supplier.product_code || (!result.model_number ? "—" : "")}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground py-2 hidden sm:table-cell max-w-[200px] truncate">
                            {supplier.description || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-right font-bold py-2">
                            £{Number(supplier.estimated_price).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-xs text-right py-2 hidden sm:table-cell">
                            {supplier.delivery_cost || "TBC"}
                          </TableCell>
                          <TableCell className="text-center py-2">
                            {supplier.url ? (
                              <a href={supplier.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-primary hover:underline text-xs">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 gap-1"
                              onClick={() => handleCreateQuote(result, supplier)}
                            >
                              <FileSpreadsheet className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Create Quote</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
};

export default ProductLookup;

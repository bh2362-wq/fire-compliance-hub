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
import { Plus, Loader2, SearchX, RefreshCw, Database, Sparkles } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  onAddToQuote: (description: string, unitPrice: number, partNumber: string) => void;
}

export function QuotationPriceLookupDialog({
  open,
  onOpenChange,
  searchTerm,
  quantity,
  onAddToQuote,
}: QuotationPriceLookupDialogProps) {
  const [catalogResults, setCatalogResults] = useState<SupplierProduct[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [refinedSearch, setRefinedSearch] = useState("");
  const [broad, setBroad] = useState(false);
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
    setAiSuggestions([]);
    setAddedIndices(new Set());
    lastSearchRef.current = term;

    try {
      // Auto-detect broad: any whitespace-separated multi-word query
      // gets tokenised + OR'd across all columns. Single-token /
      // wildcard queries (s4*, XP95) stay in narrow mode. Manual
      // toggle still wins if the engineer ticked it explicitly.
      const looksMultiWord = term.trim().split(/\s+/).filter((t) => t.length >= 2).length >= 2;
      const useBroad = broad || looksMultiWord;
      const { data: local } = await searchSupplierProducts(term, 200, { broad: useBroad });
      setCatalogResults(local);
      if (local.length === 0) toast.info("No results found in catalog");
    } catch {
      toast.error("Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  // AI suggest — uses the candidate set already on screen (or a fresh
  // broad search if nothing's loaded) and asks Claude to rank the top
  // 3 most-likely matches for the row's description / item name. The
  // ranked list lands above the catalog table as a separate section
  // so engineers can act on it without losing the full result set.
  const doAiSuggest = async () => {
    const term = lastSearchRef.current || refinedSearch.trim() || searchTerm.trim();
    if (!term) {
      toast.error("Search first or type a description to suggest from");
      return;
    }
    setAiBusy(true);
    try {
      let candidates = catalogResults;
      if (candidates.length === 0) {
        const { data: local } = await searchSupplierProducts(term, 200, { broad: true });
        candidates = local;
        setCatalogResults(local);
        setSearched(true);
      }
      if (candidates.length === 0) {
        toast.info("No catalog candidates to rank — refine the search first");
        return;
      }
      const candidateBlock = candidates
        .slice(0, 50)
        .map((c, i) =>
          `${i}: code="${c.product_code}" desc="${c.description}" supplier="${c.supplier_name}" cat="${c.category ?? ""}" price=£${Number(c.trade_price).toFixed(2)}`,
        )
        .join("\n");
      const systemPrompt =
        "You are helping a UK fire-safety estimator pick the best catalog match for a quotation line. " +
        "Given the engineer's search term and a list of candidate catalog rows, return STRICT JSON " +
        "naming the indexes of the top 3 most-likely matches (best first). Consider device type, " +
        "manufacturer family, colour / variant suffixes, and price-list source quality (Huvo > " +
        "generic supplier rows). Return: {\"indexes\":[<int>,<int>,<int>]}";
      const userMsg =
        `Engineer is looking for: "${term}"\n\nCandidates (index: details):\n${candidateBlock}\n\nReturn STRICT JSON, no fences.`;

      // Reuse the existing rewrite-text infra? No — different shape.
      // Use the lookup-device-price function's online path? Also no —
      // that's for online search. Call Claude directly via the
      // claude-chat edge function we already deploy.
      const { data, error } = await supabase.functions.invoke("claude-chat", {
        body: {
          model: "claude-sonnet-4-6",
          max_tokens: 300,
          system: systemPrompt,
          messages: [{ role: "user", content: userMsg }],
        },
      });
      if (error) throw new Error(error.message);
      const raw: string = (data?.text ?? data?.content ?? "").toString();
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      const idxs: number[] = Array.isArray(parsed.indexes) ? parsed.indexes : [];
      const picked: SupplierProduct[] = [];
      for (const i of idxs) {
        if (Number.isInteger(i) && i >= 0 && i < candidates.length) {
          picked.push(candidates[i]);
        }
      }
      if (picked.length === 0) {
        toast.info("AI didn't return any ranked matches");
        return;
      }
      setAiSuggestions(picked);
      toast.success(`AI suggested ${picked.length} match${picked.length === 1 ? "" : "es"}`);
    } catch (err) {
      console.error("AI suggest failed:", err);
      toast.error(err instanceof Error ? err.message : "AI suggest failed");
    } finally {
      setAiBusy(false);
    }
  };

  useEffect(() => {
    if (open && searchTerm.trim() && lastSearchRef.current !== searchTerm) {
      doSearch(searchTerm);
    }
    if (!open) {
      setCatalogResults([]);
      setAiSuggestions([]);
      setSearched(false);
      setRefinedSearch("");
      setBroad(false);
      setAddedIndices(new Set());
      lastSearchRef.current = "";
    }
  }, [open, searchTerm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[85dvh] flex flex-col">
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

          {/* AI Suggestions — ranked subset of catalog results. Surfaced
              above the full table so engineers see the top picks first
              while keeping the long list available below. */}
          {!loading && aiSuggestions.length > 0 && (
            <div className="border rounded-lg p-3 space-y-2 bg-primary/5 border-primary/30">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="font-semibold text-sm">AI Suggestions</p>
                <Badge variant="outline" className="text-xs">{aiSuggestions.length}</Badge>
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
                    {aiSuggestions.map((p) => {
                      const key = `ai-${p.id}`;
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
                                onAddToQuote(p.description, p.trade_price, p.product_code);
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
                                // Pass JUST the catalog description so the
                                // caller can replace the line's existing
                                // description verbatim. Engineer wants the
                                // exact catalog text in the quote, not the
                                // older "CODE - description" composite that
                                // duplicated the part_number (already
                                // surfaced via item_name in the row).
                                onAddToQuote(p.description, p.trade_price);
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
                  placeholder="Enter part number or description… (use * for wildcards, e.g. s4*)"
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={doAiSuggest}
                  disabled={aiBusy || (catalogResults.length === 0 && !refinedSearch.trim() && !searchTerm.trim())}
                  title="Ask AI to rank the top matches for the current search term"
                >
                  {aiBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  AI Suggest
                </Button>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={broad}
                  onChange={(e) => setBroad(e.target.checked)}
                />
                Force broad search — multi-word queries already auto-broaden;
                tick this to also broaden single-token queries.
              </label>
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

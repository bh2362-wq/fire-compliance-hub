import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Loader2, ExternalLink, Database, Globe2, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface InternalResult {
  description: string;
  unit_cost: number;
  source: "huvo" | "catalog" | "supplier";
  part_number: string | null;
  supplier: string | null;
  category: string | null;
  model: string | null;
  notes: string | null;
  confidence: number;
}

// Build the line-item description we write when the engineer clicks
// Apply. Combines manufacturer + model + bare description + part code
// so the quote line reads like "Apollo XP95 — Optical Smoke Detector
// (55000-600APO)" rather than just the bare part code that some
// imports leave in `description`. De-dups so we don't repeat the
// part code if it's already inside the description string.
function buildApplyDescription(r: InternalResult): string {
  const desc = (r.description ?? "").trim();
  const model = (r.model ?? "").trim();
  const part = (r.part_number ?? "").trim();
  const supplier = (r.supplier ?? "").trim();
  const parts: string[] = [];
  if (supplier && !desc.toLowerCase().includes(supplier.toLowerCase())) parts.push(supplier);
  if (model && !desc.toLowerCase().includes(model.toLowerCase())) parts.push(model);
  if (desc) parts.push(desc);
  const head = parts.join(" — ").trim();
  if (part && !head.toLowerCase().includes(part.toLowerCase())) {
    return `${head} (${part})`.trim();
  }
  return head || part || "";
}

// Pick the most informative string to show as the dialog row's primary
// line. Falls back through description → model → notes → part_number so
// rows where the description was imported as the part code still read
// usefully.
function primaryLine(r: InternalResult): string {
  const desc = (r.description ?? "").trim();
  if (desc && desc.length > 4 && desc !== (r.part_number ?? "").trim()) return desc;
  const model = (r.model ?? "").trim();
  if (model) return model;
  const notes = (r.notes ?? "").trim();
  if (notes) return notes;
  return r.part_number ?? desc ?? "";
}

interface OnlineResult {
  description: string;
  indicative_price_gbp: number | null;
  supplier: string | null;
  part_number: string | null;
  source_url: string | null;
  notes: string | null;
}

export interface PriceLookupApply {
  description: string;
  unit_price: number;
  source: "internal" | "online";
  supplier: string | null;
  part_number: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-seeded search query — usually the line's current description
   *  or device_type. Engineer can refine in the search box. */
  initialQuery: string;
  /** Site's panel manufacturer (sites.panel_make_model) — biases ranking
   *  toward in-family parts. Optional. */
  manufacturerHint: string | null;
  /** Fires when the engineer picks a result. Caller decides what to do
   *  (typically update the unit_price + description on the line being
   *  edited and close this dialog). */
  onApply: (result: PriceLookupApply) => void;
}

export function PriceLookupDialog({ open, onOpenChange, initialQuery, manufacturerHint, onApply }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [internal, setInternal] = useState<InternalResult[]>([]);
  const [online, setOnline] = useState<OnlineResult[]>([]);
  const [includeOnline, setIncludeOnline] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);

  // When the dialog opens with a new initialQuery, reset state. Doesn't
  // auto-search — engineer hits the search button so they can refine
  // the seeded query first if needed.
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setInternal([]);
      setOnline([]);
      setHasSearched(false);
    }
  }, [open, initialQuery]);

  async function handleSearch() {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      toast.warning("Type at least 2 characters to search");
      return;
    }
    setSearching(true);
    setHasSearched(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-device-price", {
        body: {
          query: trimmed,
          manufacturer_hint: manufacturerHint,
          include_online: includeOnline,
        },
      });
      if (error) throw new Error(error.message);
      setInternal(Array.isArray(data?.internal) ? data.internal : []);
      setOnline(Array.isArray(data?.online) ? data.online : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Lookup failed";
      toast.error(msg);
      setInternal([]);
      setOnline([]);
    } finally {
      setSearching(false);
    }
  }

  function applyInternal(r: InternalResult) {
    onApply({
      description: buildApplyDescription(r),
      unit_price: r.unit_cost,
      source: "internal",
      supplier: r.supplier,
      part_number: r.part_number,
    });
    onOpenChange(false);
  }
  function applyOnline(r: OnlineResult) {
    if (r.indicative_price_gbp == null) {
      toast.warning("This online result has no indicative price — can't auto-fill. Use it as a reference and type the price yourself.");
      return;
    }
    onApply({
      description: [r.part_number, r.description].filter(Boolean).join(" — ").trim() || r.description,
      unit_price: r.indicative_price_gbp,
      source: "online",
      supplier: r.supplier,
      part_number: r.part_number,
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Price lookup
          </DialogTitle>
          <DialogDescription>
            Search the internal price lists. Optionally fall back to web search
            for parts that aren't in any of your catalogues yet.
            {manufacturerHint && (
              <> Manufacturer hint: <strong>{manufacturerHint}</strong>.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Search</Label>
            <div className="flex items-center gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                placeholder="e.g. Apollo XP95 optical detector"
                disabled={searching}
                className="text-sm"
              />
              <Button onClick={handleSearch} disabled={searching || query.trim().length < 2} className="gap-1">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </Button>
            </div>
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={includeOnline}
                onChange={(e) => setIncludeOnline(e.target.checked)}
                disabled={searching}
              />
              Include online results (slower — uses AI web search)
            </label>
          </div>

          {/* Internal column */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Database className="h-3.5 w-3.5 text-muted-foreground" />
              Internal pricing tables
              {hasSearched && <span className="text-muted-foreground font-normal">({internal.length})</span>}
            </div>
            {!hasSearched ? (
              <p className="text-xs text-muted-foreground italic px-1">Search above to see results.</p>
            ) : internal.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                No matches in price_list_items / materials_catalog / supplier_products. Try a different query or check the online column.
              </div>
            ) : (
              <div className="space-y-1.5">
                {internal.map((r, i) => (
                  <Card key={`int-${i}`} className="hover:bg-muted/30 transition-colors">
                    <CardContent className="p-2.5 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        {/* Primary line is the most informative field
                            available — falls through description /
                            model / notes / part_number so terse imports
                            still read usefully. */}
                        <p className="text-sm font-medium">{primaryLine(r)}</p>
                        {/* Show model + notes underneath when the
                            primary line was description and they add
                            information. */}
                        {(r.model || r.notes) && primaryLine(r) === (r.description ?? "").trim() && (
                          <p className="text-[11px] text-muted-foreground">
                            {[r.model, r.notes].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] capitalize">{r.source}</Badge>
                          {r.supplier && <span>· {r.supplier}</span>}
                          {r.part_number && <span>· {r.part_number}</span>}
                          {r.category && <span>· {r.category}</span>}
                          {r.confidence > 0 && (
                            <span className={r.confidence >= 0.7 ? "text-success" : ""}>
                              · {Math.round(r.confidence * 100)}% match
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold">£{r.unit_cost.toFixed(2)}</div>
                        <Button
                          size="sm" variant="outline"
                          className="h-6 px-2 mt-1 text-[10px] gap-1"
                          onClick={() => applyInternal(r)}
                        >
                          <Check className="h-3 w-3" />Apply
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Online column */}
          {includeOnline && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
                Online (UK trade suppliers)
                {hasSearched && <span className="text-muted-foreground font-normal">({online.length})</span>}
              </div>
              {!hasSearched ? null : online.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No online suggestions returned. Search the part number directly on a supplier site if the internal list didn't help.
                </div>
              ) : (
                <>
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 flex items-start gap-2 text-[10px]">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p>
                      Online prices are <strong>indicative</strong> — AI-extracted from supplier pages, not a live quote.
                      Verify on the source URL before sending the quote to the customer.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {online.map((r, i) => (
                      <Card key={`web-${i}`} className="hover:bg-muted/30 transition-colors">
                        <CardContent className="p-2.5 flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <p className="text-sm font-medium">{r.description}</p>
                            <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
                              {r.supplier && <Badge variant="outline" className="text-[10px]">{r.supplier}</Badge>}
                              {r.part_number && <span>· {r.part_number}</span>}
                              {r.notes && <span className="italic">· {r.notes}</span>}
                            </div>
                            {r.source_url && (
                              <a
                                href={r.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                              >
                                <ExternalLink className="h-2.5 w-2.5" />
                                View on supplier site
                              </a>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold">
                              {r.indicative_price_gbp != null ? `£${r.indicative_price_gbp.toFixed(2)}` : "—"}
                            </div>
                            <Button
                              size="sm" variant="outline"
                              className="h-6 px-2 mt-1 text-[10px] gap-1"
                              onClick={() => applyOnline(r)}
                              disabled={r.indicative_price_gbp == null}
                            >
                              <Check className="h-3 w-3" />Apply
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

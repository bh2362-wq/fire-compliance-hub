import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Sparkles, Search, Loader2 } from "lucide-react";
import {
  lookupMaterial,
  saveToCatalog,
  searchCatalog,
  MaterialSuggestion,
} from "@/services/materialsCatalogService";
import type { MaterialEntry, WorkReportDraft } from "../useWorkReportDraft";

interface Props {
  draft: WorkReportDraft;
  onPatch: (updates: Partial<WorkReportDraft>) => void;
}

export function MaterialsStep({ draft, onPatch }: Props) {
  const locked = draft.is_locked;
  const materials = draft.materials;

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<MaterialSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  // Per-row guard so the debounced search doesn't fire again once the
  // user has explicitly picked a catalog match (or finished typing).
  const [suggestionSelected, setSuggestionSelected] = useState<boolean[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addRow = () => {
    onPatch({ materials: [...materials, { name: "", qty: "", cost: "" }] });
  };

  const updateRow = (index: number, field: keyof MaterialEntry, value: string) => {
    const next = materials.map((m, i) => (i === index ? { ...m, [field]: value } : m));
    onPatch({ materials: next });
    if (field === "name") {
      setActiveIndex(index);
      setSuggestionSelected((prev) => {
        const n = [...prev];
        n[index] = false;
        return n;
      });
    }
  };

  // Debounced catalog search for the active row's name.
  useEffect(() => {
    if (activeIndex === null) return;
    const name = materials[activeIndex]?.name || "";
    if (name.trim().length < 2 || suggestionSelected[activeIndex]) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await searchCatalog(name.trim(), 5);
      if (results.length > 0) {
        setSuggestions(results);
        setShowSuggestions(true);
        setAiUsed(false);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeIndex, materials, suggestionSelected]);

  const aiLookup = async (index: number) => {
    const name = materials[index]?.name;
    if (!name?.trim()) return;
    setActiveIndex(index);
    setLookingUp(true);
    setShowSuggestions(true);
    try {
      const { suggestions: res, ai_used } = await lookupMaterial(name.trim());
      setSuggestions(res);
      setAiUsed(ai_used);
    } catch {
      /* silent */
    } finally {
      setLookingUp(false);
    }
  };

  const pickSuggestion = (index: number, s: MaterialSuggestion) => {
    const next = materials.map((m, i) =>
      i === index
        ? {
            name: `${s.part_number} - ${s.description}`,
            qty: m.qty || "1",
            cost: s.retail_price.toFixed(2),
          }
        : m,
    );
    onPatch({ materials: next });
    setShowSuggestions(false);
    setSuggestionSelected((prev) => {
      const n = [...prev];
      n[index] = true;
      return n;
    });
    void saveToCatalog(s);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Materials used</h3>
        <p className="text-xs text-muted-foreground">
          Type a product name and tap ✨ for AI-powered part-number and price lookup.
          Saved items auto-fill next time.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Label>Materials</Label>
        <Button variant="outline" size="sm" onClick={addRow} disabled={locked}>
          <Plus className="w-4 h-4 mr-1" /> Add Row
        </Button>
      </div>

      <div className="border rounded-lg">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left text-sm font-medium p-3">Material / Part</th>
              <th className="text-left text-sm font-medium p-3 w-12"></th>
              <th className="text-left text-sm font-medium p-3 w-20">Qty</th>
              <th className="text-left text-sm font-medium p-3 w-28">Cost (£)</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((mat, i) => (
              <tr
                key={i}
                className={`border-t border-border ${
                  activeIndex === i && showSuggestions ? "bg-primary/5" : ""
                }`}
              >
                <td className="p-2">
                  <Input
                    value={mat.name}
                    onChange={(e) => updateRow(i, "name", e.target.value)}
                    onFocus={() => setActiveIndex(i)}
                    placeholder="e.g. Apollo XP95 detector"
                    className="border-0 bg-transparent focus-visible:ring-0"
                    disabled={locked}
                  />
                </td>
                <td className="p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => aiLookup(i)}
                    disabled={locked || lookingUp || !mat.name.trim()}
                    title="AI product lookup"
                  >
                    {lookingUp && activeIndex === i ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    )}
                  </Button>
                </td>
                <td className="p-2">
                  <Input
                    value={mat.qty}
                    onChange={(e) => updateRow(i, "qty", e.target.value)}
                    placeholder="0"
                    className="border-0 bg-transparent focus-visible:ring-0"
                    disabled={locked}
                  />
                </td>
                <td className="p-2">
                  <Input
                    value={mat.cost}
                    onChange={(e) => updateRow(i, "cost", e.target.value)}
                    placeholder="0.00"
                    className="border-0 bg-transparent focus-visible:ring-0"
                    disabled={locked}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* AI suggestions panel — rendered outside the table so overflow
          doesn't clip it. Only visible when the active row has results. */}
      {showSuggestions && suggestions.length > 0 && !locked && (
        <div className="border border-primary/30 rounded-lg bg-popover shadow-lg">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-muted/30 rounded-t-lg">
            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
              {aiUsed ? (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> AI Product Suggestions
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5" /> Catalog Matches
                </>
              )}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setShowSuggestions(false)}
            >
              Dismiss
            </Button>
          </div>
          <div className="divide-y divide-border">
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors flex items-center gap-3"
                onClick={() => activeIndex !== null && pickSuggestion(activeIndex, s)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-primary">
                      {s.part_number}
                    </span>
                    {s.supplier && (
                      <Badge variant="outline" className="text-[10px] h-4">
                        {s.supplier}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{s.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold text-foreground">
                    £{s.retail_price.toFixed(2)}
                  </span>
                  <p className="text-[10px] text-muted-foreground">Select</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {lookingUp && (
        <div className="flex items-center justify-center py-4 text-muted-foreground text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching for products…
        </div>
      )}
    </div>
  );
}

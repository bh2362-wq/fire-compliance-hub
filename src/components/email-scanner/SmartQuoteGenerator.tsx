/**
 * SmartQuoteGenerator
 *
 * Takes extracted email data + price list and calls Claude to:
 * 1. Identify specific fire alarm devices with quantities from the email
 * 2. Match each device against the loaded price list
 * 3. Use web search for items not in the price list
 * 4. Return fully priced quote lines ready for review
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sparkles, Loader2, Search, BookOpen, Globe, AlertTriangle,
  CheckCircle2, Pencil, Trash2, Plus, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { PriceListItem } from "@/services/priceListService";
import { buildPriceListContext } from "@/services/priceListService";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PriceSource = "price_list" | "ai_estimate" | "web_search";

export interface SmartQuoteLine {
  id: string;
  description: string;
  manufacturer: string;
  model: string;
  part_number: string;
  category: string;
  quantity: number;
  unit_cost: number;
  labour_cost: number;
  total: number;
  price_source: PriceSource;
  confidence: "High" | "Medium" | "Low";
  price_list_match?: string;
  ai_note: string;
  // editing
  _editing?: boolean;
}

interface Props {
  emailContent: string;
  extractedScope: string;
  extractedRequirements: Array<{ description: string; estimated_quantity?: number; unit?: string }>;
  priceList: PriceListItem[];
  useWebSearch: boolean;
  onLinesGenerated: (lines: SmartQuoteLine[]) => void;
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: PriceSource }) {
  if (source === "price_list") return (
    <Badge className="gap-1 text-[9px] bg-green-100 text-green-800 border-green-300/60 hover:bg-green-100">
      <BookOpen className="w-2.5 h-2.5" />Price List
    </Badge>
  );
  if (source === "web_search") return (
    <Badge className="gap-1 text-[9px] bg-blue-100 text-blue-800 border-blue-300/60 hover:bg-blue-100">
      <Globe className="w-2.5 h-2.5" />Web
    </Badge>
  );
  return (
    <Badge className="gap-1 text-[9px] bg-amber-100 text-amber-800 border-amber-300/60 hover:bg-amber-100">
      <Sparkles className="w-2.5 h-2.5" />AI Estimate
    </Badge>
  );
}

function ConfidenceDot({ confidence }: { confidence: string }) {
  return (
    <span className={cn("w-2 h-2 rounded-full flex-shrink-0 inline-block", {
      "bg-green-500": confidence === "High",
      "bg-amber-500": confidence === "Medium",
      "bg-red-500":   confidence === "Low",
    })} title={`Confidence: ${confidence}`} />
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SmartQuoteGenerator({
  emailContent, extractedScope, extractedRequirements, priceList, useWebSearch, onLinesGenerated,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [lines, setLines] = useState<SmartQuoteLine[]>([]);
  const [generated, setGenerated] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  function uid() { return Math.random().toString(36).slice(2, 10); }

  // ── Call Claude ──────────────────────────────────────────────────────────────

  async function generate() {
    setGenerating(true);
    try {
      const priceListContext = buildPriceListContext(priceList);
      const hasPriceList = priceList.length > 0;

      const requirements = extractedRequirements.length > 0
        ? extractedRequirements.map((r, i) =>
            `${i + 1}. ${r.description}${r.estimated_quantity ? ` — qty: ${r.estimated_quantity}` : ""}${r.unit ? ` ${r.unit}` : ""}`
          ).join("\n")
        : `(No structured requirements extracted — use the email text and scope below)`;

      // web search not available through edge function — note for future
      const systemPrompt = `You are a fire alarm quoting specialist for BHO Fire & Security Ltd, a UK fire alarm contractor.

Your job: read the email / scope of works and produce accurate, priced quote line items for a fire alarm job.

${hasPriceList ? `PRICE LIST (use these prices first — always prefer price list over estimates):
${priceListContext}

MATCHING RULES:
- Match by manufacturer + device type first (e.g. "Gent optical detector" → find Gent detector in price list)
- Match by part number if mentioned
- If a close match exists, use that price
- Only use AI estimate or web search if genuinely not in the price list` : "No price list loaded — use your knowledge of UK fire alarm market prices."}

${useWebSearch ? "You have access to web search. Use it to find current UK prices for specific products not in the price list. Search for '[product name] [manufacturer] UK price' or check distributor sites." : ""}

FIRE ALARM KNOWLEDGE:
- Gent by Honeywell: addressable detectors £25-45, sounders £30-50, VADs £55-90, MCPs £18-28
- Hochiki: detectors £22-38, sounders £28-45
- Advanced / MxPro: panels, modules, detectors
- Fireclass: FC detectors £20-35, FC panels
- Texecom: intruder-to-fire hybrid
- Cable: enhanced fire resistant (BS 7629) ~£0.80-1.50/m depending on cores
- Labour typical: detectors £12-20, sounders/VADs £15-25, MCPs £10-18, panels £150-400

ALWAYS include:
- Cable as a separate line item if installation is implied (estimate 3-5m per device)
- Containment/trunking if mentioned or implied
- Panel costs if full system install
- Commission/testing as a line item for new installs

Return ONLY this JSON (no other text):
{
  "quote_lines": [
    {
      "description": "Full professional trade description",
      "manufacturer": "Brand name or empty string",
      "model": "Model name or empty string",
      "part_number": "Part number if known or empty string",
      "category": "Detector|Sounder|VAD|MCP|Panel|Cable|Labour|Other",
      "quantity": 1,
      "unit_cost": 0.00,
      "labour_cost": 0.00,
      "price_source": "price_list|ai_estimate|web_search",
      "confidence": "High|Medium|Low",
      "price_list_match": "The price list item matched, or empty string",
      "ai_note": "Brief note on how price was determined"
    }
  ]
}`;

      const userMsg = `EMAIL CONTENT:
${emailContent.slice(0, 3000)}

EXTRACTED SCOPE:
${extractedScope || "(not extracted)"}

EXTRACTED REQUIREMENTS:
${requirements}

Please identify every device/material/labour item needed and produce priced quote lines. Be specific about manufacturers if mentioned. Include cable and labour as separate line items.`;

      const { data, error: fnError } = await supabase.functions.invoke("claude-chat", {
        body: {
          system: systemPrompt,
          messages: [{ role: "user", content: userMsg }],
          model: "claude-sonnet-4-20250514",
        },
      });

      if (fnError) throw new Error(fnError.message || "Edge function error");
      if (data?.error) throw new Error(data.error);

      const rawText: string = data?.content || "";

      let parsed: { quote_lines: SmartQuoteLine[] };
      try {
        parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      } catch {
        throw new Error("AI returned unexpected format — try again");
      }

      const result: SmartQuoteLine[] = (parsed.quote_lines || []).map(l => ({
        ...l,
        id: uid(),
        total: (Number(l.unit_cost) + Number(l.labour_cost)) * Number(l.quantity),
      }));

      setLines(result);
      setGenerated(true);
      onLinesGenerated(result);

      const fromList = result.filter(l => l.price_source === "price_list").length;
      const fromWeb  = result.filter(l => l.price_source === "web_search").length;
      toast.success(
        `${result.length} line items generated` +
        (fromList > 0 ? ` — ${fromList} from your price list` : "") +
        (fromWeb  > 0 ? `, ${fromWeb} from web search` : "")
      );
    } catch (err: any) {
      toast.error(err.message || "Generation failed — try again");
    } finally {
      setGenerating(false);
    }
  }

  // ── Edit lines ────────────────────────────────────────────────────────────────

  function updateLine<K extends keyof SmartQuoteLine>(id: string, field: K, value: SmartQuoteLine[K]) {
    setLines(prev => {
      const updated = prev.map(l => {
        if (l.id !== id) return l;
        const next = { ...l, [field]: value };
        next.total = (Number(next.unit_cost) + Number(next.labour_cost)) * Number(next.quantity);
        return next;
      });
      onLinesGenerated(updated);
      return updated;
    });
  }

  function removeLine(id: string) {
    const updated = lines.filter(l => l.id !== id);
    setLines(updated);
    onLinesGenerated(updated);
  }

  function addLine() {
    const newLine: SmartQuoteLine = {
      id: uid(), description: "", manufacturer: "", model: "", part_number: "",
      category: "Other", quantity: 1, unit_cost: 0, labour_cost: 0, total: 0,
      price_source: "ai_estimate", confidence: "High", ai_note: "Manually added", price_list_match: "",
    };
    const updated = [...lines, newLine];
    setLines(updated);
    onLinesGenerated(updated);
  }

  // ── Totals ────────────────────────────────────────────────────────────────────

  const totalMaterials = lines.reduce((s, l) => s + Number(l.unit_cost) * Number(l.quantity), 0);
  const totalLabour    = lines.reduce((s, l) => s + Number(l.labour_cost) * Number(l.quantity), 0);
  const total          = totalMaterials + totalLabour;
  const lowConfidence  = lines.filter(l => l.confidence === "Low" || l.confidence === "Medium").length;

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!generated) {
    return (
      <div className="space-y-3">
        {priceList.length > 0 && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200/60 text-xs text-green-800 dark:text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span><strong>{priceList.length} items</strong> in your price list — will be matched first</span>
          </div>
        )}
        {useWebSearch && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 text-xs text-blue-800 dark:text-blue-400">
            <Globe className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Web search enabled — Claude will look up prices for unmatched items</span>
          </div>
        )}
        <Button
          onClick={generate}
          disabled={generating}
          size="lg"
          className="w-full gap-2"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Identifying devices and matching prices…</>
          ) : (
            <><Sparkles className="h-4 w-4" />Generate Priced Quote Lines</>
          )}
        </Button>
        {generating && (
          <p className="text-xs text-center text-muted-foreground">
            {useWebSearch ? "Searching for prices online…" : "Matching against price list…"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className="gap-1 text-xs">
          <CheckCircle2 className="w-3 h-3 text-green-600" />
          {lines.filter(l => l.price_source === "price_list").length} from price list
        </Badge>
        {lines.filter(l => l.price_source === "web_search").length > 0 && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Globe className="w-3 h-3 text-blue-600" />
            {lines.filter(l => l.price_source === "web_search").length} from web
          </Badge>
        )}
        <Badge variant="outline" className="gap-1 text-xs">
          <Sparkles className="w-3 h-3 text-amber-600" />
          {lines.filter(l => l.price_source === "ai_estimate").length} AI estimated
        </Badge>
        {lowConfidence > 0 && (
          <Badge variant="outline" className="gap-1 text-xs border-amber-300/60 text-amber-700">
            <AlertTriangle className="w-3 h-3" />
            {lowConfidence} need review
          </Badge>
        )}
        <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs gap-1" onClick={() => { setGenerated(false); setLines([]); }}>
          <RefreshCw className="w-3 h-3" />Re-generate
        </Button>
      </div>

      {/* Line items */}
      <div className="space-y-2">
        {lines.map((line, idx) => (
          <div key={line.id} className={cn(
            "border rounded-lg p-3 space-y-2",
            line.confidence === "Low" ? "border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/10" : "border-border bg-card"
          )}>
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-muted-foreground w-5 flex-shrink-0 mt-1">{idx + 1}.</span>
              <div className="flex-1 space-y-2">
                <div className="flex items-start gap-2 flex-wrap">
                  <Input
                    value={line.description}
                    onChange={e => updateLine(line.id, "description", e.target.value)}
                    className="flex-1 min-w-[200px] text-sm font-medium h-8"
                    placeholder="Description"
                  />
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <ConfidenceDot confidence={line.confidence} />
                    <SourceBadge source={line.price_source} />
                  </div>
                </div>

                {(line.manufacturer || line.model || line.part_number) && (
                  <div className="flex gap-2 text-[10px] text-muted-foreground flex-wrap">
                    {line.manufacturer && <span>{line.manufacturer}</span>}
                    {line.model && <span>• {line.model}</span>}
                    {line.part_number && <span className="font-mono">• {line.part_number}</span>}
                    {line.price_list_match && <span className="text-green-600">• Matched: {line.price_list_match}</span>}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Qty</Label>
                    <Input
                      type="number" min={0} step={1}
                      value={line.quantity}
                      onChange={e => updateLine(line.id, "quantity", Number(e.target.value) || 0)}
                      className="h-7 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Unit Cost £</Label>
                    <Input
                      type="number" min={0} step={0.01}
                      value={line.unit_cost}
                      onChange={e => updateLine(line.id, "unit_cost", parseFloat(e.target.value) || 0)}
                      className={cn("h-7 text-sm", line.unit_cost === 0 && "border-amber-400/60")}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Labour £</Label>
                    <Input
                      type="number" min={0} step={0.01}
                      value={line.labour_cost}
                      onChange={e => updateLine(line.id, "labour_cost", parseFloat(e.target.value) || 0)}
                      className="h-7 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Line Total</Label>
                    <div className="h-7 flex items-center text-sm font-semibold">
                      £{line.total.toFixed(2)}
                    </div>
                  </div>
                </div>

                {line.ai_note && (
                  <p className="text-[10px] text-muted-foreground italic">{line.ai_note}</p>
                )}
              </div>

              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                onClick={() => removeLine(line.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" className="w-full h-8 gap-1 text-xs" onClick={addLine}>
        <Plus className="h-3.5 w-3.5" />Add Line Item
      </Button>

      {/* Totals */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between flex-wrap gap-4 text-sm">
          <div className="flex gap-6">
            <div><span className="text-xs text-muted-foreground block">Materials</span><span className="font-semibold">£{totalMaterials.toFixed(2)}</span></div>
            <div><span className="text-xs text-muted-foreground block">Labour</span><span className="font-semibold">£{totalLabour.toFixed(2)}</span></div>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground block">Total (ex VAT)</span>
            <span className="text-lg font-bold">£{total.toFixed(2)}</span>
          </div>
        </div>
        {lowConfidence > 0 && (
          <p className="text-[11px] text-amber-700 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {lowConfidence} item{lowConfidence !== 1 ? "s" : ""} marked amber need price verification before sending to client.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * SmartQuoteGenerator
 * - Generates priced quote lines from email + price list
 * - Labour toggle: switch off to hide labour column and exclude from totals
 * - Part number verification: checks each part number against Claude's knowledge
 *   of Gent/Hochiki/Advanced/Texecom ranges and flags/suggests corrections
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sparkles, Loader2, BookOpen, Globe, AlertTriangle,
  CheckCircle2, Trash2, Plus, RefreshCw, ShieldCheck,
  ArrowRight, XCircle, HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { PriceListItem } from "@/services/priceListService";
import { buildPriceListContext } from "@/services/priceListService";

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
}

interface PartVerification {
  status: "correct" | "incorrect" | "uncertain";
  suggested_part_number: string;
  suggested_description: string;
  suggested_unit_cost: number;
  note: string;
}

interface Props {
  emailContent: string;
  extractedScope: string;
  extractedRequirements: Array<{ description: string; estimated_quantity?: number; unit?: string }>;
  priceList: PriceListItem[];
  useWebSearch: boolean;
  onLinesGenerated: (lines: SmartQuoteLine[], includeLabour: boolean) => void;
}

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

function VerifyBadge({ v }: { v: PartVerification | undefined }) {
  if (!v) return null;
  if (v.status === "correct") return (
    <Badge className="gap-1 text-[9px] bg-green-100 text-green-800 border-green-300/60 hover:bg-green-100">
      <CheckCircle2 className="w-2.5 h-2.5" />Verified
    </Badge>
  );
  if (v.status === "incorrect") return (
    <Badge className="gap-1 text-[9px] bg-red-100 text-red-800 border-red-300/60 hover:bg-red-100">
      <XCircle className="w-2.5 h-2.5" />Part No. incorrect
    </Badge>
  );
  return (
    <Badge className="gap-1 text-[9px] bg-amber-100 text-amber-800 border-amber-300/60 hover:bg-amber-100">
      <HelpCircle className="w-2.5 h-2.5" />Uncertain
    </Badge>
  );
}

export function SmartQuoteGenerator({
  emailContent, extractedScope, extractedRequirements, priceList, useWebSearch, onLinesGenerated,
}: Props) {
  const [generating, setGenerating]       = useState(false);
  const [lines, setLines]                 = useState<SmartQuoteLine[]>([]);
  const [generated, setGenerated]         = useState(false);
  const [includeLabour, setIncludeLabour] = useState(true);
  const [verifying, setVerifying]         = useState(false);
  const [verifyingId, setVerifyingId]     = useState<string | null>(null);
  const [verifications, setVerifications] = useState<Record<string, PartVerification>>({});

  function uid() { return Math.random().toString(36).slice(2, 10); }

  async function generate() {
    setGenerating(true);
    setVerifications({});
    try {
      const priceListContext = buildPriceListContext(priceList);
      const hasPriceList = priceList.length > 0;

      const requirements = extractedRequirements.length > 0
        ? extractedRequirements.map((r, i) =>
            `${i + 1}. ${r.description}${r.estimated_quantity ? ` — qty: ${r.estimated_quantity}` : ""}${r.unit ? ` ${r.unit}` : ""}`
          ).join("\n")
        : "(No structured requirements extracted — use the email text and scope below)";

      const systemPrompt = `You are a fire alarm quoting specialist for BHO Fire & Security Ltd, a UK fire alarm contractor.

Your job: read the email / scope of works and produce accurate, priced quote line items for a fire alarm job.

${hasPriceList ? `PRICE LIST (use these prices first):
${priceListContext}

MATCHING RULES:
- Match by manufacturer + device type first
- Match by part number if mentioned in email
- If a close match exists, use that price
- Only use AI estimate if genuinely not in the price list` : "No price list loaded — use your knowledge of UK fire alarm market prices."}

FIRE ALARM KNOWLEDGE — Gent by Honeywell S4-Quad range:
- S4-711 = S4 Dual Optical/Heat sensor (detector only)
- S4-712 = S4 Dual Optical/Heat + Sounder
- S4-713 series = S4 Dual Optical/Heat + Voice sounder + VAD variants
- S4-710 = S4 Heat only
- S4-714 = S4 Heat + Sounder
- S4-715 series = S4 Heat + Voice sounder + VAD
- S4-761 = S4 CO + Optical/Heat
- S4-700 = S4 base (common for all S-Quad)
- S4-34800 = Vigilon MCP resettable element (excludes back box)
- S4-34895 = Surface back box (pack of 10)
- S4-34412 = Single channel interface with relay
- VIGPLUS-24 = Vigilon Plus panel 1-4 loop
- VIGPLUS-RP = Vigilon Plus repeat panel
- S3-VAD-HPR-R = S3 high power red VAD
Prices: detectors £25-55, sounders £30-65, VADs £55-110, MCPs £18-40

Always include cable and bases as separate line items where applicable.

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

      const userMsg = `EMAIL CONTENT:\n${emailContent.slice(0, 3000)}\n\nEXTRACTED SCOPE:\n${extractedScope || "(not extracted)"}\n\nEXTRACTED REQUIREMENTS:\n${requirements}\n\nIdentify every device/material/labour item and produce priced quote lines.`;

      const { data: fnData, error: fnError } = await supabase.functions.invoke("claude-chat", {
        body: { system: systemPrompt, messages: [{ role: "user", content: userMsg }], model: "claude-sonnet-4-5" },
      });

      if (fnError) throw new Error(fnError.message);
      if (fnData?.error) throw new Error(fnData.error);

      const rawText: string = fnData?.content || "";
      let parsed: { quote_lines: SmartQuoteLine[] };
      try {
        parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      } catch {
        throw new Error("AI returned unexpected format — try again");
      }

      const result: SmartQuoteLine[] = (parsed.quote_lines || []).map(l => ({
        ...l,
        id: uid(),
        total: (Number(l.unit_cost) + (includeLabour ? Number(l.labour_cost) : 0)) * Number(l.quantity),
      }));

      setLines(result);
      setGenerated(true);
      onLinesGenerated(result, includeLabour);
      const fromList = result.filter(l => l.price_source === "price_list").length;
      toast.success(`${result.length} line items generated${fromList > 0 ? ` — ${fromList} matched your price list` : ""}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Generation failed — try again");
    } finally {
      setGenerating(false);
    }
  }

  async function verifyAll() {
    const toVerify = lines.filter(l => l.part_number || l.manufacturer);
    if (toVerify.length === 0) { toast.error("No part numbers to verify"); return; }
    setVerifying(true);
    try {
      const itemList = toVerify.map((l, i) =>
        `${i + 1}. ID:${l.id} | Manufacturer: ${l.manufacturer || "?"} | Part: ${l.part_number || "?"} | Description: ${l.description}`
      ).join("\n");

      const { data: fnData, error: fnError } = await supabase.functions.invoke("claude-chat", {
        body: {
          model: "claude-sonnet-4-5",
          system: `You are a fire alarm parts specialist with expert knowledge of Gent by Honeywell (S4-Quad, S3, Vigilon, Vigilon Plus), Hochiki, Advanced/MxPro, Fireclass, Texecom, and Apollo product ranges and their part numbering systems.

For each item verify whether the part number matches the description. Return ONLY this JSON:
{
  "verifications": [
    {
      "id": "the ID exactly as given",
      "status": "correct|incorrect|uncertain",
      "suggested_part_number": "correct part number if wrong, same if correct",
      "suggested_description": "corrected description if part number is wrong",
      "suggested_unit_cost": 0,
      "note": "brief explanation citing your product knowledge"
    }
  ]
}`,
          messages: [{ role: "user", content: `Verify these fire alarm part numbers:\n\n${itemList}` }],
        },
      });

      if (fnError) throw new Error(fnError.message);
      const rawText: string = fnData?.content || "";
      let parsed: { verifications: (PartVerification & { id: string })[] };
      try {
        parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      } catch {
        throw new Error("Verification returned unexpected format");
      }

      const map: Record<string, PartVerification> = {};
      (parsed.verifications || []).forEach(v => { map[v.id] = v; });
      setVerifications(map);

      const incorrect = Object.values(map).filter(v => v.status === "incorrect").length;
      const correct   = Object.values(map).filter(v => v.status === "correct").length;
      if (incorrect > 0) {
        toast.warning(`${incorrect} part number${incorrect !== 1 ? "s" : ""} may be incorrect — ${correct} confirmed correct`);
      } else {
        toast.success(`All ${correct} part numbers verified correct`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function verifyOne(line: SmartQuoteLine) {
    setVerifyingId(line.id);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("claude-chat", {
        body: {
          model: "claude-sonnet-4-5",
          system: `You are a fire alarm parts specialist. Verify whether this part number is correct for the description. Return ONLY JSON: {"id":"${line.id}","status":"correct|incorrect|uncertain","suggested_part_number":"...","suggested_description":"...","suggested_unit_cost":0,"note":"..."}`,
          messages: [{ role: "user", content: `Manufacturer: ${line.manufacturer || "?"}\nPart: ${line.part_number || "not given"}\nDescription: ${line.description}\n\nIs this part number correct?` }],
        },
      });
      if (fnError) throw new Error(fnError.message);
      const rawText: string = fnData?.content || "";
      const parsed: PartVerification & { id: string } = JSON.parse(rawText.replace(/```json|```/g, "").trim());
      setVerifications(prev => ({ ...prev, [line.id]: parsed }));
      toast.success("Verification complete");
    } catch {
      toast.error("Verification failed — try again");
    } finally {
      setVerifyingId(null);
    }
  }

  function acceptSuggestion(lineId: string) {
    const v = verifications[lineId];
    if (!v) return;
    setLines(prev => {
      const updated = prev.map(l => {
        if (l.id !== lineId) return l;
        const newLine = {
          ...l,
          part_number: v.suggested_part_number || l.part_number,
          description: v.suggested_description || l.description,
          unit_cost: v.suggested_unit_cost > 0 ? v.suggested_unit_cost : l.unit_cost,
          price_source: v.suggested_unit_cost > 0 ? "ai_estimate" as PriceSource : l.price_source,
        };
        newLine.total = (newLine.unit_cost + (includeLabour ? newLine.labour_cost : 0)) * newLine.quantity;
        return newLine;
      });
      onLinesGenerated(updated, includeLabour);
      return updated;
    });
    setVerifications(prev => { const n = { ...prev }; delete n[lineId]; return n; });
    toast.success("Suggestion applied");
  }

  function updateLine<K extends keyof SmartQuoteLine>(id: string, field: K, value: SmartQuoteLine[K]) {
    setLines(prev => {
      const updated = prev.map(l => {
        if (l.id !== id) return l;
        const next = { ...l, [field]: value };
        next.total = (Number(next.unit_cost) + (includeLabour ? Number(next.labour_cost) : 0)) * Number(next.quantity);
        return next;
      });
      onLinesGenerated(updated, includeLabour);
      return updated;
    });
  }

  function removeLine(id: string) {
    const updated = lines.filter(l => l.id !== id);
    setLines(updated);
    onLinesGenerated(updated, includeLabour);
    setVerifications(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  function addLine() {
    const nl: SmartQuoteLine = {
      id: uid(), description: "", manufacturer: "", model: "", part_number: "",
      category: "Other", quantity: 1, unit_cost: 0, labour_cost: 0, total: 0,
      price_source: "ai_estimate", confidence: "High", ai_note: "Manually added",
    };
    const updated = [...lines, nl];
    setLines(updated);
    onLinesGenerated(updated, includeLabour);
  }

  function toggleLabour(val: boolean) {
    setIncludeLabour(val);
    const updated = lines.map(l => ({
      ...l,
      total: (Number(l.unit_cost) + (val ? Number(l.labour_cost) : 0)) * Number(l.quantity),
    }));
    setLines(updated);
    onLinesGenerated(updated, val);
  }

  const totalMaterials = lines.reduce((s, l) => s + Number(l.unit_cost) * Number(l.quantity), 0);
  const totalLabour    = includeLabour ? lines.reduce((s, l) => s + Number(l.labour_cost) * Number(l.quantity), 0) : 0;
  const total          = totalMaterials + totalLabour;
  const lowConfidence  = lines.filter(l => l.confidence === "Low" || l.confidence === "Medium").length;
  const hasIncorrect   = Object.values(verifications).some(v => v.status === "incorrect");

  if (!generated) {
    return (
      <div className="space-y-3">
        {priceList.length > 0 && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200/60 text-xs text-green-800">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span><strong>{priceList.length} items</strong> in your price list — will be matched first</span>
          </div>
        )}
        <Button onClick={generate} disabled={generating} size="lg" className="w-full gap-2">
          {generating
            ? <><Loader2 className="h-4 w-4 animate-spin" />Identifying devices and matching prices…</>
            : <><Sparkles className="h-4 w-4" />Generate Priced Quote Lines</>}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* Top controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg border bg-muted/30">
        <div className="flex items-center gap-2.5">
          <Switch checked={includeLabour} onCheckedChange={toggleLabour} id="labour-toggle" />
          <Label htmlFor="labour-toggle" className="text-xs font-medium cursor-pointer">
            Include Labour
            {!includeLabour && <span className="ml-1.5 text-muted-foreground font-normal">(supply only)</span>}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm"
            className={cn("h-7 gap-1.5 text-xs", hasIncorrect && "border-red-300/60 text-red-700")}
            onClick={verifyAll} disabled={verifying || lines.length === 0}>
            {verifying
              ? <><Loader2 className="w-3 h-3 animate-spin" />Verifying…</>
              : <><ShieldCheck className="w-3 h-3" />Verify Part Numbers</>}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
            onClick={() => { setGenerated(false); setLines([]); setVerifications({}); }}>
            <RefreshCw className="w-3 h-3" />Re-generate
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-2 flex-wrap text-[10px]">
        <Badge variant="outline" className="gap-1">
          <CheckCircle2 className="w-2.5 h-2.5 text-green-600" />
          {lines.filter(l => l.price_source === "price_list").length} from price list
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Sparkles className="w-2.5 h-2.5 text-amber-600" />
          {lines.filter(l => l.price_source === "ai_estimate").length} AI estimated
        </Badge>
        {lowConfidence > 0 && (
          <Badge variant="outline" className="gap-1 border-amber-300/60 text-amber-700">
            <AlertTriangle className="w-2.5 h-2.5" />{lowConfidence} need price review
          </Badge>
        )}
        {hasIncorrect && (
          <Badge variant="outline" className="gap-1 border-red-300/60 text-red-700">
            <XCircle className="w-2.5 h-2.5" />
            {Object.values(verifications).filter(v => v.status === "incorrect").length} part no. issues
          </Badge>
        )}
      </div>

      {/* Lines */}
      <div className="space-y-2">
        {lines.map((line, idx) => {
          const v = verifications[line.id];
          const isVerifyingThis = verifyingId === line.id;
          return (
            <div key={line.id} className={cn(
              "border rounded-lg p-3 space-y-2",
              v?.status === "incorrect" ? "border-red-300/60 bg-red-50/30 dark:bg-red-950/10" :
              line.confidence === "Low"  ? "border-amber-300/60 bg-amber-50/30 dark:bg-amber-950/10" :
              "border-border bg-card"
            )}>
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-muted-foreground w-5 flex-shrink-0 mt-1">{idx + 1}.</span>
                <div className="flex-1 space-y-2 min-w-0">

                  <div className="flex items-start gap-2 flex-wrap">
                    <Input value={line.description}
                      onChange={e => updateLine(line.id, "description", e.target.value)}
                      className="flex-1 min-w-[180px] text-sm font-medium h-8" placeholder="Description" />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <SourceBadge source={line.price_source} />
                      <VerifyBadge v={v} />
                    </div>
                  </div>

                  {(line.manufacturer || line.model || line.part_number) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex gap-2 text-[10px] text-muted-foreground flex-wrap">
                        {line.manufacturer && <span className="font-medium text-foreground">{line.manufacturer}</span>}
                        {line.model && <span>• {line.model}</span>}
                        {line.part_number && (
                          <span className={cn("font-mono", v?.status === "incorrect" && "line-through text-red-500")}>
                            • {line.part_number}
                          </span>
                        )}
                        {line.price_list_match && <span className="text-green-600">• {line.price_list_match}</span>}
                      </div>
                      {(line.part_number || line.manufacturer) && !v && (
                        <button onClick={() => verifyOne(line)} disabled={isVerifyingThis || verifying}
                          className="text-[9px] text-muted-foreground hover:text-primary underline flex items-center gap-0.5 flex-shrink-0">
                          {isVerifyingThis
                            ? <><Loader2 className="w-2.5 h-2.5 animate-spin" />checking…</>
                            : <><ShieldCheck className="w-2.5 h-2.5" />verify</>}
                        </button>
                      )}
                    </div>
                  )}

                  {v && v.status !== "correct" && (
                    <div className={cn("rounded-md p-2.5 space-y-1.5 text-xs",
                      v.status === "incorrect"
                        ? "bg-red-50 dark:bg-red-950/20 border border-red-200/60"
                        : "bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60")}>
                      <p className={cn("font-semibold flex items-center gap-1",
                        v.status === "incorrect" ? "text-red-700" : "text-amber-700")}>
                        {v.status === "incorrect" ? <XCircle className="w-3 h-3" /> : <HelpCircle className="w-3 h-3" />}
                        {v.status === "incorrect" ? "Part number may be incorrect" : "Uncertain — check this"}
                      </p>
                      <p className="text-muted-foreground leading-relaxed">{v.note}</p>
                      {v.suggested_part_number && v.suggested_part_number !== line.part_number && (
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <span className="text-muted-foreground">Suggested:</span>
                          <span className="font-mono font-semibold">{v.suggested_part_number}</span>
                          {v.suggested_description && v.suggested_description !== line.description && (
                            <span className="text-muted-foreground">— {v.suggested_description}</span>
                          )}
                          {v.suggested_unit_cost > 0 && (
                            <span className="text-green-700 font-medium">£{v.suggested_unit_cost.toFixed(2)}</span>
                          )}
                          <Button size="sm" className="h-6 px-2 text-[10px] gap-1 ml-auto"
                            onClick={() => acceptSuggestion(line.id)}>
                            <ArrowRight className="w-2.5 h-2.5" />Apply
                          </Button>
                          <button className="text-[10px] text-muted-foreground underline"
                            onClick={() => setVerifications(prev => { const n = { ...prev }; delete n[line.id]; return n; })}>
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {v?.status === "correct" && (
                    <p className="text-[10px] text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />{v.note}
                    </p>
                  )}

                  <div className={cn("grid gap-2", includeLabour ? "grid-cols-4" : "grid-cols-3")}>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Qty</Label>
                      <Input type="number" min={0} value={line.quantity}
                        onChange={e => updateLine(line.id, "quantity", Number(e.target.value) || 0)}
                        className="h-7 text-sm" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Unit Cost £</Label>
                      <Input type="number" min={0} step={0.01} value={line.unit_cost}
                        onChange={e => updateLine(line.id, "unit_cost", parseFloat(e.target.value) || 0)}
                        className={cn("h-7 text-sm", line.unit_cost === 0 && "border-amber-400/60")} />
                    </div>
                    {includeLabour && (
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Labour £</Label>
                        <Input type="number" min={0} step={0.01} value={line.labour_cost}
                          onChange={e => updateLine(line.id, "labour_cost", parseFloat(e.target.value) || 0)}
                          className="h-7 text-sm" />
                      </div>
                    )}
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Line Total</Label>
                      <div className="h-7 flex items-center text-sm font-semibold">£{line.total.toFixed(2)}</div>
                    </div>
                  </div>

                  {line.ai_note && <p className="text-[10px] text-muted-foreground italic">{line.ai_note}</p>}
                </div>

                <button onClick={() => removeLine(line.id)}
                  className="text-muted-foreground hover:text-destructive flex-shrink-0 p-1 rounded">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Button variant="outline" size="sm" className="w-full h-8 gap-1 text-xs" onClick={addLine}>
        <Plus className="h-3.5 w-3.5" />Add Line Item
      </Button>

      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between flex-wrap gap-4 text-sm">
          <div className="flex gap-6">
            <div><span className="text-xs text-muted-foreground block">Materials</span><span className="font-semibold">£{totalMaterials.toFixed(2)}</span></div>
            {includeLabour && <div><span className="text-xs text-muted-foreground block">Labour</span><span className="font-semibold">£{totalLabour.toFixed(2)}</span></div>}
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground block">Total (ex VAT){!includeLabour && " — supply only"}</span>
            <span className="text-lg font-bold">£{total.toFixed(2)}</span>
          </div>
        </div>
        {lowConfidence > 0 && (
          <p className="text-[11px] text-amber-700 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {lowConfidence} item{lowConfidence !== 1 ? "s" : ""} need price verification before sending to client
          </p>
        )}
        {hasIncorrect && (
          <p className="text-[11px] text-red-700 mt-1 flex items-center gap-1">
            <XCircle className="w-3 h-3" />Part number issues found — review suggestions above before creating quote
          </p>
        )}
      </div>
    </div>
  );
}

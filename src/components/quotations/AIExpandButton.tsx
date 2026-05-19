import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Check, X, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface LineItemInput {
  description: string;
  quantity: number;
}

interface ExpandedResult {
  index: number;
  expanded_description: string;
  expanded_summary_section: string;
}

interface AIExpandButtonProps {
  lineItems: LineItemInput[];
  context?: string;
  onAccept: (expandedItems: { index: number; description: string }[], generatedSummary: string) => void;
  disabled?: boolean;
}

export function AIExpandButton({ lineItems, context, onAccept, disabled }: AIExpandButtonProps) {
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [results, setResults] = useState<ExpandedResult[]>([]);
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [instructions, setInstructions] = useState("");

  const generateContent = async (customInstructions?: string) => {
    setLoading(true);
    try {
      const itemsText = lineItems
        .map((item, i) => `${i + 1}. ${item.description} (Qty: ${item.quantity})`)
        .join("\n");

      const body: any = {
        text: itemsText,
        type: "quotation_bs5839_expand",
        context: context || undefined,
      };
      if (customInstructions?.trim()) {
        body.customInstructions = customInstructions.trim();
      }

      const { data, error } = await supabase.functions.invoke("rewrite-text", { body });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const rewrittenText = data.rewrittenText;
      // Parse JSON response
      const cleaned = rewrittenText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed: ExpandedResult[] = JSON.parse(cleaned);

      setResults(parsed);

      // Build summary from sections
      const summaryParts = parsed
        .map((r) => r.expanded_summary_section)
        .filter(Boolean);
      const fullSummary = `**Scope of Works**\n\nWe are pleased to provide our quotation for the following works:\n\n${summaryParts.map((s) => `- ${s}`).join("\n")}\n\nAll works will be carried out in accordance with __BS 5839-1:2025__ and relevant British Standards. A completion certificate will be issued upon successful commissioning and testing.`;
      setGeneratedSummary(fullSummary);

      setPreviewOpen(true);
    } catch (err) {
      console.error("BS5839 expand error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to generate content");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = () => {
    if (!lineItems.some((i) => i.description.trim())) {
      toast.error("Add line items with descriptions first");
      return;
    }
    setInstructions("");
    generateContent();
  };

  const handleRetry = () => generateContent(instructions);

  const handleAccept = () => {
    const expandedItems = results.map((r) => ({
      index: r.index,
      description: r.expanded_description,
    }));
    onAccept(expandedItems, generatedSummary);
    toast.success("BS 5839 detail applied — please review before sending");
    setPreviewOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        disabled={disabled || loading || !lineItems.some((i) => i.description.trim())}
        className="gap-1"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {loading ? "Generating..." : "Add BS 5839 Detail"}
      </Button>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              BS 5839 Detail Preview
              <Badge variant="secondary" className="text-xs">Review Required</Badge>
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 pr-2">
            <div className="space-y-4">
              {results.map((result, i) => {
                const original = lineItems[result.index];
                return (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Item {result.index + 1}</Badge>
                      <span className="text-xs text-muted-foreground truncate">{original?.description}</span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-primary mb-1">Expanded Description</p>
                      <p className="text-sm bg-primary/5 border border-primary/20 rounded p-2 whitespace-pre-wrap">
                        {result.expanded_description}
                      </p>
                    </div>
                  </div>
                );
              })}

              <div className="border rounded-lg p-3 space-y-2">
                <Badge variant="outline" className="text-xs">Generated Summary</Badge>
                <div className="text-sm bg-primary/5 border border-primary/20 rounded p-2 whitespace-pre-wrap">
                  {generatedSummary}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Want changes? Tell the AI what to adjust:
                </p>
                <Textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Add more detail about panel replacement, reference BS 5839-6 for the domestic areas, shorten descriptions..."
                  className="min-h-[50px] text-sm"
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)} className="gap-1">
              <X className="h-4 w-4" /> Reject
            </Button>
            <Button variant="outline" size="sm" onClick={handleRetry} disabled={loading} className="gap-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {instructions.trim() ? "Retry with Instructions" : "Retry"}
            </Button>
            <Button size="sm" onClick={handleAccept} disabled={loading} className="gap-1">
              <Check className="h-4 w-4" /> Accept & Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Undo2, Check, X, RefreshCw, BookOpenCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AIRewriteButtonProps {
  text: string;
  type: "defects" | "defect_simplify" | "recommendations" | "works" | "comments" | "parts" | "notes" | "quotation_items" | "quotation_title" | "quotation_summary" | "bs5839_guidance";
  onRewrite: (newText: string) => void;
  disabled?: boolean;
  generateRecommendations?: boolean;
  onRecommendationsGenerated?: (recommendations: string) => void;
  context?: string;
  /** Compact icon-only variant — for inline use next to a small input
   *  (e.g. per-line in a quotation editor) where a full button with
   *  "Improve with AI" label would crowd the row. Defaults to false. */
  compact?: boolean;
}

// The guidance prompt appends a fixed verification tag to every
// response. The dialog renders it as a banner rather than inline text;
// stripping here keeps both views clean.
const GUIDANCE_VERIFY_TAG =
  "[Guidance referencing BS 5839-1:2017 — verify clause numbers against your copy of the standard before issue.]";
function stripGuidanceTag(text: string): string {
  return text.replace(GUIDANCE_VERIFY_TAG, "").trimEnd();
}

export function AIRewriteButton({
  text,
  type,
  onRewrite,
  disabled = false,
  generateRecommendations = false,
  onRecommendationsGenerated,
  context,
}: AIRewriteButtonProps) {
  const [loading, setLoading] = useState(false);
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [previewRecommendations, setPreviewRecommendations] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");

  const callAI = async (customInstructions?: string) => {
    setLoading(true);
    try {
      const body: any = { text, type, generateRecommendations, context };
      if (customInstructions?.trim()) {
        body.customInstructions = customInstructions.trim();
      }

      const { data, error } = await supabase.functions.invoke("rewrite-text", {
        body,
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.rewrittenText) {
        // Guidance responses end with a fixed verify tag — strip it from
        // the preview body since the dialog renders the disclaimer as
        // its own banner. (Keep raw text otherwise.)
        const cleaned = type === "bs5839_guidance"
          ? stripGuidanceTag(data.rewrittenText)
          : data.rewrittenText;
        setPreviewText(cleaned);
        setPreviewRecommendations(data.generatedRecommendations || null);
        setPreviewOpen(true);
      }
    } catch (error) {
      console.error("Rewrite error:", error);
      const message = error instanceof Error ? error.message : "Failed to rewrite text";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRewrite = () => {
    if (!text.trim()) {
      toast.error("Please enter some text first");
      return;
    }
    setOriginalText(text);
    setInstructions("");
    callAI();
  };

  const handleRetry = () => {
    callAI(instructions);
  };

  const handleAccept = () => {
    onRewrite(previewText);
    toast.success("Text improved with AI");

    if (previewRecommendations && onRecommendationsGenerated) {
      onRecommendationsGenerated(previewRecommendations);
      toast.success("Further action auto-filled based on work report");
    }

    setPreviewOpen(false);
    setInstructions("");
  };

  const handleReject = () => {
    setPreviewOpen(false);
    setOriginalText(null);
    setInstructions("");
  };

  const handleUndo = () => {
    if (originalText) {
      onRewrite(originalText);
      setOriginalText(null);
      toast.info("Restored original text");
    }
  };

  const isGuidance = type === "bs5839_guidance";
  const idleLabel = isGuidance ? "Suggest BS 5839 guidance" : "Improve with AI";
  const busyLabel = isGuidance ? "Drafting…" : "Improving...";
  const IdleIcon = isGuidance ? BookOpenCheck : Sparkles;

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size={compact ? "icon" : "sm"}
          onClick={handleRewrite}
          disabled={disabled || loading || !text.trim()}
          className={
            compact
              ? "h-7 w-7 text-muted-foreground hover:text-primary"
              : "h-7 px-2 text-xs text-muted-foreground hover:text-primary"
          }
          title={compact ? (loading ? busyLabel : idleLabel) : undefined}
          aria-label={compact ? (loading ? busyLabel : idleLabel) : undefined}
        >
          {loading ? (
            <Loader2 className={compact ? "w-3.5 h-3.5 animate-spin" : "w-3 h-3 animate-spin mr-1"} />
          ) : (
            <IdleIcon className={compact ? "w-3.5 h-3.5" : "w-3 h-3 mr-1"} />
          )}
          {!compact && (loading ? busyLabel : idleLabel)}
        </Button>
        {originalText && !loading && !previewOpen && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleUndo}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
          >
            <Undo2 className="w-3 h-3 mr-1" />
            Undo
          </Button>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isGuidance ? (
                <BookOpenCheck className="h-5 w-5 text-primary" />
              ) : (
                <Sparkles className="h-5 w-5 text-primary" />
              )}
              {isGuidance ? "BS 5839 Guidance Suggestion" : "AI Improvement Preview"}
            </DialogTitle>
          </DialogHeader>

          {isGuidance && (
            // BS 5839-1:2017 is copyrighted; the AI paraphrases from
            // general knowledge and can be wrong about exact clause
            // numbers. The engineer is signing the report — they must
            // verify against their licensed copy before accepting.
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Verify before signing.</p>
                <p>
                  This is AI-suggested guidance based on general knowledge of BS&nbsp;5839-1:2017. Clause numbers and specific
                  requirements <strong>must be verified against your licensed copy of the standard</strong> before you accept and
                  issue the report.
                </p>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 space-y-4">
            {/* Original vs Improved */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Original</p>
                <ScrollArea className="h-[180px] border rounded-md p-3 bg-muted/30">
                  <p className="text-sm whitespace-pre-wrap">{originalText}</p>
                </ScrollArea>
              </div>
              <div>
                <p className="text-xs font-medium text-primary mb-1">Improved</p>
                <ScrollArea className="h-[180px] border rounded-md p-3 border-primary/30 bg-primary/5">
                  <p className="text-sm whitespace-pre-wrap">{previewText}</p>
                </ScrollArea>
              </div>
            </div>

            {/* Custom instructions for retry */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Want changes? Tell the AI how to improve it:
              </p>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Make it more formal, add BS5839 references, list all devices separately, shorten it..."
                className="min-h-[60px] text-sm"
              />
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReject}
              className="gap-1"
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={loading}
              className="gap-1"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {instructions.trim() ? "Retry with Instructions" : "Retry"}
            </Button>
            <Button
              size="sm"
              onClick={handleAccept}
              disabled={loading}
              className="gap-1"
            >
              <Check className="h-4 w-4" />
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

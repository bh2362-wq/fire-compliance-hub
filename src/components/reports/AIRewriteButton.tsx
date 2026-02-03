import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AIRewriteButtonProps {
  text: string;
  type: "defects" | "recommendations" | "works" | "comments";
  onRewrite: (newText: string) => void;
  disabled?: boolean;
  generateRecommendations?: boolean;
  onRecommendationsGenerated?: (recommendations: string) => void;
}

export function AIRewriteButton({
  text,
  type,
  onRewrite,
  disabled = false,
  generateRecommendations = false,
  onRecommendationsGenerated,
}: AIRewriteButtonProps) {
  const [loading, setLoading] = useState(false);
  const [originalText, setOriginalText] = useState<string | null>(null);

  const handleRewrite = async () => {
    if (!text.trim()) {
      toast.error("Please enter some text first");
      return;
    }

    setLoading(true);
    setOriginalText(text);

    try {
      const { data, error } = await supabase.functions.invoke("rewrite-text", {
        body: { text, type, generateRecommendations },
      });

      if (error) {
        throw error;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.rewrittenText) {
        onRewrite(data.rewrittenText);
        toast.success("Text improved with AI");
      }

      // If recommendations were generated and callback provided, call it
      if (data.generatedRecommendations && onRecommendationsGenerated) {
        onRecommendationsGenerated(data.generatedRecommendations);
        toast.success("Further action auto-filled based on work report");
      }
    } catch (error) {
      console.error("Rewrite error:", error);
      const message = error instanceof Error ? error.message : "Failed to rewrite text";
      toast.error(message);
      setOriginalText(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = () => {
    if (originalText) {
      onRewrite(originalText);
      setOriginalText(null);
      toast.info("Restored original text");
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleRewrite}
        disabled={disabled || loading || !text.trim()}
        className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin mr-1" />
        ) : (
          <Sparkles className="w-3 h-3 mr-1" />
        )}
        {loading ? "Rewriting..." : "Improve with AI"}
      </Button>
      {originalText && !loading && (
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
  );
}

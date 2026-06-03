import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Check, X, RefreshCw, BookOpen, AlertTriangle, Undo2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type RewriteType = "quotation_title" | "quotation_summary" | "quotation_bs5839_expand";

interface GroundingChunkMeta {
  document_title: string;
  standard_reference: string | null;
  section_title: string | null;
  page_number: number | null;
  similarity: number;
}
interface GroundingMeta {
  enabled: boolean;
  applied: boolean;
  chunks_retrieved: number;
  documents_referenced: number;
  top_similarity: number;
  verified_clauses: string[];
  chunks: GroundingChunkMeta[];
  error?: string;
}

interface Props {
  /** Current text in the field */
  text: string;
  /** Type-aware prompt selection. Defaults to quotation_title for backwards compatibility. */
  type?: RewriteType;
  /** Free-form context (string) or structured context (object with lineItems etc.) */
  context?: string | Record<string, unknown>;
  /** Called when user accepts improved text. */
  onAccept: (newText: string) => void;
  /** Button label override */
  label?: string;
  /** Minimum chars before button enables. Sensible per-type defaults applied if omitted. */
  minChars?: number;
  /** Visual size */
  variant?: "inline" | "button";
  disabled?: boolean;
}

const DEFAULT_MIN: Record<RewriteType, number> = {
  quotation_title: 5,
  quotation_summary: 20,
  quotation_bs5839_expand: 30,
};

export function ImproveTitleButton({
  text,
  type = "quotation_title",
  context,
  onAccept,
  label = "Improve",
  minChars,
  variant = "inline",
  disabled,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [improved, setImproved] = useState("");
  const [grounding, setGrounding] = useState<GroundingMeta | null>(null);
  const [hallucinated, setHallucinated] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [undoVisible, setUndoVisible] = useState(false);
  const previousValueRef = useRef<string>("");
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const min = minChars ?? DEFAULT_MIN[type];
  const tooShort = !text || text.trim().length < min;

  const run = async (custom?: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("rewrite-text", {
        body: {
          text,
          type,
          context,
          customInstructions: custom?.trim() || undefined,
          useReferenceLibrary: true,
          referenceLibraryOptions: { minSimilarity: 0.25 },
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setImproved(data.rewrittenText ?? "");
      setGrounding(data.grounding_used ?? null);
      setHallucinated(data.hallucinated_clauses ?? []);
      setOpen(true);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Improve failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (tooShort) { toast.error(`Add at least ${min} characters first`); return; }
    setInstructions("");
    run();
  };

  const accept = () => {
    previousValueRef.current = text;
    onAccept(improved);
    setOpen(false);
    setUndoVisible(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoVisible(false), 5000);
    toast.success("Applied", {
      action: {
        label: "Undo",
        onClick: () => {
          onAccept(previousValueRef.current);
          setUndoVisible(false);
        },
      },
      duration: 5000,
    });
  };

  const buttonLabel = loading ? "Improving…" : label;
  const sourceLabel = type === "quotation_title" ? "Title" : type === "quotation_summary" ? "Description" : "Scope";

  const triggerBtn = (
    <Button
      type="button"
      variant={variant === "button" ? "outline" : "ghost"}
      size="sm"
      onClick={handleClick}
      disabled={disabled || loading || tooShort}
      className={variant === "inline" ? "h-7 px-2 text-xs text-muted-foreground hover:text-primary relative" : "gap-1 relative"}
    >
      {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
      {buttonLabel}
      {hallucinated.length > 0 && !open && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500" />
      )}
    </Button>
  );

  return (
    <>
      {hallucinated.length > 0 && !open ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{triggerBtn}</TooltipTrigger>
            <TooltipContent>AI may have cited unverified clauses — review before sending</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : triggerBtn}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Improved {sourceLabel}
              {grounding?.applied && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <BookOpen className="w-3 h-3" /> Library-grounded
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Original</p>
                <div className="border rounded-md p-3 bg-muted/30 text-sm min-h-[44px] whitespace-pre-wrap max-h-[300px] overflow-auto">{text}</div>
              </div>
              <div>
                <p className="text-xs font-medium text-primary mb-1">Improved</p>
                <div className="border rounded-md p-3 border-primary/30 bg-primary/5 text-sm min-h-[44px] font-medium whitespace-pre-wrap max-h-[300px] overflow-auto">{improved}</div>
              </div>
            </div>

            {grounding && (
              <div className="rounded-md border p-3 bg-muted/20 text-xs space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">chunks: {grounding.chunks_retrieved}</Badge>
                  <Badge variant="outline">docs: {grounding.documents_referenced}</Badge>
                  <Badge variant="outline">top sim: {grounding.top_similarity.toFixed(3)}</Badge>
                  {!grounding.applied && (
                    <Badge variant="secondary">no grounding applied{grounding.error ? ` — ${grounding.error}` : ""}</Badge>
                  )}
                </div>
                {grounding.chunks.length > 0 && (
                  <ul className="space-y-0.5 text-muted-foreground">
                    {grounding.chunks.slice(0, 5).map((c, i) => (
                      <li key={i} className="truncate">
                        [{i + 1}] {c.document_title}
                        {c.section_title ? ` — ${c.section_title}` : ""}
                        {c.page_number ? ` p.${c.page_number}` : ""}
                        {" "}<span className="opacity-60">({c.similarity.toFixed(3)})</span>
                      </li>
                    ))}
                  </ul>
                )}
                {grounding.verified_clauses.length > 0 && (
                  <div className="text-emerald-700 dark:text-emerald-400">
                    Verified citations: {grounding.verified_clauses.join(", ")}
                  </div>
                )}
              </div>
            )}

            {hallucinated.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs flex gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-amber-700 dark:text-amber-400">Unverified citations</div>
                  <div className="text-muted-foreground">
                    Not found in retrieved library excerpts: {hallucinated.join(", ")}
                  </div>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Tweak instructions (optional)</p>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. shorten, cite specific clauses, mention manufacturer…"
                className="min-h-[50px] text-sm"
              />
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 sm:gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="gap-1">
              <X className="h-4 w-4" /> Reject
            </Button>
            <Button variant="outline" size="sm" onClick={() => run(instructions)} disabled={loading} className="gap-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {instructions.trim() ? "Retry with instructions" : "Retry"}
            </Button>
            <Button size="sm" onClick={accept} disabled={loading || !improved.trim()} className="gap-1">
              <Check className="h-4 w-4" /> Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Alias export for the broader use case
export { ImproveTitleButton as ImproveButton };

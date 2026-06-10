/**
 * BsClauseSuggester
 *
 * Companion to the BS Clause Reference input on the smart-form
 * Variations step. Engineer types a variation description; this
 * widget calls the suggest-bs5839-clause edge function with ONLY
 * the variation text — no other parts of the form payload are
 * sent — and surfaces up to 3 BS 5839-1:2025 clause suggestions
 * with confidence + reasoning. Clicking a suggestion fills the
 * input.
 *
 * Intentionally scoped to the single variation: the requirement
 * was an explicit "check the variation field, no other parts of
 * the form".
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ClauseSuggestion {
  clause: string;
  title: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

interface Props {
  /** Description of the variation — sole input that gets sent. */
  description: string;
  /** Justification text — optional second input, also sent. */
  justification?: string;
  /** Current value of the BS Clause Reference input. */
  value: string;
  /** Setter for the BS Clause Reference input. */
  onChange: (v: string) => void;
  disabled?: boolean;
}

const CONFIDENCE_STYLES: Record<ClauseSuggestion["confidence"], string> = {
  high:   "bg-green-500/15 text-green-700 border-green-500/30",
  medium: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  low:    "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

export function BsClauseSuggester({
  description,
  justification,
  value,
  onChange,
  disabled,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ClauseSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const hasText = (description?.trim()?.length ?? 0) > 0
    || (justification?.trim()?.length ?? 0) > 0;

  async function runCheck() {
    if (!hasText) {
      toast.warning("Add a variation description first so the checker has something to read.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "suggest-bs5839-clause",
        {
          // Explicitly only send the variation text. Nothing else from
          // the form leaves the browser.
          body: { description, justification },
        },
      );
      if (invokeErr) throw new Error(invokeErr.message ?? "Suggester error");
      const payload = data as { suggestions?: ClauseSuggestion[]; error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      const list = Array.isArray(payload?.suggestions) ? payload!.suggestions! : [];
      if (list.length === 0) {
        setError("No matching clause found — write one in manually.");
        return;
      }
      setSuggestions(list);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Couldn't suggest a BS clause", { description: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">BS Clause Reference</Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px] gap-1"
          onClick={runCheck}
          disabled={disabled || loading || !hasText}
          title={hasText
            ? "Suggest a BS 5839-1:2025 clause from the variation description"
            : "Type a variation description first"}
        >
          {loading
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Sparkles className="h-3 w-3" />}
          {loading ? "Checking…" : "Suggest"}
        </Button>
      </div>

      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Cl. 22.2(g)"
        disabled={disabled}
      />

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="rounded-md border bg-popover overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={`${s.clause}-${i}`}
              type="button"
              onClick={() => {
                onChange(s.clause);
                setSuggestions([]);
              }}
              className="w-full text-left px-2.5 py-2 hover:bg-accent transition-colors border-b last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold">{s.clause}</span>
                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${CONFIDENCE_STYLES[s.confidence] ?? ""}`}>
                  {s.confidence}
                </Badge>
                <span className="text-xs text-muted-foreground truncate flex-1">{s.title}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{s.reasoning}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

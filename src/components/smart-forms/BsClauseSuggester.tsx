/**
 * BsClauseSuggester
 *
 * Companion to the BS Clause Reference + Justification inputs on the
 * smart-form Variations step. Engineer types a variation description;
 * this widget calls the suggest-bs5839-clause edge function with ONLY
 * the variation text — no other parts of the form payload are sent —
 * and surfaces up to 3 BS 5839-1:2025 clause suggestions with
 * confidence + reasoning.
 *
 * Selecting a suggestion appends:
 *   - the clause ref to BS Clause Reference (comma-separated)
 *   - "Cl. X — reasoning" to Justification (newline-separated)
 *
 * Clicking a selected suggestion again removes both entries. Multiple
 * suggestions can be stacked. The user's own typed justification is
 * preserved either way — we only add/remove the exact lines we wrote.
 *
 * Scope (per the brief): the edge function call uses ONLY the variation
 * description + justification text. No other form fields leave the
 * browser.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, AlertCircle, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ClauseSuggestion {
  clause: string;
  title: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

interface Props {
  description: string;
  justification: string;
  /** Current BS Clause Reference value. */
  value: string;
  /** Setter for BS Clause Reference. */
  onChange: (v: string) => void;
  /** Setter for Justification — required for multi-select to write the
   *  reasoning into the right field. */
  onJustificationChange: (v: string) => void;
  disabled?: boolean;
}

const CONFIDENCE_STYLES: Record<ClauseSuggestion["confidence"], string> = {
  high:   "bg-green-500/15 text-green-700 border-green-500/30",
  medium: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  low:    "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

// Match by clause ref alone — refs are unique in BS 5839-1.
function clauseRefs(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function clauseLine(s: ClauseSuggestion): string {
  return `${s.clause} — ${s.reasoning}`;
}

export function BsClauseSuggester({
  description,
  justification,
  value,
  onChange,
  onJustificationChange,
  disabled,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ClauseSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const hasText = (description?.trim()?.length ?? 0) > 0
    || (justification?.trim()?.length ?? 0) > 0;

  const selectedRefs = clauseRefs(value);
  const isSelected = (s: ClauseSuggestion) => selectedRefs.includes(s.clause);

  async function runCheck() {
    if (!hasText) {
      toast.warning("Add a variation description first so the checker has something to read.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "suggest-bs5839-clause",
        {
          // Explicitly send ONLY the variation text — nothing else from
          // the form payload leaves the browser.
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

  function toggleSuggestion(s: ClauseSuggestion) {
    const line = clauseLine(s);
    if (isSelected(s)) {
      // Remove — strip the ref from the comma-list and the matching
      // line from the justification. Other refs / other lines are
      // preserved so the engineer's edits stick around.
      const newRefs = selectedRefs.filter((r) => r !== s.clause).join(", ");
      onChange(newRefs);

      const newJustification = (justification ?? "")
        .split("\n")
        .filter((row) => row.trim() !== line)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")  // collapse runs of blanks left behind
        .trim();
      onJustificationChange(newJustification);
    } else {
      // Append — clause to comma-list, full "Cl. X — reasoning" line to
      // justification (preceded by a newline if the field has content).
      const newRefs = value.trim() ? `${value.trim()}, ${s.clause}` : s.clause;
      onChange(newRefs);

      const base = (justification ?? "").trim();
      const newJustification = base ? `${base}\n${line}` : line;
      onJustificationChange(newJustification);
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
          <div className="px-2.5 py-1.5 border-b bg-muted/40 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Tap a clause to add it to the justification — tap again to remove.
            </span>
            <button
              type="button"
              onClick={() => setSuggestions([])}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          {suggestions.map((s, i) => {
            const selected = isSelected(s);
            return (
              <button
                key={`${s.clause}-${i}`}
                type="button"
                onClick={() => toggleSuggestion(s)}
                className={cn(
                  "w-full text-left px-2.5 py-2 transition-colors border-b last:border-b-0",
                  selected
                    ? "bg-primary/10 hover:bg-primary/15"
                    : "hover:bg-accent",
                )}
              >
                <div className="flex items-center gap-2">
                  {selected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <span className="h-3.5 w-3.5 shrink-0 rounded-sm border border-muted-foreground/40" />
                  )}
                  <span className="font-mono text-xs font-semibold">{s.clause}</span>
                  <Badge variant="outline" className={cn("text-[9px] px-1 py-0", CONFIDENCE_STYLES[s.confidence])}>
                    {s.confidence}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate flex-1">{s.title}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug pl-5">
                  {s.reasoning}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

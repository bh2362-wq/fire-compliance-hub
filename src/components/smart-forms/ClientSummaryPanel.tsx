import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  /** Human label for this form, e.g. "BS 5839-1 Commissioning Certificate". */
  formLabel?: string;
  /** Any form payload — fields are flattened into context for the AI. */
  payload: Record<string, any>;
  /** Optional extra instruction sentence (form-specific tone or focus). */
  extraInstruction?: string;
  /** Optional custom context builder; overrides default flatten logic. */
  buildContext?: (payload: Record<string, any>) => string;
}

/* Default flattener: turns the payload into "key: value" lines, skipping
   empty values, base64 signatures, large arrays of objects (just counted),
   and obvious internals. */
function defaultBuildContext(payload: Record<string, any>): string {
  const SKIP_PREFIXES = ["_", "id", "submission", "user_id", "site_id", "customer_id", "visit_id"];
  const SKIP_KEYS = new Set([
    "engineer_signature", "rp_signature", "client_signature",
    "signature", "signature_image", "logo", "company_logo",
  ]);
  const lines: string[] = [];
  const isObj = (v: any) => v && typeof v === "object";

  for (const [k, v] of Object.entries(payload || {})) {
    if (SKIP_KEYS.has(k)) continue;
    if (SKIP_PREFIXES.some((p) => k.startsWith(p))) continue;
    if (v === null || v === undefined || v === "") continue;

    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      // Summarise object arrays — list first 8 short string fields per item.
      if (isObj(v[0])) {
        lines.push(`${k}: ${v.length} item(s)`);
        v.slice(0, 8).forEach((item, i) => {
          const desc = item.description || item.item || item.label || item.name || item.title;
          const status = item.status || item.result || item.severity;
          if (desc) lines.push(`  - ${status ? `[${status}] ` : ""}${desc}`);
        });
      } else {
        lines.push(`${k}: ${v.join(", ")}`);
      }
      continue;
    }

    if (isObj(v)) continue; // skip nested objects
    if (typeof v === "string" && v.startsWith("data:image")) continue;

    const display = typeof v === "string" && v.length > 240 ? v.slice(0, 240) + "…" : String(v);
    lines.push(`${k}: ${display}`);
  }
  return lines.join("\n");
}

export function ClientSummaryPanel({
  payload,
  formLabel = "fire safety service visit",
  extraInstruction,
  buildContext,
}: Props) {
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const ctx = (buildContext ?? defaultBuildContext)(payload);
      const baseInstruction =
        `Write a single client-facing email about this ${formLabel}. ` +
        `Output ONLY the email in this exact order and nothing else:\n` +
        `1. First line: "Subject: <concise subject>"\n` +
        `2. Blank line\n` +
        `3. Greeting (e.g. "Dear <name>,") — use the client/contact name from the context if available, otherwise "Dear Sir/Madam,"\n` +
        `4. Body paragraphs covering: what was carried out, overall outcome, any flagged items or defects, recommended follow-up actions, and next due date.\n` +
        `5. Sign-off ("Kind regards,") followed by the engineer's name from the context if available.\n` +
        `Be reassuring but honest. Plain English, no markdown, no headings, no bullet symbols, no technical engineer summary before the email. Keep the body under 180 words.`;
      const customInstructions = extraInstruction
        ? `${baseInstruction} ${extraInstruction}`
        : baseInstruction;

      const { data, error } = await supabase.functions.invoke("rewrite-text", {
        body: { text: ctx, type: "comments", customInstructions },
      });
      if (error) throw error;
      const out = (data?.rewrittenText || data?.rewritten || data?.text || "").toString();
      if (!out.trim()) throw new Error("Empty AI response");
      setSummary(out);
      toast.success("Summary generated");
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate summary");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-muted-foreground">
          Generates a friendly client-facing email from this form's details.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            Generate
          </Button>
          <Button size="sm" variant="ghost" onClick={copy} disabled={!summary}>
            <Copy className="h-3.5 w-3.5 mr-1" />Copy
          </Button>
        </div>
      </div>
      <Textarea
        rows={8}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Click Generate to create a plain-English client summary…"
        className="text-xs"
      />
    </div>
  );
}

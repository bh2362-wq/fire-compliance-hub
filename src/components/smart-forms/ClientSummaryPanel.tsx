import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { BS5839Payload } from "@/services/smartFormService";

interface Props {
  payload: BS5839Payload;
}

export function ClientSummaryPanel({ payload }: Props) {
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  function buildContext(): string {
    const checklist = payload.checklist ?? [];
    const noCount = checklist.filter(c => c.status === "Fail" || c.status === "NO").length;
    const defects = (payload.defects ?? []).filter(d => d.description?.trim());
    const lines: string[] = [];
    lines.push(`Site: ${payload.premises_name || "Unknown"}`);
    lines.push(`Date of service: ${payload.date_of_service || "n/a"}`);
    lines.push(`Engineer: ${payload.engineer_name || "n/a"}`);
    lines.push(`Overall status: ${payload.overall_status || "n/a"}`);
    lines.push(`Checklist: ${checklist.length} items, ${noCount} flagged NO.`);
    if (defects.length) {
      lines.push(`Defects: ${defects.length}`);
      defects.slice(0, 10).forEach(d => lines.push(` - ${d.severity || "Minor"}: ${d.description}`));
    }
    if (payload.work_carried_out) lines.push(`Work carried out: ${payload.work_carried_out}`);
    if (payload.next_service_date) lines.push(`Next service due: ${payload.next_service_date}`);
    return lines.join("\n");
  }

  async function generate() {
    setBusy(true);
    try {
      const ctx = buildContext();
      const { data, error } = await supabase.functions.invoke("rewrite-text", {
        body: {
          text: ctx,
          type: "comments",
          customInstructions:
            "Write a short plain-English email summary for the client about this fire alarm service visit. Be reassuring but honest. Mention overall status, any flagged items or defects, what work was done, and the next service date. Keep it under 180 words. No markdown.",
        },
      });
      if (error) throw error;
      const out = (data?.rewritten || data?.text || "").toString();
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          Generates a friendly client-facing email from the cert details.
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

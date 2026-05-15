import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sparkles, Copy, Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  formLabel?: string;
  payload: Record<string, any>;
  extraInstruction?: string;
  buildContext?: (payload: Record<string, any>) => string;
}

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
      if (isObj(v[0])) {
        lines.push(`${k}: ${v.length} item(s)`);
        v.slice(0, 8).forEach((item) => {
          const desc = item.description || item.item || item.label || item.name || item.title;
          const status = item.status || item.result || item.severity;
          if (desc) lines.push(`  - ${status ? `[${status}] ` : ""}${desc}`);
        });
      } else {
        lines.push(`${k}: ${v.join(", ")}`);
      }
      continue;
    }
    if (isObj(v)) continue;
    if (typeof v === "string" && v.startsWith("data:image")) continue;
    const display = typeof v === "string" && v.length > 240 ? v.slice(0, 240) + "…" : String(v);
    lines.push(`${k}: ${display}`);
  }
  return lines.join("\n");
}

// Pull subject + body from "Subject: ..." prefixed text
function splitSubjectBody(text: string): { subject: string; body: string } {
  const m = text.match(/^\s*Subject:\s*(.+?)\s*\n+([\s\S]*)$/i);
  if (m) return { subject: m[1].trim(), body: m[2].trim() };
  return { subject: "", body: text.trim() };
}

export function ClientSummaryPanel({
  payload,
  formLabel = "fire safety service visit",
  extraInstruction,
  buildContext,
}: Props) {
  const [summary, setSummary] = useState("");
  const [recipient, setRecipient] = useState<string>(
    payload?.contact_email || payload?.client_email || payload?.customer_email || ""
  );
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const customerId = payload?.customer_id || null;
  const siteId = payload?.site_id || null;
  const visitId = payload?.visit_id || null;

  async function generate() {
    setBusy(true);
    try {
      let ctx = (buildContext ?? defaultBuildContext)(payload);

      // Pull existing open defects on this site so the email reflects the full picture
      // (e.g. previously reported Vesda fault). The AI is then told to dedupe.
      if (siteId) {
        try {
          const { data: prior } = await supabase
            .from("site_defects")
            .select("description, location, category, status, raised_at")
            .eq("site_id", siteId)
            .in("status", ["open", "quoted"])
            .order("raised_at", { ascending: false })
            .limit(40);
          if (prior && prior.length) {
            const lines = prior.map((d: any) => {
              const cat = d.category ? `C${d.category}` : "";
              const loc = d.location ? ` @ ${d.location}` : "";
              return `  - [${d.status}${cat ? ` ${cat}` : ""}]${loc} ${d.description}`;
            });
            ctx += `\n\nprevious_open_defects: ${prior.length} item(s)\n${lines.join("\n")}`;
          }
        } catch (e) {
          console.warn("Could not load prior defects:", e);
        }
      }

      const baseInstruction =
        `Write a single client-facing email about this ${formLabel}. ` +
        `Output ONLY the email in this exact order and nothing else:\n` +
        `1. First line: "Subject: <concise subject>"\n` +
        `2. Blank line\n` +
        `3. Greeting (e.g. "Dear <name>,") — use the client/contact name from the context if available, otherwise "Dear Sir/Madam,"\n` +
        `4. Body paragraphs covering: what was carried out, overall outcome, any flagged items or defects (INCLUDING any items listed under previous_open_defects that are still outstanding, e.g. previously reported Vesda or detector faults), recommended follow-up actions, and next due date.\n` +
        `5. Sign-off ("Kind regards,") followed by the engineer's name from the context if available.\n\n` +
        `IMPORTANT — Deduplicate issues: if the same fault appears in both today's findings and previous_open_defects, mention it ONCE only. Match by description and location (case-insensitive, ignore minor wording differences). Never list the same defect twice.\n` +
        `Be reassuring but honest. Plain English, no markdown, no headings, no bullet symbols, no technical engineer summary before the email. Keep the body under 220 words.`;
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

  async function saveDraft() {
    if (!summary.trim()) {
      toast.error("Generate or write the email first");
      return;
    }
    setSaving(true);
    try {
      const { subject, body } = splitSubjectBody(summary);
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("customer_email_drafts").insert({
        customer_id: customerId,
        site_id: siteId,
        visit_id: visitId,
        form_label: formLabel,
        recipient_email: recipient || null,
        subject: subject || `Service summary — ${formLabel}`,
        body,
        status: "draft",
        created_by: user?.id || null,
      });
      if (error) throw error;
      toast.success("Saved to customer file");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to save draft");
    } finally {
      setSaving(false);
    }
  }

  async function sendNow() {
    if (!summary.trim()) {
      toast.error("Generate or write the email first");
      return;
    }
    if (!recipient.trim()) {
      toast.error("Enter a recipient email");
      return;
    }
    setSending(true);
    try {
      const { subject, body } = splitSubjectBody(summary);
      const { data, error } = await supabase.functions.invoke("send-customer-email", {
        body: {
          to: recipient.trim(),
          subject: subject || `Service summary — ${formLabel}`,
          body,
          customerId,
          siteId,
          visitId,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Email sent");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-muted-foreground">
          Generates a friendly client-facing email. Save it to the customer file or send straight away.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
            Generate
          </Button>
          <Button size="sm" variant="ghost" onClick={copy} disabled={!summary}>
            <Copy className="h-3.5 w-3.5 mr-1" />Copy
          </Button>
          <Button size="sm" variant="outline" onClick={saveDraft} disabled={!summary || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save draft
          </Button>
          <Button size="sm" onClick={sendNow} disabled={!summary || !recipient || sending}>
            {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            Send now
          </Button>
        </div>
      </div>
      <Input
        type="email"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="Recipient email (e.g. client@example.com)"
        className="h-8 text-xs"
      />
      <Textarea
        rows={10}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Click Generate to create a plain-English client summary…"
        className="text-xs"
      />
    </div>
  );
}

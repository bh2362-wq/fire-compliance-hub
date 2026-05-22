import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, CalendarClock, Siren, FileText, Calendar as CalendarIcon,
  Bell, AlertTriangle, StickyNote, X, CheckCircle2, ArrowRight,
  Mail, MessageSquare, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import {
  listPendingActionItems, dismissActionItem, markActioned,
  type EmailActionItemRow, type IntentType, type IntentPriority,
} from "@/services/emailActionItemsService";
import type { ExtractedEmailData } from "@/pages/EmailScanner";

const INTENT_META: Record<IntentType, { icon: typeof Bell; label: string; tint: string }> = {
  visit:    { icon: CalendarClock,  label: "Book visit",        tint: "text-blue-700 bg-blue-50 border-blue-200" },
  callout:  { icon: Siren,          label: "Arrange callout",   tint: "text-red-700 bg-red-50 border-red-200" },
  quote:    { icon: FileText,       label: "Create quote",      tint: "text-amber-700 bg-amber-50 border-amber-200" },
  meeting:  { icon: CalendarIcon,   label: "Add to calendar",   tint: "text-purple-700 bg-purple-50 border-purple-200" },
  reminder: { icon: Bell,           label: "Reminder",          tint: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  issue:    { icon: AlertTriangle,  label: "Flag issue",        tint: "text-rose-700 bg-rose-50 border-rose-200" },
  note:     { icon: StickyNote,     label: "Note",              tint: "text-slate-700 bg-slate-50 border-slate-200" },
};

const PRIORITY_BADGE: Record<IntentPriority, string> = {
  urgent: "bg-red-600 text-white",
  high:   "bg-orange-500 text-white",
  medium: "bg-amber-100 text-amber-900",
  low:    "bg-slate-100 text-slate-700",
};

interface Props {
  /** Called when user clicks the primary action and we want the parent EmailScanner to drop into the visit/quote/bulk flow. */
  onRouteToFlow?: (mode: "visit" | "quote", data: ExtractedEmailData) => void;
  /** Restrict to a specific source email if provided. */
  sourceEmailId?: string;
}

export function IntentReviewQueue({ onRouteToFlow, sourceEmailId }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["email-action-items", sourceEmailId ?? "all"],
    queryFn: async () => {
      const all = await listPendingActionItems(200);
      return sourceEmailId ? all.filter((i) => i.source_email_id === sourceEmailId) : all;
    },
  });

  const lastEmailSweep = typeof window !== "undefined" ? localStorage.getItem("emailScanner.lastSweep.email") : null;
  const lastWaSweep    = typeof window !== "undefined" ? localStorage.getItem("emailScanner.lastSweep.whatsapp") : null;

  async function handleDismiss(id: string) {
    setBusy(id);
    try {
      await dismissActionItem(id);
      toast.success("Discarded");
      qc.invalidateQueries({ queryKey: ["email-action-items"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  }

  async function handleBulkDiscardLow() {
    const targets = items.filter((i) => i.priority === "low" || i.priority === "medium");
    if (!targets.length) { toast.info("Nothing low/medium priority to discard"); return; }
    if (!confirm(`Discard ${targets.length} low/medium-priority item${targets.length === 1 ? "" : "s"}?`)) return;
    setBusy("bulk");
    try {
      await Promise.all(targets.map((t) => dismissActionItem(t.id)));
      toast.success(`Discarded ${targets.length} item${targets.length === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["email-action-items"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  }

  function payloadToExtracted(it: EmailActionItemRow): ExtractedEmailData {
    const p = it.suggested_payload || {};
    return {
      company_name: p.company_name ?? null,
      contact_name: p.contact_name ?? null,
      contact_email: p.contact_email ?? null,
      contact_phone: p.contact_phone ?? null,
      site_name: p.site_name ?? null,
      site_address: p.site_address ?? null,
      site_city: p.site_city ?? null,
      site_postcode: p.site_postcode ?? null,
      visit_type: it.intent_type === "callout" ? "emergency" : (p.visit_type ?? null),
      urgency: it.priority === "urgent" || it.priority === "high" ? "high" : it.priority,
      preferred_date: it.suggested_date,
      description: p.description ?? it.summary ?? null,
      notes: p.notes ?? null,
      client_po_number: p.client_po_number ?? null,
      scope_summary: p.description ?? it.summary ?? null,
      sender_email: it.source_from ?? null,
    };
  }

  async function handlePrimaryAction(it: EmailActionItemRow) {
    setBusy(it.id);
    try {
      if (it.intent_type === "visit" || it.intent_type === "callout") {
        onRouteToFlow?.("visit", payloadToExtracted(it));
        await markActioned(it.id);
      } else if (it.intent_type === "quote") {
        onRouteToFlow?.("quote", payloadToExtracted(it));
        await markActioned(it.id);
      } else if (it.intent_type === "meeting") {
        // Route to Schedule with prefill query
        const params = new URLSearchParams({
          title: it.title,
          date: it.suggested_date || "",
          notes: it.summary || "",
        });
        window.open(`/dashboard/schedule?${params.toString()}`, "_blank");
        await markActioned(it.id, "schedule", undefined);
        toast.success("Opened Schedule — finish booking and it'll sync to Outlook");
      } else {
        // reminder/issue/note — just acknowledge
        await markActioned(it.id);
        toast.success("Marked as done");
      }
      qc.invalidateQueries({ queryKey: ["email-action-items"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />Loading action items…
      </div>
    );
  }

  const SweepHeader = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 border-b border-border/60 mb-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Mail className="w-3 h-3" />
          Email sweep: <span className="font-medium text-foreground">
            {lastEmailSweep ? `${formatDistanceToNow(new Date(lastEmailSweep))} ago` : "never"}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          WhatsApp sweep: <span className="font-medium text-foreground">
            {lastWaSweep ? `${formatDistanceToNow(new Date(lastWaSweep))} ago` : "never"}
          </span>
        </span>
        <span>· {items.length} pending</span>
      </div>
      {items.length > 0 && (
        <Button
          variant="ghost" size="sm" className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-destructive"
          onClick={handleBulkDiscardLow} disabled={busy === "bulk"}
        >
          <Trash2 className="w-3 h-3" />Discard low/medium
        </Button>
      )}
    </div>
  );

  if (items.length === 0) {
    return (
      <div>
        {SweepHeader}
        <div className="text-center py-10 text-muted-foreground text-sm">
          <CheckCircle2 className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
          No pending action items — items persist here until you action or discard them.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {SweepHeader}
      {items.map((it) => {
        const meta = INTENT_META[it.intent_type];
        const Icon = meta.icon;
        const isMeeting = it.intent_type === "meeting";
        const isInfoOnly = it.intent_type === "reminder" || it.intent_type === "note" || it.intent_type === "issue";
        return (
          <Card key={it.id} className={`border ${meta.tint.split(" ").pop()}`}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-md ${meta.tint}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{meta.label}</Badge>
                    <Badge className={`text-[10px] uppercase tracking-wide ${PRIORITY_BADGE[it.priority]}`}>
                      {it.priority}
                    </Badge>
                    {it.suggested_date && (
                      <Badge variant="outline" className="text-[10px]">
                        <CalendarIcon className="w-2.5 h-2.5 mr-1" />
                        {format(new Date(it.suggested_date), "dd MMM yyyy")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-semibold leading-snug">{it.title}</p>
                  {it.summary && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{it.summary}</p>}
                  {(it.source_subject || it.source_from) && (
                    <p className="text-[10px] text-muted-foreground mt-1 truncate">
                      {it.source_from && <span className="font-medium">{it.source_from}</span>}
                      {it.source_subject && <span> · {it.source_subject}</span>}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handlePrimaryAction(it)}
                    disabled={busy === it.id}
                  >
                    {busy === it.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                    {isInfoOnly ? "Done" : isMeeting ? "Schedule" : meta.label}
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-7 w-7 p-0"
                    onClick={() => handleDismiss(it.id)} disabled={busy === it.id}
                    aria-label="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      <p className="text-[10px] text-muted-foreground text-center pt-2">
        Need to revisit dismissed items? <Link to="/email-scanner" className="underline">Open the scanner</Link>.
      </p>
    </div>
  );
}

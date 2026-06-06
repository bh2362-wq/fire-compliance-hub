import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, ClipboardCheck, Receipt, Mail, ShieldAlert, AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { VisitActionsDrawer } from "./VisitActionsDrawer";

// Unified "Open Actions" view. Aggregates outstanding work from five
// sources so the user has one place to see everything that needs a
// decision instead of hunting through separate widgets.
//
// Sources:
//   1. service_visits status="pending_review" → visit needs sign-off
//   2. service_visits completed but with no matching xero_invoices row
//      → visit needs invoicing
//   3. email_action_items status="pending"|"snoozed" → email decision
//      (replaces the standalone EmailActionItemsWidget)
//   4. site_bafe_certificates status="valid", expiry within 7 days
//      → urgent renewal
//   5. xero_invoices status="OVERDUE" → chase via credit control

type ActionKind =
  | "visit_review"
  | "visit_invoice"
  | "email_decision"
  | "bafe_renewal"
  | "invoice_overdue";

interface ActionItem {
  id: string;
  kind: ActionKind;
  title: string;
  subtitle: string | null;
  // For visit-related actions we open the drawer with the visit_id so
  // the user picks from a menu (View vs Create invoice, etc.) instead
  // of being shoved into the wrong action. Non-visit actions navigate
  // to their href on click.
  visitId?: string;
  href?: string;
  // For sorting — higher = more urgent.
  urgencyScore: number;
  urgencyLabel: "urgent" | "soon" | "normal";
}

const KIND_META: Record<ActionKind, { label: string; icon: typeof CheckCircle2; tone: string; toneIcon: string }> = {
  visit_review:    { label: "Needs review",   icon: ClipboardCheck, tone: "bg-warning/8 border-warning/20",        toneIcon: "text-warning" },
  visit_invoice:   { label: "Needs invoice",  icon: Receipt,        tone: "bg-secondary/8 border-secondary/20",    toneIcon: "text-secondary" },
  email_decision:  { label: "Email action",   icon: Mail,           tone: "bg-secondary/8 border-secondary/20",    toneIcon: "text-secondary" },
  bafe_renewal:    { label: "BAFE renewal",   icon: ShieldAlert,    tone: "bg-destructive/8 border-destructive/20", toneIcon: "text-destructive" },
  invoice_overdue: { label: "Overdue invoice",icon: AlertTriangle,  tone: "bg-destructive/8 border-destructive/20", toneIcon: "text-destructive" },
};

function urgencyBadge(label: ActionItem["urgencyLabel"]): { className: string; text: string } {
  if (label === "urgent") return { className: "bg-destructive/15 text-destructive border-destructive/25", text: "URGENT" };
  if (label === "soon")   return { className: "bg-warning/15 text-warning border-warning/25",         text: "SOON" };
  return { className: "bg-muted text-muted-foreground border-border", text: "OPEN" };
}

export function OpenActionsWidget() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerVisitId, setDrawerVisitId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const todayIso = format(now, "yyyy-MM-dd");
        const in7 = new Date(now.getTime() + 7 * 86_400_000);
        const in7Iso = format(in7, "yyyy-MM-dd");

        // Five parallel queries.
        const [
          reviewQ, completedQ, emailsQ, bafeQ, overdueInvQ,
        ] = await Promise.all([
          supabase.from("service_visits")
            .select("id, visit_date, site:sites(name)")
            .eq("status", "pending_review")
            .order("visit_date", { ascending: true })
            .limit(20),
          supabase.from("service_visits")
            .select("id, visit_date, site:sites(name)")
            .eq("status", "completed")
            .order("visit_date", { ascending: false })
            .limit(50),
          supabase.from("email_action_items")
            .select("id, title, priority, source_from, created_at")
            .in("status", ["pending", "snoozed"])
            .order("priority", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(20),
          supabase.from("site_bafe_certificates")
            .select("id, certificate_type, expiry_date, site:sites(name)")
            .eq("status", "valid")
            .lte("expiry_date", in7Iso)
            .order("expiry_date", { ascending: true })
            .limit(20),
          supabase.from("xero_invoices")
            .select("id, xero_invoice_number, contact_name, total_amount")
            .eq("status", "OVERDUE")
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

        // For visit_invoice: take completed visits, drop the ones that
        // already have a non-voided / non-deleted invoice. A VOIDED or
        // DELETED invoice means the work is still uninvoiced — anything
        // else (DRAFT / SUBMITTED / AUTHORISED / PAID / OVERDUE) means
        // someone has already started invoicing this visit.
        const completedVisitIds = (completedQ.data ?? []).map((v: any) => v.id as string);
        let invoicedVisitIds = new Set<string>();
        if (completedVisitIds.length > 0) {
          const { data: invRows } = await supabase
            .from("xero_invoices")
            .select("visit_id, status")
            .in("visit_id", completedVisitIds)
            .not("status", "in", "(VOIDED,DELETED)");
          invoicedVisitIds = new Set(
            (invRows ?? [])
              .map((r: any) => r.visit_id as string)
              .filter(Boolean),
          );
        }

        const list: ActionItem[] = [];

        // 1. Visit pending review — opens the visit actions drawer so
        //    the user can pick Open / Edit / Create invoice / View
        //    site, rather than being shoved straight into one action.
        for (const v of (reviewQ.data ?? []) as any[]) {
          const daysAgo = differenceInDays(now, parseISO(v.visit_date));
          list.push({
            id: `vr-${v.id}`,
            kind: "visit_review",
            title: v.site?.name ?? "Unknown site",
            subtitle: `Visited ${format(parseISO(v.visit_date), "d MMM")} · ${daysAgo}d since`,
            visitId: v.id,
            urgencyScore: 50 + daysAgo,
            urgencyLabel: daysAgo > 7 ? "urgent" : daysAgo > 3 ? "soon" : "normal",
          });
        }

        // 2. Visit completed, no invoice. Drawer-driven again: if the
        //    drawer finds an existing invoice (e.g. created via Xero
        //    directly, not via the visit flow) it shows "View invoice"
        //    instead of "Create invoice".
        for (const v of (completedQ.data ?? []) as any[]) {
          if (invoicedVisitIds.has(v.id)) continue;
          const daysAgo = differenceInDays(now, parseISO(v.visit_date));
          list.push({
            id: `vi-${v.id}`,
            kind: "visit_invoice",
            title: v.site?.name ?? "Unknown site",
            subtitle: `Completed ${format(parseISO(v.visit_date), "d MMM")} · ${daysAgo}d since`,
            visitId: v.id,
            urgencyScore: 30 + daysAgo,
            urgencyLabel: daysAgo > 14 ? "urgent" : daysAgo > 7 ? "soon" : "normal",
          });
        }

        // 3. Email action items
        for (const e of (emailsQ.data ?? []) as any[]) {
          const isUrgent = e.priority === "urgent";
          const isHigh = e.priority === "high";
          list.push({
            id: `em-${e.id}`,
            kind: "email_decision",
            title: e.title ?? "(untitled email)",
            subtitle: e.source_from ?? null,
            href: `/dashboard/email-scanner`,
            urgencyScore: isUrgent ? 90 : isHigh ? 70 : 40,
            urgencyLabel: isUrgent ? "urgent" : isHigh ? "soon" : "normal",
          });
        }

        // 4. BAFE certs expiring ≤7 days (or already expired)
        for (const c of (bafeQ.data ?? []) as any[]) {
          const days = differenceInDays(parseISO(c.expiry_date), now);
          list.push({
            id: `bf-${c.id}`,
            kind: "bafe_renewal",
            title: c.site?.name ?? "Unknown site",
            subtitle: days < 0
              ? `${c.certificate_type ?? "?"} — expired ${Math.abs(days)}d ago`
              : `${c.certificate_type ?? "?"} — expires in ${days}d`,
            href: `/dashboard/cert-tracker`,
            urgencyScore: 100 - days,
            urgencyLabel: days <= 3 ? "urgent" : "soon",
          });
        }

        // 5. Overdue invoices
        for (const inv of (overdueInvQ.data ?? []) as any[]) {
          list.push({
            id: `ov-${inv.id}`,
            kind: "invoice_overdue",
            title: inv.contact_name ?? "Unknown customer",
            subtitle: `${inv.xero_invoice_number ?? "?"} · £${Number(inv.total_amount ?? 0).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`,
            href: `/dashboard/credit-control`,
            urgencyScore: 75,
            urgencyLabel: "urgent",
          });
        }

        list.sort((a, b) => b.urgencyScore - a.urgencyScore);
        if (!cancelled) setItems(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="section-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-warning/10 flex items-center justify-center">
            <ClipboardCheck className="w-4 h-4 text-warning" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Open Actions</h3>
            <p className="text-xs text-muted-foreground">
              {loading ? "Checking…" : items.length === 0 ? "All caught up" : `${items.length} items need attention`}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-md border border-border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-success/60" />
          <p>No open actions — you're all caught up.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin">
          {items.slice(0, 25).map((it) => {
            const meta = KIND_META[it.kind];
            const Icon = meta.icon;
            const badge = urgencyBadge(it.urgencyLabel);
            return (
              <button
                key={it.id}
                onClick={() => {
                  // Visit-related actions open the drawer; everything
                  // else navigates to its target page.
                  if (it.visitId && (it.kind === "visit_review" || it.kind === "visit_invoice")) {
                    setDrawerVisitId(it.visitId);
                  } else if (it.href) {
                    navigate(it.href);
                  }
                }}
                className={cn(
                  "w-full text-left rounded-md border p-3 hover:shadow-sm transition-all active:scale-[0.99] flex items-center gap-3",
                  meta.tone,
                )}
              >
                <div className="w-9 h-9 rounded-md bg-card flex items-center justify-center shrink-0">
                  <Icon className={cn("w-4 h-4", meta.toneIcon)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {meta.label}
                    </p>
                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border", badge.className)}>
                      {badge.text}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-foreground truncate">{it.title}</p>
                  {it.subtitle && (
                    <p className="text-xs text-muted-foreground truncate">{it.subtitle}</p>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
          {items.length > 25 && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              + {items.length - 25} more
            </p>
          )}
        </div>
      )}

      <VisitActionsDrawer
        visitId={drawerVisitId}
        open={drawerVisitId !== null}
        onOpenChange={(o) => { if (!o) setDrawerVisitId(null); }}
      />
    </div>
  );
}

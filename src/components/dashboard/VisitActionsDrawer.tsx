import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Eye, Receipt, MapPin, Calendar,
  CheckCircle2, ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// Action drawer for visit rows on the dashboard widgets.
//
// Why this exists
//   DayVisitsWidget and OpenActionsWidget used to navigate directly
//   into the visit edit dialog (or the create-invoice dialog). That's
//   fine when the action is unambiguous, but:
//     • Some visits are already invoiced and the "Needs invoice"
//       action would still appear and route to the create flow.
//     • There's no single "pick what you want to do" affordance, so
//       the user couldn't reach related actions (open site, view
//       existing invoice, etc.) from the same starting point.
//
//   The drawer fixes both. It opens with a single fetch that resolves:
//     • the visit + its site
//     • the latest non-voided / non-deleted invoice for the visit
//   then offers the right buttons (Create vs View invoice; Open visit
//   details; Open site) and closes itself when one is picked, routing
//   the page via the existing query-param deep-links.

interface VisitInfo {
  id: string;
  visit_date: string;
  status: string | null;
  visit_type: string | null;
  appointment_time: string | null;
  site: { id: string; name: string | null } | null;
}

interface InvoiceInfo {
  id: string;
  xero_invoice_number: string | null;
  status: string | null;
  total_amount: number | null;
}

interface VisitActionsDrawerProps {
  visitId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function statusTone(status: string | null): string {
  switch (status) {
    case "scheduled":      return "bg-secondary/10 text-secondary border-secondary/20";
    case "in_progress":    return "bg-warning/10 text-warning border-warning/20";
    case "pending_review": return "bg-warning/10 text-warning border-warning/20";
    case "completed":      return "bg-success/10 text-success border-success/20";
    case "cancelled":      return "bg-muted text-muted-foreground border-border";
    case "no_show":        return "bg-destructive/10 text-destructive border-destructive/25";
    default:               return "bg-muted text-muted-foreground border-border";
  }
}

function invoiceTone(status: string | null): string {
  switch (status) {
    case "PAID":       return "bg-success/10 text-success border-success/25";
    case "AUTHORISED": return "bg-secondary/10 text-secondary border-secondary/25";
    case "OVERDUE":    return "bg-destructive/10 text-destructive border-destructive/25";
    case "DRAFT":      return "bg-muted text-muted-foreground border-border";
    case "SUBMITTED":  return "bg-warning/10 text-warning border-warning/25";
    default:           return "bg-muted text-muted-foreground border-border";
  }
}

export function VisitActionsDrawer({ visitId, open, onOpenChange }: VisitActionsDrawerProps) {
  const navigate = useNavigate();
  const [visit, setVisit] = useState<VisitInfo | null>(null);
  const [invoice, setInvoice] = useState<InvoiceInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !visitId) return;
    let cancelled = false;
    setLoading(true);
    setVisit(null);
    setInvoice(null);
    (async () => {
      const [vQ, iQ] = await Promise.all([
        supabase
          .from("service_visits")
          .select("id, visit_date, status, visit_type, appointment_time, site:sites(id, name)")
          .eq("id", visitId)
          .single(),
        supabase
          .from("xero_invoices")
          .select("id, xero_invoice_number, status, total_amount")
          .eq("visit_id", visitId)
          .not("status", "in", "(VOIDED,DELETED)")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setVisit((vQ.data ?? null) as VisitInfo | null);
      setInvoice((iQ.data ?? null) as InvoiceInfo | null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, visitId]);

  const close = () => onOpenChange(false);

  const goToVisitEdit = () => {
    close();
    navigate(`/dashboard/visits?visitId=${visitId}`);
  };

  const goToCreateInvoice = () => {
    close();
    navigate(`/dashboard/visits?invoiceVisit=${visitId}`);
  };

  const goToViewInvoices = () => {
    close();
    navigate(`/dashboard/invoices`);
  };

  const goToSite = () => {
    if (!visit?.site?.id) return;
    close();
    navigate(`/sites`);
  };

  const visitStatusLabel = (() => {
    if (!visit?.status) return "—";
    return visit.status.replace(/_/g, " ");
  })();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-lg pr-6">
            {loading ? <Skeleton className="h-6 w-48" /> : (visit?.site?.name ?? "Unknown site")}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="space-y-2 mt-2">
              {loading ? (
                <Skeleton className="h-4 w-32" />
              ) : visit ? (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(parseISO(visit.visit_date), "EEE d MMM yyyy")}
                    {visit.appointment_time && ` · ${visit.appointment_time.slice(0, 5)}`}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      "inline-flex text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border",
                      statusTone(visit.status),
                    )}>
                      {visitStatusLabel}
                    </span>
                    {invoice && (
                      <span className={cn(
                        "inline-flex text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border",
                        invoiceTone(invoice.status),
                      )}>
                        Invoice {invoice.status?.toLowerCase() ?? "found"}
                      </span>
                    )}
                  </div>
                  {invoice && (
                    <p className="text-xs text-muted-foreground">
                      {invoice.xero_invoice_number ?? "(no number)"}
                      {invoice.total_amount != null && (
                        <> · £{Number(invoice.total_amount).toLocaleString("en-GB", { maximumFractionDigits: 2 })}</>
                      )}
                    </p>
                  )}
                </>
              ) : (
                <span>Visit not found.</span>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-2">
          <ActionRow
            icon={Eye}
            label="Open visit details"
            description="Edit status, notes, engineer, requirements."
            onClick={goToVisitEdit}
            disabled={!visit}
          />

          {/* Smart invoice action — driven by whether an active invoice
              already exists. Avoids the previous "needs invoice" link
              firing on a job that's already been invoiced. */}
          {invoice ? (
            <ActionRow
              icon={Receipt}
              label="View invoice"
              description={`${invoice.xero_invoice_number ?? "Existing invoice"} — ${invoice.status?.toLowerCase() ?? "active"}`}
              onClick={goToViewInvoices}
              tone="success"
            />
          ) : (
            <ActionRow
              icon={Receipt}
              label="Create invoice"
              description="Build a Xero invoice from this visit's work."
              onClick={goToCreateInvoice}
              tone="primary"
              disabled={!visit || visit.status !== "completed"}
              hint={visit && visit.status !== "completed"
                ? "Visit must be completed first."
                : undefined}
            />
          )}

          {visit?.site && (
            <ActionRow
              icon={MapPin}
              label={`Open site: ${visit.site.name ?? "—"}`}
              description="See history, defects and certificates for this site."
              onClick={goToSite}
            />
          )}

          {/* Quick status confirmation hint when the visit is already
              fully closed out — there's nothing left to action. */}
          {visit?.status === "completed" && invoice?.status === "PAID" && (
            <div className="flex items-center gap-2 mt-3 p-3 rounded-md bg-success/10 border border-success/25 text-success text-sm">
              <CheckCircle2 className="w-4 h-4" />
              This job is closed out — visit completed and invoice paid.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActionRow({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
  tone = "default",
  hint,
}: {
  icon: typeof Eye;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "success";
  hint?: string;
}) {
  const toneClass =
    tone === "primary" ? "border-primary/30 hover:bg-primary/5"
    : tone === "success" ? "border-success/30 hover:bg-success/5"
    : "border-border hover:border-foreground/25";

  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full h-auto py-3 px-3 justify-start text-left flex items-center gap-3 disabled:opacity-50",
        toneClass,
      )}
    >
      <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-foreground/70" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{hint ?? description}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </Button>
  );
}


import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, CalendarClock, Receipt, ShieldCheck, Briefcase } from "lucide-react";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// Recommendations — heuristic advice on day-to-day running of the
// business. Each card is one piece of advice with a count, a sentence,
// and a CTA. If no rules trigger, shows a "all looks good" empty state.
//
// Why heuristics not LLM
//   Predictable and instant. The BAFE-grounded RAG chat we built lives
//   in the AI Assistant page for richer questions. These cards are the
//   "go look at X now" prompt — speed matters here, not nuance.

interface Tip {
  id: string;
  icon: typeof CalendarClock;
  tone: "primary" | "warning" | "destructive" | "secondary" | "success";
  message: string;
  cta: string;
  href: string;
  // For ordering — higher = more urgent.
  weight: number;
}

const TONE_RING: Record<Tip["tone"], string> = {
  primary:     "bg-primary/8 border-primary/20 text-primary",
  warning:     "bg-warning/8 border-warning/20 text-warning",
  destructive: "bg-destructive/8 border-destructive/20 text-destructive",
  secondary:   "bg-secondary/8 border-secondary/20 text-secondary",
  success:     "bg-success/8 border-success/20 text-success",
};

export function RecommendationsWidget() {
  const navigate = useNavigate();
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const todayIso = format(now, "yyyy-MM-dd");
        const tomorrowIso = format(addDays(now, 1), "yyyy-MM-dd");
        const in30 = format(addDays(now, 30), "yyyy-MM-dd");

        const [
          tomorrowQ, bafeExpQ, overdueQ, ramsDraftQ,
        ] = await Promise.all([
          supabase.from("service_visits")
            .select("id", { count: "exact", head: true })
            .eq("visit_date", tomorrowIso)
            .in("status", ["scheduled", "in_progress"]),
          supabase.from("site_bafe_certificates")
            .select("id", { count: "exact", head: true })
            .eq("status", "valid")
            .gte("expiry_date", todayIso)
            .lte("expiry_date", in30),
          supabase.from("xero_invoices")
            .select("id, total_amount", { count: "exact" })
            .eq("status", "OVERDUE"),
          supabase.from("rams_documents")
            .select("id", { count: "exact", head: true })
            .in("status", ["draft", "prepared"]),
        ]);

        const overdueTotal = (overdueQ.data ?? []).reduce(
          (sum, inv: any) => sum + (inv.total_amount ?? 0), 0,
        );
        const overdueCount = overdueQ.count ?? 0;

        const tomorrowCount = tomorrowQ.count ?? 0;
        const bafeExpiring = bafeExpQ.count ?? 0;
        const ramsDraft = ramsDraftQ.count ?? 0;

        const out: Tip[] = [];

        if (overdueCount > 0) {
          out.push({
            id: "overdue-invoices",
            icon: Receipt,
            tone: "destructive",
            message: `${overdueCount} overdue invoice${overdueCount === 1 ? "" : "s"} totalling £${overdueTotal.toLocaleString("en-GB", { maximumFractionDigits: 0 })} — chase via credit control.`,
            cta: "Open credit control",
            href: "/dashboard/credit-control",
            weight: 100,
          });
        }

        if (bafeExpiring > 0) {
          out.push({
            id: "bafe-expiring",
            icon: ShieldCheck,
            tone: "warning",
            message: `${bafeExpiring} BAFE cert${bafeExpiring === 1 ? "" : "s"} expire within 30 days — start the renewal process now.`,
            cta: "Open cert tracker",
            href: "/dashboard/cert-tracker",
            weight: 80,
          });
        }

        if (tomorrowCount > 0) {
          out.push({
            id: "tomorrow-load",
            icon: CalendarClock,
            tone: "primary",
            message: `${tomorrowCount} visit${tomorrowCount === 1 ? "" : "s"} scheduled tomorrow — review tools and materials tonight.`,
            cta: "Open diary",
            href: "/dashboard/visits",
            weight: 70,
          });
        }

        if (ramsDraft > 0) {
          out.push({
            id: "rams-draft",
            icon: Briefcase,
            tone: "secondary",
            message: `${ramsDraft} RAMS in draft or prepared state — send to client before the visit.`,
            cta: "Open RAMS",
            href: "/qms/rams",
            weight: 50,
          });
        }

        out.sort((a, b) => b.weight - a.weight);
        if (!cancelled) setTips(out);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="section-card">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Recommendations</h3>
          <p className="text-xs text-muted-foreground">
            {loading ? "Looking…" : tips.length === 0 ? "Nothing urgent right now" : `${tips.length} suggestion${tips.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 rounded-md border border-border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : tips.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>Everything looks good — no urgent business actions today.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {tips.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => navigate(t.href)}
                className={cn(
                  "text-left rounded-md border p-3 hover:shadow-sm transition-all active:scale-[0.99]",
                  TONE_RING[t.tone],
                )}
              >
                <div className="flex items-start gap-3">
                  <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">{t.message}</p>
                    <p className="text-xs font-semibold mt-1.5 inline-flex items-center gap-1">
                      {t.cta} <ArrowRight className="w-3 h-3" />
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

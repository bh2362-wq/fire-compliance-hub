import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { KPICard } from "@/components/dashboard/KPICard";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import RecentVisits from "@/components/dashboard/RecentVisits";
import QuickActions from "@/components/dashboard/QuickActions";
import TodaySchedule from "@/components/dashboard/TodaySchedule";
import ServiceDueDashboard from "@/components/dashboard/ServiceDueDashboard";
import ComplianceChart from "@/components/dashboard/ComplianceChart";
import { FinancialSummary } from "@/components/dashboard/FinancialSummary";
import { BankReconciliation } from "@/components/xero/BankReconciliation";
import { ComplianceCalendar, getComplianceAlertCount } from "@/components/dashboard/ComplianceCalendar";
import { RamsRemindersWidget } from "@/components/dashboard/RamsRemindersWidget";
import { EmailActionItemsWidget } from "@/components/dashboard/EmailActionItemsWidget";
import {
  Building2, ClipboardCheck, AlertTriangle, ShieldCheck,
  Award, ArrowRight
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format, subDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { getAllBafeCertificates } from "@/services/bafeCertificateService";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

/* ── Alert strip ──────────────────────────────────────────────────────── */
interface AlertStripProps {
  type: "danger" | "warning";
  message: string;
  action?: string;
  onClick?: () => void;
}

const AlertStrip = ({ type, message, action, onClick }: AlertStripProps) => (
  <div
    className={cn(
      "flex items-center gap-3 px-4 py-3.5 sm:py-3 rounded-md border text-[15px] sm:text-sm font-medium",
      type === "danger"
        ? "bg-destructive/8 border-destructive/20 text-destructive"
        : "bg-warning/8 border-warning/20 text-warning"
    )}
  >
    <AlertTriangle className="w-5 h-5 sm:w-4 sm:h-4 flex-shrink-0" />
    <span className="flex-1">{message}</span>
    {action && (
      <button
        onClick={onClick}
        className="flex items-center gap-1 text-sm sm:text-xs font-semibold opacity-80 hover:opacity-100 transition-opacity ml-2 whitespace-nowrap py-1"
      >
        {action} <ArrowRight className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
      </button>
    )}
  </div>
);

/* ── Main Dashboard ───────────────────────────────────────────────────── */
const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    activeSites: 0,
    visitsThisMonth: 0,
    pendingVisits: 0,
    openVisits: 0,
    overdueCount: 0,
    overdueTotalGbp: 0,
  });
  // 30-day visit-per-day trend feeding the Visits This Month sparkline.
  // Latest day last (Sparkline expects oldest-first order).
  const [visitTrend, setVisitTrend] = useState<number[]>([]);
  // Week-over-week delta on visits (this 7d count vs previous 7d).
  const [visitsWowDelta, setVisitsWowDelta] = useState<number | null>(null);
  const [complianceOverdue, setComplianceOverdue] = useState(0);

  useEffect(() => {
    getComplianceAlertCount()
      .then((count) => setComplianceOverdue(count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      const now = new Date();
      const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
      const monthEnd   = format(endOfMonth(now),   "yyyy-MM-dd");
      const trendStart = format(subDays(now, 29), "yyyy-MM-dd");

      const [sitesResult, visitsThisMonthResult, openVisitsResult, overdueResult, trendResult] =
        await Promise.all([
          supabase.from("sites").select("id", { count: "exact", head: true }).eq("status", "active"),
          supabase.from("service_visits").select("id, status", { count: "exact" })
            .gte("visit_date", monthStart)
            .lte("visit_date", monthEnd),
          supabase.from("service_visits").select("id", { count: "exact", head: true })
            .in("status", ["scheduled", "in_progress", "pending_review"]),
          // Overdue invoices via Xero-synced records
          supabase.from("xero_invoices")
            .select("id, total_amount, status")
            .in("status", ["AUTHORISED", "OVERDUE"]),
          // Last 30 days of visit dates for the sparkline.
          supabase.from("service_visits").select("visit_date")
            .gte("visit_date", trendStart),
        ]);

      const pendingCount = visitsThisMonthResult.data?.filter(
        (v) => v.status === "scheduled" || v.status === "pending_review"
      ).length || 0;

      const overdueInvoices = (overdueResult.data || []).filter(
        (inv: any) => inv.status === "OVERDUE"
      );
      const overdueTotal = overdueInvoices.reduce(
        (sum: number, inv: any) => sum + (inv.total_amount || 0), 0
      );

      // Build a 30-bucket histogram (oldest-first) from the trend rows.
      const buckets: number[] = Array.from({ length: 30 }, () => 0);
      for (const row of (trendResult.data ?? []) as { visit_date: string }[]) {
        const d = new Date(row.visit_date);
        const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
        const idx = 29 - diff;
        if (idx >= 0 && idx < 30) buckets[idx] += 1;
      }
      setVisitTrend(buckets);
      // WoW delta: last 7 buckets vs the 7 before that.
      const last7 = buckets.slice(-7).reduce((a, b) => a + b, 0);
      const prev7 = buckets.slice(-14, -7).reduce((a, b) => a + b, 0);
      setVisitsWowDelta(prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : (last7 > 0 ? 100 : null));

      setStats({
        activeSites:      sitesResult.count || 0,
        visitsThisMonth:  visitsThisMonthResult.count || 0,
        pendingVisits:    pendingCount,
        openVisits:       openVisitsResult.count || 0,
        overdueCount:     overdueInvoices.length,
        overdueTotalGbp:  overdueTotal,
      });
    };

    fetchStats();
  }, []);

  /* BAFE compliance summary */
  const { data: bafeCerts } = useQuery({
    queryKey: ["dashboard-bafe-certs"],
    queryFn: getAllBafeCertificates,
  });

  const bafeSiteMap = new Map<string, typeof bafeCerts>();
  (bafeCerts || []).forEach((c) => {
    const arr = bafeSiteMap.get(c.site_id) || [];
    (arr as any[]).push(c);
    bafeSiteMap.set(c.site_id, arr as any);
  });

  const bafeTypes = ["design", "installation", "commissioning", "maintenance"];
  const bafeCompliant = Array.from(bafeSiteMap.values()).filter(
    (certs) => bafeTypes.every((t) => (certs as any[]).some((c: any) => c.certificate_type === t && c.status === "valid"))
  ).length;
  const bafeTotalSites = bafeSiteMap.size;
  const bafeExpiring = (bafeCerts || []).filter((c) => {
    if (!c.expiry_date) return false;
    const diff = new Date(c.expiry_date).getTime() - Date.now();
    return diff > 0 && diff < 30 * 86_400_000;
  }).length;
  const bafeExpired = (bafeCerts || []).filter((c) => {
    if (!c.expiry_date) return false;
    return new Date(c.expiry_date).getTime() < Date.now() && c.status !== "valid";
  }).length;
  const bafeCompliantPct = bafeTotalSites > 0 ? Math.round((bafeCompliant / bafeTotalSites) * 100) : 0;

  const hasAlerts = bafeExpiring > 0 || bafeExpired > 0 || stats.overdueCount > 0 || complianceOverdue > 0;

  return (
    <DashboardLayout>
      <div className="space-y-5">

        {/* ── Hero — date + today/tomorrow snapshot + New Visit CTA ────── */}
        <DashboardHero />

        {/* ── Alert strip ─────────────────────────────────────────────── */}
        {hasAlerts && (
          <div className="space-y-2">
            {(bafeExpired > 0 || bafeExpiring > 0) && (
              <AlertStrip
                type={bafeExpired > 0 ? "danger" : "warning"}
                message={
                  bafeExpired > 0
                    ? `${bafeExpired} BAFE certificate${bafeExpired !== 1 ? "s have" : " has"} expired — action required`
                    : `${bafeExpiring} BAFE certificate${bafeExpiring !== 1 ? "s are" : " is"} expiring within 30 days`
                }
                action="View Cert Tracker"
                onClick={() => navigate("/dashboard/cert-tracker")}
              />
            )}
            {complianceOverdue > 0 && (
              <AlertStrip
                type="danger"
                message={`${complianceOverdue} site${complianceOverdue !== 1 ? "s are" : " is"} overdue for service`}
                action="View Schedule"
                onClick={() => {
                  const el = document.getElementById("compliance-calendar");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            )}
            {stats.overdueCount > 0 && (
              <AlertStrip
                type="warning"
                message={`${stats.overdueCount} overdue invoice${stats.overdueCount !== 1 ? "s" : ""} — £${stats.overdueTotalGbp.toLocaleString("en-GB", { maximumFractionDigits: 0 })} outstanding`}
                action="Chase Now"
                onClick={() => navigate("/dashboard/credit-control")}
              />
            )}
          </div>
        )}

        {/* ── KPI strip — sparkline + WoW delta where we have data ────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <KPICard
            title="Active Sites"
            value={stats.activeSites}
            subtitle="Fire alarm installations"
            icon={Building2}
            iconTint="bg-primary/10"
            iconInk="text-primary"
            href="/sites"
          />
          <KPICard
            title="Visits This Month"
            value={stats.visitsThisMonth}
            trend={visitTrend}
            deltaPercent={visitsWowDelta}
            goodDirection="up"
            subtitle={stats.pendingVisits > 0 ? `${stats.pendingVisits} pending` : "all confirmed"}
            icon={ClipboardCheck}
            iconTint="bg-success/10"
            iconInk="text-success"
            accent="success"
            href="/dashboard/visits"
          />
          <KPICard
            title="Open Visits"
            value={stats.openVisits}
            subtitle={stats.openVisits > 0 ? "Awaiting completion" : "All clear"}
            icon={AlertTriangle}
            iconTint={stats.openVisits > 0 ? "bg-destructive/10" : "bg-success/10"}
            iconInk={stats.openVisits > 0 ? "text-destructive" : "text-success"}
            accent={stats.openVisits > 0 ? "danger" : "success"}
            href="/dashboard/visits"
          />
          <KPICard
            title="BAFE Compliance"
            value={`${bafeCompliantPct}%`}
            subtitle={
              bafeExpiring > 0
                ? `${bafeExpiring} cert${bafeExpiring !== 1 ? "s" : ""} expiring soon`
                : `${bafeCompliant} of ${bafeTotalSites} sites compliant`
            }
            icon={Award}
            iconTint="bg-primary/10"
            iconInk="text-primary"
            accent={bafeExpired > 0 ? "danger" : bafeExpiring > 0 ? "warning" : "primary"}
            href="/dashboard/cert-tracker"
          />
        </div>

        {/* ── Service Due — desk-only.
              The widget is rendered as a dense spreadsheet with
              hard-coded 11–12px fonts that don't respect the
              theme. Until it has a mobile-card variant, hide it
              on phones — TodaySchedule below covers today-focus,
              and the canonical list is at /dashboard/visits. */}
        <div className="hidden md:block">
          <ServiceDueDashboard />
        </div>

        {/* ── BAFE summary card.
              Hidden on mobile — the BAFE Compliance KPI tile above
              already shows the percentage; the full breakdown is
              desk work and the cert-tracker page is one tap away. */}
        <div
          className="section-card cursor-pointer hover:border-primary/30 transition-all hidden md:block"
          onClick={() => navigate("/dashboard/cert-tracker")}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">BAFE SP203-1 Compliance</h3>
                <p className="text-xs text-muted-foreground">All certificate types across all sites</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>

          {/* Progress bar */}
          <div className="w-full bg-muted rounded-full h-1.5 mb-4 overflow-hidden">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-700"
              style={{ width: `${bafeCompliantPct}%` }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-lg bg-background/60">
              <p className="text-2xl font-bold text-foreground">{bafeCompliant}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">
                Fully Compliant
              </p>
            </div>
            <div
              className={cn(
                "p-3 rounded-lg",
                bafeExpiring > 0 ? "bg-warning/8 border border-warning/20" : "bg-background/60"
              )}
            >
              <p className={cn("text-2xl font-bold", bafeExpiring > 0 ? "text-warning" : "text-foreground")}>
                {bafeExpiring}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">
                Expiring ≤30d
              </p>
            </div>
            <div
              className={cn(
                "p-3 rounded-lg",
                bafeExpired > 0 ? "bg-destructive/8 border border-destructive/20" : "bg-background/60"
              )}
            >
              <p className={cn("text-2xl font-bold", bafeExpired > 0 ? "text-destructive" : "text-foreground")}>
                {bafeTotalSites > 0 ? bafeTotalSites - bafeCompliant : 0}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">
                Incomplete
              </p>
            </div>
          </div>
        </div>

        {/* ── Today's schedule — kept on mobile.
              Quick actions hidden on mobile (most actions are
              desk-bias, and the FAB / hero CTA cover the key one). */}
        <div className="grid md:grid-cols-2 gap-3 md:gap-5">
          <div className="hidden md:block">
            <QuickActions />
          </div>
          <TodaySchedule />
        </div>

        {/* ── RAMS reminders — desk work, hide on mobile ───────────────── */}
        <div className="hidden md:block">
          <RamsRemindersWidget />
        </div>

        {/* ── Email action items — desk work, hide on mobile ──────────── */}
        <div className="hidden md:block">
          <EmailActionItemsWidget />
        </div>


        {/* ── Charts + financial — all desk work, hide on mobile.
              ComplianceCalendar / Chart / Financial / Reconciliation
              are dense visualisations that don't read well on a
              phone and aren't engineer-in-the-field tasks. ─────────── */}
        <div className="hidden md:grid lg:grid-cols-3 gap-3 md:gap-5">
          <div className="lg:col-span-2 space-y-3 md:space-y-5">
            <ComplianceChart />
            <div id="compliance-calendar">
              <ComplianceCalendar />
            </div>
            <RecentVisits />
          </div>
          <div className="space-y-3 md:space-y-5">
            <FinancialSummary />
            <BankReconciliation />
          </div>
        </div>

        {/* ── New Feature Callouts — marketing copy, hide on mobile ──── */}
        <div className="hidden md:grid md:grid-cols-2 gap-3 md:gap-4 pt-2">
          <div
            className="new-feature-callout"
            onClick={() => navigate("/dashboard/cert-tracker")}
          >
            <p className="new-feature-label">✦ Suggested feature</p>
            <p className="text-sm font-semibold text-foreground mb-1">Client Compliance Portal</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Give each client a shareable link to see their site's live compliance status, certificate history, and upcoming visits — no login needed. Reduces inbound calls and positions BHO Fire as proactive.
            </p>
          </div>

          <div className="new-feature-callout">
            <p className="new-feature-label">✦ Suggested feature</p>
            <p className="text-sm font-semibold text-foreground mb-1">Site Profitability Dashboard</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Revenue vs. cost per site and per customer. Track labour hours against contract value. Instantly see your most and least profitable clients so you can prioritise renewals strategically.
            </p>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
};

export default Dashboard;

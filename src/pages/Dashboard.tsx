import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import RecentVisits from "@/components/dashboard/RecentVisits";
import QuickActions from "@/components/dashboard/QuickActions";
import TodaySchedule from "@/components/dashboard/TodaySchedule";
import ServiceDueDashboard from "@/components/dashboard/ServiceDueDashboard";
import ComplianceChart from "@/components/dashboard/ComplianceChart";
import { FinancialSummary } from "@/components/dashboard/FinancialSummary";
import { BankReconciliation } from "@/components/xero/BankReconciliation";
import { ComplianceCalendar, getComplianceAlertCount } from "@/components/dashboard/ComplianceCalendar";
import { RamsRemindersWidget } from "@/components/dashboard/RamsRemindersWidget";
import {
  Building2, ClipboardCheck, AlertTriangle, ShieldCheck,
  CreditCard, Award, TrendingUp, ArrowRight
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
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
      "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium",
      type === "danger"
        ? "bg-destructive/8 border-destructive/20 text-destructive"
        : "bg-warning/8 border-warning/20 text-warning"
    )}
  >
    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
    <span className="flex-1">{message}</span>
    {action && (
      <button
        onClick={onClick}
        className="flex items-center gap-1 text-xs font-semibold opacity-70 hover:opacity-100 transition-opacity ml-2 whitespace-nowrap"
      >
        {action} <ArrowRight className="w-3 h-3" />
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

      const [sitesResult, visitsThisMonthResult, openVisitsResult, overdueResult] =
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

        {/* ── Stats grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Active Sites"
            value={stats.activeSites}
            change="Fire alarm installations"
            changeType="neutral"
            icon={Building2}
            iconColor="bg-primary/10"
            iconStroke="text-primary"
            href="/sites"
          />
          <StatsCard
            title="Visits This Month"
            value={stats.visitsThisMonth}
            change={stats.pendingVisits > 0 ? `${stats.pendingVisits} pending confirmation` : "All confirmed"}
            changeType={stats.pendingVisits > 0 ? "neutral" : "positive"}
            icon={ClipboardCheck}
            iconColor="bg-success/10"
            iconStroke="text-success"
            href="/dashboard/visits"
          />
          <StatsCard
            title="Open Visits"
            value={stats.openVisits}
            change={stats.openVisits > 0 ? "Awaiting completion" : "All clear"}
            changeType={stats.openVisits > 0 ? "negative" : "positive"}
            icon={AlertTriangle}
            iconColor={stats.openVisits > 0 ? "bg-destructive/10" : "bg-success/10"}
            iconStroke={stats.openVisits > 0 ? "text-destructive" : "text-success"}
            href="/dashboard/visits"
            accent={stats.openVisits > 0}
          />
          <StatsCard
            title="BAFE Compliance"
            value={`${bafeCompliantPct}%`}
            change={
              bafeExpiring > 0
                ? `${bafeExpiring} cert${bafeExpiring !== 1 ? "s" : ""} expiring soon`
                : `${bafeCompliant} of ${bafeTotalSites} sites fully compliant`
            }
            changeType={bafeExpiring > 0 ? "negative" : "positive"}
            icon={Award}
            iconColor="bg-primary/10"
            iconStroke="text-primary"
            href="/dashboard/cert-tracker"
          />
        </div>

        {/* ── BAFE summary card ────────────────────────────────────────── */}
        <div
          className="section-card cursor-pointer hover:border-primary/30 transition-all"
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

          <div className="grid grid-cols-3 gap-4 text-center">
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

        {/* ── Service Due ──────────────────────────────────────────────── */}
        <ServiceDueDashboard />

        {/* ── Quick actions + schedule ─────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-5">
          <QuickActions />
          <TodaySchedule />
        </div>

        {/* ── RAMS reminders ───────────────────────────────────────────── */}
        <RamsRemindersWidget />

        {/* ── Charts + financial ───────────────────────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <ComplianceChart />
            <div id="compliance-calendar">
              <ComplianceCalendar />
            </div>
            <RecentVisits />
          </div>
          <div className="space-y-5">
            <FinancialSummary />
            <BankReconciliation />
          </div>
        </div>

        {/* ── New Feature Callouts ─────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-4 pt-2">
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

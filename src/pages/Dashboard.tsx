import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import RecentVisits from "@/components/dashboard/RecentVisits";
import QuickActions from "@/components/dashboard/QuickActions";
import TodaySchedule from "@/components/dashboard/TodaySchedule";
import ComplianceChart from "@/components/dashboard/ComplianceChart";
import { FinancialSummary } from "@/components/dashboard/FinancialSummary";
import { BankReconciliation } from "@/components/xero/BankReconciliation";
import { Building2, ClipboardCheck, AlertTriangle, Percent, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { getAllBafeCertificates } from "@/services/bafeCertificateService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    activeSites: 0,
    visitsThisMonth: 0,
    pendingVisits: 0,
    openVisits: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const now = new Date();
      const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

      // Fetch all stats in parallel
      const [sitesResult, visitsThisMonthResult, openVisitsResult] = await Promise.all([
        supabase.from("sites").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("visits").select("id, status", { count: "exact" })
          .gte("visit_date", monthStart)
          .lte("visit_date", monthEnd),
        supabase.from("visits").select("id", { count: "exact", head: true })
          .in("status", ["scheduled", "in_progress", "pending_review"]),
      ]);

      const pendingCount = visitsThisMonthResult.data?.filter(
        v => v.status === "scheduled" || v.status === "pending_review"
      ).length || 0;

      setStats({
        activeSites: sitesResult.count || 0,
        visitsThisMonth: visitsThisMonthResult.count || 0,
        pendingVisits: pendingCount,
        openVisits: openVisitsResult.count || 0,
      });
    };

    fetchStats();
  }, []);

  const { data: bafeCerts } = useQuery({
    queryKey: ['dashboard-bafe-certs'],
    queryFn: getAllBafeCertificates,
  });

  const bafeSiteMap = new Map<string, typeof bafeCerts>();
  (bafeCerts || []).forEach((c) => {
    const arr = bafeSiteMap.get(c.site_id) || [];
    arr.push(c);
    bafeSiteMap.set(c.site_id, arr);
  });
  const bafeTypes = ['design', 'installation', 'commissioning', 'maintenance'];
  const bafeCompliant = Array.from(bafeSiteMap.values()).filter(
    (certs) => bafeTypes.every((t) => certs!.some((c) => c.certificate_type === t && c.status === 'valid'))
  ).length;
  const bafeTotalSites = bafeSiteMap.size;
  const bafeExpiring = (bafeCerts || []).filter((c) => {
    if (!c.expiry_date) return false;
    const diff = new Date(c.expiry_date).getTime() - Date.now();
    return diff > 0 && diff < 30 * 86400000;
  }).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your fire alarm compliance status</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Active Sites"
            value={stats.activeSites}
            change=""
            changeType="neutral"
            icon={Building2}
            href="/sites"
          />
          <StatsCard
            title="Visits This Month"
            value={stats.visitsThisMonth}
            change={stats.pendingVisits > 0 ? `${stats.pendingVisits} pending` : ""}
            changeType="neutral"
            icon={ClipboardCheck}
            href="/dashboard/visits"
          />
          <StatsCard
            title="Avg. Coverage"
            value="98.2%"
            change="+1.4% from last month"
            changeType="positive"
            icon={Percent}
            href="/dashboard/reports"
          />
          {stats.openVisits > 0 && (
            <StatsCard
              title="Open Visits"
              value={stats.openVisits}
              change="Awaiting completion"
              changeType="negative"
              icon={AlertTriangle}
              iconColor="bg-destructive"
              href="/dashboard/visits"
            />
          )}
        </div>

        {/* Quick actions + schedule */}
        <div className="grid lg:grid-cols-2 gap-6">
          <QuickActions />
          <TodaySchedule />
        </div>

        {/* Charts, lists, and financials */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <ComplianceChart />
            <RecentVisits />
          </div>
          <div className="space-y-6">
            <FinancialSummary />
            <BankReconciliation />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;

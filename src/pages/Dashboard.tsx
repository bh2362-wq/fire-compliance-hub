import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StatsCard from "@/components/dashboard/StatsCard";
import RecentVisits from "@/components/dashboard/RecentVisits";
import ComplianceChart from "@/components/dashboard/ComplianceChart";
import { FinancialSummary } from "@/components/dashboard/FinancialSummary";
import { BankReconciliation } from "@/components/xero/BankReconciliation";
import { Building2, ClipboardCheck, AlertTriangle, Percent } from "lucide-react";

const Dashboard = () => {
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
            value={24}
            change="+2 this month"
            changeType="positive"
            icon={Building2}
          />
          <StatsCard
            title="Visits This Month"
            value={18}
            change="7 pending"
            changeType="neutral"
            icon={ClipboardCheck}
          />
          <StatsCard
            title="Avg. Coverage"
            value="98.2%"
            change="+1.4% from last month"
            changeType="positive"
            icon={Percent}
          />
          <StatsCard
            title="Open Issues"
            value={12}
            change="3 critical"
            changeType="negative"
            icon={AlertTriangle}
            iconColor="bg-destructive"
          />
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

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { differenceInDays, format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { XeroOutstandingInvoice } from "@/services/xeroService";
import { TrendingDown, AlertTriangle, Clock, PoundSterling } from "lucide-react";

interface CustomerPaymentInsightsProps {
  invoices: XeroOutstandingInvoice[];
  customerName: string;
}

export interface PaymentInsightsSummary {
  totalOutstanding: number;
  totalOverdue: number;
  overdueCount: number;
  currentCount: number;
  avgDaysOverdue: number;
  maxDaysOverdue: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  agingBuckets: { name: string; value: number; count: number }[];
  monthlyBreakdown: { month: string; amount: number; overdue: number }[];
}

const AGING_COLORS = ["hsl(142, 71%, 45%)", "hsl(48, 96%, 53%)", "hsl(25, 95%, 53%)", "hsl(0, 84%, 60%)"];

function computeInsights(invoices: XeroOutstandingInvoice[]): PaymentInsightsSummary {
  const now = new Date();

  const overdueInvoices = invoices.filter((inv) => inv.isOverdue);
  const currentInvoices = invoices.filter((inv) => !inv.isOverdue);

  const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.amountDue, 0);
  const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + inv.amountDue, 0);

  const daysOverdueList = overdueInvoices.map((inv) =>
    differenceInDays(now, new Date(inv.dueDate))
  );
  const avgDaysOverdue =
    daysOverdueList.length > 0
      ? Math.round(daysOverdueList.reduce((a, b) => a + b, 0) / daysOverdueList.length)
      : 0;
  const maxDaysOverdue = daysOverdueList.length > 0 ? Math.max(...daysOverdueList) : 0;

  // Aging buckets
  const buckets = { current: 0, "1-30": 0, "31-60": 0, "60+": 0 };
  const bucketCounts = { current: 0, "1-30": 0, "31-60": 0, "60+": 0 };

  invoices.forEach((inv) => {
    const days = differenceInDays(now, new Date(inv.dueDate));
    if (days <= 0) {
      buckets.current += inv.amountDue;
      bucketCounts.current++;
    } else if (days <= 30) {
      buckets["1-30"] += inv.amountDue;
      bucketCounts["1-30"]++;
    } else if (days <= 60) {
      buckets["31-60"] += inv.amountDue;
      bucketCounts["31-60"]++;
    } else {
      buckets["60+"] += inv.amountDue;
      bucketCounts["60+"]++;
    }
  });

  const agingBuckets = [
    { name: "Current", value: Math.round(buckets.current * 100) / 100, count: bucketCounts.current },
    { name: "1-30 days", value: Math.round(buckets["1-30"] * 100) / 100, count: bucketCounts["1-30"] },
    { name: "31-60 days", value: Math.round(buckets["31-60"] * 100) / 100, count: bucketCounts["31-60"] },
    { name: "60+ days", value: Math.round(buckets["60+"] * 100) / 100, count: bucketCounts["60+"] },
  ].filter((b) => b.value > 0);

  // Monthly breakdown by due date
  const monthlyMap = new Map<string, { amount: number; overdue: number }>();
  invoices.forEach((inv) => {
    const monthKey = format(new Date(inv.dueDate), "MMM yyyy");
    const existing = monthlyMap.get(monthKey) || { amount: 0, overdue: 0 };
    existing.amount += inv.amountDue;
    if (inv.isOverdue) existing.overdue += inv.amountDue;
    monthlyMap.set(monthKey, existing);
  });
  const monthlyBreakdown = Array.from(monthlyMap.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

  // Risk level
  const overdueRatio = totalOutstanding > 0 ? totalOverdue / totalOutstanding : 0;
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  if (overdueRatio > 0.75 || maxDaysOverdue > 90) riskLevel = "critical";
  else if (overdueRatio > 0.5 || maxDaysOverdue > 60) riskLevel = "high";
  else if (overdueRatio > 0.25 || maxDaysOverdue > 30) riskLevel = "medium";

  return {
    totalOutstanding,
    totalOverdue,
    overdueCount: overdueInvoices.length,
    currentCount: currentInvoices.length,
    avgDaysOverdue,
    maxDaysOverdue,
    riskLevel,
    agingBuckets,
    monthlyBreakdown,
  };
}

const RISK_CONFIG = {
  low: { label: "Low Risk", variant: "default" as const, color: "text-green-600" },
  medium: { label: "Medium Risk", variant: "secondary" as const, color: "text-yellow-600" },
  high: { label: "High Risk", variant: "destructive" as const, color: "text-orange-600" },
  critical: { label: "Critical Risk", variant: "destructive" as const, color: "text-red-600" },
};

export function CustomerPaymentInsights({ invoices, customerName }: CustomerPaymentInsightsProps) {
  const insights = useMemo(() => computeInsights(invoices), [invoices]);
  const riskConfig = RISK_CONFIG[insights.riskLevel];

  if (invoices.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Impact Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <PoundSterling className="h-3 w-3" />
            Total Outstanding
          </div>
          <div className="text-lg font-bold">
            £{insights.totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <TrendingDown className="h-3 w-3" />
            Total Overdue
          </div>
          <div className="text-lg font-bold text-destructive">
            £{insights.totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Clock className="h-3 w-3" />
            Avg Days Overdue
          </div>
          <div className="text-lg font-bold">{insights.avgDaysOverdue}</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <AlertTriangle className="h-3 w-3" />
            Risk Level
          </div>
          <Badge variant={riskConfig.variant} className="mt-1">
            {riskConfig.label}
          </Badge>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Aging Breakdown Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Aging Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={insights.agingBuckets}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={40}
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {insights.agingBuckets.map((_, index) => (
                      <Cell key={index} fill={AGING_COLORS[index % AGING_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => `£${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Due Amounts Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outstanding by Due Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={insights.monthlyBreakdown}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
                  <Tooltip
                    formatter={(value: number) => `£${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  />
                  <Bar dataKey="overdue" name="Overdue" fill="hsl(0, 84%, 60%)" stackId="a" />
                  <Bar dataKey="amount" name="Current" fill="hsl(142, 71%, 45%)" stackId="b" />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Impact Statement */}
      {insights.overdueCount > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4">
            <p className="text-sm">
              <strong className="text-destructive">Payment Impact:</strong>{" "}
              {customerName} has{" "}
              <strong>{insights.overdueCount} overdue invoice{insights.overdueCount !== 1 ? "s" : ""}</strong>{" "}
              totalling{" "}
              <strong className="text-destructive">
                £{insights.totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </strong>
              . The longest outstanding invoice is{" "}
              <strong>{insights.maxDaysOverdue} days</strong> past due with an average of{" "}
              <strong>{insights.avgDaysOverdue} days</strong> overdue. This account is rated as{" "}
              <strong className={riskConfig.color}>{riskConfig.label}</strong>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Export the compute function so it can be reused for email data
export { computeInsights };

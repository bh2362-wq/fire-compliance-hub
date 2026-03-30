import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, FileText, Receipt, ClipboardCheck, Calendar, ArrowRight, AlertTriangle, Clock } from "lucide-react";

interface ActionableVisit {
  id: string;
  visit_date: string;
  visit_type: string;
  status: string;
  site_name: string;
  customer_name: string;
  has_report: boolean;
  has_invoice: boolean;
  report_id?: string;
}

const QuickActions = () => {
  const navigate = useNavigate();
  const [actionableVisits, setActionableVisits] = useState<ActionableVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayCount, setTodayCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    fetchActionableVisits();
  }, []);

  const fetchActionableVisits = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];

      // Fetch visits needing action (not completed/cancelled/invoiced)
      const { data: visits } = await supabase
        .from("visits")
        .select(`
          id, visit_date, visit_type, status,
          sites(name, customer_id, customers(name))
        `)
        .in("status", ["completed", "in_progress", "confirmed", "scheduled", "pending_review"])
        .order("visit_date", { ascending: true })
        .limit(50);

      if (!visits) {
        setLoading(false);
        return;
      }

      const visitIds = visits.map(v => v.id);

      // Fetch reports and invoices in parallel
      const [reportsRes, invoicesRes] = await Promise.all([
        supabase.from("service_reports").select("visit_id, id").in("visit_id", visitIds),
        supabase.from("xero_invoices").select("visit_id").in("visit_id", visitIds),
      ]);

      const reportMap = new Map<string, string>();
      reportsRes.data?.forEach(r => reportMap.set(r.visit_id, r.id));
      const invoiceSet = new Set(invoicesRes.data?.map(i => i.visit_id) || []);

      const actionable: ActionableVisit[] = visits
        .filter(v => {
          // Show visits that need next steps
          const hasReport = reportMap.has(v.id);
          const hasInvoice = invoiceSet.has(v.id);
          // Completed without report, or has report but no invoice
          return (v.status === "completed" && !hasReport) ||
                 (v.status === "completed" && hasReport && !hasInvoice) ||
                 (v.status === "in_progress") ||
                 (v.status === "pending_review") ||
                 (v.status === "confirmed" && v.visit_date <= today) ||
                 (v.status === "scheduled" && v.visit_date <= today);
        })
        .map(v => {
          const site = v.sites as any;
          return {
            id: v.id,
            visit_date: v.visit_date,
            visit_type: v.visit_type,
            status: v.status,
            site_name: site?.name || "Unknown",
            customer_name: site?.customers?.name || "Unknown",
            has_report: reportMap.has(v.id),
            has_invoice: invoiceSet.has(v.id),
            report_id: reportMap.get(v.id),
          };
        })
        .slice(0, 8);

      // Count today's visits and overdue
      const todayVisits = visits.filter(v => v.visit_date === today).length;
      const overdue = visits.filter(v => v.visit_date < today && ["scheduled", "confirmed"].includes(v.status)).length;

      setActionableVisits(actionable);
      setTodayCount(todayVisits);
      setOverdueCount(overdue);
    } catch (err) {
      console.error("Error fetching actionable visits:", err);
    } finally {
      setLoading(false);
    }
  };

  const getNextAction = (visit: ActionableVisit) => {
    if (visit.status === "scheduled" || visit.status === "confirmed") {
      return { label: "Start Job", icon: ClipboardCheck, color: "text-primary" };
    }
    if (visit.status === "in_progress") {
      return { label: "Complete", icon: ClipboardCheck, color: "text-warning" };
    }
    if (visit.status === "completed" && !visit.has_report) {
      return { label: "Write Report", icon: FileText, color: "text-accent" };
    }
    if (visit.has_report && !visit.has_invoice) {
      return { label: "Create Invoice", icon: Receipt, color: "text-success" };
    }
    if (visit.status === "pending_review") {
      return { label: "Review", icon: FileText, color: "text-accent" };
    }
    return { label: "View", icon: ArrowRight, color: "text-muted-foreground" };
  };

  const handleAction = (visit: ActionableVisit) => {
    navigate(`/dashboard/visits?visitId=${visit.id}`);
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h3>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
            <p className="text-sm text-muted-foreground">Jobs needing your attention</p>
          </div>
          <div className="flex items-center gap-2">
            {todayCount > 0 && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                <Calendar className="w-3 h-3 mr-1" />
                {todayCount} today
              </Badge>
            )}
            {overdueCount > 0 && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {overdueCount} overdue
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Quick shortcuts */}
      <div className="p-4 border-b border-border grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate("/dashboard/visits")}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Visit
        </Button>
        <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate("/dashboard/schedule")}>
          <Calendar className="w-4 h-4 mr-1.5" />
          Schedule
        </Button>
        <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate("/dashboard/reports")}>
          <FileText className="w-4 h-4 mr-1.5" />
          Reports
        </Button>
        <Button variant="outline" size="sm" className="justify-start" onClick={() => navigate("/dashboard/invoices")}>
          <Receipt className="w-4 h-4 mr-1.5" />
          Invoices
        </Button>
      </div>

      {/* Actionable items */}
      {actionableVisits.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground">
          <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">All caught up! No jobs need attention.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {actionableVisits.map((visit) => {
            const action = getNextAction(visit);
            const ActionIcon = action.icon;
            const isOverdue = visit.visit_date < new Date().toISOString().split("T")[0] && 
                             ["scheduled", "confirmed"].includes(visit.status);

            return (
              <div
                key={visit.id}
                className="p-3 px-5 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer group"
                onClick={() => handleAction(visit)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm truncate">
                      {visit.site_name}
                    </span>
                    {isOverdue && (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] px-1.5 py-0">
                        <Clock className="w-2.5 h-2.5 mr-0.5" />
                        Overdue
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {visit.customer_name} · {new Date(visit.visit_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`${action.color} opacity-70 group-hover:opacity-100 transition-opacity shrink-0`}
                >
                  <ActionIcon className="w-4 h-4 mr-1.5" />
                  {action.label}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QuickActions;

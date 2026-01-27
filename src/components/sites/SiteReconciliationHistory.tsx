import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { GitCompare, Calendar, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface Visit {
  id: string;
  visit_date: string;
  visit_type: string;
  status: string | null;
  devices_tested: number | null;
  total_devices: number | null;
  coverage_percentage: number | null;
  issues_count: number | null;
}

interface SiteReconciliationHistoryProps {
  siteId: string;
}

const SiteReconciliationHistory = ({ siteId }: SiteReconciliationHistoryProps) => {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchVisits = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("visits")
        .select(
          "id, visit_date, visit_type, status, devices_tested, total_devices, coverage_percentage, issues_count"
        )
        .eq("site_id", siteId)
        .order("visit_date", { ascending: false })
        .limit(10);

      if (!error && data) {
        setVisits(data);
      }
      setLoading(false);
    };

    fetchVisits();
  }, [siteId]);

  const getCoverageColor = (coverage: number | null) => {
    if (coverage === null) return "text-muted-foreground";
    if (coverage >= 95) return "text-success";
    if (coverage >= 80) return "text-warning";
    return "text-destructive";
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      case "in_progress":
        return (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
            <AlertTriangle className="w-3 h-3 mr-1" />
            In Progress
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
            {status || "Unknown"}
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="p-4 space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <GitCompare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Reconciliation History</h3>
            <p className="text-sm text-muted-foreground">
              Past test visits and coverage results
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/dashboard/reconciliation?siteId=${siteId}`)}
        >
          <GitCompare className="w-4 h-4 mr-2" />
          New Reconciliation
        </Button>
      </div>

      {visits.length === 0 ? (
        <div className="p-12 text-center">
          <GitCompare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No reconciliations yet</h3>
          <p className="text-muted-foreground mb-4">
            Upload test results and reconcile them against the device inventory.
          </p>
          <Button
            variant="hero"
            onClick={() => navigate(`/dashboard/reconciliation?siteId=${siteId}`)}
          >
            <GitCompare className="w-4 h-4 mr-2" />
            Start Reconciliation
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {visits.map((visit) => {
            const coverage = visit.coverage_percentage || 0;
            return (
              <div key={visit.id} className="p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4" />
                      {format(new Date(visit.visit_date), "MMM d, yyyy")}
                    </div>
                    <Badge variant="secondary">{visit.visit_type}</Badge>
                    {getStatusBadge(visit.status)}
                  </div>
                  <div className="flex items-center gap-4">
                    {(visit.issues_count || 0) > 0 && (
                      <div className="flex items-center gap-1 text-destructive text-sm">
                        <XCircle className="w-4 h-4" />
                        {visit.issues_count} issues
                      </div>
                    )}
                    <span className={`text-2xl font-bold ${getCoverageColor(coverage)}`}>
                      {coverage}%
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {visit.devices_tested || 0} of {visit.total_devices || 0} devices tested
                    </span>
                    <span className={`font-medium ${getCoverageColor(coverage)}`}>
                      Coverage
                    </span>
                  </div>
                  <Progress
                    value={coverage}
                    className="h-2"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SiteReconciliationHistory;

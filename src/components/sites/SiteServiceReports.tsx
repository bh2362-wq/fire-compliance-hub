import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, AlertTriangle, CheckCircle2, Eye, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { getSiteServiceReports, ServiceReport } from "@/services/serviceReportService";
import { ServiceReportDialog } from "@/components/reports/ServiceReportDialog";
import { WorkReportDialog } from "@/components/reports/WorkReportDialog";
import { ReportTypeSelector } from "@/components/reports/ReportTypeSelector";
import { supabase } from "@/integrations/supabase/client";

interface SiteServiceReportsProps {
  siteId: string;
  siteName?: string;
}

interface VisitInfo {
  visit_type: string;
  visit_date: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  completed: {
    label: "Completed",
    className: "bg-success/10 text-success border-success/20",
  },
  draft: {
    label: "Draft",
    className: "bg-warning/10 text-warning border-warning/20",
  },
};

const conditionConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  satisfactory: {
    label: "Satisfactory",
    icon: CheckCircle2,
    className: "text-success",
  },
  requires_attention: {
    label: "Requires Attention",
    icon: AlertTriangle,
    className: "text-warning",
  },
  unsatisfactory: {
    label: "Unsatisfactory",
    icon: AlertTriangle,
    className: "text-destructive",
  },
};

export function SiteServiceReports({ siteId, siteName }: SiteServiceReportsProps) {
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [visitMap, setVisitMap] = useState<Record<string, VisitInfo>>({});
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ServiceReport | null>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [reportType, setReportType] = useState<"bs5839" | "work" | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await getSiteServiceReports(siteId);
      setReports(data);

      // Fetch visit info for each report
      if (data.length > 0) {
        const visitIds = data.map((r) => r.visit_id);
        const { data: visits } = await supabase
          .from("visits")
          .select("id, visit_type, visit_date")
          .in("id", visitIds);

        if (visits) {
          const map: Record<string, VisitInfo> = {};
          visits.forEach((v) => {
            map[v.id] = { visit_type: v.visit_type, visit_date: v.visit_date };
          });
          setVisitMap(map);
        }
      }
    } catch (error) {
      console.error("Failed to load reports:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [siteId]);

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border">
        <div className="p-4 border-b border-border">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="divide-y divide-border">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-4">
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Service Reports</h3>
          <Badge variant="secondary">{reports.length}</Badge>
        </div>
      </div>

      {reports.length === 0 ? (
        <div className="p-8 text-center">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm">
            No service reports for this site yet
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
          {reports.map((report) => {
            const status = statusConfig[report.status] || statusConfig.draft;
            const condition = report.system_condition
              ? conditionConfig[report.system_condition]
              : null;
            const ConditionIcon = condition?.icon;
            const visit = visitMap[report.visit_id];

            return (
              <div
                key={report.id}
                className="p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground text-sm">
                        {format(new Date(report.report_date), "MMM d, yyyy")}
                      </span>
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                      {visit && (
                        <span className="text-xs text-muted-foreground capitalize">
                          {visit.visit_type.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {report.engineer_name && (
                        <span>Engineer: {report.engineer_name}</span>
                      )}
                      {condition && ConditionIcon && (
                        <span className={`flex items-center gap-1 ${condition.className}`}>
                          <ConditionIcon className="w-3.5 h-3.5" />
                          {condition.label}
                        </span>
                      )}
                    </div>
                    {report.defects_found && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {report.defects_found.slice(0, 60)}
                        {report.defects_found.length > 60 ? "..." : ""}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedReport(report);
                      setShowTypeSelector(true);
                    }}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Report Type Selector */}
      <ReportTypeSelector
        open={showTypeSelector}
        onOpenChange={setShowTypeSelector}
        onSelect={(type) => setReportType(type)}
      />

      {/* Work Report Dialog */}
      {selectedReport && reportType === "work" && (
        <WorkReportDialog
          open={!!selectedReport && reportType === "work"}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedReport(null);
              setReportType(null);
            }
          }}
          visit={{
            id: selectedReport.visit_id,
            visit_type: visitMap[selectedReport.visit_id]?.visit_type || "",
            visit_date: visitMap[selectedReport.visit_id]?.visit_date || selectedReport.report_date,
            site_id: siteId,
            sites: siteName ? { name: siteName } : null,
          }}
          onSuccess={fetchReports}
        />
      )}

      {/* BS5839 Report Dialog */}
      {selectedReport && reportType === "bs5839" && (
        <ServiceReportDialog
          open={!!selectedReport && reportType === "bs5839"}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedReport(null);
              setReportType(null);
            }
          }}
          visit={{
            id: selectedReport.visit_id,
            visit_type: visitMap[selectedReport.visit_id]?.visit_type || "",
            visit_date: visitMap[selectedReport.visit_id]?.visit_date || selectedReport.report_date,
            site_id: siteId,
            sites: siteName ? { name: siteName } : null,
          }}
          onSuccess={fetchReports}
        />
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Building2, Calendar, Search, Eye, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { ServiceReport, BS5839Checklist, getDefaultChecklist } from "@/services/serviceReportService";
import { ServiceReportDialog } from "@/components/reports/ServiceReportDialog";

interface ReportWithSite extends ServiceReport {
  sites: { name: string } | null;
  visits: { visit_type: string; visit_date: string } | null;
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

const Reports = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportWithSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedReport, setSelectedReport] = useState<ReportWithSite | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("service_reports")
      .select(`
        *,
        sites:site_id(name),
        visits:visit_id(visit_type, visit_date)
      `)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setReports(
        data.map((r) => ({
          ...r,
          checklist: (r.checklist as unknown as BS5839Checklist) || getDefaultChecklist(),
        })) as ReportWithSite[]
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const filteredReports = reports.filter((report) => {
    const matchesSearch =
      searchTerm === "" ||
      report.sites?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.engineer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.report_number?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || report.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="bg-card rounded-xl border border-border">
            <div className="divide-y divide-border">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="p-6">
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-foreground">Service Reports</h2>
          <p className="text-muted-foreground">
            BS5839:2025 compliant service reports for all sites
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by site, engineer, or report number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Reports List */}
        {filteredReports.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No reports found</h3>
            <p className="text-muted-foreground">
              {searchTerm || statusFilter !== "all"
                ? "Try adjusting your search or filters"
                : "Create service reports from the Visits page"}
            </p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border divide-y divide-border">
            {filteredReports.map((report) => {
              const status = statusConfig[report.status] || statusConfig.draft;
              const condition = report.system_condition
                ? conditionConfig[report.system_condition]
                : null;
              const ConditionIcon = condition?.icon;

              return (
                <div
                  key={report.id}
                  className="p-6 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">
                            {report.sites?.name || "Unknown Site"}
                          </h3>
                          <Badge variant="outline" className={status.className}>
                            {status.label}
                          </Badge>
                          {condition && ConditionIcon && (
                            <span className={`flex items-center gap-1 text-sm ${condition.className}`}>
                              <ConditionIcon className="w-4 h-4" />
                              {condition.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(report.report_date), "MMM d, yyyy")}
                          </span>
                          {report.visits && (
                            <span className="capitalize">{report.visits.visit_type.replace("_", " ")}</span>
                          )}
                          {report.engineer_name && (
                            <span>Engineer: {report.engineer_name}</span>
                          )}
                          {report.report_number && (
                            <span>#{report.report_number}</span>
                          )}
                        </div>
                        {report.defects_found && (
                          <p className="text-sm text-destructive mt-2">
                            <AlertTriangle className="w-4 h-4 inline mr-1" />
                            Defects: {report.defects_found.slice(0, 100)}
                            {report.defects_found.length > 100 ? "..." : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/dashboard/sites/${report.site_id}`)}
                      >
                        <Building2 className="w-4 h-4 mr-1" />
                        Site
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedReport(report)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View Report
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Report Dialog */}
      {selectedReport && (
        <ServiceReportDialog
          open={!!selectedReport}
          onOpenChange={(open) => !open && setSelectedReport(null)}
          visit={{
            id: selectedReport.visit_id,
            visit_type: selectedReport.visits?.visit_type || "",
            visit_date: selectedReport.visits?.visit_date || selectedReport.report_date,
            site_id: selectedReport.site_id,
            sites: selectedReport.sites,
          }}
          onSuccess={fetchReports}
        />
      )}
    </DashboardLayout>
  );
};

export default Reports;

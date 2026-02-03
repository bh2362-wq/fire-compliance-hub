import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, AlertTriangle, CheckCircle2, Eye, Download, Receipt, Wind } from "lucide-react";
import { format } from "date-fns";
import { getSiteServiceReports, ServiceReport } from "@/services/serviceReportService";
import { ServiceReportDialog } from "@/components/reports/ServiceReportDialog";
import { WorkReportDialog } from "@/components/reports/WorkReportDialog";
import { ASDReportDialog } from "@/components/reports/ASDReportDialog";
import { generateServiceReportPDF, generateWorkReportPDF, generateASDReportPDF } from "@/lib/pdfGenerator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SiteServiceReportsProps {
  siteId: string;
  siteName?: string;
}

interface VisitInfo {
  visit_type: string;
  visit_date: string;
}

interface InvoiceInfo {
  xero_invoice_number: string | null;
  status: string | null;
}

interface SiteInfo {
  name: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
}

interface ASDAsset {
  id: string;
  item_name: string;
  manufacturer?: string | null;
  model?: string | null;
  location?: string | null;
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

// Helper to detect if a report is a Work Report (has JSON in notes with work report fields)
function isWorkReport(report: ServiceReport): boolean {
  if (!report.notes) return false;
  try {
    const parsed = JSON.parse(report.notes);
    // Work reports have these specific fields (but NOT asd)
    return (typeof parsed.jobNumber !== "undefined" || typeof parsed.jobType !== "undefined") && parsed.report_type !== "asd";
  } catch {
    return false;
  }
}

// Helper to detect if a report is an ASD Report
function isASDReport(report: ServiceReport): boolean {
  if (!report.notes) return false;
  try {
    const parsed = JSON.parse(report.notes);
    return parsed.report_type === "asd";
  } catch {
    return false;
  }
}

export function SiteServiceReports({ siteId, siteName }: SiteServiceReportsProps) {
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [visitMap, setVisitMap] = useState<Record<string, VisitInfo>>({});
  const [invoiceMap, setInvoiceMap] = useState<Record<string, InvoiceInfo>>({});
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<ServiceReport | null>(null);
  const [dialogType, setDialogType] = useState<"work" | "bs5839" | "asd" | null>(null);
  const [asdAssets, setAsdAssets] = useState<ASDAsset[]>([]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await getSiteServiceReports(siteId);
      setReports(data);

      // Fetch site info for PDF generation
      const { data: site } = await supabase
        .from("sites")
        .select("name, address, city, postcode, contact_name, contact_phone, contact_email")
        .eq("id", siteId)
        .maybeSingle();
      
      if (site) setSiteInfo(site);

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

        // Fetch invoice info for visits
        const { data: invoices } = await supabase
          .from("xero_invoices")
          .select("visit_id, xero_invoice_number, status")
          .in("visit_id", visitIds);

        if (invoices) {
          const invMap: Record<string, InvoiceInfo> = {};
          invoices.forEach((inv) => {
            invMap[inv.visit_id] = { 
              xero_invoice_number: inv.xero_invoice_number, 
              status: inv.status 
            };
          });
          setInvoiceMap(invMap);
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

  const handleViewReport = async (report: ServiceReport) => {
    setSelectedReport(report);
    
    // Auto-detect report type from data
    if (isASDReport(report)) {
      // Load ASD assets for the dialog
      try {
        const parsed = JSON.parse(report.notes || "{}");
        const assetIds = parsed.asset_ids || [];
        if (assetIds.length > 0) {
          const { data: assets } = await supabase
            .from("site_assets")
            .select("id, item_name, manufacturer, model, location")
            .in("id", assetIds);
          setAsdAssets(assets || []);
        } else {
          // Fallback: load all ASD assets for the site
          const { data: assets } = await supabase
            .from("site_assets")
            .select("id, item_name, manufacturer, model, location")
            .eq("site_id", siteId)
            .eq("asset_type", "asd");
          setAsdAssets(assets || []);
        }
      } catch {
        setAsdAssets([]);
      }
      setDialogType("asd");
    } else if (isWorkReport(report)) {
      setDialogType("work");
    } else {
      setDialogType("bs5839");
    }
  };

  const handleDownloadPDF = async (report: ServiceReport) => {
    const visit = visitMap[report.visit_id];
    if (!siteInfo || !visit) {
      toast.error("Missing site or visit information");
      return;
    }

    try {
      if (isASDReport(report)) {
        // ASD Report PDF
        const parsed = JSON.parse(report.notes || "{}");
        const units = parsed.units || [];
        
        generateASDReportPDF(
          {
            reportNumber: report.report_number || "",
            reportDate: report.report_date,
            engineerName: report.engineer_name || "",
            clientName: report.client_name || "",
            units: units,
            workCarriedOut: report.work_carried_out || "",
            partsUsed: report.parts_used || "",
            notes: parsed.additional_notes || "",
            engineerSignature: parsed.engineerSignature || "",
            engineerSignDate: parsed.engineerSignDate || "",
            engineerSignTime: parsed.engineerSignTime || "",
            customerNotPresent: parsed.customerNotPresent || false,
            customerSignature: parsed.customerSignature || "",
            customerSignDate: parsed.customerSignDate || "",
            customerSignTime: parsed.customerSignTime || "",
          },
          siteInfo,
          visit.visit_date,
          visit.visit_type
        );
      } else if (isWorkReport(report)) {
        // Parse work report data from notes - includes signatures
        const parsed = JSON.parse(report.notes || "{}");
        generateWorkReportPDF(
          {
            certificateNo: report.report_number || "",
            jobNumber: parsed.jobNumber || "",
            jobType: parsed.jobType || "",
            attendanceDay: parsed.attendanceDay || "",
            systemStatusArrival: parsed.systemStatusArrival || "",
            systemStatusDeparture: parsed.systemStatusDeparture || "",
            workCompleted: parsed.workCompleted || false,
            returnRequired: parsed.returnRequired || false,
            surveyRequired: parsed.surveyRequired || false,
            quotationRequired: parsed.quotationRequired || false,
            ramsCompleted: parsed.ramsCompleted || false,
            logBookEntry: parsed.logBookEntry || false,
            worksReport: report.work_carried_out || "",
            furtherAction: report.recommendations || "",
            numEngineers: parsed.numEngineers || 1,
            workDays: parsed.workDays || [],
            totalHours: parsed.totalHours || "",
            startTime: parsed.startTime || "",
            finishTime: parsed.finishTime || "",
            travelTime: parsed.travelTime || "",
            duration: parsed.duration || "",
            materials: parsed.materials || [],
            // Engineer signature fields
            engineerName: report.engineer_name || "",
            engineerSignature: report.engineer_signature || parsed.engineerSignature || "",
            engineerSignDate: parsed.engineerSignDate || "",
            engineerSignTime: parsed.engineerSignTime || "",
            // Customer signature fields
            customerNotPresent: parsed.customerNotPresent || false,
            customerName: report.client_name || "",
            customerSignature: report.client_signature || parsed.customerSignature || "",
            customerSignDate: parsed.customerSignDate || "",
            customerSignTime: parsed.customerSignTime || "",
            customerPosition: parsed.customerPosition || "",
            // System info
            systemType: parsed.systemType || "",
            panelManufacturer: parsed.panelManufacturer || "",
            panelModel: parsed.panelModel || "",
            panelLocation: parsed.panelLocation || "",
            zonesCount: parsed.zonesCount,
            devicesCount: parsed.devicesCount,
          },
          siteInfo,
          visit.visit_date,
          visit.visit_type
        );
      } else {
        // BS5839 report - parse signature data and multi-panel data from notes
        let signatures = {};
        let panels = undefined;
        try {
          const parsed = JSON.parse(report.notes || "{}");
          signatures = {
            engineerSignature: report.engineer_signature || parsed.engineerSignature || "",
            engineerSignDate: parsed.engineerSignDate || "",
            engineerSignTime: parsed.engineerSignTime || "",
            customerNotPresent: parsed.customerNotPresent || false,
            customerSignature: report.client_signature || parsed.customerSignature || "",
            customerSignDate: parsed.customerSignDate || "",
            customerSignTime: parsed.customerSignTime || "",
          };
          // Extract multi-panel checklist data if present
          if (parsed.multi_panel && Array.isArray(parsed.panel_checklists)) {
            panels = parsed.panel_checklists;
          }
        } catch {
          // Notes parsing failed, use empty signatures
        }
        generateServiceReportPDF(report, siteInfo, visit, panels, signatures);
      }
      toast.success("PDF downloaded");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

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
            const invoice = invoiceMap[report.visit_id];
            const isWork = isWorkReport(report);
            const isAsd = isASDReport(report);
            const reportTypeLabel = isAsd ? "ASD" : isWork ? "Work Report" : "BS5839";

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
                      <Badge variant="secondary" className={`text-xs ${isAsd ? 'flex items-center gap-1' : ''}`}>
                        {isAsd && <Wind className="w-3 h-3" />}
                        {reportTypeLabel}
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
                      {invoice ? (
                        <Badge 
                          variant="outline" 
                          className={
                            invoice.status === "PAID" 
                              ? "bg-success/10 text-success border-success/20" 
                              : invoice.status === "AUTHORISED"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }
                        >
                          <Receipt className="w-3 h-3 mr-1" />
                          {invoice.status === "PAID" ? "Paid" : invoice.status === "AUTHORISED" ? "Invoiced" : "Draft"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                          Not Invoiced
                        </Badge>
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
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewReport(report)}
                      title="View / Edit"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadPDF(report)}
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Work Report Dialog */}
      {selectedReport && dialogType === "work" && (
        <WorkReportDialog
          open={!!selectedReport && dialogType === "work"}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedReport(null);
              setDialogType(null);
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
      {selectedReport && dialogType === "bs5839" && (
        <ServiceReportDialog
          open={!!selectedReport && dialogType === "bs5839"}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedReport(null);
              setDialogType(null);
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

      {/* ASD Report Dialog */}
      {selectedReport && dialogType === "asd" && asdAssets.length > 0 && (
        <ASDReportDialog
          open={!!selectedReport && dialogType === "asd"}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedReport(null);
              setDialogType(null);
              setAsdAssets([]);
            }
          }}
          visit={{
            id: selectedReport.visit_id,
            visit_type: visitMap[selectedReport.visit_id]?.visit_type || "",
            visit_date: visitMap[selectedReport.visit_id]?.visit_date || selectedReport.report_date,
            site_id: siteId,
            sites: siteName ? { name: siteName } : null,
          }}
          assets={asdAssets}
          onSuccess={fetchReports}
        />
      )}
    </div>
  );
}
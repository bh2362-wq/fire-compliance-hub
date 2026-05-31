import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, AlertTriangle, CheckCircle2, Eye, Download, Wind, RefreshCw, FileSearch, Upload, ExternalLink } from "lucide-react";
import { PdfPreviewDialog } from "@/components/reports/PdfPreviewDialog";
import { format } from "date-fns";
import { getSiteServiceReports, ServiceReport } from "@/services/serviceReportService";
import { parseAbsentMarker } from "@/lib/clientSignatureMarker";
import { InvoiceStatusBadge } from "@/components/reports/InvoiceStatusBadge";
import { ServiceReportDialog } from "@/components/reports/ServiceReportDialog";
import { WorkReportDialog } from "@/components/reports/WorkReportDialog";
import { ASDReportDialog } from "@/components/reports/ASDReportDialog";
import { generateServiceReportPDF, generateWorkReportPDF, generateASDReportPDF, generateDisabledRefugeReportPDF } from "@/lib/pdfGenerator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SharePointBulkUpload } from "@/components/sharepoint/SharePointBulkUpload";
import { SharePointUploadDialog } from "@/components/sharepoint/SharePointUploadDialog";

interface SiteServiceReportsProps {
  siteId: string;
  siteName?: string;
  customerName?: string;
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

export function SiteServiceReports({ siteId, siteName, customerName }: SiteServiceReportsProps) {
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [visitMap, setVisitMap] = useState<Record<string, VisitInfo>>({});
  const [invoiceMap, setInvoiceMap] = useState<Record<string, InvoiceInfo>>({});
  const navigate = useNavigate();
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ServiceReport | null>(null);
  const [dialogType, setDialogType] = useState<"work" | "bs5839" | "asd" | null>(null);
  const [asdAssets, setAsdAssets] = useState<ASDAsset[]>([]);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewReportId, setPdfPreviewReportId] = useState<string | null>(null);
  const [sharePointReport, setSharePointReport] = useState<ServiceReport | null>(null);

  const sanitizeName = (name: string) => name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();

  const getSharePointPath = () => {
    const cName = customerName || "Unknown Customer";
    const sName = siteName || "Unknown Site";
    const sAddr = siteInfo?.address || "";
    const siteFolder = sAddr ? `${sanitizeName(sName)} (${sanitizeName(sAddr)})` : sanitizeName(sName);
    return `Customers/${sanitizeName(cName)}/${siteFolder}/Reports`;
  };

  const generatePdfForSharePoint = async (report: ServiceReport): Promise<string | null> => {
    const visit = visitMap[report.visit_id];
    if (!siteInfo || !visit) return null;
    try {
      if (isASDReport(report)) {
        const parsed = JSON.parse(report.notes || "{}");
        return generateASDReportPDF({ reportNumber: report.report_number || "", reportDate: report.report_date, engineerName: report.engineer_name || "", clientName: report.client_name || "", units: parsed.units || [], systemCondition: report.system_condition || "", defectsFound: report.defects_found || "", recommendations: report.recommendations || "", workCarriedOut: report.work_carried_out || "", partsUsed: report.parts_used || "", notes: parsed.additional_notes || "", engineerSignature: report.engineer_signature || parsed.engineerSignature || "", engineerSignDate: parsed.engineerSignDate || "", engineerSignTime: parsed.engineerSignTime || "", customerNotPresent: parsed.customerNotPresent || false, customerSignature: report.client_signature || parsed.customerSignature || "", customerSignDate: parsed.customerSignDate || "", customerSignTime: parsed.customerSignTime || "" }, siteInfo, visit.visit_date, visit.visit_type, true) as string;
      } else if (isWorkReport(report)) {
        const parsed = JSON.parse(report.notes || "{}");
        return await generateWorkReportPDF({ certificateNo: report.report_number || "", jobNumber: parsed.jobNumber || "", jobType: parsed.jobType || "", appointmentDate: parsed.appointmentDate || "", systemStatusArrival: parsed.systemStatusArrival || "", systemStatusDeparture: parsed.systemStatusDeparture || "", workCompleted: parsed.workCompleted || report.status === "completed" || report.status === "locked", returnRequired: parsed.returnRequired || false, surveyRequired: parsed.surveyRequired || false, quotationRequired: parsed.quotationRequired || false, ramsCompleted: parsed.ramsCompleted || false, logBookEntry: parsed.logBookEntry || false, worksReport: report.work_carried_out || "", furtherAction: report.recommendations || "", numEngineers: parsed.numEngineers || 1, workDays: parsed.workDays || [], totalHours: parsed.totalHours || "", startTime: parsed.startTime || "", finishTime: parsed.finishTime || "", travelTime: parsed.travelTime || "", duration: parsed.duration || "", materials: parsed.materials || [], engineerName: report.engineer_name || "", engineerSignature: report.engineer_signature || parsed.engineerSignature || "", engineerSignDate: parsed.engineerSignDate || "", engineerSignTime: parsed.engineerSignTime || "", customerNotPresent: parsed.customerNotPresent || false, customerName: report.client_name || "", customerSignature: report.client_signature || parsed.customerSignature || "", customerSignDate: parsed.customerSignDate || "", customerSignTime: parsed.customerSignTime || "" }, siteInfo, visit.visit_date, visit.visit_type, true) as string;
      } else {
        let signatures = {}; let panels = undefined;
        try { const parsed = JSON.parse(report.notes || "{}"); signatures = { engineerSignature: report.engineer_signature || parsed.engineerSignature || "", engineerSignDate: parsed.engineerSignDate || "", engineerSignTime: parsed.engineerSignTime || "", customerNotPresent: parsed.customerNotPresent || false, customerSignature: report.client_signature || parsed.customerSignature || "", customerSignDate: parsed.customerSignDate || "", customerSignTime: parsed.customerSignTime || "" }; if (parsed.multi_panel && Array.isArray(parsed.panel_checklists)) panels = parsed.panel_checklists; } catch { /* ignore */ }
        return generateServiceReportPDF(report, siteInfo, visit, panels, signatures, true) as string;
      }
    } catch (err) { console.error("Failed to generate PDF:", err); return null; }
  };

  const handleSyncInvoiceStatus = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-invoice-status", {
        body: { siteIds: [siteId] },
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      const { matched, total, unmatchedInvoices } = data;
      if (matched > 0) {
        toast.success(`Matched ${matched} of ${total} reports to Xero invoices`);
        fetchReports();
      } else if (unmatchedInvoices?.length > 0) {
        toast.info(`No auto-matches found. ${unmatchedInvoices.length} Xero invoices available — use "Link Invoice Number" on each report to manually link.`);
      } else {
        toast.info("No new invoice matches found in Xero");
      }
    } catch (err) {
      console.error("Sync failed:", err);
      toast.error("Failed to sync with Xero");
    } finally {
      setSyncing(false);
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const data = await getSiteServiceReports(siteId);
      setReports(data);

      // Fetch site info for PDF generation. bs5839_category is the
      // canonical home for the System block's Category line.
      const { data: site } = await (supabase as any)
        .from("sites")
        .select("name, address, city, postcode, contact_name, contact_phone, contact_email, bs5839_category")
        .eq("id", siteId)
        .maybeSingle();
      
      if (site) setSiteInfo(site);

      // Fetch visit info for each report
      if (data.length > 0) {
        const visitIds = data.map((r) => r.visit_id);
        const { data: visits } = await supabase
          .from("service_visits")
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
    // BS 5839 service reports get the new wizard; ASD and Work still use
    // legacy modal dialogs because the wizard doesn't model their fields.
    // (Once those disciplines have their own wizards, route them too.)
    if (isASDReport(report)) {
      setSelectedReport(report);
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
      return;
    }

    if (isWorkReport(report)) {
      setSelectedReport(report);
      setDialogType("work");
      return;
    }

    // BS 5839 (default) → navigate to the new capture wizard, which loads
    // the existing draft via useServiceReportDraft.
    if (report.visit_id) {
      navigate(`/dashboard/visits/${report.visit_id}/service-report/capture`);
      return;
    }

    // Fallback: report somehow has no visit_id — keep the legacy modal.
    setSelectedReport(report);
    setDialogType("bs5839");
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
            // Global summary fields from report columns
            systemCondition: report.system_condition || "",
            defectsFound: report.defects_found || "",
            recommendations: report.recommendations || "",
            workCarriedOut: report.work_carried_out || "",
            partsUsed: report.parts_used || "",
            notes: parsed.additional_notes || "",
            engineerSignature: report.engineer_signature || parsed.engineerSignature || "",
            engineerSignDate: parsed.engineerSignDate || "",
            engineerSignTime: parsed.engineerSignTime || "",
            customerNotPresent: parsed.customerNotPresent || false,
            customerSignature: report.client_signature || parsed.customerSignature || "",
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
        await generateWorkReportPDF(
          {
            certificateNo: report.report_number || "",
            jobNumber: parsed.jobNumber || "",
            jobType: parsed.jobType || "",
            appointmentDate: parsed.appointmentDate || "",
            systemStatusArrival: parsed.systemStatusArrival || "",
            systemStatusDeparture: parsed.systemStatusDeparture || "",
            workCompleted: parsed.workCompleted || report.status === "completed" || report.status === "locked",
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
          // Decode the structured "absent" marker the wizard stores in
          // client_signature so the PDF renders the chosen reason
          // (Verbally briefed / Not on site / Other) instead of just a
          // blank signature box.
          const absent = parseAbsentMarker(report.client_signature);
          signatures = {
            engineerSignature: report.engineer_signature || parsed.engineerSignature || "",
            engineerSignDate: parsed.engineerSignDate || "",
            engineerSignTime: parsed.engineerSignTime || "",
            customerNotPresent: absent.absent || parsed.customerNotPresent || false,
            customerAbsentReason: absent.reason ?? undefined,
            customerAbsentNote: absent.note ?? undefined,
            customerSignature: absent.absent ? "" : (report.client_signature || parsed.customerSignature || ""),
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

        // Fetch the extras the generator now renders: structured
        // defects from site_defects, device ticks from
        // parsed_device_tests, customer via sites.customer_id, plus
        // the new template-prefill fields (duty holder + ARC details)
        // straight off the sites row. Each is independent — a failure
        // on one shouldn't block the whole PDF.
        const [defectsRes, devicesRes, siteExtraRes] = await Promise.all([
          supabase
            .from("site_defects")
            .select("description, location, category, status")
            .eq("visit_id", report.visit_id)
            .then((r) => r.data ?? []),
          supabase
            .from("parsed_device_tests")
            .select("loop, address, device_type, location, status, tested_at, fail_reason")
            .eq("visit_id", report.visit_id)
            .order("tested_at", { ascending: true })
            .then((r) => r.data ?? []),
          (async () => {
            const { data: siteRow } = await (supabase as any)
              .from("sites")
              .select("customer_id, duty_holder_name, duty_holder_role, duty_holder_email, duty_holder_phone, arc_provider, arc_account_ref, arc_connected, access_hours")
              .eq("id", siteId)
              .maybeSingle();
            let customer: { name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null } | null = null;
            if (siteRow?.customer_id) {
              const { data: c } = await supabase
                .from("customers")
                .select("name, contact_name, contact_email, contact_phone")
                .eq("id", siteRow.customer_id)
                .maybeSingle();
              customer = c ?? null;
            }
            return { siteRow, customer };
          })(),
        ]);

        const customerRow = siteExtraRes.customer;
        const siteRow = siteExtraRes.siteRow;

        generateServiceReportPDF(report, siteInfo, visit, panels, signatures, undefined, {
          defects: defectsRes,
          deviceTests: devicesRes,
          customer: customerRow,
          dutyHolder: siteRow && (siteRow.duty_holder_name || siteRow.duty_holder_email)
            ? {
                name: siteRow.duty_holder_name ?? null,
                role: siteRow.duty_holder_role ?? null,
                email: siteRow.duty_holder_email ?? null,
                phone: siteRow.duty_holder_phone ?? null,
              }
            : null,
          arc: siteRow?.arc_connected
            ? {
                provider: siteRow.arc_provider ?? null,
                accountRef: siteRow.arc_account_ref ?? null,
              }
            : null,
          accessHours: siteRow?.access_hours ?? null,
        });
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
        <div className="flex items-center gap-2">
          {customerName && (
            <SharePointBulkUpload
              reports={reports}
              customerName={customerName}
              siteMap={{ [siteId]: { name: siteName || "Unknown Site", address: siteInfo?.address || "" } }}
              visitMap={visitMap}
              generatePdfBase64ForReport={(report) => generatePdfForSharePoint(report)}
              onComplete={() => fetchReports()}
              label="Upload to SharePoint"
            />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncInvoiceStatus}
            disabled={syncing || reports.length === 0}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Xero"}
          </Button>
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
                      <InvoiceStatusBadge
                        reportId={report.id}
                        xeroInvoice={invoice || undefined}
                        manuallyInvoiced={(report as any).invoiced || false}
                        manualInvoiceNumber={(report as any).xero_invoice_number}
                        onStatusChanged={fetchReports}
                      />
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
                      onClick={() => {
                        setPdfPreviewReportId(report.id);
                        setPdfPreviewOpen(true);
                      }}
                      title="Preview PDF"
                    >
                      <FileSearch className="w-4 h-4" />
                    </Button>
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
      {selectedReport && dialogType === "asd" && (
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

      {pdfPreviewReportId && (
        <PdfPreviewDialog
          open={pdfPreviewOpen}
          onOpenChange={(open) => {
            setPdfPreviewOpen(open);
            if (!open) setPdfPreviewReportId(null);
          }}
          reportId={pdfPreviewReportId}
        />
      )}
    </div>
  );
}
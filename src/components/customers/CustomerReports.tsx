import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardCheck, Calendar, MapPin, FileText, Download, Eye, Receipt, Wind, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, isValid } from "date-fns";
import { generateServiceReportPDF, generateWorkReportPDF, generateASDReportPDF, generateDisabledRefugeReportPDF } from "@/lib/pdfGenerator";
import { toast } from "sonner";

interface ServiceReport {
  id: string;
  report_date: string;
  status: string;
  report_number: string | null;
  system_type: string | null;
  system_condition: string | null;
  engineer_name: string | null;
  defects_found: string | null;
  recommendations: string | null;
  work_carried_out: string | null;
  parts_used: string | null;
  engineer_signature: string | null;
  client_name: string | null;
  client_signature: string | null;
  checklist: any;
  notes: string | null;
  site_id: string;
  visit_id: string;
  site?: {
    name: string;
    address?: string | null;
    city?: string | null;
    postcode?: string | null;
    contact_name?: string | null;
    contact_phone?: string | null;
  };
}

interface VisitInfo {
  visit_type: string;
  visit_date: string;
}

interface InvoiceInfo {
  xero_invoice_number: string | null;
  status: string | null;
}

interface CustomerReportsProps {
  customerId: string;
  siteIds: string[];
}

function isWorkReport(report: ServiceReport): boolean {
  if (!report.notes) return false;
  try {
    const parsed = JSON.parse(report.notes);
    return (typeof parsed.jobNumber !== "undefined" || typeof parsed.jobType !== "undefined") && parsed.report_type !== "asd" && parsed.report_type !== "disabled_refuge";
  } catch {
    return false;
  }
}

function isASDReport(report: ServiceReport): boolean {
  if (!report.notes) return false;
  try {
    const parsed = JSON.parse(report.notes);
    return parsed.report_type === "asd";
  } catch {
    return false;
  }
}

function isDisabledRefugeReport(report: ServiceReport): boolean {
  if (!report.notes) return false;
  try {
    const parsed = JSON.parse(report.notes);
    return parsed.report_type === "disabled_refuge";
  } catch {
    return false;
  }
}

const conditionConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  satisfactory: { label: "Satisfactory", icon: CheckCircle2, className: "text-success" },
  requires_attention: { label: "Requires Attention", icon: AlertTriangle, className: "text-warning" },
  unsatisfactory: { label: "Unsatisfactory", icon: AlertTriangle, className: "text-destructive" },
};

export function CustomerReports({ customerId, siteIds }: CustomerReportsProps) {
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [visitMap, setVisitMap] = useState<Record<string, VisitInfo>>({});
  const [invoiceMap, setInvoiceMap] = useState<Record<string, InvoiceInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReports = async () => {
      if (siteIds.length === 0) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("service_reports")
          .select(`
            id, report_date, status, report_number, system_type, system_condition,
            engineer_name, defects_found, recommendations, work_carried_out,
            parts_used, engineer_signature, client_name, client_signature,
            checklist, notes, site_id, visit_id,
            site:sites(name, address, city, postcode, contact_name, contact_phone)
          `)
          .in("site_id", siteIds)
          .eq("status", "completed")
          .order("report_date", { ascending: false })
          .limit(50);

        if (error) throw error;

        const transformedData = (data || []).map((report: any) => ({
          ...report,
          site: report.site ? report.site : undefined,
        }));

        setReports(transformedData);

        // Fetch visit info
        if (transformedData.length > 0) {
          const visitIds = transformedData.map((r: any) => r.visit_id);
          const [visitsResult, invoicesResult] = await Promise.all([
            supabase.from("visits").select("id, visit_type, visit_date").in("id", visitIds),
            supabase.from("xero_invoices").select("visit_id, xero_invoice_number, status").in("visit_id", visitIds),
          ]);

          if (visitsResult.data) {
            const map: Record<string, VisitInfo> = {};
            visitsResult.data.forEach((v) => {
              map[v.id] = { visit_type: v.visit_type, visit_date: v.visit_date };
            });
            setVisitMap(map);
          }

          if (invoicesResult.data) {
            const invMap: Record<string, InvoiceInfo> = {};
            invoicesResult.data.forEach((inv) => {
              invMap[inv.visit_id] = { xero_invoice_number: inv.xero_invoice_number, status: inv.status };
            });
            setInvoiceMap(invMap);
          }
        }
      } catch (err) {
        console.error("Error loading reports:", err);
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, [siteIds]);

  const formatDate = (dateStr: string): string => {
    try {
      const date = parseISO(dateStr);
      return isValid(date) ? format(date, "dd MMM yyyy") : "N/A";
    } catch {
      return "N/A";
    }
  };

  const getReportTypeLabel = (report: ServiceReport): string => {
    if (isASDReport(report)) return "ASD";
    if (isDisabledRefugeReport(report)) return "EVC";
    if (isWorkReport(report)) return "Job Sheet";
    return "BS 5839-1";
  };

  const handleDownloadPDF = async (report: ServiceReport) => {
    const visit = visitMap[report.visit_id];
    const siteInfo = report.site;
    if (!siteInfo || !visit) {
      toast.error("Missing site or visit information");
      return;
    }

    try {
      if (isASDReport(report)) {
        const parsed = JSON.parse(report.notes || "{}");
        generateASDReportPDF(
          {
            reportNumber: report.report_number || "",
            reportDate: report.report_date,
            engineerName: report.engineer_name || "",
            clientName: report.client_name || "",
            units: parsed.units || [],
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
      } else if (isDisabledRefugeReport(report)) {
        const parsed = JSON.parse(report.notes || "{}");
        await generateDisabledRefugeReportPDF(
          {
            reportNumber: report.report_number || "",
            reportDate: report.report_date,
            engineerName: report.engineer_name || "",
            clientName: report.client_name || "",
            units: (parsed.units || []).map((u: any) => ({
              assetId: u.assetId,
              assetName: u.assetName,
              manufacturer: u.manufacturer,
              model: u.model,
              location: u.location,
              checklist: u.checklist,
              defects: u.defects,
              recommendations: u.recommendations,
              systemCondition: u.systemCondition,
            })),
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
          visit.visit_type || "EVC Service"
        );
      } else if (isWorkReport(report)) {
        const parsed = JSON.parse(report.notes || "{}");
        generateWorkReportPDF(
          {
            certificateNo: report.report_number || "",
            jobNumber: parsed.jobNumber || "",
            jobType: parsed.jobType || "",
            appointmentDate: parsed.appointmentDate || "",
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
            photos: parsed.photos || [],
            engineerName: report.engineer_name || "",
            engineerSignature: report.engineer_signature || parsed.engineerSignature || "",
            engineerSignDate: parsed.engineerSignDate || "",
            engineerSignTime: parsed.engineerSignTime || "",
            customerNotPresent: parsed.customerNotPresent || false,
            customerName: report.client_name || "",
            customerSignature: report.client_signature || parsed.customerSignature || "",
            customerSignDate: parsed.customerSignDate || "",
            customerSignTime: parsed.customerSignTime || "",
          },
          siteInfo,
          visit.visit_date,
          visit.visit_type
        );
      } else {
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
          if (parsed.multi_panel && Array.isArray(parsed.panel_checklists)) {
            panels = parsed.panel_checklists;
          }
        } catch { /* ignore */ }
        generateServiceReportPDF(report as any, siteInfo, visit, panels, signatures);
      }
      toast.success("PDF downloaded");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" />
            Completed Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4" />
          Completed Reports
          <Badge variant="secondary" className="ml-1">{reports.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No completed reports yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {reports.map((report) => {
              const invoice = invoiceMap[report.visit_id];
              const visit = visitMap[report.visit_id];
              const condition = report.system_condition
                ? conditionConfig[report.system_condition]
                : null;
              const ConditionIcon = condition?.icon;
              const isAsd = isASDReport(report);

              return (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {report.report_number || "Report"}
                      </span>
                      <Badge variant="secondary" className={`text-xs ${isAsd ? 'flex items-center gap-1' : ''}`}>
                        {isAsd && <Wind className="w-3 h-3" />}
                        {getReportTypeLabel(report)}
                      </Badge>
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
                        <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-xs">
                          Not Invoiced
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(report.report_date)}
                      </span>
                      {report.site?.name && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {report.site.name}
                        </span>
                      )}
                      {report.engineer_name && (
                        <span className="truncate">Eng: {report.engineer_name}</span>
                      )}
                      {condition && ConditionIcon && (
                        <span className={`flex items-center gap-1 ${condition.className}`}>
                          <ConditionIcon className="w-3 h-3" />
                          {condition.label}
                        </span>
                      )}
                      {visit && (
                        <span className="capitalize">{visit.visit_type.replace("_", " ")}</span>
                      )}
                    </div>
                    {report.defects_found && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {report.defects_found.slice(0, 60)}
                        {report.defects_found.length > 60 ? "..." : ""}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadPDF(report)}
                    title="Download PDF"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

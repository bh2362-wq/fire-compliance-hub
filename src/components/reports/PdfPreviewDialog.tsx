import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, X } from "lucide-react";
import { ServiceReport } from "@/services/serviceReportService";
import { supabase } from "@/integrations/supabase/client";
import {
  generateServiceReportPDF,
  generateWorkReportPDF,
  generateASDReportPDF,
  generateDisabledRefugeReportPDF,
} from "@/lib/pdfGenerator";
import { toast } from "sonner";

interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
}

function isWorkReportNotes(notes: string | null): boolean {
  if (!notes) return false;
  try {
    const parsed = JSON.parse(notes);
    return (
      (typeof parsed.jobNumber !== "undefined" || typeof parsed.jobType !== "undefined") &&
      parsed.report_type !== "asd" &&
      parsed.report_type !== "disabled_refuge"
    );
  } catch {
    return false;
  }
}

function getReportType(notes: string | null): "bs5839" | "work" | "asd" | "disabled_refuge" {
  if (!notes) return "bs5839";
  try {
    const parsed = JSON.parse(notes);
    if (parsed.report_type === "asd") return "asd";
    if (parsed.report_type === "disabled_refuge") return "disabled_refuge";
    if (typeof parsed.jobNumber !== "undefined" || typeof parsed.jobType !== "undefined") return "work";
    return "bs5839";
  } catch {
    return "bs5839";
  }
}

export function PdfPreviewDialog({ open, onOpenChange, reportId }: PdfPreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generatePreview = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch the full report with site and visit info
      const { data: report, error: reportError } = await supabase
        .from("service_reports")
        .select(`
          *,
          sites:site_id(name, address, city, postcode, contact_name, contact_phone, contact_email),
          visits:visit_id(visit_type, visit_date)
        `)
        .eq("id", reportId)
        .single();

      if (reportError || !report) throw new Error("Report not found");

      const site = report.sites as any;
      const visit = report.visits as any;
      const siteInfo = {
        name: site?.name || "",
        address: site?.address,
        city: site?.city,
        postcode: site?.postcode,
        contact_name: site?.contact_name,
        contact_phone: site?.contact_phone,
        contact_email: site?.contact_email,
      };

      const reportType = getReportType(report.notes);
      let base64: string | null = null;

      if (reportType === "disabled_refuge") {
        const parsed = JSON.parse(report.notes || "{}");
        base64 = await generateDisabledRefugeReportPDF(
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
          visit?.visit_date || report.report_date,
          visit?.visit_type || "",
          true
        ) as string;
      } else if (reportType === "asd") {
        const parsed = JSON.parse(report.notes || "{}");
        base64 = generateASDReportPDF(
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
          visit?.visit_date || report.report_date,
          visit?.visit_type || "",
          true
        ) as string;
      } else if (reportType === "work") {
        const parsed = JSON.parse(report.notes || "{}");
        base64 = generateWorkReportPDF(
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
            engineerName: report.engineer_name || "",
            engineerSignature: report.engineer_signature || parsed.engineerSignature || "",
            engineerSignDate: parsed.engineerSignDate || "",
            engineerSignTime: parsed.engineerSignTime || "",
            customerNotPresent: parsed.customerNotPresent || false,
            customerName: report.client_name || "",
            customerSignature: report.client_signature || parsed.customerSignature || "",
            customerSignDate: parsed.customerSignDate || "",
            customerSignTime: parsed.customerSignTime || "",
            customerPosition: parsed.customerPosition || "",
            systemType: parsed.systemType || "",
            panelManufacturer: parsed.panelManufacturer || "",
            panelModel: parsed.panelModel || "",
            panelLocation: parsed.panelLocation || "",
            zonesCount: parsed.zonesCount,
            devicesCount: parsed.devicesCount,
          },
          siteInfo,
          visit?.visit_date || report.report_date,
          visit?.visit_type || "",
          true
        ) as string;
      } else {
        // BS5839
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
        } catch {}

        base64 = generateServiceReportPDF(
          report as any,
          siteInfo,
          { visit_type: visit?.visit_type || "", visit_date: visit?.visit_date || report.report_date },
          panels,
          signatures,
          true
        ) as string;
      }

      if (!base64) throw new Error("Failed to generate PDF");

      // Convert base64 to blob URL for iframe
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      console.error("PDF preview error:", err);
      setError("Failed to generate PDF preview");
      toast.error("Failed to generate PDF preview");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      generatePreview();
    } else {
      // Clean up blob URL
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
        setPdfUrl(null);
      }
      setError(null);
    }
    onOpenChange(isOpen);
  };

  const handleDownload = () => {
    if (pdfUrl) {
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.download = "report.pdf";
      a.click();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b flex-row items-center justify-between shrink-0">
          <div>
            <DialogTitle>Report Preview</DialogTitle>
            <DialogDescription>PDF preview of the completed report</DialogDescription>
          </div>
          {pdfUrl && (
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">Generating PDF preview...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title="Report PDF Preview"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

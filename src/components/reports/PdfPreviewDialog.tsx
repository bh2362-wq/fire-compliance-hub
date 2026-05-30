import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      generateAndOpen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reportId]);

  const generateAndOpen = async () => {
    setLoading(true);
    setError(null);
    try {
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
              assetId: u.assetId, assetName: u.assetName, manufacturer: u.manufacturer,
              model: u.model, location: u.location, checklist: u.checklist,
              defects: u.defects, recommendations: u.recommendations, systemCondition: u.systemCondition,
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
          siteInfo, visit?.visit_date || report.report_date, visit?.visit_type || "", true
        ) as string;
      } else if (reportType === "asd") {
        const parsed = JSON.parse(report.notes || "{}");
        base64 = generateASDReportPDF(
          {
            reportNumber: report.report_number || "", reportDate: report.report_date,
            engineerName: report.engineer_name || "", clientName: report.client_name || "",
            units: parsed.units || [], systemCondition: report.system_condition || "",
            defectsFound: report.defects_found || "", recommendations: report.recommendations || "",
            workCarriedOut: report.work_carried_out || "", partsUsed: report.parts_used || "",
            notes: parsed.additional_notes || "",
            engineerSignature: report.engineer_signature || parsed.engineerSignature || "",
            engineerSignDate: parsed.engineerSignDate || "", engineerSignTime: parsed.engineerSignTime || "",
            customerNotPresent: parsed.customerNotPresent || false,
            customerSignature: report.client_signature || parsed.customerSignature || "",
            customerSignDate: parsed.customerSignDate || "", customerSignTime: parsed.customerSignTime || "",
          },
          siteInfo, visit?.visit_date || report.report_date, visit?.visit_type || "", true
        ) as string;
      } else if (reportType === "work") {
        const parsed = JSON.parse(report.notes || "{}");
        base64 = await generateWorkReportPDF(
          {
            certificateNo: report.report_number || "", jobNumber: parsed.jobNumber || "",
            jobType: parsed.jobType || "", appointmentDate: parsed.appointmentDate || "",
            systemStatusArrival: parsed.systemStatusArrival || "",
            systemStatusDeparture: parsed.systemStatusDeparture || "",
            workCompleted: parsed.workCompleted || report.status === "completed" || report.status === "locked", returnRequired: parsed.returnRequired || false,
            surveyRequired: parsed.surveyRequired || false, quotationRequired: parsed.quotationRequired || false,
            ramsCompleted: parsed.ramsCompleted || false, logBookEntry: parsed.logBookEntry || false,
            worksReport: report.work_carried_out || "", furtherAction: report.recommendations || "",
            numEngineers: parsed.numEngineers || 1, workDays: parsed.workDays || [],
            totalHours: parsed.totalHours || "", startTime: parsed.startTime || "",
            finishTime: parsed.finishTime || "", travelTime: parsed.travelTime || "",
            duration: parsed.duration || "", materials: parsed.materials || [],
            photos: parsed.photos || [], reportFiles: parsed.reportFiles || [],
            engineerName: report.engineer_name || "",
            engineerSignature: report.engineer_signature || parsed.engineerSignature || "",
            engineerSignDate: parsed.engineerSignDate || "", engineerSignTime: parsed.engineerSignTime || "",
            customerNotPresent: parsed.customerNotPresent || false,
            customerName: report.client_name || "",
            customerSignature: report.client_signature || parsed.customerSignature || "",
            customerSignDate: parsed.customerSignDate || "", customerSignTime: parsed.customerSignTime || "",
            customerPosition: parsed.customerPosition || "",
            panelInfo: parsed.panelInfo || "", locationInfo: parsed.locationInfo || "",
            typeInfo: parsed.typeInfo || "", zonesInfo: parsed.zonesInfo || "",
            contactPhone: parsed.contactPhone || "",
            contactPerson: parsed.contactPerson || "",
            contactEmail: parsed.contactEmail || "",
            reportDate: parsed.reportDate || report.report_date,
          },
          siteInfo, visit?.visit_date || report.report_date, visit?.visit_type || "", true
        ) as string;
      } else {
        let signatures = {};
        let panels = undefined;
        try {
          const parsed = JSON.parse(report.notes || "{}");
          signatures = {
            engineerSignature: report.engineer_signature || parsed.engineerSignature || "",
            engineerSignDate: parsed.engineerSignDate || "", engineerSignTime: parsed.engineerSignTime || "",
            customerNotPresent: parsed.customerNotPresent || false,
            customerSignature: report.client_signature || parsed.customerSignature || "",
            customerSignDate: parsed.customerSignDate || "", customerSignTime: parsed.customerSignTime || "",
          };
          if (parsed.multi_panel && Array.isArray(parsed.panel_checklists)) {
            panels = parsed.panel_checklists;
          }
        } catch {}
        // Pull the extras the new wizard records to other tables so the
        // preview matches the engineer's actual capture (defects from
        // site_defects, device ticks from parsed_device_tests, customer
        // via sites.customer_id).
        const visitId = report.visit_id;
        const siteId = report.site_id;
        const [defectsRes, devicesRes, customerRow] = await Promise.all([
          visitId
            ? supabase
                .from("site_defects")
                .select("description, location, category, status")
                .eq("visit_id", visitId)
                .then((r) => r.data ?? [])
            : Promise.resolve([]),
          visitId
            ? supabase
                .from("parsed_device_tests")
                .select("loop, address, device_type, location, status, tested_at, fail_reason")
                .eq("visit_id", visitId)
                .order("tested_at", { ascending: true })
                .then((r) => r.data ?? [])
            : Promise.resolve([]),
          (async () => {
            if (!siteId) return null;
            const { data: siteRow } = await supabase
              .from("sites")
              .select("customer_id")
              .eq("id", siteId)
              .maybeSingle();
            if (!siteRow?.customer_id) return null;
            const { data: c } = await supabase
              .from("customers")
              .select("name, contact_name, contact_email, contact_phone")
              .eq("id", siteRow.customer_id)
              .maybeSingle();
            return c ?? null;
          })(),
        ]);
        base64 = generateServiceReportPDF(
          report as any, siteInfo,
          { visit_type: visit?.visit_type || "", visit_date: visit?.visit_date || report.report_date },
          panels, signatures, true,
          { defects: defectsRes, deviceTests: devicesRes, customer: customerRow },
        ) as string;
      }

      if (!base64) throw new Error("Failed to generate PDF");

      // Convert base64 to blob
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      const fileName = `${report.report_number || `report-${reportId}`}.pdf`;

      // Try anchor download first (works in most browsers / top-level pages)
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      a.rel = "noopener";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Fallback: also open the PDF in a new tab so the user always gets it,
      // even when running inside a sandboxed preview iframe that blocks downloads.
      const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        // Popup blocked — surface a manual link via toast
        toast.message("PDF ready", {
          description: "Click to open the report",
          action: {
            label: "Open PDF",
            onClick: () => window.open(blobUrl, "_blank", "noopener,noreferrer"),
          },
          duration: 10000,
        });
      } else {
        toast.success("PDF opened in a new tab");
      }

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      onOpenChange(false);
    } catch (err) {
      console.error("PDF preview error:", err);
      setError("Failed to generate PDF preview");
      toast.error("Failed to generate PDF preview");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Report Preview</DialogTitle>
          <DialogDescription>
            {loading ? "Generating PDF..." : error ? error : "Downloading PDF..."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center py-6">
          {loading ? (
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
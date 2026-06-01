import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Building2, Calendar, Search, Eye, AlertTriangle, CheckCircle2, Wind, Trash2, MoreVertical, FileCheck, FilePen, Receipt, ReceiptText, Unlock, Mail, ClipboardList, Globe, Upload, ExternalLink, Loader2, Copy, Volume2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { CustomerCreateInvoiceDialog } from "@/components/customers/CustomerCreateInvoiceDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ServiceReport, BS5839Checklist, getDefaultChecklist } from "@/services/serviceReportService";
import { useAuth } from "@/contexts/AuthContext";
import { EmailReportDialog } from "@/components/reports/EmailReportDialog";
import { getCompanySettings } from "@/services/companySettingsService";
import { generateServiceReportPDF, generateWorkReportPDF, generateASDReportPDF, generateDisabledRefugeReportPDF } from "@/lib/pdfGenerator";
import { generateCauseEffectReportPDF } from "@/lib/causeEffectReportPdfGenerator";
import { loadCauseEffectReportBundle } from "@/services/causeEffectTestService";
import { GenerateQuotationDialog } from "@/components/quotations/GenerateQuotationDialog";
import { PdfPreviewDialog } from "@/components/reports/PdfPreviewDialog";
import { ChangeReportSiteDialog } from "@/components/reports/ChangeReportSiteDialog";

interface ReportWithSite extends ServiceReport {
  _kind?: "service";
  sites: { name: string; customers?: { name: string } | null } | null;
  visits: { visit_type: string; visit_date: string; client_po_number?: string | null } | null;
}

// C&E + Audibility test reports live in their own ce_audibility_reports
// table, but the user expects them in the same Reports list. Discriminated
// against ReportWithSite via `_kind` — every row in the unified list has
// a `_kind`, so the renderer can branch without `instanceof`.
interface CeReportRow {
  _kind: "ce";
  id: string;
  visit_id: string;
  site_id: string;
  report_number: string | null;
  report_date: string | null;
  status: "draft" | "completed" | string | null;
  engineer_name: string | null;
  created_at: string;
  sites: { name: string; customers?: { name: string } | null } | null;
  visits: { visit_type: string; visit_date: string } | null;
}

type UnifiedReportRow =
  | (ReportWithSite & { _kind: "service" })
  | CeReportRow;

const statusConfig: Record<string, { label: string; className: string }> = {
  completed: {
    label: "Completed",
    className: "bg-success/10 text-success border-success/20",
  },
  locked: {
    label: "Locked",
    className: "bg-destructive/10 text-destructive border-destructive/20",
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
  const [reports, setReports] = useState<UnifiedReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<ReportWithSite | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [reportToInvoice, setReportToInvoice] = useState<ReportWithSite | null>(null);
  const [invoiceContactId, setInvoiceContactId] = useState<string | null>(null);
  const [invoiceCustomerInfo, setInvoiceCustomerInfo] = useState<{ id: string; name: string; xeroContactId: string | null } | null>(null);
  const [invoiceSiteInfo, setInvoiceSiteInfo] = useState<{ id: string; name: string; address: string | null; city: string | null } | null>(null);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [reportToUnlock, setReportToUnlock] = useState<ReportWithSite | null>(null);
  const [unlockReason, setUnlockReason] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const { user } = useAuth();
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [reportToEmail, setReportToEmail] = useState<ReportWithSite | null>(null);
  const [emailRecipientInfo, setEmailRecipientInfo] = useState<{
    email: string;
    recipients: string;
    customerName: string;
    customerId: string;
  } | null>(null);
  const [companySettings, setCompanySettings] = useState<{
    company_name?: string;
    report_logo_url?: string;
    company_logo_url?: string;
  } | null>(null);
  const [quotationDialogOpen, setQuotationDialogOpen] = useState(false);
  const [reportForQuotation, setReportForQuotation] = useState<ReportWithSite | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewReportId, setPdfPreviewReportId] = useState<string | null>(null);
  const [changeSiteTarget, setChangeSiteTarget] = useState<{
    kind: "service" | "ce";
    id: string;
    siteId: string | null;
    siteName: string | null;
  } | null>(null);
  const [uploadingToSharePoint, setUploadingToSharePoint] = useState<string | null>(null);

  const sanitizeName = (name: string) => name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();

  const handleUploadToSharePoint = async (report: ReportWithSite) => {
    const customerName = (report.sites as any)?.customers?.name || "Unknown Customer";
    const siteName = report.sites?.name || "Unknown Site";
    const siteAddress = (report.sites as any)?.address || "";
    const siteFolder = siteAddress ? `${sanitizeName(siteName)} (${sanitizeName(siteAddress)})` : sanitizeName(siteName);
    const visitDate = report.visits?.visit_date || report.report_date;
    const dateStr = visitDate ? format(new Date(visitDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    const reportNum = report.report_number || "report";
    const reportFolderName = `${reportNum}_${dateStr}`;
    const folderPath = `Customers/${sanitizeName(customerName)}/${siteFolder}/Reports/${reportFolderName}`;
    const fileName = `${reportFolderName}.pdf`;

    setUploadingToSharePoint(report.id);
    try {
      // Fetch full report data for PDF generation
      const { data: fullReport } = await supabase
        .from("service_reports")
        .select(`*, sites:site_id(name, address, city, postcode, contact_name, contact_phone, contact_email, bs5839_category)`)
        .eq("id", report.id)
        .single();

      if (!fullReport) throw new Error("Report not found");

      const site = fullReport.sites as any;
      const siteInfo = {
        name: site?.name || "",
        address: site?.address,
        city: site?.city,
        postcode: site?.postcode,
        contact_name: site?.contact_name,
        contact_phone: site?.contact_phone,
        contact_email: site?.contact_email,
        bs5839_category: site?.bs5839_category,
      };
      const visit = report.visits || { visit_type: "", visit_date: fullReport.report_date };

      let base64: string | null = null;

      if (isDisabledRefugeReport(fullReport as any)) {
        const parsed = JSON.parse(fullReport.notes || "{}");
        base64 = await generateDisabledRefugeReportPDF({
          reportNumber: fullReport.report_number || "", reportDate: fullReport.report_date, engineerName: fullReport.engineer_name || "", clientName: fullReport.client_name || "",
          units: (parsed.units || []).map((u: any) => ({ assetId: u.assetId, assetName: u.assetName, manufacturer: u.manufacturer, model: u.model, location: u.location, checklist: u.checklist, defects: u.defects, recommendations: u.recommendations, systemCondition: u.systemCondition })),
          systemCondition: fullReport.system_condition || "", defectsFound: fullReport.defects_found || "", recommendations: fullReport.recommendations || "", workCarriedOut: fullReport.work_carried_out || "", partsUsed: fullReport.parts_used || "", notes: parsed.additional_notes || "",
          engineerSignature: fullReport.engineer_signature || parsed.engineerSignature || "", engineerSignDate: parsed.engineerSignDate || "", engineerSignTime: parsed.engineerSignTime || "",
          customerNotPresent: parsed.customerNotPresent || false, customerSignature: fullReport.client_signature || parsed.customerSignature || "", customerSignDate: parsed.customerSignDate || "", customerSignTime: parsed.customerSignTime || "",
        }, siteInfo, visit.visit_date, visit.visit_type, true) as string;
      } else if (isASDReport(fullReport as any)) {
        const parsed = JSON.parse(fullReport.notes || "{}");
        base64 = generateASDReportPDF({
          reportNumber: fullReport.report_number || "", reportDate: fullReport.report_date, engineerName: fullReport.engineer_name || "", clientName: fullReport.client_name || "",
          units: parsed.units || [], systemCondition: fullReport.system_condition || "", defectsFound: fullReport.defects_found || "", recommendations: fullReport.recommendations || "", workCarriedOut: fullReport.work_carried_out || "", partsUsed: fullReport.parts_used || "", notes: parsed.additional_notes || "",
          engineerSignature: fullReport.engineer_signature || parsed.engineerSignature || "", engineerSignDate: parsed.engineerSignDate || "", engineerSignTime: parsed.engineerSignTime || "",
          customerNotPresent: parsed.customerNotPresent || false, customerSignature: fullReport.client_signature || parsed.customerSignature || "", customerSignDate: parsed.customerSignDate || "", customerSignTime: parsed.customerSignTime || "",
        }, siteInfo, visit.visit_date, visit.visit_type, true) as string;
      } else if (isWorkReport(fullReport as any)) {
        const parsed = JSON.parse(fullReport.notes || "{}");
        base64 = await generateWorkReportPDF({
          certificateNo: fullReport.report_number || "", jobNumber: parsed.jobNumber || "", jobType: parsed.jobType || "", appointmentDate: parsed.appointmentDate || "",
          systemStatusArrival: parsed.systemStatusArrival || "", systemStatusDeparture: parsed.systemStatusDeparture || "", workCompleted: parsed.workCompleted || fullReport.status === "completed" || fullReport.status === "locked", returnRequired: parsed.returnRequired || false,
          surveyRequired: parsed.surveyRequired || false, quotationRequired: parsed.quotationRequired || false, ramsCompleted: parsed.ramsCompleted || false, logBookEntry: parsed.logBookEntry || false,
          worksReport: fullReport.work_carried_out || "", furtherAction: fullReport.recommendations || "", numEngineers: parsed.numEngineers || 1, workDays: parsed.workDays || [],
          totalHours: parsed.totalHours || "", startTime: parsed.startTime || "", finishTime: parsed.finishTime || "", travelTime: parsed.travelTime || "", duration: parsed.duration || "",
          materials: parsed.materials || [], photos: parsed.photos || [], reportFiles: parsed.reportFiles || [],
          engineerName: fullReport.engineer_name || "", engineerSignature: fullReport.engineer_signature || parsed.engineerSignature || "",
          engineerSignDate: parsed.engineerSignDate || "", engineerSignTime: parsed.engineerSignTime || "", customerNotPresent: parsed.customerNotPresent || false,
          customerName: fullReport.client_name || "", customerSignature: fullReport.client_signature || parsed.customerSignature || "", customerSignDate: parsed.customerSignDate || "", customerSignTime: parsed.customerSignTime || "",
          panelInfo: parsed.panelInfo || "", locationInfo: parsed.locationInfo || "", typeInfo: parsed.typeInfo || "", zonesInfo: parsed.zonesInfo || "", contactPhone: parsed.contactPhone || "",
          reportDate: parsed.reportDate || fullReport.report_date,
        }, siteInfo, visit.visit_date, visit.visit_type, true) as string;
      } else {
        let signatures = {}; let panels = undefined;
        try { const parsed = JSON.parse(fullReport.notes || "{}"); signatures = { engineerSignature: fullReport.engineer_signature || parsed.engineerSignature || "", engineerSignDate: parsed.engineerSignDate || "", engineerSignTime: parsed.engineerSignTime || "", customerNotPresent: parsed.customerNotPresent || false, customerSignature: fullReport.client_signature || parsed.customerSignature || "", customerSignDate: parsed.customerSignDate || "", customerSignTime: parsed.customerSignTime || "" }; if (parsed.multi_panel && Array.isArray(parsed.panel_checklists)) panels = parsed.panel_checklists; } catch { /* ignore */ }
        base64 = generateServiceReportPDF(fullReport as any, siteInfo, visit, panels, signatures, true) as string;
      }

      if (!base64) throw new Error("Failed to generate PDF");

      const { data, error } = await supabase.functions.invoke("upload-to-sharepoint", {
        body: { folderPath, fileName, fileBase64: base64, contentType: "application/pdf" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Save SharePoint URL to report
      if (data?.webUrl) {
        await supabase.from("service_reports").update({
          sharepoint_folder: folderPath,
          sharepoint_url: data.webUrl,
        }).eq("id", report.id);
      }

      toast.success(`Report ${report.report_number} uploaded to SharePoint`);
      fetchReports();
    } catch (err: any) {
      console.error("SharePoint upload error:", err);
      toast.error(err.message || "Failed to upload to SharePoint");
    } finally {
      setUploadingToSharePoint(null);
    }
  };

  // Helper to detect if a report is a Work Report (has JSON in notes with work report fields)
  function isWorkReport(report: ServiceReport): boolean {
    if (!report.notes) return false;
    try {
      const parsed = JSON.parse(report.notes);
      // Work reports have these specific fields (but NOT asd or disabled_refuge)
      return (typeof parsed.jobNumber !== "undefined" || typeof parsed.jobType !== "undefined") 
        && parsed.report_type !== "asd" && parsed.report_type !== "disabled_refuge";
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

  // Helper to detect if a report is a Disabled Refuge Report
  function isDisabledRefugeReport(report: ServiceReport): boolean {
    if (!report.notes) return false;
    try {
      const parsed = JSON.parse(report.notes);
      return parsed.report_type === "disabled_refuge";
    } catch {
      return false;
    }
  }

  useEffect(() => {
    getCompanySettings().then(setCompanySettings).catch(console.error);
  }, []);

  const handleEmailReport = async (report: ReportWithSite) => {
    // Fetch customer info for this site
    const { data: siteData } = await supabase
      .from("sites")
      .select("customer_id, customers(name, contact_email, email_recipients, report_email_recipients)")
      .eq("id", report.site_id)
      .maybeSingle();

    const customer = siteData?.customers as { name: string; contact_email: string; email_recipients: string; report_email_recipients: string } | null;
    
    setEmailRecipientInfo({
      email: customer?.contact_email || "",
      recipients: customer?.report_email_recipients || customer?.email_recipients || "",
      customerName: customer?.name || "",
      customerId: siteData?.customer_id || "",
    });
    setReportToEmail(report);
    setEmailDialogOpen(true);
  };

  const generateReportPdfBase64 = async (): Promise<string | null> => {
    if (!reportToEmail) throw new Error("No report selected");

    // Fetch full report data with site info
    const { data: fullReport } = await supabase
      .from("service_reports")
      .select(`
        *,
        sites:site_id(name, address, city, postcode, contact_name, contact_phone, contact_email, bs5839_category, customers(name, client_signature))
      `)
      .eq("id", reportToEmail.id)
      .single();

    if (!fullReport) throw new Error("Report not found");

    const site = fullReport.sites as any;
    const customer = site?.customers as any;

    const siteInfo = {
      name: site?.name || "",
      address: site?.address,
      city: site?.city,
      postcode: site?.postcode,
      contact_name: site?.contact_name,
      contact_phone: site?.contact_phone,
      contact_email: site?.contact_email,
      bs5839_category: site?.bs5839_category,
    };

    const visitInfo = {
      visit_type: reportToEmail.visits?.visit_type || "",
      visit_date: reportToEmail.visits?.visit_date || fullReport.report_date,
    };

    // Determine report type and use appropriate PDF generator
    if (isDisabledRefugeReport(fullReport as any)) {
      // Disabled Refuge Report
      const parsed = JSON.parse(fullReport.notes || "{}");
      const units = parsed.units || [];
      
      const base64 = await generateDisabledRefugeReportPDF(
        {
          reportNumber: fullReport.report_number || "",
          reportDate: fullReport.report_date,
          engineerName: fullReport.engineer_name || "",
          clientName: fullReport.client_name || "",
          units: units.map((u: any) => ({
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
          systemCondition: fullReport.system_condition || "",
          defectsFound: fullReport.defects_found || "",
          recommendations: fullReport.recommendations || "",
          workCarriedOut: fullReport.work_carried_out || "",
          partsUsed: fullReport.parts_used || "",
          notes: parsed.additional_notes || "",
          engineerSignature: fullReport.engineer_signature || parsed.engineerSignature || "",
          engineerSignDate: parsed.engineerSignDate || "",
          engineerSignTime: parsed.engineerSignTime || "",
          customerNotPresent: parsed.customerNotPresent || false,
          customerSignature: fullReport.client_signature || parsed.customerSignature || "",
          customerSignDate: parsed.customerSignDate || "",
          customerSignTime: parsed.customerSignTime || "",
        },
        siteInfo,
        visitInfo.visit_date,
        visitInfo.visit_type || "EVC Service",
        true // returnBase64
      );
      
      if (!base64) throw new Error("Failed to generate PDF");
      return base64 as string;
    } else if (isASDReport(fullReport as any)) {
      // ASD Report
      const parsed = JSON.parse(fullReport.notes || "{}");
      
      const base64 = generateASDReportPDF(
        {
          reportNumber: fullReport.report_number || "",
          reportDate: fullReport.report_date,
          engineerName: fullReport.engineer_name || "",
          clientName: fullReport.client_name || "",
          units: parsed.units || [],
          systemCondition: fullReport.system_condition || "",
          defectsFound: fullReport.defects_found || "",
          recommendations: fullReport.recommendations || "",
          workCarriedOut: fullReport.work_carried_out || "",
          partsUsed: fullReport.parts_used || "",
          notes: parsed.additional_notes || "",
          engineerSignature: fullReport.engineer_signature || parsed.engineerSignature || "",
          engineerSignDate: parsed.engineerSignDate || "",
          engineerSignTime: parsed.engineerSignTime || "",
          customerNotPresent: parsed.customerNotPresent || false,
          customerSignature: fullReport.client_signature || parsed.customerSignature || "",
          customerSignDate: parsed.customerSignDate || "",
          customerSignTime: parsed.customerSignTime || "",
        },
        siteInfo,
        visitInfo.visit_date,
        visitInfo.visit_type,
        true // returnBase64
      );
      
      if (!base64) throw new Error("Failed to generate PDF");
      return base64 as string;
    } else if (isWorkReport(fullReport as any)) {
      // Work Report / Job Sheet
      const parsed = JSON.parse(fullReport.notes || "{}");
      
      const base64 = await generateWorkReportPDF(
        {
          certificateNo: fullReport.report_number || "",
          jobNumber: parsed.jobNumber || "",
          jobType: parsed.jobType || "",
          appointmentDate: parsed.appointmentDate || "",
          systemStatusArrival: parsed.systemStatusArrival || "",
          systemStatusDeparture: parsed.systemStatusDeparture || "",
          workCompleted: parsed.workCompleted || fullReport.status === "completed" || fullReport.status === "locked",
          returnRequired: parsed.returnRequired || false,
          surveyRequired: parsed.surveyRequired || false,
          quotationRequired: parsed.quotationRequired || false,
          ramsCompleted: parsed.ramsCompleted || false,
          logBookEntry: parsed.logBookEntry || false,
          worksReport: fullReport.work_carried_out || "",
          furtherAction: fullReport.recommendations || "",
          numEngineers: parsed.numEngineers || 1,
          workDays: parsed.workDays || [],
          totalHours: parsed.totalHours || "",
          startTime: parsed.startTime || "",
          finishTime: parsed.finishTime || "",
          travelTime: parsed.travelTime || "",
          duration: parsed.duration || "",
          materials: parsed.materials || [],
          photos: parsed.photos || [],
          reportFiles: parsed.reportFiles || [],
          engineerName: fullReport.engineer_name || "",
          engineerSignature: fullReport.engineer_signature || parsed.engineerSignature || "",
          engineerSignDate: parsed.engineerSignDate || "",
          engineerSignTime: parsed.engineerSignTime || "",
          customerNotPresent: parsed.customerNotPresent || false,
          customerName: fullReport.client_name || "",
          customerSignature: fullReport.client_signature || parsed.customerSignature || "",
          customerSignDate: parsed.customerSignDate || "",
          customerSignTime: parsed.customerSignTime || "",
          customerPosition: parsed.customerPosition || "",
          panelInfo: parsed.panelInfo || "",
          locationInfo: parsed.locationInfo || "",
          typeInfo: parsed.typeInfo || "",
          zonesInfo: parsed.zonesInfo || "",
          contactPhone: parsed.contactPhone || "",
          reportDate: parsed.reportDate || fullReport.report_date,
        },
        siteInfo,
        visitInfo.visit_date,
        visitInfo.visit_type,
        true // returnBase64
      );
      
      if (!base64) throw new Error("Failed to generate PDF");
      return base64 as string;
    } else {
      // BS5839 / Service Report
      let signatures = {};
      let panels = undefined;
      try {
        const parsed = JSON.parse(fullReport.notes || "{}");
        signatures = {
          engineerSignature: fullReport.engineer_signature || parsed.engineerSignature || "",
          engineerSignDate: parsed.engineerSignDate || "",
          engineerSignTime: parsed.engineerSignTime || "",
          customerNotPresent: parsed.customerNotPresent || false,
          customerSignature: fullReport.client_signature || parsed.customerSignature || "",
          customerSignDate: parsed.customerSignDate || "",
          customerSignTime: parsed.customerSignTime || "",
        };
        if (parsed.multi_panel && Array.isArray(parsed.panel_checklists)) {
          panels = parsed.panel_checklists;
        }
      } catch {
        // Notes parsing failed, use empty signatures
      }

      const base64 = generateServiceReportPDF(
        fullReport as any,
        siteInfo,
        visitInfo,
        panels,
        signatures,
        true // returnBase64
      );

      if (!base64) throw new Error("Failed to generate PDF");
      return base64 as string;
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    // Fetch service reports and C&E reports in parallel — they live in
    // separate tables but the user expects to see both on this page.
    const [serviceRes, ceRes] = await Promise.all([
      supabase
        .from("service_reports")
        .select(`
          *,
          sites:site_id(name, address, customers:customer_id(name)),
          visits:visit_id(visit_type, visit_date, client_po_number)
        `)
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("ce_audibility_reports")
        .select(`
          id, visit_id, site_id, report_number, report_date, status,
          engineer_name, created_at,
          sites:site_id(name, address, customers:customer_id(name)),
          visits:visit_id(visit_type, visit_date)
        `)
        .order("created_at", { ascending: false }),
    ]);

    const serviceRows: UnifiedReportRow[] =
      !serviceRes.error && serviceRes.data
        ? serviceRes.data.map((r) => ({
            ...r,
            _kind: "service" as const,
            checklist: (r.checklist as unknown as BS5839Checklist) || getDefaultChecklist(),
          })) as UnifiedReportRow[]
        : [];

    // Tolerate the C&E table being unmigrated on an older env — just
    // surface the service reports rather than blanking the whole page.
    const ceRows: UnifiedReportRow[] =
      !ceRes.error && Array.isArray(ceRes.data)
        ? (ceRes.data as Array<Omit<CeReportRow, "_kind">>).map((r) => ({
            ...r,
            _kind: "ce" as const,
          }))
        : [];

    const merged = [...serviceRows, ...ceRows].sort((a, b) => {
      const ad = a._kind === "service" ? (a.created_at ?? "") : a.created_at;
      const bd = b._kind === "service" ? (b.created_at ?? "") : b.created_at;
      return bd.localeCompare(ad);
    });

    setReports(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleDeleteReport = async () => {
    if (!reportToDelete) return;
    
    setDeleting(true);
    try {
      const reportNumber = reportToDelete.report_number;
      const reportType = reportNumber?.startsWith("CERT") ? "CERT" : "JOB";

      // Delete the report
      const { error: deleteError } = await supabase
        .from("service_reports")
        .delete()
        .eq("id", reportToDelete.id);

      if (deleteError) throw deleteError;

      // Recycle the report number if it exists
      if (reportNumber) {
        const { error: recycleError } = await supabase
          .from("recycled_report_numbers")
          .insert({
            report_number: reportNumber,
            report_type: reportType,
          });

        if (recycleError) {
          console.error("Failed to recycle report number:", recycleError);
          // Don't throw - the report is deleted, recycling is optional
        }
      }

      toast.success(`Report ${reportNumber || ""} deleted successfully. The number will be reused.`);
      fetchReports();
    } catch (error) {
      console.error("Failed to delete report:", error);
      toast.error("Failed to delete report");
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setReportToDelete(null);
    }
  };

  const handleStatusChange = async (reportId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("service_reports")
        .update({ status: newStatus })
        .eq("id", reportId);

      if (error) throw error;

      toast.success(`Status updated to ${newStatus}`);
      fetchReports();
    } catch (error) {
      console.error("Failed to update status:", error);
      toast.error("Failed to update status");
    }
  };

  const handleInvoicedToggle = async (reportId: string, invoiced: boolean) => {
    try {
      const { error } = await supabase
        .from("service_reports")
        .update({ invoiced })
        .eq("id", reportId);

      if (error) throw error;

      toast.success(invoiced ? "Marked as invoiced" : "Marked as not invoiced");
      fetchReports();
    } catch (error) {
      console.error("Failed to update invoiced status:", error);
      toast.error("Failed to update invoiced status");
    }
  };

  const handleCreateInvoice = async (report: ReportWithSite) => {
    // Look up the site and customer details
    const { data: siteData } = await supabase
      .from("sites")
      .select("id, name, address, city, customer_id")
      .eq("id", report.site_id)
      .maybeSingle();
    
    if (siteData) {
      setInvoiceSiteInfo({ id: siteData.id, name: siteData.name, address: siteData.address, city: siteData.city });
      
      if (siteData.customer_id) {
        const { data: customerData } = await supabase
          .from("customers")
          .select("id, name, xero_contact_id")
          .eq("id", siteData.customer_id)
          .maybeSingle();
        
        if (customerData) {
          setInvoiceCustomerInfo({ id: customerData.id, name: customerData.name, xeroContactId: customerData.xero_contact_id });
        } else {
          setInvoiceCustomerInfo(null);
        }
      } else {
        setInvoiceCustomerInfo(null);
      }
    } else {
      setInvoiceSiteInfo(null);
      setInvoiceCustomerInfo(null);
    }
    
    setReportToInvoice(report);
    setInvoiceDialogOpen(true);
  };

  const handleUnlockReport = async () => {
    if (!reportToUnlock || !unlockReason.trim() || !user) return;

    setUnlocking(true);
    try {
      // Update report status to draft
      const { error: updateError } = await supabase
        .from("service_reports")
        .update({ status: "draft" })
        .eq("id", reportToUnlock.id);

      if (updateError) throw updateError;

      // Log the unlock action for compliance audit
      const { error: auditError } = await supabase
        .from("audit_logs")
        .insert({
          user_id: user.id,
          entity_type: "service_report",
          entity_id: reportToUnlock.id,
          action: "unlock",
          details: {
            report_number: reportToUnlock.report_number,
            site_name: reportToUnlock.sites?.name,
            reason: unlockReason.trim(),
            unlocked_at: new Date().toISOString(),
          },
        });

      if (auditError) {
        console.error("Failed to create audit log:", auditError);
        // Don't throw - the unlock succeeded, audit logging is secondary
      }

      toast.success(`Report ${reportToUnlock.report_number || ""} unlocked for editing`);
      fetchReports();
    } catch (error) {
      console.error("Failed to unlock report:", error);
      toast.error("Failed to unlock report");
    } finally {
      setUnlocking(false);
      setUnlockDialogOpen(false);
      setReportToUnlock(null);
      setUnlockReason("");
    }
  };

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
            <SelectTrigger className="w-full sm:w-40">
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
              // C&E + Audibility test reports live in a separate table —
              // render them with their own simplified row, then narrow the
              // type and fall through to the service-report rendering.
              if (report._kind === "ce") {
                return (
                  <CauseEffectReportRow
                    key={report.id}
                    report={report}
                    navigate={navigate}
                    onChangeSite={() => setChangeSiteTarget({
                      kind: "ce",
                      id: report.id,
                      siteId: report.site_id ?? null,
                      siteName: report.sites?.name ?? null,
                    })}
                  />
                );
              }
              const status = statusConfig[report.status] || statusConfig.draft;
              const condition = report.system_condition
                ? conditionConfig[report.system_condition]
                : null;
              const ConditionIcon = condition?.icon;

              // Check if this is an ASD report
              let isAsdReport = false;
              try {
                const notesData = JSON.parse(report.notes || "{}");
                isAsdReport = notesData.report_type === "asd";
              } catch {
                // Not JSON, not an ASD report
              }

              // A visit booked as "cause_and_effect" should always open the
              // C&E wizard, not the BS 5839 service-report form — even if
              // no ce_audibility_reports row exists yet (the wizard fetch-
              // or-creates the draft on first open).
              const isCauseEffectVisit =
                report.visits?.visit_type === "cause_and_effect";

              // For C&E visits, the eye-icon "View Report" must render the
              // C&E PDF — not the BS 5839 service-report one. Look up the
              // ce_audibility_reports row by visit_id and run the C&E
              // generator. If no row exists yet, point the engineer at the
              // wizard to capture it.
              const handleViewReportPdf = async () => {
                if (!isCauseEffectVisit) {
                  setPdfPreviewReportId(report.id);
                  setPdfPreviewOpen(true);
                  return;
                }
                if (!report.visit_id) {
                  toast.error("This report isn't linked to a visit.");
                  return;
                }
                try {
                  const { data: ceRow, error: ceErr } = await (supabase as any)
                    .from("ce_audibility_reports")
                    .select("id")
                    .eq("visit_id", report.visit_id)
                    .maybeSingle();
                  if (ceErr) throw ceErr;
                  if (!ceRow) {
                    toast.error("No C&E data captured yet — click Edit Report to start.");
                    return;
                  }
                  const bundle = await loadCauseEffectReportBundle(ceRow.id);
                  await generateCauseEffectReportPDF(bundle);
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "Failed to generate PDF";
                  toast.error(`Couldn't generate C&E PDF: ${msg}`);
                }
              };

              const handleViewReport = async () => {
                // C&E visit overrides everything below — always go to the
                // C&E capture wizard.
                if (isCauseEffectVisit) {
                  if (report.visit_id) {
                    navigate(`/dashboard/visits/${report.visit_id}/cause-effect-test/capture`);
                  } else {
                    toast.error("This report isn't linked to a visit — open it from the visit instead.");
                  }
                  return;
                }

                // Detect report type from notes
                let reportType = "bs5839";
                try {
                  const notes = JSON.parse(report.notes || "{}");
                  if (notes.report_type === "asd") reportType = "asd";
                  else if (notes.report_type === "disabled_refuge") reportType = "disabled_refuge";
                  else if (notes.jobNumber || notes.jobType || Array.isArray(notes.workDays)) reportType = "job";
                } catch {
                  // Not JSON, check report number
                  if ((report.report_number || "").startsWith("JOB-")) reportType = "job";
                }

                // BS 5839 service reports → navigate to the new capture
                // wizard. Orphan-report fallback (no visit_id) shows a
                // toast — legacy ServiceReportDialog has been deleted.
                if (reportType === "bs5839") {
                  if (report.visit_id) {
                    navigate(`/dashboard/visits/${report.visit_id}/service-report/capture`);
                  } else {
                    toast.error("This report isn't linked to a visit — open it from the visit instead.");
                  }
                  return;
                }

                // Disabled-refuge → route to the new wizard (Path 2 step B).
                // Falls back to the legacy dialog when there's no visit_id
                // since the wizard needs one for the URL.
                if (reportType === "disabled_refuge" && report.visit_id) {
                  navigate(`/dashboard/visits/${report.visit_id}/disabled-refuge-report/capture`);
                  return;
                }

                // ASD service report → new wizard (Path 2 step C). Same
                // fallback shape as disabled-refuge.
                if (reportType === "asd" && report.visit_id) {
                  navigate(`/dashboard/visits/${report.visit_id}/asd-report/capture`);
                  return;
                }

                // Work/job report → wizard (Path 2 step D, Phase 5c).
                if (reportType === "job" && report.visit_id) {
                  navigate(`/dashboard/visits/${report.visit_id}/work-report/capture`);
                  return;
                }

                // Orphan work report (no visit_id) — rare, surface clearly.
                if (reportType === "job") {
                  toast.error("This work report isn't linked to a visit — open it from the visit instead.");
                  return;
                }

                // Unhandled report type — every known type (bs5839, asd,
                // disabled_refuge, job) is routed above. Surface clearly.
                toast.error("This report type isn't viewable yet — please contact support.");
              };

              return (
                <div
                  key={report.id}
                  className="p-4 sm:p-6 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                    <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                        isAsdReport
                          ? "bg-secondary/10"
                          : isCauseEffectVisit
                            ? "bg-secondary/10"
                            : "bg-primary/10"
                      )}>
                        {isAsdReport ? (
                          <Wind className="w-6 h-6 text-secondary" />
                        ) : isCauseEffectVisit ? (
                          <Volume2 className="w-6 h-6 text-secondary" />
                        ) : (
                          <FileText className="w-6 h-6 text-primary" />
                        )}
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground truncate">
                            {report.sites?.name || "Unknown Site"}
                          </h3>
                          {isAsdReport && (
                            <Badge variant="secondary" className="text-xs">
                              ASD
                            </Badge>
                          )}
                          {isCauseEffectVisit && (
                            <Badge variant="secondary" className="text-xs">
                              Cause &amp; Effect
                            </Badge>
                          )}
                          <Badge variant="outline" className={status.className}>
                            {status.label}
                          </Badge>
                          {(report as any).invoiced && (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                              <ReceiptText className="w-3 h-3 mr-1" />
                              Invoiced
                            </Badge>
                          )}
                          {condition && ConditionIcon && (
                            <span className={`flex items-center gap-1 text-sm ${condition.className}`}>
                              <ConditionIcon className="w-4 h-4" />
                              {condition.label}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
                    {/* Actions — wrap to a row below on mobile (sm:flex-row puts
                        them at top-right on desktop). View Report becomes the
                        primary action; Site collapses to icon-only to save space. */}
                    <div className="flex items-center gap-2 sm:shrink-0 -mr-1 sm:mr-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 px-2 sm:px-3"
                        onClick={() => navigate(`/dashboard/sites/${report.site_id}`)}
                        aria-label="View site"
                      >
                        <Building2 className="w-4 h-4 sm:mr-1" />
                        <span className="hidden sm:inline">Site</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 flex-1 sm:flex-initial"
                        onClick={handleViewReportPdf}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View Report
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="More actions">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={handleViewReport}
                          >
                            <FilePen className="w-4 h-4 mr-2" />
                            Edit Report
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setChangeSiteTarget({
                              kind: "service",
                              id: report.id,
                              siteId: report.site_id ?? null,
                              siteName: report.sites?.name ?? null,
                            })}
                          >
                            <Building2 className="w-4 h-4 mr-2" />
                            Change Site / Customer
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleEmailReport(report)}
                          >
                            <Mail className="w-4 h-4 mr-2" />
                            Email Report
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleCreateInvoice(report)}
                          >
                            <Receipt className="w-4 h-4 mr-2" />
                            Create Invoice
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setReportForQuotation(report);
                              setQuotationDialogOpen(true);
                            }}
                          >
                            <ClipboardList className="w-4 h-4 mr-2" />
                            Generate Quotation
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.preventDefault();
                              handleInvoicedToggle(report.id, !(report as any).invoiced);
                            }}
                          >
                            <ReceiptText className="w-4 h-4 mr-2" />
                            {(report as any).invoiced ? "Mark as Not Invoiced" : "Mark as Invoiced"}
                          </DropdownMenuItem>
                          {(report.status === "completed" || report.status === "locked") ? (
                            <DropdownMenuItem
                              onClick={() => {
                                setReportToUnlock(report);
                                setUnlockDialogOpen(true);
                              }}
                            >
                              <Unlock className="w-4 h-4 mr-2" />
                              Unlock Report
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(report.id, "completed")}
                            >
                              <FileCheck className="w-4 h-4 mr-2" />
                              Mark as Completed
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <Globe className="w-4 h-4 mr-2" />
                              View Online
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {(report as any).sharepoint_url ? (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      window.open((report as any).sharepoint_url, "_blank", "noopener,noreferrer");
                                    }}
                                  >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Open in SharePoint
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      navigator.clipboard.writeText((report as any).sharepoint_url);
                                      toast.success("SharePoint link copied to clipboard");
                                    }}
                                  >
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy SharePoint Link
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                              <DropdownMenuItem
                                disabled={uploadingToSharePoint === report.id}
                                onClick={() => handleUploadToSharePoint(report)}
                              >
                                {uploadingToSharePoint === report.id ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4 mr-2" />
                                )}
                                {(report as any).sharepoint_url ? "Update on SharePoint" : "Upload to SharePoint"}
                              </DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setReportToDelete(report);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Report
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* All report types (BS5839, ASD, Disabled-refuge, Work/job) now
          navigate to wizard routes from handleViewReport — no dialogs. */}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete report{" "}
              <strong>{reportToDelete?.report_number || "this report"}</strong>?
              <br /><br />
              This action cannot be undone. The report number will be recycled and reused for the next report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteReport}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete Report"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unlock Report Dialog */}
      <Dialog open={unlockDialogOpen} onOpenChange={(open) => {
        setUnlockDialogOpen(open);
        if (!open) {
          setReportToUnlock(null);
          setUnlockReason("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock Report for Editing</DialogTitle>
            <DialogDescription>
              You are about to unlock report{" "}
              <strong>{reportToUnlock?.report_number || "this report"}</strong>.
              This action will be logged for compliance purposes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="unlock-reason">Reason for unlocking *</Label>
              <Textarea
                id="unlock-reason"
                placeholder="Enter reason for unlocking this completed report..."
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This reason will be recorded in the audit log.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUnlockDialogOpen(false);
                setReportToUnlock(null);
                setUnlockReason("");
              }}
              disabled={unlocking}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUnlockReport}
              disabled={unlocking || !unlockReason.trim()}
            >
              {unlocking ? "Unlocking..." : "Unlock Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Invoice Dialog */}
      {reportToInvoice && invoiceCustomerInfo && invoiceSiteInfo && (
        <CustomerCreateInvoiceDialog
          open={invoiceDialogOpen}
          onOpenChange={(open) => {
            setInvoiceDialogOpen(open);
            if (!open) {
              setReportToInvoice(null);
              setInvoiceCustomerInfo(null);
              setInvoiceSiteInfo(null);
            }
          }}
          customerId={invoiceCustomerInfo.id}
          customerName={invoiceCustomerInfo.name}
          xeroContactId={invoiceCustomerInfo.xeroContactId}
          sites={[invoiceSiteInfo]}
          onSuccess={() => {
            handleInvoicedToggle(reportToInvoice.id, true);
          }}
          jobReportData={{
            jobType: reportToInvoice.visits?.visit_type || "",
            reportDate: reportToInvoice.report_date,
            reportNumber: reportToInvoice.report_number || undefined,
            poNumber: (() => {
              try {
                const notes = reportToInvoice.notes ? JSON.parse(reportToInvoice.notes) : null;
                return notes?.contractPoNumber || reportToInvoice.visits?.client_po_number || undefined;
              } catch { return undefined; }
            })(),
            unitPrice: (() => {
              try {
                const notes = reportToInvoice.notes ? JSON.parse(reportToInvoice.notes) : null;
                return notes?.contractUnitPrice || undefined;
              } catch { return undefined; }
            })(),
            siteName: invoiceSiteInfo.name,
            jobDescription: reportToInvoice.work_carried_out || undefined,
            visitDate: reportToInvoice.visits?.visit_date || reportToInvoice.report_date,
            materials: (() => {
              try {
                const notes = reportToInvoice.notes ? JSON.parse(reportToInvoice.notes) : null;
                return notes?.materials?.filter((m: any) => m.name && m.name.trim()) || [];
              } catch { return []; }
            })(),
          }}
        />
      )}

      {/* Email Report Dialog */}
      {reportToEmail && emailRecipientInfo && (
        <EmailReportDialog
          open={emailDialogOpen}
          onOpenChange={(open) => {
            setEmailDialogOpen(open);
            if (!open) {
              setReportToEmail(null);
              setEmailRecipientInfo(null);
            }
          }}
          defaultEmail={emailRecipientInfo.email}
          defaultRecipients={emailRecipientInfo.recipients}
          customerName={emailRecipientInfo.customerName}
          customerId={emailRecipientInfo.customerId}
          siteId={reportToEmail.site_id}
          visitId={reportToEmail.visit_id}
          reportId={reportToEmail.id}
          siteName={reportToEmail.sites?.name || ""}
          reportNumber={reportToEmail.report_number || ""}
          reportDate={reportToEmail.report_date}
          companyName={companySettings?.company_name}
          logoUrl={companySettings?.report_logo_url || companySettings?.company_logo_url}
          generatePdfBase64={generateReportPdfBase64}
        />
      )}

      {/* Generate Quotation Dialog */}
      {reportForQuotation && (
        <GenerateQuotationDialog
          open={quotationDialogOpen}
          onOpenChange={(open) => {
            setQuotationDialogOpen(open);
            if (!open) {
              setReportForQuotation(null);
            }
          }}
          report={{
            id: reportForQuotation.id,
            report_number: reportForQuotation.report_number || "",
            site_id: reportForQuotation.site_id,
            visit_id: reportForQuotation.visit_id,
            notes: reportForQuotation.notes,
            defects: reportForQuotation.defects_found,
            recommendations: reportForQuotation.recommendations,
            sites: reportForQuotation.sites,
            visits: reportForQuotation.visits,
          }}
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

      <ChangeReportSiteDialog
        open={!!changeSiteTarget}
        onOpenChange={(open) => { if (!open) setChangeSiteTarget(null); }}
        reportKind={changeSiteTarget?.kind ?? "service"}
        reportId={changeSiteTarget?.id ?? null}
        currentSiteId={changeSiteTarget?.siteId ?? null}
        currentSiteName={changeSiteTarget?.siteName ?? null}
        onSuccess={fetchReports}
      />
    </DashboardLayout>
  );
};

export default Reports;

/* --------------------------------------------------------------------- */
/* C&E + Audibility report row                                            */
/* --------------------------------------------------------------------- */
function CauseEffectReportRow({
  report,
  navigate,
  onChangeSite,
}: {
  report: CeReportRow;
  navigate: ReturnType<typeof useNavigate>;
  onChangeSite: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const status = statusConfig[report.status ?? "draft"] || statusConfig.draft;

  const handleOpen = () => {
    if (!report.visit_id) {
      toast.error("This C&E report isn't linked to a visit — open from the visit instead.");
      return;
    }
    navigate(`/dashboard/visits/${report.visit_id}/cause-effect-test/capture`);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const bundle = await loadCauseEffectReportBundle(report.id);
      await generateCauseEffectReportPDF(bundle);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate PDF";
      toast.error(`Couldn't generate C&E PDF: ${msg}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 hover:bg-muted/30 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-secondary/10">
            <Volume2 className="w-6 h-6 text-secondary" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground truncate">
                {report.sites?.name || "Unknown Site"}
              </h3>
              <Badge variant="secondary" className="text-xs">Cause &amp; Effect</Badge>
              <Badge variant="outline" className={status.className}>{status.label}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {report.report_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(report.report_date), "MMM d, yyyy")}
                </span>
              )}
              {report.visits && (
                <span className="capitalize">{report.visits.visit_type.replace(/_/g, " ")}</span>
              )}
              {report.engineer_name && <span>Engineer: {report.engineer_name}</span>}
              {report.report_number && <span>#{report.report_number}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2 sm:px-3"
            onClick={() => navigate(`/dashboard/sites/${report.site_id}`)}
            aria-label="View site"
          >
            <Building2 className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Site</span>
          </Button>
          <Button variant="outline" size="sm" className="h-9 flex-1 sm:flex-initial" onClick={handleDownload} disabled={downloading}>
            {downloading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />}
            View Report
          </Button>
          <Button variant="ghost" size="sm" className="h-9 px-2 sm:px-3" onClick={handleOpen} aria-label="Open report">
            <FilePen className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">Open</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="More actions">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onChangeSite}>
                <Building2 className="w-4 h-4 mr-2" />
                Change Site / Customer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

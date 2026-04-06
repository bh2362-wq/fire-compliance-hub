import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Calendar, Building2, Eye, GitCompare, FileText, ClipboardCheck, Trash2, Loader2, Pencil, Mail, MoreVertical, CalendarPlus, CalendarDays, XCircle, Package, Send, RotateCcw, ArrowRight, CheckSquare, Truck, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Visit } from "@/hooks/useVisits";
import { CreateInvoiceDialog } from "@/components/xero/CreateInvoiceDialog";
import { ServiceReportDialog } from "@/components/reports/ServiceReportDialog";
import { WorkReportDialog } from "@/components/reports/WorkReportDialog";
import { ASDReportDialog } from "@/components/reports/ASDReportDialog";
import { DisabledRefugeReportDialog } from "@/components/reports/DisabledRefugeReportDialog";
import { ReportTypeSelector } from "@/components/reports/ReportTypeSelector";
import { ReportPreviewDialog } from "@/components/reports/ReportPreviewDialog";
import { SmokeSprayEstimate } from "./SmokeSprayEstimate";
import VisitEditDialog from "./VisitEditDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmailReportDialog } from "@/components/reports/EmailReportDialog";
import { getCompanySettings } from "@/services/companySettingsService";
import { VisitRequirementsDialog } from "./VisitRequirementsDialog";
import { VisitRequirementsBadges } from "./VisitRequirementsBadges";
import { SendVisitConfirmationDialog } from "./SendVisitConfirmationDialog";
import { BulkEmailJobsDialog } from "./BulkEmailJobsDialog";
import { getVisitTypeLabel } from "@/constants/visitTypes";
import JobProgressTracker from "./JobProgressTracker";
import PurchaseOrderFormDialog from "@/components/purchase-orders/PurchaseOrderFormDialog";
import { fetchActiveSubcontractors, Subcontractor } from "@/services/subcontractorService";
import { ReassignVisitDialog } from "./ReassignVisitDialog";
import { MergeSitesDialog } from "@/components/sites/MergeSitesDialog";

interface ASDAsset {
  id: string;
  item_name: string;
  manufacturer?: string | null;
  model?: string | null;
  location?: string | null;
}

interface DisabledRefugeAsset {
  id: string;
  item_name: string;
  manufacturer?: string | null;
  model?: string | null;
  location?: string | null;
}

interface InvoiceInfo {
  xero_invoice_number: string | null;
  status: string | null;
}

interface ReportInfo {
  id: string | null;
  report_number: string | null;
  status: string | null;
  report_date: string | null;
}

interface VisitsTableProps {
  visits: Visit[];
  loading: boolean;
  onRefresh?: () => void;
  initialEditVisitId?: string;
  onInitialVisitOpened?: () => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  confirmed: {
    label: "Confirmed — Awaiting Scheduling",
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  },
  completed: {
    label: "Completed",
    className: "bg-success/10 text-success border-success/20",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  pending_review: {
    label: "Pending Review",
    className: "bg-accent/10 text-accent border-accent/20",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  invoiced: {
    label: "Invoiced",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  on_hold: {
    label: "On Hold",
    className: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  },
  awaiting_parts: {
    label: "Awaiting Parts",
    className: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  },
  further_works_required: {
    label: "Further Works Required",
    className: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  },
  quote_needed: {
    label: "Quote Needed",
    className: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  },
  awaiting_po: {
    label: "Awaiting PO",
    className: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  },
};

const CHANGEABLE_STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'awaiting_parts', label: 'Awaiting Parts' },
  { value: 'further_works_required', label: 'Further Works Required' },
  { value: 'quote_needed', label: 'Quote Needed' },
  { value: 'awaiting_po', label: 'Awaiting PO' },
  { value: 'awaiting_scheduling', label: 'Awaiting Scheduling' },
];

// Group order for sub-list sections
const STATUS_GROUP_ORDER = [
  'confirmed',
  'in_progress',
  'scheduled',
  'on_hold',
  'awaiting_parts',
  'further_works_required',
  'quote_needed',
  'awaiting_po',
  'awaiting_scheduling',
  'pending_review',
];

const VisitsTable = ({ visits, loading, onRefresh, initialEditVisitId, onInitialVisitOpened }: VisitsTableProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [invoiceVisit, setInvoiceVisit] = useState<Visit | null>(null);
  const [invoiceContactId, setInvoiceContactId] = useState<string | null>(null);
  const [reportVisit, setReportVisit] = useState<Visit | null>(null);
  const [previewVisit, setPreviewVisit] = useState<Visit | null>(null);
  const [showReportTypeSelector, setShowReportTypeSelector] = useState(false);
  const [reportType, setReportType] = useState<"bs5839" | "work" | "asd" | "disabled_refuge" | null>(null);
  const [selectedAsdAssets, setSelectedAsdAssets] = useState<ASDAsset[]>([]);
  const [selectedDisabledRefugeAssets, setSelectedDisabledRefugeAssets] = useState<DisabledRefugeAsset[]>([]);
  const [editVisit, setEditVisit] = useState<Visit | null>(null);
  const [deleteVisit, setDeleteVisit] = useState<Visit | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [initialVisitHandled, setInitialVisitHandled] = useState(false);
  const [invoiceMap, setInvoiceMap] = useState<Record<string, InvoiceInfo>>({});
  const [reportMap, setReportMap] = useState<Record<string, ReportInfo>>({});
  const [requirementsVisit, setRequirementsVisit] = useState<Visit | null>(null);
  const [requirementsRefreshKey, setRequirementsRefreshKey] = useState(0);
  const [confirmationVisit, setConfirmationVisit] = useState<Visit | null>(null);
  const [selectedVisitIds, setSelectedVisitIds] = useState<Set<string>>(new Set());
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const [subcontractorPOVisit, setSubcontractorPOVisit] = useState<Visit | null>(null);
  const [subcontractorPOPrefill, setSubcontractorPOPrefill] = useState<{
    supplierName?: string;
    reference?: string;
    notes?: string;
    lineItems?: { description: string; quantity: number; unit_price: number }[];
  } | null>(null);

  const [reassignVisit, setReassignVisit] = useState<Visit | null>(null);
  const [mergeSitesOpen, setMergeSitesOpen] = useState(false);
  const [emailVisit, setEmailVisit] = useState<Visit | null>(null);
  const [emailVisitData, setEmailVisitData] = useState<{
    defaultEmail: string;
    defaultRecipients: string;
    customerName: string;
    customerId?: string;
    siteId?: string;
    reportId?: string;
    siteName: string;
    reportNumber: string;
    reportDate: string;
    companyName: string;
    logoUrl?: string;
    generatePdfBase64: () => Promise<string>;
  } | null>(null);

  // Fetch invoice status and report numbers for all visits
  useEffect(() => {
    const fetchVisitInfo = async () => {
      if (visits.length === 0) return;
      
      const visitIds = visits.map(v => v.id);
      
      // Fetch invoices and reports in parallel
      const [invoicesResult, reportsResult] = await Promise.all([
        supabase
          .from("xero_invoices")
          .select("visit_id, xero_invoice_number, status")
          .in("visit_id", visitIds),
        supabase
          .from("service_reports")
          .select("visit_id, report_number, id, status, report_date")
          .in("visit_id", visitIds)
      ]);

      if (invoicesResult.data) {
        const map: Record<string, InvoiceInfo> = {};
        invoicesResult.data.forEach((inv) => {
          map[inv.visit_id] = {
            xero_invoice_number: inv.xero_invoice_number,
            status: inv.status,
          };
        });
        setInvoiceMap(map);
      }

      if (reportsResult.data) {
        const map: Record<string, ReportInfo> = {};
        reportsResult.data.forEach((rep) => {
          // Include all reports; prefer ones with report_number if multiple exist
          if (!map[rep.visit_id] || rep.report_number) {
            map[rep.visit_id] = {
              id: rep.id,
              report_number: rep.report_number,
              status: rep.status,
              report_date: rep.report_date,
            };
          }
        });
        setReportMap(map);
      }
    };

    fetchVisitInfo();
  }, [visits]);

  // Auto-open edit dialog for initial visit ID from URL
  useEffect(() => {
    if (initialEditVisitId && !initialVisitHandled && visits.length > 0) {
      const visitToEdit = visits.find(v => v.id === initialEditVisitId);
      if (visitToEdit) {
        setEditVisit(visitToEdit);
        setInitialVisitHandled(true);
        onInitialVisitOpened?.();
      }
    }
  }, [initialEditVisitId, visits, initialVisitHandled, onInitialVisitOpened]);

  const handleDeleteVisit = async () => {
    if (!deleteVisit) return;
    
    setDeleting(true);
    try {
      // Check if visit has linked invoice
      const hasInvoice = !!invoiceMap[deleteVisit.id];
      if (hasInvoice) {
        toast({
          title: "Cannot delete visit",
          description: "This visit has a linked invoice. Delete or void the invoice in Xero first.",
          variant: "destructive",
        });
        setDeleteVisit(null);
        setDeleting(false);
        return;
      }

      // Build the SharePoint folder path to delete
      const shortId = deleteVisit.id.substring(0, 8);
      const visitDate = deleteVisit.visit_date?.replace(/-/g, "") || "";
      const visitType = deleteVisit.visit_type || "visit";

      // Get site info for SharePoint path
      let spFolderPath = "";
      if (deleteVisit.site_id) {
        const { data: siteData } = await supabase
          .from("sites")
          .select("name, address, customer_id, sharepoint_folder")
          .eq("id", deleteVisit.site_id)
          .single();

        if (siteData?.sharepoint_folder) {
          spFolderPath = `${siteData.sharepoint_folder}/Reports/${visitType}_${visitDate}_${shortId}`;
        } else if (siteData) {
          const sanitize = (name: string) =>
            name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
          let customerName = "";
          if (siteData.customer_id) {
            const { data: custData } = await supabase
              .from("customers")
              .select("name")
              .eq("id", siteData.customer_id)
              .single();
            customerName = custData?.name || "";
          }
          const sName = sanitize(siteData.name);
          const sAddr = siteData.address ? ` (${sanitize(siteData.address)})` : "";
          const basePath = customerName
            ? `Customers/${sanitize(customerName)}/${sName}${sAddr}`
            : `Sites/${sName}${sAddr}`;
          spFolderPath = `${basePath}/Reports/${visitType}_${visitDate}_${shortId}`;
        }
      }

      // Delete SharePoint folder (fire-and-forget, don't block deletion)
      if (spFolderPath) {
        supabase.functions.invoke("sharepoint-delete-folder", {
          body: { folderPath: spFolderPath },
        }).then(({ data, error: spError }) => {
          if (spError) {
            console.warn("SharePoint folder deletion failed:", spError);
          } else {
            console.log("SharePoint folder deleted:", data?.deletedPath);
          }
        }).catch((err: unknown) => {
          console.warn("SharePoint folder deletion skipped:", err);
        });
      }

      // Delete all linked records in dependency order before deleting the visit

      // 1. Delete parsed_device_tests linked to file_uploads for this visit
      const { data: uploads } = await supabase
        .from("file_uploads")
        .select("id")
        .eq("visit_id", deleteVisit.id);
      if (uploads && uploads.length > 0) {
        await supabase.from("parsed_device_tests").delete().in("upload_id", uploads.map(u => u.id));
      }

      // 2. Delete issues
      await supabase.from("issues").delete().eq("visit_id", deleteVisit.id);

      // 3. Delete customer form submissions
      await supabase.from("customer_form_submissions").delete().eq("visit_id", deleteVisit.id);

      // 4. Delete email logs
      await supabase.from("email_logs").delete().eq("visit_id", deleteVisit.id);

      // 5. Delete file uploads
      await supabase.from("file_uploads").delete().eq("visit_id", deleteVisit.id);

      // 6. Delete linked appointments
      await supabase.from("appointments").delete().eq("visit_id", deleteVisit.id);

      // 7. Delete service reports
      await supabase.from("service_reports").delete().eq("visit_id", deleteVisit.id);

      // 8. Delete RAMS documents (auto-generated on visit creation)
      await supabase.from("rams_documents").delete().eq("visit_id", deleteVisit.id);

      // 9. Delete visit requirements
      await supabase.from("visit_requirements").delete().eq("visit_id", deleteVisit.id);

      // 10. Delete subcontractor sheets
      await supabase.from("visit_subcontractor_sheets").delete().eq("visit_id", deleteVisit.id);

      // 11. Delete linked quotations
      await supabase.from("quotations").delete().eq("visit_id", deleteVisit.id);

      // 12. Delete QMS NCRs and feedback
      await supabase.from("qms_ncrs").delete().eq("visit_id", deleteVisit.id);
      await supabase.from("qms_feedback").delete().eq("visit_id", deleteVisit.id);
      const { error } = await supabase
        .from("visits")
        .delete()
        .eq("id", deleteVisit.id);

      if (error) {
        // Check for foreign key constraint error
        if (error.code === "23503") {
          toast({
            title: "Cannot delete visit",
            description: "This visit has linked records (invoice or reports). Remove them first.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "Visit deleted",
          description: "The visit and its SharePoint folder have been removed.",
        });
        onRefresh?.();
      }
      
      setDeleteVisit(null);
    } catch (error) {
      console.error("Error deleting visit:", error);
      toast({
        title: "Error",
        description: "Failed to delete visit. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleEmailReport = async (visit: Visit) => {
    try {
      const reportInfo = reportMap[visit.id];
      if (!reportInfo?.id) return;

      // Fetch site + customer + company info in parallel
      const [siteResult, settingsResult, reportResult] = await Promise.all([
        supabase
          .from("sites")
          .select("id, name, address, city, postcode, contact_name, contact_email, contact_phone, customer_id, customers(id, name, contact_email, email_recipients)")
          .eq("id", visit.site_id)
          .maybeSingle(),
        getCompanySettings().catch(() => null),
        supabase
          .from("service_reports")
          .select("id, report_number, report_date, notes")
          .eq("id", reportInfo.id)
          .maybeSingle(),
      ]);

      const site = siteResult.data;
      const customer = site?.customers as { id: string; name: string; contact_email: string | null; email_recipients: string | null } | null;
      const report = reportResult.data;

      if (!site || !report) {
        toast({ title: "Error", description: "Could not load report data", variant: "destructive" });
        return;
      }

      const compName = settingsResult?.company_name || "BHO Fire Ltd";
      const logo = settingsResult?.report_logo_url || settingsResult?.company_logo_url || undefined;
      const reportDate = report.report_date || visit.visit_date;

      // Detect report type from notes
      let detectedType: "work" | "asd" | "disabled_refuge" | "bs5839" = "bs5839";
      try {
        const parsed = JSON.parse(report.notes || "{}");
        if (parsed.report_type === "asd") detectedType = "asd";
        else if (parsed.report_type === "disabled_refuge") detectedType = "disabled_refuge";
        else if (typeof parsed.jobNumber !== "undefined" || typeof parsed.jobType !== "undefined") detectedType = "work";
      } catch {
        if ((report.report_number || "").startsWith("JOB-")) detectedType = "work";
      }

      const generatePdfBase64 = async (): Promise<string> => {
        const { generateWorkReportPDF, generateASDReportPDF, generateServiceReportPDF, generateDisabledRefugeReportPDF } = await import("@/lib/pdfGenerator");
        
        // Re-fetch full report
        const { data: fullReport } = await supabase
          .from("service_reports")
          .select("*")
          .eq("id", reportInfo.id!)
          .single();
        
        if (!fullReport) throw new Error("Report not found");

        let parsedNotes: Record<string, unknown> = {};
        try {
          if (fullReport.notes) parsedNotes = JSON.parse(fullReport.notes);
        } catch { /* ignore */ }

        const siteData = {
          name: site.name,
          address: site.address || "",
          city: site.city || "",
          postcode: site.postcode || "",
          contact_name: site.contact_name || "",
          contact_phone: site.contact_phone || "",
        };

        if (detectedType === "asd") {
          const units = (parsedNotes.units as unknown[]) || [];
          const base64 = generateASDReportPDF(
            {
              reportNumber: fullReport.report_number || "",
              reportDate: fullReport.report_date,
              engineerName: fullReport.engineer_name || "",
              clientName: fullReport.client_name || "",
              units: units as any[],
              systemCondition: fullReport.system_condition || "",
              defectsFound: fullReport.defects_found || "",
              recommendations: fullReport.recommendations || "",
              workCarriedOut: fullReport.work_carried_out || "",
              partsUsed: fullReport.parts_used || "",
              notes: (parsedNotes.additional_notes as string) || "",
              engineerSignature: fullReport.engineer_signature || (parsedNotes.engineerSignature as string) || "",
              engineerSignDate: (parsedNotes.engineerSignDate as string) || "",
              engineerSignTime: (parsedNotes.engineerSignTime as string) || "",
              customerNotPresent: (parsedNotes.customerNotPresent as boolean) || false,
              customerSignature: fullReport.client_signature || (parsedNotes.customerSignature as string) || "",
              customerSignDate: (parsedNotes.customerSignDate as string) || "",
              customerSignTime: (parsedNotes.customerSignTime as string) || "",
            },
            siteData,
            reportDate,
            visit.visit_type,
            true
          );
          if (typeof base64 === "string") return base64;
          throw new Error("Failed to generate ASD PDF");
        }

        if (detectedType === "disabled_refuge") {
          const units = (parsedNotes.units as unknown[]) || [];
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
              notes: (parsedNotes.additional_notes as string) || "",
              engineerSignature: fullReport.engineer_signature || (parsedNotes.engineerSignature as string) || "",
              engineerSignDate: (parsedNotes.engineerSignDate as string) || "",
              engineerSignTime: (parsedNotes.engineerSignTime as string) || "",
              customerNotPresent: (parsedNotes.customerNotPresent as boolean) || false,
              customerSignature: fullReport.client_signature || (parsedNotes.customerSignature as string) || "",
              customerSignDate: (parsedNotes.customerSignDate as string) || "",
              customerSignTime: (parsedNotes.customerSignTime as string) || "",
            },
            siteData,
            reportDate,
            visit.visit_type || "EVC Service",
            true
          );
          if (typeof base64 === "string") return base64;
          throw new Error("Failed to generate Disabled Refuge PDF");
        }

        if (detectedType === "work") {
          const workDays = (parsedNotes.workDays as Array<{ date: string; startTime: string; finishTime: string; duration: string }>) || [];
          const pdfData = {
            certificateNo: fullReport.report_number || "",
            jobNumber: (parsedNotes.jobNumber as string) || "",
            jobType: (parsedNotes.jobType as string) || "",
            appointmentDate: (parsedNotes.appointmentDate as string) || undefined,
            systemStatusArrival: (parsedNotes.systemStatusArrival as string) || "",
            systemStatusDeparture: (parsedNotes.systemStatusDeparture as string) || "",
            workCompleted: (parsedNotes.workCompleted as boolean) || fullReport.status === "completed" || fullReport.status === "locked",
            returnRequired: (parsedNotes.returnRequired as boolean) || false,
            surveyRequired: (parsedNotes.surveyRequired as boolean) || false,
            quotationRequired: (parsedNotes.quotationRequired as boolean) || false,
            ramsCompleted: (parsedNotes.ramsCompleted as boolean) || false,
            logBookEntry: (parsedNotes.logBookEntry as boolean) || false,
            worksReport: fullReport.work_carried_out || "",
            furtherAction: fullReport.recommendations || "",
            numEngineers: (parsedNotes.numEngineers as number) || 1,
            workDays: workDays.length > 0 ? workDays : undefined,
            totalHours: (parsedNotes.totalHours as string) || undefined,
            startTime: (parsedNotes.startTime as string) || "",
            finishTime: (parsedNotes.finishTime as string) || "",
            travelTime: (parsedNotes.travelTime as string) || "",
            duration: (parsedNotes.duration as string) || "",
            materials: (parsedNotes.materials as Array<{ name: string; qty: string; cost: string }>) || [],
            photos: (parsedNotes.photos as Array<{ url: string; caption: string }>) || [],
            engineerName: fullReport.engineer_name || "",
            engineerSignature: fullReport.engineer_signature || (parsedNotes.engineerSignature as string) || undefined,
            engineerSignDate: (parsedNotes.engineerSignDate as string) || undefined,
            engineerSignTime: (parsedNotes.engineerSignTime as string) || undefined,
            customerNotPresent: (parsedNotes.customerNotPresent as boolean) || false,
            customerName: fullReport.client_name || "",
            customerSignature: fullReport.client_signature || (parsedNotes.customerSignature as string) || undefined,
            customerSignDate: (parsedNotes.customerSignDate as string) || undefined,
            customerSignTime: (parsedNotes.customerSignTime as string) || undefined,
          };
          const result = await generateWorkReportPDF(pdfData, siteData, reportDate, visit.visit_type, true);
          if (typeof result === "string") return result;
          throw new Error("Failed to generate Work Report PDF");
        }

        // BS5839 Service Report
        let signatures = {};
        let panels = undefined;
        try {
          signatures = {
            engineerSignature: fullReport.engineer_signature || (parsedNotes.engineerSignature as string) || "",
            engineerSignDate: (parsedNotes.engineerSignDate as string) || "",
            engineerSignTime: (parsedNotes.engineerSignTime as string) || "",
            customerNotPresent: (parsedNotes.customerNotPresent as boolean) || false,
            customerSignature: fullReport.client_signature || (parsedNotes.customerSignature as string) || "",
            customerSignDate: (parsedNotes.customerSignDate as string) || "",
            customerSignTime: (parsedNotes.customerSignTime as string) || "",
          };
          if ((parsedNotes.multi_panel as boolean) && Array.isArray(parsedNotes.panel_checklists)) {
            panels = parsedNotes.panel_checklists as any[];
          }
        } catch { /* ignore */ }

        const base64 = generateServiceReportPDF(
          fullReport as any,
          siteData,
          { visit_type: visit.visit_type, visit_date: visit.visit_date },
          panels,
          signatures,
          true
        );
        if (typeof base64 === "string") return base64;
        throw new Error("Failed to generate Service Report PDF");
      };

      setEmailVisitData({
        defaultEmail: site.contact_email || customer?.contact_email || "",
        defaultRecipients: customer?.email_recipients || "",
        customerName: customer?.name || "",
        customerId: customer?.id,
        siteId: site.id,
        reportId: report.id,
        siteName: site.name,
        reportNumber: report.report_number || "",
        reportDate: format(new Date(reportDate), "dd-MM-yyyy"),
        companyName: compName,
        logoUrl: logo,
        generatePdfBase64,
      });
      setEmailVisit(visit);
    } catch (error) {
      console.error("Failed to prepare email:", error);
      toast({ title: "Error", description: "Failed to prepare email", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border">
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/50 border-b border-border">
          <div className="col-span-3"><Skeleton className="h-4 w-16" /></div>
          <div className="col-span-3"><Skeleton className="h-4 w-20" /></div>
          <div className="col-span-2"><Skeleton className="h-4 w-16" /></div>
          <div className="col-span-2"><Skeleton className="h-4 w-16" /></div>
          <div className="col-span-2"><Skeleton className="h-4 w-16" /></div>
        </div>
        <div className="divide-y divide-border">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="grid grid-cols-12 gap-4 px-6 py-4">
              <div className="col-span-3"><Skeleton className="h-12 w-full" /></div>
              <div className="col-span-3"><Skeleton className="h-12 w-full" /></div>
              <div className="col-span-2"><Skeleton className="h-8 w-full" /></div>
              <div className="col-span-2"><Skeleton className="h-8 w-full" /></div>
              <div className="col-span-2"><Skeleton className="h-8 w-full" /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state is handled after invoice filtering below

  // Separate invoiced/completed and active visits
  // A visit is considered invoiced if it has a xero_invoices record OR its status is 'invoiced'
  // Completed visits are also removed from the active list (they live in Reports)
  const invoicedVisits = visits.filter(v => !!invoiceMap[v.id] || v.status === 'invoiced');
  // Sort confirmed visits to the top, then by date
  const statusPriority: Record<string, number> = { confirmed: 0, scheduled: 1, in_progress: 2, pending_review: 3 };
  const activeVisits = visits
    .filter(v => !invoiceMap[v.id] && v.status !== 'invoiced' && v.status !== 'completed' && v.status !== 'cancelled')
    .sort((a, b) => {
      const pa = statusPriority[a.status || ''] ?? 99;
      const pb = statusPriority[b.status || ''] ?? 99;
      if (pa !== pb) return pa - pb;
      return 0; // preserve existing date order within same priority
    });

  // Helper to render a visit row
  const renderVisitRow = (visit: Visit, isInvoiced: boolean = false) => {
    const invoiceInfo = invoiceMap[visit.id];
    const reportInfo = reportMap[visit.id];
    const displayStatus = isInvoiced 
      ? statusConfig.invoiced 
      : statusConfig[visit.status || "in_progress"] || statusConfig.in_progress;
    
    const coverage = Number(visit.coverage_percentage) || 0;

    // Parse notes for asset type
    let assetBadge: React.ReactNode = null;
    let notesPreview = "";
    try {
      const parsed = JSON.parse(visit.notes || "{}");
      notesPreview = parsed.user_notes || "";
      const assetType = parsed.asset_type;
      if (assetType && assetType !== "general") {
        const assetLabels: Record<string, { label: string; className: string }> = {
          fire_panel: { label: "Fire", className: "bg-red-500/10 text-red-600 border-red-500/20" },
          fire: { label: "Fire", className: "bg-red-500/10 text-red-600 border-red-500/20" },
          asd: { label: "ASD", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
          aspirator: { label: "ASD", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
          disabled_refuge: { label: "DR", className: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
          intruder_alarm: { label: "Intruder", className: "bg-slate-500/10 text-slate-600 border-slate-500/20" },
          nurse_call: { label: "Nurse", className: "bg-teal-500/10 text-teal-600 border-teal-500/20" },
          gas_suppression: { label: "Gas", className: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20" },
          room_integrity: { label: "Room Int.", className: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" },
        };
        const config = assetLabels[assetType] || { label: assetType.replace(/_/g, " "), className: "bg-muted/50 text-muted-foreground border-border" };
        assetBadge = (
          <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 ${config.className}`}>
            {config.label}
          </Badge>
        );
      }
    } catch { /* ignore */ }

    return (
      <tr
        key={visit.id}
        className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors text-sm"
      >
        {/* Checkbox */}
        <td className="px-2 py-1.5 w-8">
          <Checkbox
            checked={selectedVisitIds.has(visit.id)}
            onCheckedChange={(checked) => {
              setSelectedVisitIds((prev) => {
                const next = new Set(prev);
                if (checked) next.add(visit.id);
                else next.delete(visit.id);
                return next;
              });
            }}
          />
        </td>
        {/* Site */}
        <td className="px-2 py-1.5">
          <div className="min-w-0">
            <p className="font-medium text-foreground text-sm truncate max-w-[200px]">
              {visit.site?.name || "Unknown Site"}
            </p>
            {visit.site?.customer_name && (
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{visit.site.customer_name}</p>
            )}
          </div>
        </td>
        {/* Type */}
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1 flex-wrap">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/5 text-primary border-primary/20">
              {getVisitTypeLabel(visit.visit_type)}
            </Badge>
            {assetBadge}
          </div>
        </td>
        {/* Date */}
        <td className="px-2 py-1.5 text-xs text-foreground whitespace-nowrap">
          {format(new Date(visit.visit_date), "dd MMM yy")}
        </td>
        {/* Status */}
        <td className="px-2 py-1.5">
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${displayStatus.className}`}>
            {isInvoiced && invoiceInfo?.xero_invoice_number 
              ? `#${invoiceInfo.xero_invoice_number}` 
              : displayStatus.label}
          </Badge>
        </td>
        {/* Report */}
        <td className="px-2 py-1.5 text-xs text-muted-foreground">
          {reportInfo?.report_number || "—"}
        </td>
        {/* Devices */}
        <td className="px-2 py-1.5 text-xs text-foreground whitespace-nowrap">
          {visit.devices_tested || 0}/{visit.total_devices || 0}
          {(visit.issues_count || 0) > 0 && (
            <span className="text-destructive ml-1">({visit.issues_count})</span>
          )}
        </td>
        {/* Coverage */}
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  coverage >= 95 ? "bg-success" : coverage >= 80 ? "bg-warning" : "bg-destructive"
                }`}
                style={{ width: `${coverage}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground w-7">{coverage}%</span>
          </div>
        </td>
        {/* Cost */}
        <td className="px-2 py-1.5">
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="—"
            className="w-16 bg-transparent border border-border rounded px-1.5 py-0.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            defaultValue={visit.quoted_price ?? ""}
            onBlur={async (e) => {
              const val = e.target.value ? parseFloat(e.target.value) : null;
              if (val === (visit.quoted_price ?? null)) return;
              const { error } = await supabase
                .from("visits")
                .update({ quoted_price: val })
                .eq("id", visit.id);
              if (error) {
                toast({ title: "Error", description: "Failed to save cost", variant: "destructive" });
              } else {
                onRefresh?.();
              }
            }}
          />
        </td>
        {/* Progress */}
        <td className="px-2 py-1.5">
          <JobProgressTracker
            status={visit.status}
            hasReport={!!reportInfo?.report_number}
            hasInvoice={isInvoiced}
            compact
          />
        </td>
        {/* Actions */}
        <td className="px-2 py-1.5">
          <div className="flex items-center justify-end gap-1">
            {!isInvoiced && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setPreviewVisit(visit)}
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Report</TooltipContent>
              </Tooltip>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate(`/dashboard/sites/${visit.site_id}`)}>
                  <Eye className="w-4 h-4 mr-2" />
                  View Site
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditVisit(visit)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit Visit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setReassignVisit(visit)}>
                  <Building2 className="w-4 h-4 mr-2" />
                  Reassign Site
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Change Status
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                      {CHANGEABLE_STATUSES.map((s) => (
                        <DropdownMenuItem
                          key={s.value}
                          disabled={visit.status === s.value}
                          onClick={async () => {
                            const { error } = await supabase
                              .from("visits")
                              .update({ status: s.value })
                              .eq("id", visit.id);
                            if (error) {
                              toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
                            } else {
                              toast({ title: "Status updated", description: `Visit set to ${s.label}` });
                              onRefresh?.();
                            }
                          }}
                        >
                          <Badge variant="outline" className={`${statusConfig[s.value]?.className || ''} mr-2 text-[10px]`}>
                            {s.label}
                          </Badge>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                {reportInfo?.status === "completed" && (
                <DropdownMenuItem onClick={() => handleEmailReport(visit)}>
                    <Mail className="w-4 h-4 mr-2" />
                    Email Customer
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setConfirmationVisit(visit)}>
                  <Send className="w-4 h-4 mr-2" />
                  Send Confirmation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRequirementsVisit(visit)}>
                  <Package className="w-4 h-4 mr-2" />
                  Job Requirements
                 </DropdownMenuItem>
                {visit.visit_type === 'subcontract' && (
                  <DropdownMenuItem onClick={async () => {
                    try {
                      const subs = await fetchActiveSubcontractors();
                      const { data: siteData } = await supabase
                        .from("sites")
                        .select("name, address, customer:customers(name)")
                        .eq("id", visit.site_id)
                        .single();
                      const siteName = siteData?.name || "";
                      const customerName = (siteData?.customer as any)?.name || "";
                      const visitLabel = getVisitTypeLabel(visit.visit_type);
                      const visitDate = format(new Date(visit.visit_date), "dd/MM/yyyy");
                      const prefill = {
                        supplierName: subs.length === 1 ? subs[0].company_name : undefined,
                        reference: `${customerName} - ${siteName} - ${visitDate}`,
                        notes: `${visitLabel} at ${siteName}\nVisit date: ${visitDate}`,
                        lineItems: [{ description: `${visitLabel} - ${siteName}`, quantity: 1, unit_price: subs.length === 1 ? (subs[0].day_rate || 0) : 0 }],
                      };
                      setSubcontractorPOPrefill(prefill);
                      setSubcontractorPOVisit(visit);
                    } catch (err) {
                      console.error("Error preparing subcontractor PO:", err);
                      toast({ title: "Error", description: "Failed to prepare PO", variant: "destructive" });
                    }
                  }}>
                    <Truck className="w-4 h-4 mr-2" />
                    Raise Subcontractor PO
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(`/dashboard/schedule`)}>
                  <CalendarDays className="w-4 h-4 mr-2" />
                  View Schedule
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  const { data: existing } = await supabase
                    .from("appointments")
                    .select("id")
                    .eq("visit_id", visit.id)
                    .maybeSingle();
                  if (existing) {
                    const { error: updateErr } = await supabase
                      .from("appointments")
                      .update({
                        appointment_date: visit.visit_date,
                        visit_type: visit.visit_type,
                        title: `${visit.visit_type} - ${visit.site?.name || "Site"}`,
                      })
                      .eq("id", existing.id);
                    if (updateErr) {
                      toast({ title: "Error", description: "Failed to update schedule", variant: "destructive" });
                    } else {
                      toast({ title: "Schedule updated", description: `Appointment moved to ${format(new Date(visit.visit_date), "MMM d, yyyy")}` });
                    }
                    await queryClient.invalidateQueries({ queryKey: ['appointments'] });
                    navigate(`/dashboard/schedule`);
                  } else {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) return;
                    const { data: siteData } = await supabase
                      .from("sites")
                      .select("customer_id")
                      .eq("id", visit.site_id)
                      .maybeSingle();
                    const { error } = await supabase.from("appointments").insert({
                      visit_id: visit.id,
                      site_id: visit.site_id,
                      customer_id: siteData?.customer_id || null,
                      title: `${visit.visit_type} - ${visit.site?.name || "Site"}`,
                      appointment_date: visit.visit_date,
                      start_time: "09:00",
                      end_time: "17:00",
                      status: "scheduled",
                      visit_type: visit.visit_type,
                      created_by: user.id,
                    });
                    if (error) {
                      toast({ title: "Error", description: "Failed to add to schedule", variant: "destructive" });
                    } else {
                      toast({ title: "Added to schedule", description: `Visit added to schedule for ${format(new Date(visit.visit_date), "MMM d, yyyy")}` });
                      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
                      navigate(`/dashboard/schedule`);
                    }
                  }
                }}>
                  <CalendarPlus className="w-4 h-4 mr-2" />
                  Add to Schedule
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {!isInvoiced && (
                  <DropdownMenuItem onClick={() => navigate(`/dashboard/reconciliation?siteId=${visit.site_id}&visitId=${visit.id}`)}>
                    <GitCompare className="w-4 h-4 mr-2" />
                    Reconcile
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={async () => {
                  const { data: siteData } = await supabase
                    .from("sites")
                    .select("customer_id")
                    .eq("id", visit.site_id)
                    .maybeSingle();
                  if (siteData?.customer_id) {
                    const { data: customerData } = await supabase
                      .from("customers")
                      .select("xero_contact_id")
                      .eq("id", siteData.customer_id)
                      .maybeSingle();
                    setInvoiceContactId(customerData?.xero_contact_id || null);
                  } else {
                    setInvoiceContactId(null);
                  }
                  setInvoiceVisit(visit);
                }}>
                  <FileText className="w-4 h-4 mr-2" />
                  {isInvoiced ? "Create Additional Invoice" : "Create Invoice"}
                </DropdownMenuItem>
                {!isInvoiced && (
                  <>
                    <DropdownMenuSeparator />
                    {visit.status !== 'cancelled' && visit.status !== 'completed' && (
                      <DropdownMenuItem
                        onClick={async () => {
                          const { error } = await supabase
                            .from("visits")
                            .update({ status: "cancelled" })
                            .eq("id", visit.id);
                          if (error) {
                            toast({ title: "Error", description: "Failed to cancel visit", variant: "destructive" });
                          } else {
                            toast({ title: "Visit cancelled", description: "The visit has been cancelled." });
                            onRefresh?.();
                          }
                        }}
                        className="text-warning focus:text-warning"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancel Visit
                      </DropdownMenuItem>
                    )}
                    {(visit.status === 'cancelled' || visit.status === 'completed') && (
                      <DropdownMenuItem
                        onClick={async () => {
                          const { error } = await supabase
                            .from("visits")
                            .update({ status: "scheduled" })
                            .eq("id", visit.id);
                          if (error) {
                            toast({ title: "Error", description: "Failed to revoke visit", variant: "destructive" });
                          } else {
                            toast({ title: "Visit revoked", description: "The visit has been returned to the active list." });
                            onRefresh?.();
                          }
                        }}
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Revoke Visit
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => setDeleteVisit(visit)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Visit
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </td>
      </tr>
    );
  };

  if (activeVisits.length === 0 && invoicedVisits.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-12 text-center">
        <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">No visits found</h3>
        <p className="text-muted-foreground">
          Select a site and create a new visit to get started.
        </p>
      </div>
    );
  }

  const selectedVisits = visits.filter((v) => selectedVisitIds.has(v.id));

  return (
    <div className="space-y-6">
      {/* Merge Sites tool */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setMergeSitesOpen(true)}>
          <GitCompare className="w-4 h-4 mr-2" />
          Merge Duplicate Sites
        </Button>
      </div>
      {/* Selection toolbar */}
      {selectedVisitIds.size > 0 && (
      <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{selectedVisitIds.size} job{selectedVisitIds.size > 1 ? "s" : ""} selected</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setSelectedVisitIds(new Set())}>
              Clear
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Change Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {CHANGEABLE_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s.value}
                    onClick={async () => {
                      const ids = Array.from(selectedVisitIds);
                      const { error } = await supabase
                        .from("visits")
                        .update({ status: s.value })
                        .in("id", ids);
                      if (error) {
                        toast({ title: "Error", description: "Failed to update statuses", variant: "destructive" });
                      } else {
                        toast({ title: "Status updated", description: `${ids.length} job(s) set to ${s.label}` });
                        setSelectedVisitIds(new Set());
                        onRefresh?.();
                      }
                    }}
                  >
                    <Badge variant="outline" className={`${statusConfig[s.value]?.className || ''} mr-2 text-[10px]`}>
                      {s.label}
                    </Badge>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => setShowBulkEmail(true)}>
              <Mail className="w-4 h-4 mr-2" />
              Email to Client
            </Button>
          </div>
        </div>
      )}

      {/* Active Visits - Grouped by Status */}
      {activeVisits.length > 0 && (() => {
        // Group visits by status
        const grouped: Record<string, Visit[]> = {};
        activeVisits.forEach((visit) => {
          const status = visit.status || 'scheduled';
          if (!grouped[status]) grouped[status] = [];
          grouped[status].push(visit);
        });

        // Sort groups by STATUS_GROUP_ORDER
        const orderedGroups = STATUS_GROUP_ORDER
          .filter((s) => grouped[s] && grouped[s].length > 0)
          .map((s) => ({ status: s, visits: grouped[s] }));

        // Add any remaining statuses not in the order
        Object.keys(grouped).forEach((s) => {
          if (!STATUS_GROUP_ORDER.includes(s) && grouped[s].length > 0) {
            orderedGroups.push({ status: s, visits: grouped[s] });
          }
        });

        return orderedGroups.map((group) => {
          const totalCost = group.visits.reduce((sum, v) => sum + (v.quoted_price || 0), 0);
          const totalDevices = group.visits.reduce((sum, v) => sum + (v.total_devices || 0), 0);
          const uniqueSites = new Set(group.visits.map(v => v.site?.name)).size;

          return (
            <Collapsible key={group.status} defaultOpen={group.status !== 'on_hold' && group.status !== 'awaiting_parts'}>
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <CollapsibleTrigger className="w-full px-6 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={statusConfig[group.status]?.className || ''}>
                      {statusConfig[group.status]?.label || group.status}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">{group.visits.length} job{group.visits.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{uniqueSites} site{uniqueSites !== 1 ? 's' : ''}</span>
                    {totalDevices > 0 && <span>{totalDevices} devices</span>}
                    {totalCost > 0 && <span>£{totalCost.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>}
                    <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="grid grid-cols-12 gap-4 px-6 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-t border-b border-border">
                    <div className="col-span-3">Site</div>
                    <div className="col-span-2">Date / Type</div>
                    <div className="col-span-1">Devices</div>
                    <div className="col-span-1">Coverage</div>
                    <div className="col-span-1">Cost</div>
                    <div className="col-span-2">Smoke Spray</div>
                    <div className="col-span-2">Actions</div>
                  </div>
                  <div className="divide-y divide-border">
                    {group.visits.map((visit) => renderVisitRow(visit, false))}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        });
      })()}

      {activeVisits.length === 0 && invoicedVisits.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No active visits</h3>
          <p className="text-muted-foreground">
            All visits have been invoiced. Create a new visit to get started.
          </p>
        </div>
      )}

      {/* Recently Invoiced Section */}
      {invoicedVisits.length > 0 && (
        <div className="bg-card rounded-xl border border-border">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Recently Invoiced
            </h3>
            <p className="text-sm text-muted-foreground">Visits that have been invoiced</p>
          </div>
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b border-border">
            <div className="col-span-3">Site</div>
            <div className="col-span-2">Date / Invoice</div>
            <div className="col-span-2">Devices</div>
            <div className="col-span-1">Coverage</div>
            <div className="col-span-2">Smoke Spray</div>
            <div className="col-span-2">Actions</div>
          </div>
          <div className="divide-y divide-border">
            {invoicedVisits.slice(0, 5).map((visit) => renderVisitRow(visit, true))}
          </div>
          {invoicedVisits.length > 5 && (
            <div className="px-6 py-3 text-center border-t border-border">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate("/dashboard/invoices")}
              >
                View all {invoicedVisits.length} invoiced visits
              </Button>
            </div>
          )}
        </div>
      )}

      {invoiceVisit && (
        <CreateInvoiceDialog
          open={!!invoiceVisit}
          onOpenChange={(open) => {
            if (!open) {
              setInvoiceVisit(null);
              setInvoiceContactId(null);
            }
          }}
          visit={{ ...invoiceVisit, sites: invoiceVisit.site }}
          onSuccess={onRefresh}
          defaultContactId={invoiceContactId}
        />
      )}

      {previewVisit && (
        <ReportPreviewDialog
          open={!!previewVisit}
          onOpenChange={(open) => !open && setPreviewVisit(null)}
          visit={previewVisit}
          onEdit={async (existingReportType) => {
            setReportVisit(previewVisit);
            setPreviewVisit(null);
            
            // If report exists, use its type directly - skip the selector
            if (existingReportType) {
              setReportType(existingReportType);
              // If ASD, load assets
              if (existingReportType === "asd") {
                try {
                  const { data: assets } = await supabase
                    .from("site_assets")
                    .select("id, item_name, manufacturer, model, location")
                    .eq("site_id", previewVisit.site_id)
                    .eq("asset_type", "asd");
                  setSelectedAsdAssets(assets || []);
                } catch {
                  setSelectedAsdAssets([]);
                }
              } else if (existingReportType === "disabled_refuge") {
                try {
                  const { data: assets } = await supabase
                    .from("site_assets")
                    .select("id, item_name, manufacturer, model, location")
                    .eq("site_id", previewVisit.site_id)
                    .eq("asset_type", "disabled_refuge");
                  setSelectedDisabledRefugeAssets(assets || []);
                } catch {
                  setSelectedDisabledRefugeAssets([]);
                }
              }
            } else if (previewVisit.visit_type === "remedial" || previewVisit.visit_type === "emergency" || previewVisit.visit_type === "supply_only") {
              setReportType("work");
            } else {
              // Check visit notes for asset_type to auto-route
              try {
                const notes = previewVisit.notes ? JSON.parse(previewVisit.notes) : null;
                const assetType = notes?.asset_type;
                
                if (assetType === "disabled_refuge") {
                  const { data: assets } = await supabase
                    .from("site_assets")
                    .select("id, item_name, manufacturer, model, location")
                    .eq("site_id", previewVisit.site_id)
                    .eq("asset_type", "disabled_refuge");
                  
                  if (assets && assets.length > 0) {
                    setSelectedDisabledRefugeAssets(assets);
                    setReportType("disabled_refuge");
                    return;
                  }
                } else if (assetType === "asd") {
                  const { data: assets } = await supabase
                    .from("site_assets")
                    .select("id, item_name, manufacturer, model, location")
                    .eq("site_id", previewVisit.site_id)
                    .eq("asset_type", "asd");
                  
                  if (assets && assets.length > 0) {
                    setSelectedAsdAssets(assets);
                    setReportType("asd");
                    return;
                  }
                } else if (assetType === "fire_panel") {
                  setReportType("bs5839");
                  return;
                }
              } catch {
                // If notes parsing fails, fall through to selector
              }
              
              setShowReportTypeSelector(true);
            }
          }}
        />
      )}

      <ReportTypeSelector
        open={showReportTypeSelector}
        onOpenChange={setShowReportTypeSelector}
        onSelect={(type, asdAssets, disabledRefugeAssets) => {
          setReportType(type);
          if (asdAssets && asdAssets.length > 0) {
            setSelectedAsdAssets(asdAssets);
          }
          if (disabledRefugeAssets && disabledRefugeAssets.length > 0) {
            setSelectedDisabledRefugeAssets(disabledRefugeAssets);
          }
        }}
        siteId={reportVisit?.site_id}
      />

      {reportVisit && reportType === "work" && (
        <WorkReportDialog
          open={!!reportVisit && reportType === "work"}
          onOpenChange={(open) => {
            if (!open) {
              setReportVisit(null);
              setReportType(null);
            }
          }}
          visit={{ ...reportVisit, sites: reportVisit.site }}
          onSuccess={onRefresh}
        />
      )}

      {reportVisit && reportType === "bs5839" && (
        <ServiceReportDialog
          open={!!reportVisit && reportType === "bs5839"}
          onOpenChange={(open) => {
            if (!open) {
              setReportVisit(null);
              setReportType(null);
            }
          }}
          visit={{ ...reportVisit, sites: reportVisit.site }}
          onSuccess={onRefresh}
        />
      )}

      {reportVisit && reportType === "asd" && selectedAsdAssets.length > 0 && (
        <ASDReportDialog
          open={!!reportVisit && reportType === "asd"}
          onOpenChange={(open) => {
            if (!open) {
              setReportVisit(null);
              setReportType(null);
              setSelectedAsdAssets([]);
            }
          }}
          visit={{ ...reportVisit, sites: reportVisit.site }}
          assets={selectedAsdAssets}
          onSuccess={onRefresh}
        />
      )}

      {reportVisit && reportType === "disabled_refuge" && selectedDisabledRefugeAssets.length > 0 && (
        <DisabledRefugeReportDialog
          open={!!reportVisit && reportType === "disabled_refuge"}
          onOpenChange={(open) => {
            if (!open) {
              setReportVisit(null);
              setReportType(null);
              setSelectedDisabledRefugeAssets([]);
            }
          }}
          visit={{ ...reportVisit, sites: reportVisit.site }}
          assets={selectedDisabledRefugeAssets}
          onSuccess={onRefresh}
        />
      )}

      {editVisit && (
        <VisitEditDialog
          visit={editVisit}
          open={!!editVisit}
          onOpenChange={(open) => !open && setEditVisit(null)}
          onSuccess={onRefresh}
        />
      )}

      <AlertDialog open={!!deleteVisit} onOpenChange={(open) => !open && setDeleteVisit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Visit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this visit for{" "}
              <span className="font-medium">{deleteVisit?.site?.name}</span> on{" "}
              <span className="font-medium">
                {deleteVisit?.visit_date && format(new Date(deleteVisit.visit_date), "MMM d, yyyy")}
              </span>
              ?
              <br />
              <span className="text-destructive font-medium mt-2 block">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVisit}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Visit"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Report Dialog */}
      {emailVisit && emailVisitData && (
        <EmailReportDialog
          open={!!emailVisit}
          onOpenChange={(open) => {
            if (!open) {
              setEmailVisit(null);
              setEmailVisitData(null);
            }
          }}
          defaultEmail={emailVisitData.defaultEmail}
          defaultRecipients={emailVisitData.defaultRecipients}
          customerName={emailVisitData.customerName}
          customerId={emailVisitData.customerId}
          siteId={emailVisitData.siteId}
          visitId={emailVisit.id}
          reportId={emailVisitData.reportId}
          siteName={emailVisitData.siteName}
          reportNumber={emailVisitData.reportNumber}
          reportDate={emailVisitData.reportDate}
          companyName={emailVisitData.companyName}
          logoUrl={emailVisitData.logoUrl}
          generatePdfBase64={emailVisitData.generatePdfBase64}
        />
      )}
      {/* Visit Requirements Dialog */}
      {requirementsVisit && (
        <VisitRequirementsDialog
          open={!!requirementsVisit}
          onOpenChange={(open) => !open && setRequirementsVisit(null)}
          visitId={requirementsVisit.id}
          siteName={requirementsVisit.site?.name || "Site"}
          visitDate={format(new Date(requirementsVisit.visit_date), "MMM d, yyyy")}
          onUpdate={() => setRequirementsRefreshKey((k) => k + 1)}
        />
      )}
      {confirmationVisit && (
        <SendVisitConfirmationDialog
          open={!!confirmationVisit}
          onOpenChange={(open) => !open && setConfirmationVisit(null)}
          visit={confirmationVisit}
          onSuccess={onRefresh}
        />
      )}
      <BulkEmailJobsDialog
        open={showBulkEmail}
        onOpenChange={setShowBulkEmail}
        selectedVisits={selectedVisits}
        onSuccess={() => {
          setSelectedVisitIds(new Set());
          onRefresh?.();
        }}
      />
      {subcontractorPOVisit && (
        <PurchaseOrderFormDialog
          open={!!subcontractorPOVisit}
          onOpenChange={(open) => {
            if (!open) {
              setSubcontractorPOVisit(null);
              setSubcontractorPOPrefill(null);
            }
          }}
          onSuccess={() => {
            setSubcontractorPOVisit(null);
            setSubcontractorPOPrefill(null);
            toast({ title: "Success", description: "Subcontractor PO created" });
          }}
          prefill={subcontractorPOPrefill}
        />
      )}
      {reassignVisit && (
        <ReassignVisitDialog
          open={!!reassignVisit}
          onOpenChange={(open) => !open && setReassignVisit(null)}
          visitId={reassignVisit.id}
          currentSiteId={reassignVisit.site_id}
          currentSiteName={reassignVisit.site?.name || "Unknown Site"}
          onSuccess={onRefresh}
        />
      )}
      <MergeSitesDialog
        open={mergeSitesOpen}
        onOpenChange={setMergeSitesOpen}
        onSuccess={onRefresh}
      />
    </div>
  );
};

export default VisitsTable;

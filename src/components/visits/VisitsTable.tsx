import { useState, useEffect } from "react";
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
import { Calendar, Building2, Eye, GitCompare, FileText, ClipboardCheck, Trash2, Loader2, Pencil, Mail, MoreVertical, CalendarPlus, CalendarDays, XCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
  invoiced: {
    label: "Invoiced",
    className: "bg-primary/10 text-primary border-primary/20",
  },
};

const VisitsTable = ({ visits, loading, onRefresh, initialEditVisitId, onInitialVisitOpened }: VisitsTableProps) => {
  const navigate = useNavigate();
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

      // Delete linked appointment from schedule first
      const { error: appointmentError } = await supabase
        .from("appointments")
        .delete()
        .eq("visit_id", deleteVisit.id);

      if (appointmentError) {
        console.error("Error deleting linked appointment:", appointmentError);
      }

      // Check for linked service reports and delete them first
      const { error: reportError } = await supabase
        .from("service_reports")
        .delete()
        .eq("visit_id", deleteVisit.id);

      if (reportError) {
        console.error("Error deleting linked reports:", reportError);
      }

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
          description: "The visit has been successfully deleted.",
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
            workCompleted: (parsedNotes.workCompleted as boolean) || false,
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

  // Separate invoiced and non-invoiced visits
  // A visit is considered invoiced if it has a xero_invoices record OR its status is 'invoiced'
  const invoicedVisits = visits.filter(v => !!invoiceMap[v.id] || v.status === 'invoiced');
  const activeVisits = visits.filter(v => !invoiceMap[v.id] && v.status !== 'invoiced');

  // Helper to render a visit row
  const renderVisitRow = (visit: Visit, isInvoiced: boolean = false) => {
    const invoiceInfo = invoiceMap[visit.id];
    const reportInfo = reportMap[visit.id];
    const displayStatus = isInvoiced 
      ? statusConfig.invoiced 
      : statusConfig[visit.status || "in_progress"] || statusConfig.in_progress;
    
    const coverage = Number(visit.coverage_percentage) || 0;

    return (
      <div
        key={visit.id}
        className="grid grid-cols-12 gap-4 px-6 py-4 hover:bg-muted/30 transition-colors items-center"
      >
        <div className="col-span-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <Building2 className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">
                {visit.site?.name || "Unknown Site"}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{visit.visit_type}</span>
                {reportInfo?.report_number && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-muted/50">
                    {reportInfo.report_number}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="col-span-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm text-foreground">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              {format(new Date(visit.visit_date), "MMM d, yyyy")}
            </div>
            <Badge variant="outline" className={displayStatus.className}>
              {isInvoiced && invoiceInfo?.xero_invoice_number 
                ? `#${invoiceInfo.xero_invoice_number}` 
                : displayStatus.label}
            </Badge>
          </div>
        </div>
        <div className="col-span-2">
          <div className="space-y-1">
            <p className="text-sm text-foreground">
              {visit.devices_tested || 0} / {visit.total_devices || 0} tested
            </p>
            {(visit.issues_count || 0) > 0 && (
              <p className="text-xs text-destructive">{visit.issues_count} issues</p>
            )}
          </div>
        </div>
        <div className="col-span-1">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    coverage >= 95
                      ? "bg-success"
                      : coverage >= 80
                      ? "bg-warning"
                      : "bg-destructive"
                  }`}
                  style={{ width: `${coverage}%` }}
                />
              </div>
              <span className="text-xs font-medium text-foreground w-8">
                {coverage}%
              </span>
            </div>
          </div>
        </div>
        <div className="col-span-2">
          <SmokeSprayEstimate siteId={visit.site_id} visitType={visit.visit_type} />
        </div>
        <div className="col-span-2 flex items-center justify-end gap-2">
          {!isInvoiced && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewVisit(visit)}
            >
              <ClipboardCheck className="w-4 h-4 mr-1" />
              Report
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
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
              {reportInfo?.status === "completed" && (
                <DropdownMenuItem onClick={() => handleEmailReport(visit)}>
                  <Mail className="w-4 h-4 mr-2" />
                  Email Customer
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate(`/dashboard/schedule`)}>
                <CalendarDays className="w-4 h-4 mr-2" />
                View Schedule
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {
                // Check if appointment already exists
                const { data: existing } = await supabase
                  .from("appointments")
                  .select("id")
                  .eq("visit_id", visit.id)
                  .maybeSingle();
                
                if (existing) {
                  toast({ title: "Already scheduled", description: "This visit is already on the schedule." });
                  navigate(`/dashboard/schedule`);
                } else {
                  // Create appointment from visit
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) return;
                  
                  // Get customer_id from site
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
                    navigate(`/dashboard/schedule`);
                  }
                }
              }}>
                <CalendarPlus className="w-4 h-4 mr-2" />
                Add to Schedule
              </DropdownMenuItem>
              {!isInvoiced && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate(`/dashboard/reconciliation?siteId=${visit.site_id}&visitId=${visit.id}`)}>
                    <GitCompare className="w-4 h-4 mr-2" />
                    Reconcile
                  </DropdownMenuItem>
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
                    Create Invoice
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      // Cancel visit - update status
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
      </div>
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

  return (
    <div className="space-y-6">
      {/* Active Visits */}
      {activeVisits.length > 0 && (
        <div className="bg-card rounded-xl border border-border">
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b border-border">
            <div className="col-span-3">Site</div>
            <div className="col-span-2">Date / Type</div>
            <div className="col-span-2">Devices</div>
            <div className="col-span-1">Coverage</div>
            <div className="col-span-2">Smoke Spray</div>
            <div className="col-span-2">Actions</div>
          </div>
          <div className="divide-y divide-border">
            {activeVisits.map((visit) => renderVisitRow(visit, false))}
          </div>
        </div>
      )}

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
    </div>
  );
};

export default VisitsTable;

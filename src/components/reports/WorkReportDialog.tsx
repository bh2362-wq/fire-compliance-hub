import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { isHeic, heicTo } from "heic-to";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SignaturePad } from "@/components/ui/signature-pad";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, FileText, ClipboardList, Package, PenTool, Download, CalendarIcon, Clock, Lock, Plus, Trash2, Camera, X, Image, ChevronLeft, ChevronRight, Mail, Upload, Paperclip } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  ServiceReport,
  getDefaultChecklist,
  getServiceReport,
  createServiceReport,
  updateServiceReport,
  assignReportNumber,
} from "@/services/serviceReportService";
import { generateWorkReportPDF } from "@/lib/pdfGenerator";
import { supabase } from "@/integrations/supabase/client";
import { InvoicePromptDialog } from "./InvoicePromptDialog";
import { AIRewriteButton } from "./AIRewriteButton";
import { CustomerCreateInvoiceDialog } from "@/components/customers/CustomerCreateInvoiceDialog";
import { sendJobCompletedNotification } from "@/services/notificationService";
import { getServiceContracts } from "@/services/serviceContractService";
import { EmailReportDialog } from "./EmailReportDialog";
import { getCompanySettings } from "@/services/companySettingsService";

interface VisitForReport {
  id: string;
  visit_type: string;
  visit_date: string;
  site_id: string;
  notes?: string | null;
  sites?: { name: string; address?: string | null; city?: string | null; postcode?: string | null; contact_name?: string | null; contact_phone?: string | null; contact_email?: string | null } | null;
}

interface WorkReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: VisitForReport;
  onSuccess?: () => void;
  showCompleteVisit?: boolean;
}

const JOB_TYPES = [
  { value: "service", label: "Service" },
  { value: "repair", label: "Repair" },
  { value: "installation", label: "Installation" },
  { value: "inspection", label: "Inspection" },
  { value: "commissioning", label: "Commissioning" },
  { value: "remedial", label: "Remedial" },
  { value: "callout", label: "Callout" },
];

const SYSTEM_STATUS_OPTIONS = [
  { value: "operational", label: "Fully Operational" },
  { value: "fault", label: "Fault Present" },
  { value: "disabled", label: "Disabled" },
  { value: "silenced", label: "Silenced" },
  { value: "partial", label: "Partial Operation" },
];

import { createAppointment } from "@/services/appointmentService";

export function WorkReportDialog({
  open,
  onOpenChange,
  visit,
  onSuccess,
  showCompleteVisit = false,
}: WorkReportDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [activeTab, setActiveTab] = useState("job");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<{
    id: string;
    name: string;
    xero_contact_id: string | null;
    email_recipients?: string | null;
  } | null>(null);
  const [siteInfo, setSiteInfo] = useState<{
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    postcode?: string | null;
    contact_name?: string | null;
    contact_email?: string | null;
  } | null>(null);
  const [contractPoNumber, setContractPoNumber] = useState<string | null>(null);
  const [contractUnitPrice, setContractUnitPrice] = useState<number | null>(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [companyName, setCompanyName] = useState<string>("BHO Fire Ltd");
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);

  const parseTimeToMinutes = (time: string): number | null => {
    if (!time) return null;
    const [h, m] = time.split(":").map((n) => Number(n));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const formatMinutesToTime = (mins: number): string => {
    const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const deriveFinishTime = (start: string, durationHours: string): string => {
    const startMins = parseTimeToMinutes(start);
    const dur = Number(durationHours);
    if (startMins === null || !Number.isFinite(dur) || dur <= 0) return "";
    const durMins = Math.round(dur * 60);
    return formatMinutesToTime(startMins + durMins);
  };

  // Form state - Job Details
  const [certificateNo, setCertificateNo] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [jobType, setJobType] = useState("");
  const [workCompleted, setWorkCompleted] = useState(false);
  const [returnRequired, setReturnRequired] = useState(false);
  const [surveyRequired, setSurveyRequired] = useState(false);
  const [quotationRequired, setQuotationRequired] = useState(false);
  const [ramsCompleted, setRamsCompleted] = useState(false);
  const [logBookEntry, setLogBookEntry] = useState(false);
  const [systemStatusArrival, setSystemStatusArrival] = useState("");
  const [systemStatusDeparture, setSystemStatusDeparture] = useState("");
  const [appointmentDate, setAppointmentDate] = useState<Date | undefined>(undefined);
  const [reportDate, setReportDate] = useState<Date>(new Date(visit.visit_date));
  
  // Custom system fields
  const [panelInfo, setPanelInfo] = useState("");
  const [locationInfo, setLocationInfo] = useState("");
  const [typeInfo, setTypeInfo] = useState("");
  const [zonesInfo, setZonesInfo] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // Form state - Works & Times
  const [worksReport, setWorksReport] = useState("");
  const [furtherAction, setFurtherAction] = useState("");
  const [numEngineers, setNumEngineers] = useState<number | "">(1);
  const [travelTime, setTravelTime] = useState("");
  
  // Multi-day work log
  interface WorkDayEntry {
    date: string;
    startTime: string;
    finishTime: string;
    duration: string;
  }
  const [workDays, setWorkDays] = useState<WorkDayEntry[]>([
    { date: format(new Date(visit.visit_date), "yyyy-MM-dd"), startTime: "", finishTime: "", duration: "" }
  ]);
  
  // Legacy single-day fields for backwards compatibility
  const [startTime, setStartTime] = useState("");
  const [finishTime, setFinishTime] = useState("");
  const [duration, setDuration] = useState("");

  // Materials
  const [materials, setMaterials] = useState<{ name: string; qty: string; cost: string }[]>([
    { name: "", qty: "", cost: "" },
  ]);

  // Photos
  const [photos, setPhotos] = useState<{ url: string; caption: string }[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  // Files (paperwork, config files etc.)
  const [reportFiles, setReportFiles] = useState<{ url: string; name: string; size: number }[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // SharePoint folder for this report
  const [reportSharePointFolder, setReportSharePointFolder] = useState<string | null>(null);

  // Signatures
  const [engineerName, setEngineerName] = useState("");
  const [engineerSignature, setEngineerSignature] = useState("");
  const [engineerSignDate, setEngineerSignDate] = useState<Date | undefined>(undefined);
  const [engineerSignTime, setEngineerSignTime] = useState("");
  const [customerNotPresent, setCustomerNotPresent] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerSignature, setCustomerSignature] = useState("");
  const [customerSignDate, setCustomerSignDate] = useState<Date | undefined>(undefined);
  const [customerSignTime, setCustomerSignTime] = useState("");

  useEffect(() => {
    if (open && user) {
      loadReport();
    }
  }, [open, user, visit.id]);

  // Calculate duration for a work day entry
  const calculateDayDuration = (start: string, finish: string): string => {
    if (!start || !finish) return "";
    
    const [startHours, startMinutes] = start.split(":").map(Number);
    const [finishHours, finishMinutes] = finish.split(":").map(Number);
    
    let startTotalMinutes = startHours * 60 + startMinutes;
    let finishTotalMinutes = finishHours * 60 + finishMinutes;
    
    // Handle overnight shifts
    if (finishTotalMinutes < startTotalMinutes) {
      finishTotalMinutes += 24 * 60;
    }
    
    const diffMinutes = finishTotalMinutes - startTotalMinutes;
    return (diffMinutes / 60).toFixed(2);
  };

  // Update work day entry
  const updateWorkDay = (index: number, field: keyof WorkDayEntry, value: string) => {
    const updated = [...workDays];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-calculate duration when times change
    if (field === "startTime" || field === "finishTime") {
      updated[index].duration = calculateDayDuration(
        field === "startTime" ? value : updated[index].startTime,
        field === "finishTime" ? value : updated[index].finishTime
      );
    }
    
    setWorkDays(updated);
  };

  // Add new work day
  const addWorkDay = () => {
    setWorkDays([...workDays, { date: "", startTime: "", finishTime: "", duration: "" }]);
  };

  // Remove work day
  const removeWorkDay = (index: number) => {
    if (workDays.length > 1) {
      setWorkDays(workDays.filter((_, i) => i !== index));
    }
  };

  // Calculate total hours across all days
  const totalHours = workDays.reduce((sum, day) => {
    const hours = parseFloat(day.duration) || 0;
    return sum + hours;
  }, 0).toFixed(2);

  // Summary values used on the Sign tab
  const signSummary = useMemo(() => {
    const arrival = workDays.find((d) => !!d.startTime)?.startTime || "";
    const lastDayWithTimes = [...workDays]
      .reverse()
      .find((d) => !!d.finishTime || (!!d.startTime && !!d.duration));
    const departure =
      lastDayWithTimes?.finishTime ||
      (lastDayWithTimes?.startTime && lastDayWithTimes?.duration
        ? deriveFinishTime(lastDayWithTimes.startTime, lastDayWithTimes.duration)
        : "");
    const summaryDateRaw =
      [...workDays].reverse().find((d) => !!d.date)?.date ||
      format(new Date(visit.visit_date), "yyyy-MM-dd");
    const singleDayDuration =
      [...workDays].reverse().find((d) => !!d.duration)?.duration || "";
    const displayDuration = workDays.length > 1 ? totalHours : singleDayDuration;

    return {
      arrival,
      departure,
      summaryDateRaw,
      displayDuration,
    };
  }, [workDays, totalHours, visit.visit_date]);

  // Legacy duration calculation for backwards compatibility
  useEffect(() => {
    if (startTime && finishTime) {
      setDuration(calculateDayDuration(startTime, finishTime));
    } else {
      setDuration("");
    }
  }, [startTime, finishTime]);

  const loadReport = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch site info with customer details
      const { data: site } = await supabase
        .from("sites")
        .select("id, name, address, city, postcode, contact_name, contact_email, customer_id, customers(id, name, xero_contact_id, contact_email, email_recipients)")
        .eq("id", visit.site_id)
        .maybeSingle();

      if (site) {
        // Get customer contact email if site doesn't have one
        const customerData = site.customers as { id: string; name: string; xero_contact_id: string | null; contact_email?: string | null; email_recipients?: string | null } | null;
        const contactEmail = site.contact_email || customerData?.contact_email || "";
        
        setSiteInfo({
          id: site.id,
          name: site.name,
          address: site.address,
          city: site.city,
          postcode: site.postcode,
          contact_name: site.contact_name,
          contact_email: contactEmail,
        });
        
        // Set customer info for invoice creation
        if (customerData) {
          setCustomerInfo({
            id: customerData.id,
            name: customerData.name,
            xero_contact_id: customerData.xero_contact_id,
            email_recipients: customerData.email_recipients,
          });
        }
      }

      // Fetch company settings for email branding
      try {
        const settings = await getCompanySettings();
        if (settings?.company_name) {
          setCompanyName(settings.company_name);
        }
        if (settings?.report_logo_url || settings?.company_logo_url) {
          setLogoUrl(settings.report_logo_url || settings.company_logo_url || undefined);
        }
      } catch (e) {
        console.error("Failed to load company settings:", e);
      }

      // Fetch service contracts to get PO number (try to match by visit type first)
      try {
        const contracts = await getServiceContracts(visit.site_id);
        
        // Parse asset_type from visit notes to match the right contract
        let assetType: string | null = null;
        try {
          const visitNotes = typeof visit.notes === 'string' ? JSON.parse(visit.notes || '{}') : (visit.notes || {});
          assetType = visitNotes.asset_type || null;
        } catch { /* ignore */ }
        
        // Asset types match service contract types directly (lowercase)
        const matchedServiceType = assetType || null;
        
        // Try matching by service type first
        let contractWithPo = matchedServiceType
          ? contracts.find(c => c.po_number && c.service_type === matchedServiceType)
          : null;
        
        // Fallback to any contract with a PO number
        if (!contractWithPo) {
          contractWithPo = contracts.find(c => c.po_number) || null;
        }
        
        if (contractWithPo) {
          setContractPoNumber(contractWithPo.po_number);
          setContractUnitPrice(contractWithPo.unit_price);
        }
      } catch (error) {
        console.error("Failed to load service contracts:", error);
      }
      let existingReport = await getServiceReport(visit.id);

      if (!existingReport) {
        // Create draft without assigning number yet (number assigned when completing)
        existingReport = await createServiceReport(visit.id, visit.site_id, user.id, {
          engineer_name: user.user_metadata?.full_name || "",
        }, 'JOB', false);  // false = don't assign number now
      }
      // Note: Legacy reports without numbers will get a number assigned when they complete

      setReport(existingReport);
      populateForm(existingReport);
      
      // Set existing SharePoint folder if any
      if (existingReport.sharepoint_folder) {
        setReportSharePointFolder(existingReport.sharepoint_folder);
      }
      
      // Check if report is already completed - lock it
      if (existingReport.status === "completed") {
        setIsLocked(true);
      }
      
      // Auto-create SharePoint folder for this report if not already created
      const customerData2 = site?.customers as { id: string; name: string } | null;
      if (!existingReport.sharepoint_folder && customerData2 && site) {
        const visitDateStr = format(new Date(visit.visit_date), "yyyy-MM-dd");
        const reportNum = existingReport.report_number || `DRAFT-${existingReport.id.substring(0, 6)}`;
        const siteLabel = [site.name, site.address].filter(Boolean).join(" ");
        const reportFolder = `${reportNum}_${visitDateStr}`;
        const folderPath = `Customers/${customerData2.name}/${siteLabel}/Reports/${reportFolder}`;
        
        try {
          const { data: spData, error: spError } = await supabase.functions.invoke("sharepoint-create-folder", {
            body: {
              folderPath,
              entityType: "report",
              entityId: existingReport.id,
            },
          });
          
          if (!spError && spData?.success) {
            setReportSharePointFolder(spData.folderPath);
            await supabase
              .from("service_reports")
              .update({ sharepoint_folder: spData.folderPath, sharepoint_url: spData.webUrl || null })
              .eq("id", existingReport.id);
          }
        } catch (e) {
          console.log("SharePoint folder creation skipped:", e);
        }
      }
    } catch (error) {
      console.error("Failed to load report:", error);
      toast.error("Failed to load work report");
    } finally {
      setLoading(false);
    }
  };

  const populateForm = (r: ServiceReport) => {
    setEngineerName(r.engineer_name || "");
    setCustomerName(r.client_name || "");
    setCertificateNo(r.report_number || "");
    setWorksReport(r.work_carried_out || "");
    setFurtherAction(r.recommendations || "");

    // Parse notes JSON if stored there
    try {
      if (r.notes) {
        const parsedNotes = JSON.parse(r.notes);
        setJobNumber(parsedNotes.jobNumber || "");
        setJobType(parsedNotes.jobType || "");
        setWorkCompleted(parsedNotes.workCompleted || false);
        setReturnRequired(parsedNotes.returnRequired || false);
        setSurveyRequired(parsedNotes.surveyRequired || false);
        setQuotationRequired(parsedNotes.quotationRequired || false);
        setRamsCompleted(parsedNotes.ramsCompleted || false);
        setLogBookEntry(parsedNotes.logBookEntry || false);
        setSystemStatusArrival(parsedNotes.systemStatusArrival || "");
        setSystemStatusDeparture(parsedNotes.systemStatusDeparture || "");
        // Custom system fields
        setPanelInfo(parsedNotes.panelInfo || "");
        setLocationInfo(parsedNotes.locationInfo || "");
        setTypeInfo(parsedNotes.typeInfo || "");
        setZonesInfo(parsedNotes.zonesInfo || "");
        setContactPhone(parsedNotes.contactPhone || "");
        if (parsedNotes.appointmentDate) {
          setAppointmentDate(new Date(parsedNotes.appointmentDate));
        } else if (parsedNotes.attendanceDay) {
          // Legacy: attendanceDay was a day name, ignore it for date picker
          setAppointmentDate(undefined);
        }
        setNumEngineers(parsedNotes.numEngineers || 1);
        // Load multi-day work log or legacy single-day times
        if (parsedNotes.workDays && parsedNotes.workDays.length > 0) {
          setWorkDays(parsedNotes.workDays);
        } else if (parsedNotes.startTime || parsedNotes.finishTime) {
          // Convert legacy single-day to workDays array
          setWorkDays([{
            date: format(new Date(visit.visit_date), "yyyy-MM-dd"),
            startTime: parsedNotes.startTime || "",
            finishTime: parsedNotes.finishTime || "",
            duration: parsedNotes.duration || ""
          }]);
        }
        setStartTime(parsedNotes.startTime || "");
        setFinishTime(parsedNotes.finishTime || "");
        setTravelTime(parsedNotes.travelTime || "");
        setDuration(parsedNotes.duration || "");
        setMaterials(parsedNotes.materials || [{ name: "", qty: "", cost: "" }]);
        setPhotos(parsedNotes.photos || []);
        setReportFiles(parsedNotes.reportFiles || []);
        setEngineerSignature(parsedNotes.engineerSignature || "");
        setCustomerSignature(parsedNotes.customerSignature || "");
        setCustomerNotPresent(parsedNotes.customerNotPresent || false);
        // Sign-off dates and times
        if (parsedNotes.engineerSignDate) {
          setEngineerSignDate(new Date(parsedNotes.engineerSignDate));
        }
        setEngineerSignTime(parsedNotes.engineerSignTime || "");
        if (parsedNotes.customerSignDate) {
          setCustomerSignDate(new Date(parsedNotes.customerSignDate));
        }
        setCustomerSignTime(parsedNotes.customerSignTime || "");
        // Report date
        if (parsedNotes.reportDate) {
          setReportDate(new Date(parsedNotes.reportDate));
        }
      }
    } catch {
      // Notes not JSON, use as-is
    }
  };

  // Build notes data object - centralized to avoid duplication
  const buildNotesData = () => {
    return JSON.stringify({
      jobNumber,
      jobType,
      workCompleted,
      returnRequired,
      surveyRequired,
      quotationRequired,
      ramsCompleted,
      logBookEntry,
      reportDate: reportDate.toISOString(),
      systemStatusArrival,
      systemStatusDeparture,
      appointmentDate: appointmentDate?.toISOString(),
      // Custom system fields
      panelInfo,
      locationInfo,
      typeInfo,
      zonesInfo,
      contactPhone,
      numEngineers,
      workDays: workDays.filter(d => d.date || d.startTime || d.finishTime),
      totalHours,
      startTime: workDays[0]?.startTime || startTime,
      finishTime: workDays[0]?.finishTime || finishTime,
      travelTime,
      duration: workDays[0]?.duration || duration,
      materials: materials.filter((m) => m.name.trim()),
      photos,
      reportFiles,
      engineerSignature,
      customerSignature,
      customerNotPresent,
      engineerSignDate: engineerSignDate?.toISOString(),
      engineerSignTime,
      customerSignDate: customerSignDate?.toISOString(),
      customerSignTime,
    });
  };

  // Auto-save function - saves silently without toast
  const autoSave = async () => {
    if (!report || isLocked || !hasUnsavedChanges) return;

    try {
      const notesData = buildNotesData();

      await updateServiceReport(report.id, {
        engineer_name: engineerName,
        client_name: customerName,
        report_number: certificateNo,
        report_date: format(reportDate, "yyyy-MM-dd"),
        work_carried_out: worksReport,
        recommendations: furtherAction,
        notes: notesData,
        status: "draft",
      });

      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Auto-save failed:", error);
      // Silent fail - don't show error toast for auto-save
    }
  };

  // Handle tab change - auto-save before switching
  const handleTabChange = async (newTab: string) => {
    if (hasUnsavedChanges && !isLocked) {
      await autoSave();
    }
    
    // When navigating to sign tab, auto-populate engineer sign time from departure if empty
    if (newTab === "sign") {
      const departureTime = signSummary.departure;
      if (departureTime && !engineerSignTime) {
        setEngineerSignTime(departureTime);
      }
      // Auto-set sign date to today if not set
      if (!engineerSignDate) {
        setEngineerSignDate(new Date());
      }
    }
    
    setActiveTab(newTab);
  };

  // Tab order for navigation
  const TAB_ORDER = ["job", "works", "materials", "photos", "sign"] as const;
  
  const currentTabIndex = TAB_ORDER.indexOf(activeTab as typeof TAB_ORDER[number]);
  const isFirstTab = currentTabIndex === 0;
  const isLastTab = currentTabIndex === TAB_ORDER.length - 1;

  const handleNextTab = () => {
    if (!isLastTab) {
      handleTabChange(TAB_ORDER[currentTabIndex + 1]);
    }
  };

  const handlePrevTab = () => {
    if (!isFirstTab) {
      handleTabChange(TAB_ORDER[currentTabIndex - 1]);
    }
  };

  // Handle dialog close - auto-save before closing
  const handleDialogClose = async (open: boolean) => {
    if (!open && hasUnsavedChanges && !isLocked && report) {
      await autoSave();
    }
    onOpenChange(open);
  };

  // Mark form as having unsaved changes when any field changes
  useEffect(() => {
    if (report && !loading) {
      setHasUnsavedChanges(true);
    }
  }, [
    jobNumber, jobType, workCompleted, returnRequired, surveyRequired, quotationRequired,
    ramsCompleted, logBookEntry, systemStatusArrival, systemStatusDeparture, appointmentDate, reportDate,
    panelInfo, locationInfo, typeInfo, zonesInfo, contactPhone,
    numEngineers, workDays, travelTime, materials, photos, reportFiles, worksReport, furtherAction,
    engineerName, engineerSignature, engineerSignDate, engineerSignTime,
    customerName, customerSignature, customerSignDate, customerSignTime, customerNotPresent
  ]);

  // Reset unsaved changes flag after loading report
  useEffect(() => {
    if (!loading && report) {
      setHasUnsavedChanges(false);
    }
  }, [loading]);

  const handleSave = async (complete = false) => {
    if (!report || isLocked) return;

    setSaving(true);
    try {
      const notesData = buildNotesData();
      
      // If completing and no report number yet, assign one now
      let finalReportNumber = certificateNo;
      if (complete && !report.report_number) {
        const newNumber = await assignReportNumber(report.id, 'JOB');
        if (newNumber) {
          finalReportNumber = newNumber;
          setCertificateNo(newNumber);
        }
      }

      await updateServiceReport(report.id, {
        engineer_name: engineerName,
        client_name: customerName,
        report_number: finalReportNumber || null,
        report_date: format(reportDate, "yyyy-MM-dd"),
        work_carried_out: worksReport,
        recommendations: furtherAction,
        notes: notesData,
        status: complete ? "completed" : "draft",
      });

      setHasUnsavedChanges(false);

      // Create or update calendar appointment if appointment date is set
      if (appointmentDate && user) {
        const appointmentDateStr = format(appointmentDate, "yyyy-MM-dd");
        const appointmentTime = workDays[0]?.startTime || "09:00";
        
        // Check if there's already an appointment for this visit
        const { data: existingAppointment } = await supabase
          .from("appointments")
          .select("id")
          .eq("visit_id", visit.id)
          .maybeSingle();

        if (existingAppointment) {
          // Update existing appointment
          await supabase
            .from("appointments")
            .update({
              appointment_date: appointmentDateStr,
              start_time: appointmentTime,
              title: `${JOB_TYPES.find(j => j.value === jobType)?.label || "Job"} - ${siteInfo?.name || "Site"}`,
              status: complete ? "completed" : "scheduled",
            })
            .eq("id", existingAppointment.id);
        } else {
          // Create new appointment
          await createAppointment({
            site_id: visit.site_id,
            visit_id: visit.id,
            customer_id: customerInfo?.id || null,
            title: `${JOB_TYPES.find(j => j.value === jobType)?.label || "Job"} - ${siteInfo?.name || "Site"}`,
            description: worksReport || furtherAction || null,
            appointment_date: appointmentDateStr,
            start_time: appointmentTime,
            visit_type: jobType || visit.visit_type,
            status: "scheduled",
          }, user.id);
        }
      }

      if (complete) {
        // Mark the visit as completed
        await supabase
          .from("visits")
          .update({ status: "completed" })
          .eq("id", visit.id);
          
        setIsLocked(true);
        toast.success(`Work report ${finalReportNumber || ""} completed and locked`);

        // Upload PDF to SharePoint
        syncPdfToSharePoint();
        
        // Send job completed notification email
        sendJobCompletedNotification(visit.id).catch(console.error);
        
        // Show invoice prompt if customer has Xero connection
        if (customerInfo?.xero_contact_id) {
          setShowInvoicePrompt(true);
        } else {
          onOpenChange(false);
          onSuccess?.();
        }
      } else {
        toast.success("Work report saved");
        // Sync PDF to SharePoint on every save so folder stays current
        syncPdfToSharePoint();
        // Also trigger refresh for draft saves so preview gets updated
        onSuccess?.();
      }
    } catch (error) {
      console.error("Failed to save report:", error);
      toast.error("Failed to save work report");
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteVisit = async () => {
    // First save the report as complete
    if (!report || isLocked) return;

    setSaving(true);
    try {
      const notesData = buildNotesData();
      
      // If no report number yet, assign one now
      let finalReportNumber = certificateNo;
      if (!report.report_number) {
        const newNumber = await assignReportNumber(report.id, 'JOB');
        if (newNumber) {
          finalReportNumber = newNumber;
          setCertificateNo(newNumber);
        }
      }

      await updateServiceReport(report.id, {
        engineer_name: engineerName,
        client_name: customerName,
        report_number: finalReportNumber || null,
        report_date: format(reportDate, "yyyy-MM-dd"),
        work_carried_out: worksReport,
        recommendations: furtherAction,
        notes: notesData,
        status: "completed",
      });

      setHasUnsavedChanges(false);

      // Update calendar appointment to completed if it exists
      if (user) {
        const { data: existingAppointment } = await supabase
          .from("appointments")
          .select("id")
          .eq("visit_id", visit.id)
          .maybeSingle();

        if (existingAppointment) {
          await supabase
            .from("appointments")
            .update({ status: "completed" })
            .eq("id", existingAppointment.id);
        } else if (appointmentDate) {
          // Create appointment if date was set but no appointment exists
          const appointmentDateStr = format(appointmentDate, "yyyy-MM-dd");
          const appointmentTime = workDays[0]?.startTime || "09:00";
          
          await createAppointment({
            site_id: visit.site_id,
            visit_id: visit.id,
            customer_id: customerInfo?.id || null,
            title: `${JOB_TYPES.find(j => j.value === jobType)?.label || "Job"} - ${siteInfo?.name || "Site"}`,
            description: worksReport || furtherAction || null,
            appointment_date: appointmentDateStr,
            start_time: appointmentTime,
            visit_type: jobType || visit.visit_type,
            status: "completed",
          }, user.id);
        }
      }

      // Mark the visit as completed
      const { error: visitError } = await supabase
        .from("visits")
        .update({ status: "completed" })
        .eq("id", visit.id);

      if (visitError) throw visitError;

      setIsLocked(true);
      toast.success(`Visit ${finalReportNumber || ""} completed and locked`);

      // Upload PDF to SharePoint
      syncPdfToSharePoint();
      
      // Send job completed notification email
      sendJobCompletedNotification(visit.id).catch(console.error);
      
      // Show invoice prompt if customer has Xero connection
      if (customerInfo?.xero_contact_id) {
        setShowInvoicePrompt(true);
      } else {
        onOpenChange(false);
        onSuccess?.();
      }
    } catch (error) {
      console.error("Failed to complete visit:", error);
      toast.error("Failed to complete visit");
    } finally {
      setSaving(false);
    }
  };

  const handleInvoicePromptConfirm = () => {
    setShowInvoicePrompt(false);
    setShowInvoiceDialog(true);
  };

  const handleInvoicePromptDecline = () => {
    setShowInvoicePrompt(false);
    onOpenChange(false);
    onSuccess?.();
  };

  const handleInvoiceDialogClose = () => {
    setShowInvoiceDialog(false);
    onOpenChange(false);
    onSuccess?.();
  };

  const addMaterialRow = () => {
    setMaterials([...materials, { name: "", qty: "", cost: "" }]);
  };

  const updateMaterial = (index: number, field: keyof (typeof materials)[0], value: string) => {
    const updated = [...materials];
    updated[index][field] = value;
    setMaterials(updated);
  };

  // Shared helper to upload current PDF to SharePoint
  const syncPdfToSharePoint = async () => {
    if (!reportSharePointFolder || !siteInfo) return;
    try {
      const pdfBase64 = await generateWorkReportPDF(
        buildPdfData(),
        siteInfo,
        format(reportDate, "yyyy-MM-dd"),
        undefined,
        true
      );
      if (pdfBase64) {
        const pdfFileName = `${certificateNo || jobNumber || 'Report'} - ${siteInfo.name || 'Site'}.pdf`;
        await supabase.functions.invoke("upload-to-sharepoint", {
          body: {
            folderPath: reportSharePointFolder,
            fileName: pdfFileName,
            fileBase64: pdfBase64,
            contentType: "application/pdf",
          },
        });
        console.log("PDF synced to SharePoint");
      }
    } catch (spErr) {
      console.log("SharePoint PDF sync skipped:", spErr);
    }
  };

  const handleDownloadPDF = async () => {
    if (!siteInfo) return;

    try {
      await generateWorkReportPDF(
        buildPdfData(),
        siteInfo,
        format(reportDate, "yyyy-MM-dd")
      );

      // Also sync to SharePoint so the folder always has the latest version
      syncPdfToSharePoint();

      toast.success("PDF downloaded successfully");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  // Build PDF data object (shared between download and email)
  const buildPdfData = () => ({
    certificateNo,
    jobNumber,
    jobType,
    appointmentDate: appointmentDate?.toISOString(),
    systemStatusArrival,
    systemStatusDeparture,
    workCompleted,
    returnRequired,
    surveyRequired,
    quotationRequired,
    ramsCompleted,
    logBookEntry,
    worksReport,
    furtherAction,
    numEngineers,
    workDays: workDays.filter(d => d.date || d.startTime || d.finishTime),
    totalHours,
    startTime: workDays[0]?.startTime || "",
    finishTime:
      workDays[0]?.finishTime ||
      (workDays[0]?.startTime && workDays[0]?.duration
        ? deriveFinishTime(workDays[0].startTime, workDays[0].duration)
        : ""),
    travelTime,
    duration: workDays[0]?.duration || "",
    materials,
    photos,
    engineerName,
    engineerSignature,
    engineerSignDate: engineerSignDate?.toISOString(),
    engineerSignTime: engineerSignTime || signSummary.departure,
    customerNotPresent,
    customerName,
    customerSignature,
    customerSignDate: customerSignDate?.toISOString(),
    customerSignTime,
    // Custom system fields
    panelInfo,
    locationInfo,
    typeInfo,
    zonesInfo,
    contactPhone,
  });

  // Generate PDF as base64 for email attachment
  const generatePdfBase64 = async (): Promise<string> => {
    if (!siteInfo) throw new Error("Site info not loaded");
    
    const base64 = await generateWorkReportPDF(
      buildPdfData(),
      siteInfo,
      format(reportDate, "yyyy-MM-dd"),
      undefined,
      true // return base64
    );
    
    if (!base64) throw new Error("Failed to generate PDF");
    return base64 as string;
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-4xl">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const fullAddress = [siteInfo?.address, siteInfo?.city, siteInfo?.postcode]
    .filter(Boolean)
    .join(", ");

  return (
    <ResponsiveDialog open={open} onOpenChange={handleDialogClose}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center gap-2 flex-wrap">
          <FileText className="h-5 w-5" />
          <span>Work Report</span>
          {isLocked && (
            <Badge variant="secondary" className="bg-muted text-muted-foreground">
              <Lock className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline">Locked</span>
            </Badge>
          )}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="truncate">
          {siteInfo?.name || visit.sites?.name} - {visit.visit_date}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <ResponsiveDialogBody className="py-4">
        {isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-sm text-amber-800 mb-4">
            <Lock className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs sm:text-sm">This report has been completed and is now read-only.</span>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="job" className="flex items-center gap-1 text-xs sm:text-sm px-1 sm:px-3">
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Job</span>
            </TabsTrigger>
            <TabsTrigger value="works" className="flex items-center gap-1 text-xs sm:text-sm px-1 sm:px-3">
              <FileText className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Works</span>
            </TabsTrigger>
            <TabsTrigger value="materials" className="flex items-center gap-1 text-xs sm:text-sm px-1 sm:px-3">
              <Package className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Materials</span>
            </TabsTrigger>
            <TabsTrigger value="photos" className="flex items-center gap-1 text-xs sm:text-sm px-1 sm:px-3">
              <Camera className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Photos</span>
            </TabsTrigger>
            <TabsTrigger value="sign" className="flex items-center gap-1 text-xs sm:text-sm px-1 sm:px-3">
              <PenTool className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Sign</span>
            </TabsTrigger>
          </TabsList>

          <fieldset disabled={isLocked} className="flex-1">
            <TabsContent value="job" className="mt-0 space-y-4">
              {/* Site Info Header */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Site Name</Label>
                    <p className="font-medium">{siteInfo?.name || visit.sites?.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Site Contact</Label>
                    <p className="font-medium">{siteInfo?.contact_name || "-"}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Site Address</Label>
                  <p className="font-medium">{fullAddress || "-"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Job Number</Label>
                  <Input
                    value={certificateNo}
                    readOnly
                    className="bg-muted/50 font-mono"
                    placeholder="Auto-generated"
                  />
                </div>
                <div className="space-y-2">
                  <Label>PO / Reference</Label>
                  <Input
                    value={jobNumber}
                    onChange={(e) => setJobNumber(e.target.value)}
                    placeholder="Optional reference"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Job Type</Label>
                  <Select value={jobType} onValueChange={setJobType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select job type" />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Report Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                        )}
                        disabled={isLocked}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(reportDate, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={reportDate}
                        onSelect={(d) => d && setReportDate(d)}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Appointment Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !appointmentDate && "text-muted-foreground"
                        )}
                        disabled={isLocked}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {appointmentDate ? format(appointmentDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={appointmentDate}
                        onSelect={setAppointmentDate}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                </Popover>
                </div>
              </div>

              {/* Custom System Fields */}
              <div className="border rounded-lg p-4 space-y-4">
                <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">System Information (Optional)</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Panel</Label>
                    <Input
                      value={panelInfo}
                      onChange={(e) => setPanelInfo(e.target.value)}
                      placeholder="e.g. Morley IAS"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Location</Label>
                    <Input
                      value={locationInfo}
                      onChange={(e) => setLocationInfo(e.target.value)}
                      placeholder="e.g. Ground Floor Reception"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Type</Label>
                    <Input
                      value={typeInfo}
                      onChange={(e) => setTypeInfo(e.target.value)}
                      placeholder="e.g. Addressable"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Zones</Label>
                    <Input
                      value={zonesInfo}
                      onChange={(e) => setZonesInfo(e.target.value)}
                      placeholder="e.g. 8"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-xs">Contact Phone</Label>
                    <Input
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="e.g. 0123 456 7890"
                      type="tel"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>System Status on Arrival</Label>
                  <Select value={systemStatusArrival} onValueChange={setSystemStatusArrival}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>System Status on Departure</Label>
                  <Select value={systemStatusDeparture} onValueChange={setSystemStatusDeparture}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Checkboxes grid */}
              <div className="border rounded-lg p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="workCompleted"
                      checked={workCompleted}
                      onCheckedChange={(c) => setWorkCompleted(!!c)}
                    />
                    <Label htmlFor="workCompleted" className="text-sm cursor-pointer">
                      Work Completed
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="returnRequired"
                      checked={returnRequired}
                      onCheckedChange={(c) => setReturnRequired(!!c)}
                    />
                    <Label htmlFor="returnRequired" className="text-sm cursor-pointer">
                      Return Required
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="surveyRequired"
                      checked={surveyRequired}
                      onCheckedChange={(c) => setSurveyRequired(!!c)}
                    />
                    <Label htmlFor="surveyRequired" className="text-sm cursor-pointer">
                      Survey Required
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="quotationRequired"
                      checked={quotationRequired}
                      onCheckedChange={(c) => setQuotationRequired(!!c)}
                    />
                    <Label htmlFor="quotationRequired" className="text-sm cursor-pointer">
                      Quotation Required
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="ramsCompleted"
                      checked={ramsCompleted}
                      onCheckedChange={(c) => setRamsCompleted(!!c)}
                    />
                    <Label htmlFor="ramsCompleted" className="text-sm cursor-pointer">
                      RAMS Completed
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="logBookEntry"
                      checked={logBookEntry}
                      onCheckedChange={(c) => setLogBookEntry(!!c)}
                    />
                    <Label htmlFor="logBookEntry" className="text-sm cursor-pointer">
                      Log Book Entry
                    </Label>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="works" className="mt-0 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Works Report / Carried Out</Label>
                  <AIRewriteButton
                    text={worksReport}
                    type="works"
                    onRewrite={(newText) => {
                      // AI rewrite should only update the works report field, not move text elsewhere
                      setWorksReport(newText);
                    }}
                    disabled={isLocked}
                    generateRecommendations={true}
                    onRecommendationsGenerated={(recs) => {
                      // Only auto-fill recommendations if Further Action is empty
                      if (!furtherAction.trim()) {
                        setFurtherAction(recs);
                      } else {
                        // If there's already content, append the generated recommendations
                        setFurtherAction(prev => `${prev}\n\n${recs}`);
                      }
                    }}
                  />
                </div>
                <Textarea
                  value={worksReport}
                  onChange={(e) => setWorksReport(e.target.value)}
                  placeholder="Describe the work carried out..."
                  className="min-h-[150px]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Further Action / Comments</Label>
                  <AIRewriteButton
                    text={furtherAction}
                    type="comments"
                    onRewrite={setFurtherAction}
                    disabled={isLocked}
                  />
                </div>
                <Textarea
                  value={furtherAction}
                  onChange={(e) => setFurtherAction(e.target.value)}
                  placeholder="Any follow-up actions required..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Work Days</h4>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={addWorkDay}
                    disabled={isLocked}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Day
                  </Button>
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left text-sm font-medium p-3">Date</th>
                        <th className="text-left text-sm font-medium p-3 w-28">Start</th>
                        <th className="text-left text-sm font-medium p-3 w-28">Finish</th>
                        <th className="text-left text-sm font-medium p-3 w-24">Hours</th>
                        <th className="text-left text-sm font-medium p-3 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {workDays.map((day, index) => (
                        <tr key={index} className="border-t border-border">
                          <td className="p-2">
                            <Input
                              type="date"
                              value={day.date}
                              onChange={(e) => updateWorkDay(index, "date", e.target.value)}
                              disabled={isLocked}
                              className="border-0 bg-transparent focus-visible:ring-0"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="time"
                              value={day.startTime}
                              onChange={(e) => updateWorkDay(index, "startTime", e.target.value)}
                              disabled={isLocked}
                              className="border-0 bg-transparent focus-visible:ring-0"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="time"
                              value={day.finishTime}
                              onChange={(e) => updateWorkDay(index, "finishTime", e.target.value)}
                              disabled={isLocked}
                              className="border-0 bg-transparent focus-visible:ring-0"
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <Input
                                type="text"
                                value={day.duration}
                                onChange={(e) => updateWorkDay(index, "duration", e.target.value)}
                                placeholder="0.00"
                                disabled={isLocked}
                                className="border-0 bg-transparent focus-visible:ring-0 w-16"
                              />
                              {day.duration && (
                                <span className="text-xs text-muted-foreground">
                                  ({Math.floor(parseFloat(day.duration) || 0)}h {Math.round(((parseFloat(day.duration) || 0) % 1) * 60)}m)
                                </span>
                              )}
                              {!isLocked && day.startTime && day.finishTime && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    const calculated = calculateDayDuration(day.startTime, day.finishTime);
                                    updateWorkDay(index, "duration", calculated);
                                  }}
                                  title="Calculate hours"
                                >
                                  <Clock className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                          <td className="p-2">
                            {workDays.length > 1 && !isLocked && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => removeWorkDay(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30">
                      <tr className="border-t border-border">
                        <td colSpan={3} className="p-3 text-right font-medium">Total Hours:</td>
                        <td className="p-3" colSpan={2}>
                          <div className="flex items-center gap-1">
                            <span className="text-lg font-bold text-primary">{totalHours}</span>
                            <span className="text-sm text-muted-foreground">
                              ({Math.floor(parseFloat(totalHours))}h {Math.round((parseFloat(totalHours) % 1) * 60)}m)
                            </span>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>No. of Engineers</Label>
                    <Input
                      type="number"
                      min={1}
                      value={numEngineers}
                      onChange={(e) => setNumEngineers(e.target.value ? parseInt(e.target.value) : "")}
                      disabled={isLocked}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Travel Time (hrs)</Label>
                    <Input
                      value={travelTime}
                      onChange={(e) => setTravelTime(e.target.value)}
                      placeholder="e.g. 1.5"
                      disabled={isLocked}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="materials" className="mt-0 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Materials Used</Label>
                  <Button variant="outline" size="sm" onClick={addMaterialRow}>
                    Add Row
                  </Button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left text-sm font-medium p-3">Material / Part</th>
                        <th className="text-left text-sm font-medium p-3 w-24">Qty</th>
                        <th className="text-left text-sm font-medium p-3 w-28">Cost (£)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((mat, index) => (
                        <tr key={index} className="border-t border-border">
                          <td className="p-2">
                            <Input
                              value={mat.name}
                              onChange={(e) => updateMaterial(index, "name", e.target.value)}
                              placeholder="Material name"
                              className="border-0 bg-transparent focus-visible:ring-0"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              value={mat.qty}
                              onChange={(e) => updateMaterial(index, "qty", e.target.value)}
                              placeholder="0"
                              className="border-0 bg-transparent focus-visible:ring-0"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              value={mat.cost}
                              onChange={(e) => updateMaterial(index, "cost", e.target.value)}
                              placeholder="0.00"
                              className="border-0 bg-transparent focus-visible:ring-0"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="photos" className="mt-0 space-y-6">
              {/* SharePoint folder status */}
              {reportSharePointFolder && (
                <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span>SharePoint: <span className="font-medium text-foreground">{reportSharePointFolder}</span></span>
                </div>
              )}
              
              {/* Site Photos Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Site Photos</Label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*,.heic,.heif"
                      multiple
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0 || !report) return;
                        
                        setUploadingPhoto(true);
                        try {
                          const newPhotos: { url: string; caption: string }[] = [];
                          
                          for (const rawFile of Array.from(files)) {
                            // Convert HEIC/HEIF to JPEG for browser compatibility
                            let file: File = rawFile;
                            const fileIsHeic = /\.(heic|heif)$/i.test(rawFile.name) || rawFile.type === 'image/heic' || rawFile.type === 'image/heif' || await isHeic(rawFile);
                            if (fileIsHeic) {
                              try {
                                const jpegBlob = await heicTo({ blob: rawFile, type: 'image/jpeg', quality: 0.85 });
                                const newName = rawFile.name.replace(/\.(heic|heif)$/i, '.jpg');
                                file = new File([jpegBlob], newName, { type: 'image/jpeg' });
                              } catch (convErr) {
                                console.error('HEIC conversion failed:', convErr);
                                toast.error(`Failed to convert ${rawFile.name} — unsupported HEIC format`);
                                continue;
                              }
                            }

                            const fileExt = file.name.split('.').pop();
                            const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                            const storagePath = `${report.id}/${uniqueName}`;
                            
                            const { error: uploadError } = await supabase.storage
                              .from('work-report-photos')
                              .upload(storagePath, file);
                            
                            if (uploadError) throw uploadError;
                            
                            const { data: { publicUrl } } = supabase.storage
                              .from('work-report-photos')
                              .getPublicUrl(storagePath);
                            
                            newPhotos.push({ url: publicUrl, caption: '' });
                            
                            // Also upload to SharePoint if folder exists
                            if (reportSharePointFolder) {
                              try {
                                const reader = new FileReader();
                                const base64 = await new Promise<string>((resolve, reject) => {
                                  reader.onload = () => {
                                    const result = reader.result as string;
                                    resolve(result.split(',')[1]);
                                  };
                                  reader.onerror = reject;
                                  reader.readAsDataURL(file);
                                });
                                
                                await supabase.functions.invoke("upload-to-sharepoint", {
                                  body: {
                                    folderPath: `${reportSharePointFolder}/Photos`,
                                    fileName: file.name,
                                    fileBase64: base64,
                                    contentType: file.type || 'image/jpeg',
                                  },
                                });
                              } catch (spErr) {
                                console.log("SharePoint photo upload skipped:", spErr);
                              }
                            }
                          }
                          
                          setPhotos(prev => [...prev, ...newPhotos]);
                          toast.success(`${newPhotos.length} photo(s) uploaded`);
                        } catch (error) {
                          console.error('Failed to upload photo:', error);
                          toast.error('Failed to upload photo');
                        } finally {
                          setUploadingPhoto(false);
                          e.target.value = '';
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={isLocked || uploadingPhoto}
                    />
                    <Button variant="outline" size="sm" disabled={isLocked || uploadingPhoto}>
                      {uploadingPhoto ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Add Photos
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                
                {photos.length === 0 ? (
                  <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
                    <Image className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No photos added yet</p>
                    <p className="text-xs mt-1">Click "Add Photos" to upload images from the site</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative group">
                        <div className="aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                          <img 
                            src={photo.url} 
                            alt={photo.caption || `Photo ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/placeholder.svg';
                            }}
                          />
                        </div>
                        {!isLocked && (
                          <button
                            type="button"
                            onClick={() => setPhotos(photos.filter((_, i) => i !== index))}
                            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        <Input
                          value={photo.caption}
                          onChange={(e) => {
                            const updated = [...photos];
                            updated[index] = { ...updated[index], caption: e.target.value };
                            setPhotos(updated);
                          }}
                          placeholder="Add caption..."
                          className="mt-2 text-xs"
                          disabled={isLocked}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Separator */}
              <div className="border-t border-border" />

              {/* File Upload Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Files & Documents</Label>
                  <div className="relative">
                    <input
                      type="file"
                      multiple
                      onChange={async (e) => {
                        const files = e.target.files;
                        if (!files || files.length === 0 || !report) return;
                        
                        setUploadingFile(true);
                        try {
                          const newFiles: { url: string; name: string; size: number }[] = [];
                          
                          for (const file of Array.from(files)) {
                            const fileExt = file.name.split('.').pop();
                            const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                            const storagePath = `${report.id}/files/${uniqueName}`;
                            
                            const { error: uploadError } = await supabase.storage
                              .from('work-report-photos')
                              .upload(storagePath, file);
                            
                            if (uploadError) throw uploadError;
                            
                            const { data: { publicUrl } } = supabase.storage
                              .from('work-report-photos')
                              .getPublicUrl(storagePath);
                            
                            newFiles.push({ url: publicUrl, name: file.name, size: file.size });
                            
                            // Also upload to SharePoint if folder exists
                            if (reportSharePointFolder) {
                              try {
                                const reader = new FileReader();
                                const base64 = await new Promise<string>((resolve, reject) => {
                                  reader.onload = () => {
                                    const result = reader.result as string;
                                    resolve(result.split(',')[1]);
                                  };
                                  reader.onerror = reject;
                                  reader.readAsDataURL(file);
                                });
                                
                                await supabase.functions.invoke("upload-to-sharepoint", {
                                  body: {
                                    folderPath: `${reportSharePointFolder}/Documents`,
                                    fileName: file.name,
                                    fileBase64: base64,
                                    contentType: file.type || 'application/octet-stream',
                                  },
                                });
                              } catch (spErr) {
                                console.log("SharePoint file upload skipped:", spErr);
                              }
                            }
                          }
                          
                          setReportFiles(prev => [...prev, ...newFiles]);
                          toast.success(`${newFiles.length} file(s) uploaded`);
                        } catch (error) {
                          console.error('Failed to upload file:', error);
                          toast.error('Failed to upload file');
                        } finally {
                          setUploadingFile(false);
                          e.target.value = '';
                        }
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={isLocked || uploadingFile}
                    />
                    <Button variant="outline" size="sm" disabled={isLocked || uploadingFile}>
                      {uploadingFile ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Paperclip className="w-4 h-4 mr-2" />
                          Add Files
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                
                {reportFiles.length === 0 ? (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground">
                    <Paperclip className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No files uploaded yet</p>
                    <p className="text-xs mt-1">Upload paperwork, configuration files, or other documents</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reportFiles.map((file, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                        <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <a 
                            href={file.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-primary hover:underline truncate block"
                          >
                            {file.name}
                          </a>
                          <span className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        {!isLocked && (
                          <button
                            type="button"
                            onClick={() => setReportFiles(reportFiles.filter((_, i) => i !== index))}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="sign" className="mt-0 space-y-5">
              {/* Completion Status Banner */}
              <div className={cn(
                "rounded-lg p-4 border-l-4",
                workCompleted 
                  ? "bg-green-50 border-l-green-500" 
                  : "bg-amber-50 border-l-amber-500"
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    workCompleted ? "bg-green-500" : "bg-amber-500"
                  )} />
                  <span className={cn(
                    "font-semibold text-sm",
                    workCompleted ? "text-green-800" : "text-amber-800"
                  )}>
                    {workCompleted ? "Works Completed" : "Works In Progress"}
                  </span>
                </div>
              </div>

              {/* Service Summary Row - Pulls from workDays */}
              <div className="grid grid-cols-4 gap-3 bg-muted/30 rounded-lg p-3">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Date</p>
                  <p className="font-semibold text-sm">
                    {signSummary.summaryDateRaw
                      ? format(new Date(signSummary.summaryDateRaw), "dd/MM/yyyy")
                      : format(new Date(visit.visit_date), "dd/MM/yyyy")}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Arrival</p>
                  <p className="font-semibold text-sm">
                    {signSummary.arrival || "—"}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Departure</p>
                  <p className="font-semibold text-sm">
                    {signSummary.departure || "—"}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Duration</p>
                  <p className="font-semibold text-sm">
                    {signSummary.displayDuration ? `${signSummary.displayDuration} hrs` : "—"}
                  </p>
                </div>
              </div>
              
              {/* Show all work days summary if multiple days */}
              {workDays.length > 1 && (
                <div className="text-center text-sm text-muted-foreground bg-muted/20 rounded-lg p-2">
                  <span className="font-medium text-foreground">{workDays.length} work days</span> • Total: <span className="font-medium text-foreground">{totalHours} hours</span>
                </div>
              )}

              {/* Signature Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Engineer Signature Card */}
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b">
                    <h4 className="font-semibold text-sm uppercase tracking-wide text-foreground">
                      Engineer
                    </h4>
                    {engineerSignature && (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Signed
                      </span>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Print Name</Label>
                      <Input
                        value={engineerName}
                        onChange={(e) => setEngineerName(e.target.value)}
                        placeholder="Engineer name"
                        className="h-9"
                      />
                    </div>
                    
                    <SignaturePad
                      value={engineerSignature}
                      onChange={setEngineerSignature}
                      width={300}
                      height={100}
                      label="Signature"
                    />

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Date Signed</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className={cn(
                                "w-full justify-start text-left font-normal h-8 text-xs",
                                !engineerSignDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-1.5 h-3 w-3" />
                              {engineerSignDate ? format(engineerSignDate, "dd/MM/yyyy") : "Select"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 z-50" align="start">
                            <Calendar
                              mode="single"
                              selected={engineerSignDate}
                              onSelect={setEngineerSignDate}
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Time Signed</Label>
                        <div className="flex items-center gap-1">
                          <Input
                            type="time"
                            value={engineerSignTime || signSummary.departure}
                            onChange={(e) => setEngineerSignTime(e.target.value)}
                            className="text-xs h-8 flex-1"
                          />
                          {signSummary.departure && !engineerSignTime && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEngineerSignTime(signSummary.departure)}
                              title="Use departure time"
                            >
                              <Clock className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer Signature Card */}
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b">
                    <h4 className="font-semibold text-sm uppercase tracking-wide text-foreground">
                      Customer
                    </h4>
                    {customerNotPresent ? (
                      <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        Not Present
                      </span>
                    ) : customerSignature ? (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        Signed
                      </span>
                    ) : null}
                  </div>
                  <div className="p-4 space-y-3">
                    {/* Customer Not Present Toggle */}
                    <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                      <Checkbox
                        id="customerNotPresent"
                        checked={customerNotPresent}
                        onCheckedChange={(checked) => setCustomerNotPresent(!!checked)}
                      />
                      <Label htmlFor="customerNotPresent" className="text-sm cursor-pointer">
                        Customer not present
                      </Label>
                    </div>

                    {customerNotPresent ? (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center min-h-[160px] flex flex-col items-center justify-center">
                        <p className="text-sm text-amber-800 font-medium">
                          Customer was not available
                        </p>
                        <p className="text-xs text-amber-600 mt-1">
                          to sign off on this work
                        </p>
                        <p className="text-xs text-muted-foreground mt-3">
                          Report signed by engineer only
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Print Name</Label>
                          <Input
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Customer name"
                            className="h-9"
                          />
                        </div>
                        
                        <SignaturePad
                          value={customerSignature}
                          onChange={setCustomerSignature}
                          width={300}
                          height={100}
                          label="Signature"
                        />

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Date Signed</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={cn(
                                    "w-full justify-start text-left font-normal h-8 text-xs",
                                    !customerSignDate && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-1.5 h-3 w-3" />
                                  {customerSignDate ? format(customerSignDate, "dd/MM/yyyy") : "Select"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 z-50" align="start">
                                <Calendar
                                  mode="single"
                                  selected={customerSignDate}
                                  onSelect={setCustomerSignDate}
                                  initialFocus
                                  className="p-3 pointer-events-auto"
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Time Signed</Label>
                            <Input
                              type="time"
                              value={customerSignTime}
                              onChange={(e) => setCustomerSignTime(e.target.value)}
                              className="text-xs h-8"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </fieldset>
        </Tabs>
      </ResponsiveDialogBody>

      <ResponsiveDialogFooter className="flex-wrap gap-2">
        <Button variant="outline" onClick={handleDownloadPDF} className="w-full sm:w-auto sm:mr-auto">
          <Download className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Download PDF</span>
          <span className="sm:hidden">PDF</span>
        </Button>
        <div className="flex gap-2 w-full sm:w-auto">
          {isLocked ? (
            <>
              <Button 
                variant="outline" 
                onClick={() => setShowEmailDialog(true)}
                className="flex-1 sm:flex-none"
              >
                <Mail className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Email Report</span>
                <span className="sm:hidden">Email</span>
              </Button>
              <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                <span className="hidden sm:inline">Report Locked</span>
              </div>
            </>
          ) : (
            <>
              {/* Previous button - show on all tabs except first */}
              {!isFirstTab && (
                <Button variant="outline" onClick={handlePrevTab} className="flex-1 sm:flex-none">
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">Previous</span>
                  <span className="sm:hidden">Back</span>
                </Button>
              )}
              
              {/* Cancel button - only show on first tab */}
              {isFirstTab && (
                <Button variant="outline" onClick={() => handleDialogClose(false)} className="flex-1 sm:flex-none">
                  Cancel
                </Button>
              )}
              
              {/* Save Draft button */}
              <Button 
                variant="outline" 
                onClick={() => handleSave(false)} 
                disabled={saving}
                className="flex-1 sm:flex-none"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <span className="hidden sm:inline">Save Draft</span>
                <span className="sm:hidden">Save</span>
              </Button>
              
              {/* Next button - show on all tabs except last */}
              {!isLastTab && (
                <Button variant="hero" onClick={handleNextTab} className="flex-1 sm:flex-none">
                  <span className="hidden sm:inline">Next</span>
                  <span className="sm:hidden">Next</span>
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
              
              {/* Complete button - only show on last tab (sign) */}
              {isLastTab && (
                showCompleteVisit ? (
                  <Button variant="hero" onClick={handleCompleteVisit} disabled={saving} className="flex-1 sm:flex-none">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <span className="hidden sm:inline">Complete Visit</span>
                    <span className="sm:hidden">Complete</span>
                  </Button>
                ) : (
                  <Button variant="hero" onClick={() => handleSave(true)} disabled={saving} className="flex-1 sm:flex-none">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <span className="hidden sm:inline">Complete Report</span>
                    <span className="sm:hidden">Complete</span>
                  </Button>
                )
              )}
            </>
          )}
        </div>
      </ResponsiveDialogFooter>

      {/* Invoice Prompt Dialog */}
      <InvoicePromptDialog
        open={showInvoicePrompt}
        onOpenChange={setShowInvoicePrompt}
        onConfirm={handleInvoicePromptConfirm}
        onDecline={handleInvoicePromptDecline}
        onEmailReport={() => {
          setShowInvoicePrompt(false);
          setShowEmailDialog(true);
        }}
        siteName={siteInfo?.name || ""}
      />

      {/* Invoice Creation Dialog */}
      {customerInfo && siteInfo && (
        <CustomerCreateInvoiceDialog
          open={showInvoiceDialog}
          onOpenChange={(open) => {
            if (!open) handleInvoiceDialogClose();
          }}
          customerId={customerInfo.id}
          customerName={customerInfo.name}
          xeroContactId={customerInfo.xero_contact_id}
          sites={[{
            id: siteInfo.id,
            name: siteInfo.name,
            address: siteInfo.address || null,
            city: siteInfo.city || null,
          }]}
          onSuccess={handleInvoiceDialogClose}
          jobReportData={{
            jobType,
            reportDate: format(reportDate, "yyyy-MM-dd"),
            reportNumber: certificateNo,
            poNumber: contractPoNumber || undefined,
            unitPrice: contractUnitPrice || undefined,
            siteName: siteInfo.name,
          }}
        />
      )}

      {/* Email Report Dialog */}
      <EmailReportDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        defaultEmail={siteInfo?.contact_email || ""}
        defaultRecipients={customerInfo?.email_recipients || ""}
        customerName={customerInfo?.name || siteInfo?.contact_name || ""}
        customerId={customerInfo?.id}
        siteId={siteInfo?.id}
        visitId={visit.id}
        reportId={report?.id}
        siteName={siteInfo?.name || ""}
        reportNumber={certificateNo}
        reportDate={format(new Date(visit.visit_date), "dd-MM-yyyy")}
        companyName={companyName}
        logoUrl={logoUrl}
        generatePdfBase64={generatePdfBase64}
      />
    </ResponsiveDialog>
  );
}

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Loader2, FileText, ClipboardList, Package, PenTool, Download, CalendarIcon, Clock, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  ServiceReport,
  getDefaultChecklist,
  getServiceReport,
  createServiceReport,
  updateServiceReport,
} from "@/services/serviceReportService";
import { generateWorkReportPDF } from "@/lib/pdfGenerator";
import { supabase } from "@/integrations/supabase/client";
import { InvoicePromptDialog } from "./InvoicePromptDialog";
import { CustomerCreateInvoiceDialog } from "@/components/customers/CustomerCreateInvoiceDialog";

interface VisitForReport {
  id: string;
  visit_type: string;
  visit_date: string;
  site_id: string;
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
  { value: "emergency", label: "Emergency" },
];

const SYSTEM_STATUS_OPTIONS = [
  { value: "operational", label: "Fully Operational" },
  { value: "fault", label: "Fault Present" },
  { value: "disabled", label: "Disabled" },
  { value: "silenced", label: "Silenced" },
  { value: "partial", label: "Partial Operation" },
];

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

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
  const [isLocked, setIsLocked] = useState(false);
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<{
    id: string;
    name: string;
    xero_contact_id: string | null;
  } | null>(null);
  const [siteInfo, setSiteInfo] = useState<{
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    postcode?: string | null;
    contact_name?: string | null;
  } | null>(null);

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
  const [attendanceDay, setAttendanceDay] = useState("");

  // Form state - Works & Times
  const [worksReport, setWorksReport] = useState("");
  const [furtherAction, setFurtherAction] = useState("");
  const [numEngineers, setNumEngineers] = useState<number | "">(1);
  const [startTime, setStartTime] = useState("");
  const [finishTime, setFinishTime] = useState("");
  const [travelTime, setTravelTime] = useState("");
  const [duration, setDuration] = useState("");

  // Materials
  const [materials, setMaterials] = useState<{ name: string; qty: string; cost: string }[]>([
    { name: "", qty: "", cost: "" },
  ]);

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

  // Auto-calculate duration from start and finish times
  useEffect(() => {
    if (startTime && finishTime) {
      const calculateDuration = () => {
        const [startHours, startMinutes] = startTime.split(":").map(Number);
        const [finishHours, finishMinutes] = finishTime.split(":").map(Number);
        
        let startTotalMinutes = startHours * 60 + startMinutes;
        let finishTotalMinutes = finishHours * 60 + finishMinutes;
        
        // Handle overnight shifts (finish time is earlier than start time)
        if (finishTotalMinutes < startTotalMinutes) {
          finishTotalMinutes += 24 * 60; // Add 24 hours
        }
        
        const diffMinutes = finishTotalMinutes - startTotalMinutes;
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        
        // Format as decimal hours (e.g., 2.5 for 2 hours 30 minutes)
        const decimalHours = (diffMinutes / 60).toFixed(2);
        setDuration(decimalHours);
      };
      
      calculateDuration();
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
        .select("id, name, address, city, postcode, contact_name, customer_id, customers(id, name, xero_contact_id)")
        .eq("id", visit.site_id)
        .maybeSingle();

      if (site) {
        setSiteInfo({
          id: site.id,
          name: site.name,
          address: site.address,
          city: site.city,
          postcode: site.postcode,
          contact_name: site.contact_name,
        });
        
        // Set customer info for invoice creation
        if (site.customers) {
          const customer = site.customers as { id: string; name: string; xero_contact_id: string | null };
          setCustomerInfo({
            id: customer.id,
            name: customer.name,
            xero_contact_id: customer.xero_contact_id,
          });
        }
      }

      let existingReport = await getServiceReport(visit.id);

      if (!existingReport) {
        // Use 'JOB' report type for work reports (job sheets)
        existingReport = await createServiceReport(visit.id, visit.site_id, user.id, {
          engineer_name: user.user_metadata?.full_name || "",
        }, 'JOB');
      }

      setReport(existingReport);
      populateForm(existingReport);
      
      // Check if report is already completed - lock it
      if (existingReport.status === "completed") {
        setIsLocked(true);
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
        setAttendanceDay(parsedNotes.attendanceDay || "");
        setNumEngineers(parsedNotes.numEngineers || 1);
        setStartTime(parsedNotes.startTime || "");
        setFinishTime(parsedNotes.finishTime || "");
        setTravelTime(parsedNotes.travelTime || "");
        setDuration(parsedNotes.duration || "");
        setMaterials(parsedNotes.materials || [{ name: "", qty: "", cost: "" }]);
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
      }
    } catch {
      // Notes not JSON, use as-is
    }
  };

  const handleSave = async (complete = false) => {
    if (!report || isLocked) return;

    setSaving(true);
    try {
      const notesData = JSON.stringify({
        jobNumber,
        jobType,
        workCompleted,
        returnRequired,
        surveyRequired,
        quotationRequired,
        ramsCompleted,
        logBookEntry,
        systemStatusArrival,
        systemStatusDeparture,
        attendanceDay,
        numEngineers,
        startTime,
        finishTime,
        travelTime,
        duration,
        materials: materials.filter((m) => m.name.trim()),
        engineerSignature,
        customerSignature,
        customerNotPresent,
        engineerSignDate: engineerSignDate?.toISOString(),
        engineerSignTime,
        customerSignDate: customerSignDate?.toISOString(),
        customerSignTime,
      });

      await updateServiceReport(report.id, {
        engineer_name: engineerName,
        client_name: customerName,
        report_number: certificateNo,
        work_carried_out: worksReport,
        recommendations: furtherAction,
        notes: notesData,
        status: complete ? "completed" : "draft",
      });

      if (complete) {
        // Mark the visit as completed
        await supabase
          .from("visits")
          .update({ status: "completed" })
          .eq("id", visit.id);
          
        setIsLocked(true);
        toast.success("Work report completed and locked");
        
        // Show invoice prompt if customer has Xero connection
        if (customerInfo?.xero_contact_id) {
          setShowInvoicePrompt(true);
        } else {
          onOpenChange(false);
          onSuccess?.();
        }
      } else {
        toast.success("Work report saved");
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
      const notesData = JSON.stringify({
        jobNumber,
        jobType,
        workCompleted,
        returnRequired,
        surveyRequired,
        quotationRequired,
        ramsCompleted,
        logBookEntry,
        systemStatusArrival,
        systemStatusDeparture,
        attendanceDay,
        numEngineers,
        startTime,
        finishTime,
        travelTime,
        duration,
        materials: materials.filter((m) => m.name.trim()),
        engineerSignature,
        customerSignature,
        customerNotPresent,
        engineerSignDate: engineerSignDate?.toISOString(),
        engineerSignTime,
        customerSignDate: customerSignDate?.toISOString(),
        customerSignTime,
      });

      await updateServiceReport(report.id, {
        engineer_name: engineerName,
        client_name: customerName,
        report_number: certificateNo,
        work_carried_out: worksReport,
        recommendations: furtherAction,
        notes: notesData,
        status: "completed",
      });

      // Mark the visit as completed
      const { error: visitError } = await supabase
        .from("visits")
        .update({ status: "completed" })
        .eq("id", visit.id);

      if (visitError) throw visitError;

      setIsLocked(true);
      toast.success("Visit completed and locked");
      
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

  const handleDownloadPDF = () => {
    if (!siteInfo) return;

    try {
      generateWorkReportPDF(
        {
          certificateNo,
          jobNumber,
          jobType,
          attendanceDay,
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
          startTime,
          finishTime,
          travelTime,
          duration,
          materials,
          engineerName,
          engineerSignature,
          engineerSignDate: engineerSignDate?.toISOString(),
          engineerSignTime,
          customerNotPresent,
          customerName,
          customerSignature,
          customerSignDate: customerSignDate?.toISOString(),
          customerSignTime,
        },
        siteInfo,
        visit.visit_date
      );

      toast.success("PDF downloaded successfully");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Work Report
            {isLocked && (
              <Badge variant="secondary" className="ml-2 bg-muted text-muted-foreground">
                <Lock className="w-3 h-3 mr-1" />
                Locked
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {siteInfo?.name || visit.sites?.name} - {visit.visit_date}
          </DialogDescription>
        </DialogHeader>

        {isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-sm text-amber-800">
            <Lock className="w-4 h-4 flex-shrink-0" />
            <span>This report has been completed and is now read-only. You can still download the PDF.</span>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="job" className="flex items-center gap-1">
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">Job Details</span>
            </TabsTrigger>
            <TabsTrigger value="works" className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Works</span>
            </TabsTrigger>
            <TabsTrigger value="materials" className="flex items-center gap-1">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Materials</span>
            </TabsTrigger>
            <TabsTrigger value="sign" className="flex items-center gap-1">
              <PenTool className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Off</span>
            </TabsTrigger>
          </TabsList>

          <fieldset disabled={isLocked} className="flex-1 overflow-y-auto py-4">
            <TabsContent value="job" className="mt-0 space-y-4">
              {/* Site Info Header */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="grid grid-cols-2 gap-4">
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

              <div className="grid grid-cols-2 gap-4">
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
                  <Label>Attendance Day</Label>
                  <Select value={attendanceDay} onValueChange={setAttendanceDay}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((day) => (
                        <SelectItem key={day} value={day}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Label>Works Report</Label>
                <Textarea
                  value={worksReport}
                  onChange={(e) => setWorksReport(e.target.value)}
                  placeholder="Describe the work carried out..."
                  className="min-h-[150px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Further Action / Comments</Label>
                <Textarea
                  value={furtherAction}
                  onChange={(e) => setFurtherAction(e.target.value)}
                  placeholder="Any follow-up actions required..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Time & Attendance</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>No. of Engineers</Label>
                    <Input
                      type="number"
                      min={1}
                      value={numEngineers}
                      onChange={(e) => setNumEngineers(e.target.value ? parseInt(e.target.value) : "")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Finish Time</Label>
                    <Input
                      type="time"
                      value={finishTime}
                      onChange={(e) => setFinishTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Travel Time (hrs)</Label>
                    <Input
                      value={travelTime}
                      onChange={(e) => setTravelTime(e.target.value)}
                      placeholder="e.g. 1.5"
                    />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Duration (hrs)</Label>
                    <div className="relative">
                      <Input
                        value={duration}
                        readOnly
                        placeholder="Auto-calculated"
                        className="bg-muted/50 cursor-default"
                      />
                      {startTime && finishTime && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          {(() => {
                            const hours = Math.floor(parseFloat(duration) || 0);
                            const minutes = Math.round(((parseFloat(duration) || 0) - hours) * 60);
                            return `${hours}h ${minutes}m`;
                          })()}
                        </span>
                      )}
                    </div>
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

              {/* Service Summary Row */}
              <div className="grid grid-cols-4 gap-3 bg-muted/30 rounded-lg p-3">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Date</p>
                  <p className="font-semibold text-sm">{visit.visit_date}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Arrival</p>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="text-sm h-8 text-center border-0 bg-background"
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Departure</p>
                  <Input
                    type="time"
                    value={finishTime}
                    onChange={(e) => setFinishTime(e.target.value)}
                    className="text-sm h-8 text-center border-0 bg-background"
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Duration</p>
                  <Input
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="hrs"
                    className="text-sm h-8 text-center border-0 bg-background"
                  />
                </div>
              </div>

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
                        <Input
                          type="time"
                          value={engineerSignTime}
                          onChange={(e) => setEngineerSignTime(e.target.value)}
                          className="text-xs h-8"
                        />
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

        <DialogFooter className="border-t pt-4 flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownloadPDF} className="mr-auto">
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
          
          {isLocked ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              Report Locked
            </div>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                variant="secondary" 
                onClick={async () => {
                  await handleSave(false);
                  onOpenChange(false);
                }} 
                disabled={saving}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Report
              </Button>
              {showCompleteVisit ? (
                <Button variant="hero" onClick={handleCompleteVisit} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Complete Visit
                </Button>
              ) : (
                <Button variant="hero" onClick={() => handleSave(true)} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Complete Report
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Invoice Prompt Dialog */}
      <InvoicePromptDialog
        open={showInvoicePrompt}
        onOpenChange={setShowInvoicePrompt}
        onConfirm={handleInvoicePromptConfirm}
        onDecline={handleInvoicePromptDecline}
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
        />
      )}
    </Dialog>
  );
}

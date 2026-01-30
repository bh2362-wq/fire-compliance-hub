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
import { toast } from "sonner";
import { Loader2, FileText, ClipboardList, Package, PenTool, Download, CalendarIcon, Clock } from "lucide-react";
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
}: WorkReportDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [activeTab, setActiveTab] = useState("job");
  const [siteInfo, setSiteInfo] = useState<{
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
  const [customerName, setCustomerName] = useState("");
  const [customerSignature, setCustomerSignature] = useState("");
  const [customerSignDate, setCustomerSignDate] = useState<Date | undefined>(undefined);
  const [customerSignTime, setCustomerSignTime] = useState("");

  useEffect(() => {
    if (open && user) {
      loadReport();
    }
  }, [open, user, visit.id]);

  const loadReport = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Fetch site info
      const { data: site } = await supabase
        .from("sites")
        .select("name, address, city, postcode, contact_name")
        .eq("id", visit.site_id)
        .maybeSingle();

      setSiteInfo(site);

      let existingReport = await getServiceReport(visit.id);

      if (!existingReport) {
        existingReport = await createServiceReport(visit.id, visit.site_id, user.id, {
          engineer_name: user.user_metadata?.full_name || "",
        });
      }

      setReport(existingReport);
      populateForm(existingReport);
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
    if (!report) return;

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

      toast.success(complete ? "Work report completed" : "Work report saved");
      if (complete) {
        onOpenChange(false);
        onSuccess?.();
      }
    } catch (error) {
      console.error("Failed to save report:", error);
      toast.error("Failed to save work report");
    } finally {
      setSaving(false);
    }
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
          </DialogTitle>
          <DialogDescription>
            {siteInfo?.name || visit.sites?.name} - {visit.visit_date}
          </DialogDescription>
        </DialogHeader>

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

          <div className="flex-1 overflow-y-auto py-4">
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
                  <Label>Certificate No</Label>
                  <Input
                    value={certificateNo}
                    onChange={(e) => setCertificateNo(e.target.value)}
                    placeholder="CR BHO..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Job Number</Label>
                  <Input
                    value={jobNumber}
                    onChange={(e) => setJobNumber(e.target.value)}
                    placeholder="Fire Services job no"
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
                    <Input
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      placeholder="Total hours on site"
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

            <TabsContent value="sign" className="mt-0 space-y-6">
              {/* Completion Summary */}
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-4 h-4 rounded-full ${workCompleted ? 'bg-green-500' : 'bg-amber-500'}`} />
                  <h3 className="font-semibold text-lg">
                    {workCompleted ? 'Works Completed' : 'Works In Progress'}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  I confirm that all works have been carried out to a satisfactory standard and the system has been left in a safe, operational condition.
                </p>
              </div>

              {/* Date & Time Summary */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-3 text-sm uppercase tracking-wide text-muted-foreground">Service Date & Time</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-background rounded-lg border">
                    <p className="text-xs text-muted-foreground mb-1">Date</p>
                    <p className="font-semibold">{visit.visit_date}</p>
                  </div>
                  <div className="text-center p-3 bg-background rounded-lg border">
                    <p className="text-xs text-muted-foreground mb-1">Arrival</p>
                    <p className="font-semibold">{startTime || '—'}</p>
                  </div>
                  <div className="text-center p-3 bg-background rounded-lg border">
                    <p className="text-xs text-muted-foreground mb-1">Departure</p>
                    <p className="font-semibold">{finishTime || '—'}</p>
                  </div>
                  <div className="text-center p-3 bg-background rounded-lg border">
                    <p className="text-xs text-muted-foreground mb-1">Duration</p>
                    <p className="font-semibold">{duration ? `${duration} hrs` : '—'}</p>
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 p-4 border-2 rounded-lg bg-background">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-base">Engineer Sign-Off</h4>
                    {engineerSignature && <span className="text-xs text-green-600 font-medium">✓ Signed</span>}
                  </div>
                  <div className="space-y-2">
                    <Label>Print Name</Label>
                    <Input
                      value={engineerName}
                      onChange={(e) => setEngineerName(e.target.value)}
                      placeholder="Engineer name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Signature</Label>
                    <SignaturePad
                      value={engineerSignature}
                      onChange={setEngineerSignature}
                      width={280}
                      height={140}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" /> Date
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal text-sm h-9",
                              !engineerSignDate && "text-muted-foreground"
                            )}
                          >
                            {engineerSignDate ? format(engineerSignDate, "dd/MM/yyyy") : "Select date"}
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
                      <Label className="text-xs flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Time
                      </Label>
                      <Input
                        type="time"
                        value={engineerSignTime}
                        onChange={(e) => setEngineerSignTime(e.target.value)}
                        className="text-sm h-9"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-4 border-2 rounded-lg bg-background">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-base">Customer Sign-Off</h4>
                    {customerSignature && <span className="text-xs text-green-600 font-medium">✓ Signed</span>}
                  </div>
                  <div className="space-y-2">
                    <Label>Print Name</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Signature</Label>
                    <SignaturePad
                      value={customerSignature}
                      onChange={setCustomerSignature}
                      width={280}
                      height={140}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" /> Date
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal text-sm h-9",
                              !customerSignDate && "text-muted-foreground"
                            )}
                          >
                            {customerSignDate ? format(customerSignDate, "dd/MM/yyyy") : "Select date"}
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
                      <Label className="text-xs flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Time
                      </Label>
                      <Input
                        type="time"
                        value={customerSignTime}
                        onChange={(e) => setCustomerSignTime(e.target.value)}
                        className="text-sm h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="border-t pt-4 flex-wrap gap-2">
          <Button variant="outline" onClick={handleDownloadPDF} className="mr-auto">
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Draft
          </Button>
          <Button variant="hero" onClick={() => handleSave(true)} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete Report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

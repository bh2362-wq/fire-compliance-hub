import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Lock,
  Unlock,
  Pencil,
  Download,
  FileText,
  Calendar,
  MapPin,
  User,
  Wrench,
  CheckCircle2,
  Clock,
  AlertCircle,
  Receipt,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateWorkReportPDF, WorkReportData, generateASDReportPDF, generateServiceReportPDF } from "@/lib/pdfGenerator";
import { Visit } from "@/hooks/useVisits";
import { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

interface ReportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: Visit;
  onEdit?: (reportType?: "bs5839" | "work" | "asd" | "disabled_refuge") => void;
}

interface SiteDetails {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
}

interface ReportData {
  id: string;
  status: string;
  report_date: string;
  report_number: string | null;
  engineer_name: string | null;
  client_name: string | null;
  work_carried_out: string | null;
  parts_used: string | null;
  defects_found: string | null;
  recommendations: string | null;
  notes: string | null;
  system_condition: string | null;
  system_type: string | null;
  panel_manufacturer: string | null;
  panel_model: string | null;
  panel_location: string | null;
  zones_count: number | null;
  devices_count: number | null;
  checklist: Json;
  engineer_signature: string | null;
  client_signature: string | null;
}

// Parse notes JSON which contains work report data from WorkReportDialog
interface ParsedNotes {
  jobNumber?: string;
  workCompleted?: boolean;
  returnRequired?: boolean;
  surveyRequired?: boolean;
  quotationRequired?: boolean;
  ramsCompleted?: boolean;
  logBookEntry?: boolean;
  systemStatusArrival?: string;
  systemStatusDeparture?: string;
  appointmentDate?: string;
  numEngineers?: number;
  startTime?: string;
  finishTime?: string;
  travelTime?: string;
  duration?: string;
  jobType?: string;
  materials?: { name: string; qty: string; cost: string }[];
  engineerSignature?: string;
  customerSignature?: string;
  customerNotPresent?: boolean;
  engineerSignDate?: string;
  engineerSignTime?: string;
  customerSignDate?: string;
  customerSignTime?: string;
}

function parseReportNotes(notes: string | null): ParsedNotes {
  if (!notes) return {};
  try {
    return JSON.parse(notes) as ParsedNotes;
  } catch {
    return {};
  }
}

// Helper to detect report type from notes
function detectReportType(notes: string | null): "bs5839" | "work" | "asd" | "disabled_refuge" | undefined {
  if (!notes) return undefined;
  try {
    const parsed = JSON.parse(notes);
    // ASD reports have report_type: "asd"
    if (parsed.report_type === "asd") return "asd";
    // Disabled Refuge reports have report_type: "disabled_refuge"
    if (parsed.report_type === "disabled_refuge") return "disabled_refuge";
    // Work reports have jobNumber or jobType but not asd
    if (typeof parsed.jobNumber !== "undefined" || typeof parsed.jobType !== "undefined") return "work";
    // Default to BS5839
    return "bs5839";
  } catch {
    return undefined;
  }
}

interface InvoiceData {
  xero_invoice_number: string | null;
  status: string | null;
  total_amount: number | null;
}

export function ReportPreviewDialog({
  open,
  onOpenChange,
  visit,
  onEdit,
}: ReportPreviewDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportData | null>(null);
  const [siteDetails, setSiteDetails] = useState<SiteDetails | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");

  const isLocked = report?.status === "completed";
  const canUnlock = unlockReason.trim().length >= 10;

  // Reset and reload data when dialog opens
  useEffect(() => {
    if (open && visit?.id) {
      // Force fresh data load on every open
      setReport(null);
      setSiteDetails(null);
      setInvoice(null);
      loadReport();
    }
  }, [open, visit?.id]);

  const loadReport = async () => {
    setLoading(true);
    try {
      // Fetch report, site details, and invoice in parallel
      const [reportResult, siteResult, invoiceResult] = await Promise.all([
        supabase
          .from("service_reports")
          .select("*")
          .eq("visit_id", visit.id)
          .maybeSingle(),
        supabase
          .from("sites")
          .select("id, name, address, city, postcode, contact_name, contact_phone, contact_email")
          .eq("id", visit.site_id)
          .single(),
        supabase
          .from("xero_invoices")
          .select("xero_invoice_number, status, total_amount")
          .eq("visit_id", visit.id)
          .maybeSingle(),
      ]);

      if (reportResult.error) throw reportResult.error;
      if (siteResult.error) throw siteResult.error;
      
      setReport(reportResult.data);
      setSiteDetails(siteResult.data);
      setInvoice(invoiceResult.data);
    } catch (error) {
      console.error("Failed to load report:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!report || !siteDetails) return;
    setDownloading(true);
    try {
      // Always fetch latest report from backend before generating PDF
      const { data: latestReport, error } = await supabase
        .from("service_reports")
        .select("*")
        .eq("visit_id", visit.id)
        .maybeSingle();

      if (error) throw error;

      const src = (latestReport || report) as ReportData;
      const parsedNotes = parseReportNotes(src.notes);
      const reportType = detectReportType(src.notes);

      if (reportType === "asd") {
        // ASD Report PDF
        const parsed = JSON.parse(src.notes || "{}");
        const units = parsed.units || [];
        
        generateASDReportPDF(
          {
            reportNumber: src.report_number || "",
            reportDate: src.report_date,
            engineerName: src.engineer_name || "",
            clientName: src.client_name || "",
            units: units,
            workCarriedOut: src.work_carried_out || "",
            partsUsed: "",
            notes: parsed.additional_notes || "",
            engineerSignature: parsed.engineerSignature || "",
            engineerSignDate: parsed.engineerSignDate || "",
            engineerSignTime: parsed.engineerSignTime || "",
            customerNotPresent: parsed.customerNotPresent || false,
            customerSignature: parsed.customerSignature || "",
            customerSignDate: parsed.customerSignDate || "",
            customerSignTime: parsed.customerSignTime || "",
          },
          {
            name: siteDetails.name,
            address: siteDetails.address,
            city: siteDetails.city,
            postcode: siteDetails.postcode,
            contact_name: siteDetails.contact_name,
            contact_phone: siteDetails.contact_phone,
          },
          visit.visit_date,
          visit.visit_type
        );
      } else if (reportType === "work") {
        // Work Report PDF
        const checklist = (src.checklist || {}) as Record<string, unknown>;
        const workReportData: WorkReportData = {
          certificateNo: src.report_number || "",
          jobNumber: parsedNotes.jobNumber || "",
          jobType: (parsedNotes.jobType as string) || (checklist.jobType as string) || "service",
          appointmentDate: parsedNotes.appointmentDate || "",
          systemStatusArrival: parsedNotes.systemStatusArrival || "",
          systemStatusDeparture: parsedNotes.systemStatusDeparture || "",
          workCompleted: !!parsedNotes.workCompleted,
          returnRequired: !!parsedNotes.returnRequired,
          surveyRequired: !!parsedNotes.surveyRequired,
          quotationRequired: !!parsedNotes.quotationRequired,
          ramsCompleted: !!parsedNotes.ramsCompleted,
          logBookEntry: !!parsedNotes.logBookEntry,
          worksReport: src.work_carried_out || "",
          furtherAction: src.recommendations || "",
          numEngineers: parsedNotes.numEngineers ?? 1,
          startTime: parsedNotes.startTime || "",
          finishTime: parsedNotes.finishTime || "",
          travelTime: parsedNotes.travelTime || "",
          duration: parsedNotes.duration || "",
          materials: parsedNotes.materials || [],
          engineerName: src.engineer_name || "",
          engineerSignature: parsedNotes.engineerSignature || undefined,
          engineerSignDate: parsedNotes.engineerSignDate || undefined,
          engineerSignTime: parsedNotes.engineerSignTime || undefined,
          customerNotPresent: parsedNotes.customerNotPresent || false,
          customerName: src.client_name || "",
          customerSignature: parsedNotes.customerSignature || undefined,
          customerSignDate: parsedNotes.customerSignDate || undefined,
          customerSignTime: parsedNotes.customerSignTime || undefined,
          customerPosition: "",
          systemType: src.system_type || undefined,
          panelManufacturer: src.panel_manufacturer || undefined,
          panelModel: src.panel_model || undefined,
          panelLocation: src.panel_location || undefined,
          zonesCount: src.zones_count || undefined,
          devicesCount: src.devices_count || undefined,
        };

        generateWorkReportPDF(
          workReportData,
          {
            name: siteDetails.name,
            address: siteDetails.address,
            city: siteDetails.city,
            postcode: siteDetails.postcode,
            contact_name: siteDetails.contact_name,
            contact_phone: siteDetails.contact_phone,
          },
          visit.visit_date,
          visit.visit_type
        );
      } else {
        // BS5839 Report PDF
        const parsed = JSON.parse(src.notes || "{}");
        const signatures = {
          engineerSignature: src.engineer_signature || parsed.engineerSignature || "",
          engineerSignDate: parsed.engineerSignDate || "",
          engineerSignTime: parsed.engineerSignTime || "",
          customerNotPresent: parsed.customerNotPresent || false,
          customerSignature: src.client_signature || parsed.customerSignature || "",
          customerSignDate: parsed.customerSignDate || "",
          customerSignTime: parsed.customerSignTime || "",
        };
        
        // Extract multi-panel checklist data if present
        let panels = undefined;
        if (parsed.multi_panel && Array.isArray(parsed.panel_checklists)) {
          panels = parsed.panel_checklists;
        }
        
        generateServiceReportPDF(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          src as any,
          {
            name: siteDetails.name,
            address: siteDetails.address,
            city: siteDetails.city,
            postcode: siteDetails.postcode,
            contact_name: siteDetails.contact_name,
            contact_phone: siteDetails.contact_phone,
          },
          { visit_type: visit.visit_type, visit_date: visit.visit_date },
          panels,
          signatures
        );
      }
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    } finally {
      setDownloading(false);
    }
  };

  const handleUnlockReport = async () => {
    if (!report || !canUnlock) return;
    setUnlocking(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("service_reports")
        .update({ status: "draft" })
        .eq("id", report.id);

      if (error) throw error;

      // Log the unlock action with reason
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        action: "report_unlocked",
        entity_type: "service_report",
        entity_id: report.id,
        details: {
          report_number: report.report_number,
          visit_id: visit.id,
          site_name: siteDetails?.name,
          reason: unlockReason.trim(),
        },
      });

      toast({
        title: "Report unlocked",
        description: "The report is now available for editing.",
      });

      // Reload report to get updated status
      await loadReport();
      setShowUnlockConfirm(false);
      setUnlockReason("");
    } catch (error) {
      console.error("Failed to unlock report:", error);
      toast({
        title: "Error",
        description: "Failed to unlock report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUnlocking(false);
    }
  };

  const handleCloseUnlockDialog = (open: boolean) => {
    if (!open) {
      setUnlockReason("");
    }
    setShowUnlockConfirm(open);
  };

  const getVisitTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      quarterly: "Quarterly Service",
      biannual: "Biannual Service",
      annual: "Annual Service",
      emergency: "Emergency",
      remedial: "Remedial",
      installation: "Installation",
      commissioning: "Commissioning",
    };
    return labels[type] || type;
  };

  const getInvoiceStatusBadge = () => {
    if (!invoice) return null;
    
    if (invoice.status === "PAID") {
      return (
        <Badge className="bg-success/10 text-success border-success/20">
          <Receipt className="w-3 h-3 mr-1" />
          Paid
        </Badge>
      );
    }
    if (invoice.status === "AUTHORISED" || invoice.status === "SUBMITTED") {
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          <Receipt className="w-3 h-3 mr-1" />
          Invoiced ({invoice.xero_invoice_number})
        </Badge>
      );
    }
    if (invoice.status === "DRAFT") {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Draft Invoice
        </Badge>
      );
    }
    return null;
  };

  const siteName = siteDetails?.name || visit.site?.name || "Site";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Service Report
                {isLocked && (
                  <Badge variant="secondary" className="ml-2 bg-muted">
                    <Lock className="w-3 h-3 mr-1" />
                    Archived
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {siteName} - {getVisitTypeLabel(visit.visit_type)}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {getInvoiceStatusBadge()}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !report ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Report Found</h3>
              <p className="text-muted-foreground mb-4">
                A report hasn't been created for this visit yet.
              </p>
              {onEdit && (
                <Button onClick={() => onEdit()}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Create Report
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Parse notes for work report data */}
              {(() => {
                const parsedNotes = parseReportNotes(report.notes);
                const checklist = report.checklist as Record<string, unknown>;
                
                // Get data from either notes (WorkReportDialog) or checklist (ServiceReportDialog)
                const workCompleted = parsedNotes.workCompleted ?? checklist?.workCompleted;
                const startTime = parsedNotes.startTime ?? checklist?.arrivalTime;
                const finishTime = parsedNotes.finishTime ?? checklist?.departureTime;
                const duration = parsedNotes.duration;
                const jobType = parsedNotes.jobType ?? checklist?.jobType;
                const engSignature = parsedNotes.engineerSignature ?? report.engineer_signature;
                const custSignature = parsedNotes.customerSignature ?? report.client_signature;
                const customerNotPresent = parsedNotes.customerNotPresent ?? checklist?.customerNotPresent;

                return (
                  <>
                    {/* Visit Info */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Date:</span>
                        <span className="font-medium">
                          {format(new Date(report.report_date), "dd MMM yyyy")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Site:</span>
                        <span className="font-medium">{siteName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Engineer:</span>
                        <span className="font-medium">{report.engineer_name || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Wrench className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Job Type:</span>
                        <span className="font-medium capitalize">
                          {(jobType as string) || "Service"}
                        </span>
                      </div>
                    </div>

                    {/* Status Summary */}
                    <div className="flex items-center gap-3 p-4 rounded-lg border">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        workCompleted
                          ? "bg-success/10"
                          : "bg-amber-100"
                      }`}>
                        {workCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-success" />
                        ) : (
                          <Clock className="w-5 h-5 text-amber-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">
                          {workCompleted
                            ? "Works Completed"
                            : "Works In Progress"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {startTime && finishTime
                            ? `${startTime} - ${finishTime}${duration ? ` (${duration} hrs)` : ""}`
                            : "Time not recorded"}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    {/* Work Details */}
                    <div className="space-y-4">
                      <h4 className="font-medium">Work Carried Out</h4>
                      <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg whitespace-pre-wrap">
                        {report.work_carried_out || "No details recorded"}
                      </p>
                    </div>

                    {report.parts_used && (
                      <div className="space-y-2">
                        <h4 className="font-medium">Parts Used</h4>
                        <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg whitespace-pre-wrap">
                          {report.parts_used}
                        </p>
                      </div>
                    )}

                    {report.defects_found && (
                      <div className="space-y-2">
                        <h4 className="font-medium">Defects Found</h4>
                        <p className="text-sm text-muted-foreground bg-amber-50 border-amber-200 border p-3 rounded-lg whitespace-pre-wrap">
                          {report.defects_found}
                        </p>
                      </div>
                    )}

                    {report.recommendations && (
                      <div className="space-y-2">
                        <h4 className="font-medium">Recommendations</h4>
                        <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg whitespace-pre-wrap">
                          {report.recommendations}
                        </p>
                      </div>
                    )}

                    <Separator />

                    {/* Signatures */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Engineer Signature</h4>
                        {engSignature ? (
                          <div className="border rounded-lg p-2 bg-white">
                            <img
                              src={engSignature as string}
                              alt="Engineer signature"
                              className="max-h-16 mx-auto"
                            />
                            <p className="text-center text-xs text-muted-foreground mt-1">
                              {report.engineer_name}
                            </p>
                          </div>
                        ) : (
                          <div className="border rounded-lg p-4 bg-muted/30 text-center text-sm text-muted-foreground">
                            Not signed
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Customer Signature</h4>
                        {custSignature ? (
                          <div className="border rounded-lg p-2 bg-white">
                            <img
                              src={custSignature as string}
                              alt="Customer signature"
                              className="max-h-16 mx-auto"
                            />
                            <p className="text-center text-xs text-muted-foreground mt-1">
                              {report.client_name}
                            </p>
                          </div>
                        ) : customerNotPresent ? (
                          <div className="border border-amber-200 rounded-lg p-4 bg-amber-50 text-center text-sm text-amber-700">
                            Customer not present
                          </div>
                        ) : (
                          <div className="border rounded-lg p-4 bg-muted/30 text-center text-sm text-muted-foreground">
                            Not signed
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </ScrollArea>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            {report && (
              <Button
                variant="outline"
                onClick={handleDownloadPDF}
                disabled={downloading}
              >
                <Download className="w-4 h-4 mr-2" />
                {downloading ? "Generating..." : "Download PDF"}
              </Button>
            )}
            {isLocked && report && (
              <Button
                variant="outline"
                onClick={() => setShowUnlockConfirm(true)}
                className="text-amber-600 hover:text-amber-700 border-amber-300 hover:border-amber-400 hover:bg-amber-50"
              >
                <Unlock className="w-4 h-4 mr-2" />
                Unlock
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={loadReport}
              disabled={loading}
              title="Refresh report data"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Refresh"
              )}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {report && onEdit && (
              <Button onClick={() => onEdit(detectReportType(report.notes))} disabled={isLocked}>
                <Pencil className="w-4 h-4 mr-2" />
                {isLocked ? "View Only" : "Edit Report"}
              </Button>
            )}
            {!report && onEdit && (
              <Button onClick={() => onEdit()}>
                <Pencil className="w-4 h-4 mr-2" />
                Create Report
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Unlock Confirmation Dialog */}
      <AlertDialog open={showUnlockConfirm} onOpenChange={handleCloseUnlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlock className="w-5 h-5 text-amber-600" />
              Unlock Report for Editing
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Are you sure you want to unlock this completed report? This will allow modifications to be made.
                </p>
                <p className="text-amber-600 font-medium">
                  Note: You will need to complete the report again after making changes.
                </p>
                <div className="space-y-2 pt-2">
                  <Label htmlFor="unlock-reason" className="text-foreground font-medium">
                    Reason for unlocking <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="unlock-reason"
                    placeholder="Please provide a reason for unlocking this report (minimum 10 characters)..."
                    value={unlockReason}
                    onChange={(e) => setUnlockReason(e.target.value)}
                    className="min-h-[80px] text-foreground"
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground">
                    {unlockReason.length}/500 characters 
                    {unlockReason.length > 0 && unlockReason.length < 10 && (
                      <span className="text-destructive ml-2">
                        (minimum 10 characters required)
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlockReport}
              disabled={unlocking || !canUnlock}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
            >
              {unlocking ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Unlocking...
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 mr-2" />
                  Unlock Report
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

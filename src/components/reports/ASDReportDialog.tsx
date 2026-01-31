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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { SignaturePad } from "@/components/ui/signature-pad";
import { toast } from "sonner";
import { Loader2, Wind, ClipboardCheck, Settings, FileCheck, FileText, Download, PenTool, CalendarIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ASDChecklist, getDefaultASDChecklist } from "@/services/asdChecklistService";
import { ASDReportChecklist } from "./ASDReportChecklist";

interface ASDAsset {
  id: string;
  item_name: string;
  manufacturer?: string | null;
  model?: string | null;
  location?: string | null;
}

interface VisitForReport {
  id: string;
  visit_type: string;
  visit_date: string;
  site_id: string;
  sites?: { name: string } | null;
}

interface ASDReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: VisitForReport;
  asset: ASDAsset;
  onSuccess?: () => void;
  showCompleteVisit?: boolean;
}

export function ASDReportDialog({
  open,
  onOpenChange,
  visit,
  asset,
  onSuccess,
  showCompleteVisit = false,
}: ASDReportDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("details");

  // Form state
  const [reportNumber, setReportNumber] = useState("");
  const [engineerName, setEngineerName] = useState("");
  const [clientName, setClientName] = useState("");
  const [checklist, setChecklist] = useState<ASDChecklist>(getDefaultASDChecklist());
  const [systemCondition, setSystemCondition] = useState("");
  const [defectsFound, setDefectsFound] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [workCarriedOut, setWorkCarriedOut] = useState("");
  const [partsUsed, setPartsUsed] = useState("");
  const [notes, setNotes] = useState("");

  // Signature state
  const [engineerSignature, setEngineerSignature] = useState("");
  const [engineerSignDate, setEngineerSignDate] = useState<Date | undefined>(undefined);
  const [engineerSignTime, setEngineerSignTime] = useState("");
  const [customerNotPresent, setCustomerNotPresent] = useState(false);
  const [customerSignature, setCustomerSignature] = useState("");
  const [customerSignDate, setCustomerSignDate] = useState<Date | undefined>(undefined);
  const [customerSignTime, setCustomerSignTime] = useState("");

  useEffect(() => {
    if (open && user) {
      loadOrCreateReport();
    }
  }, [open, user, visit.id, asset.id]);

  const loadOrCreateReport = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Check for existing ASD report for this visit+asset
      const { data: existing } = await supabase
        .from("service_reports")
        .select("*")
        .eq("visit_id", visit.id)
        .eq("notes", `{"report_type":"asd","asset_id":"${asset.id}"}`)
        .maybeSingle();

      if (existing) {
        setReportId(existing.id);
        populateForm(existing);
      } else {
        // Get auto-generated report number for ASD (use CERT type)
        const { data: numberData, error: numberError } = await supabase
          .rpc('get_next_report_number', { report_type: 'CERT' });
        
        if (numberError) {
          console.error("Failed to generate report number:", numberError);
        }

        // Create new ASD report
        const { data: newReport, error } = await supabase
          .from("service_reports")
          .insert({
            visit_id: visit.id,
            site_id: visit.site_id,
            created_by: user.id,
            checklist: JSON.parse(JSON.stringify(getDefaultASDChecklist())),
            engineer_name: user.user_metadata?.full_name || "",
            panel_manufacturer: asset.manufacturer || "",
            panel_model: asset.model || "",
            panel_location: asset.location || "",
            report_number: numberData || null,
            notes: JSON.stringify({ report_type: "asd", asset_id: asset.id, asset_name: asset.item_name }),
          })
          .select()
          .single();

        if (error) throw error;
        setReportId(newReport.id);
        setReportNumber(numberData || "");
        setEngineerName(user.user_metadata?.full_name || "");
      }
    } catch (error) {
      console.error("Failed to load ASD report:", error);
      toast.error("Failed to load ASD service report");
    } finally {
      setLoading(false);
    }
  };

  const populateForm = (r: Record<string, unknown>) => {
    setReportNumber((r.report_number as string) || "");
    setEngineerName((r.engineer_name as string) || "");
    setClientName((r.client_name as string) || "");
    
    // Parse checklist - it's stored as JSON
    const checklistData = r.checklist as ASDChecklist | null;
    setChecklist(checklistData || getDefaultASDChecklist());
    
    setSystemCondition((r.system_condition as string) || "");
    setDefectsFound((r.defects_found as string) || "");
    setRecommendations((r.recommendations as string) || "");
    setWorkCarriedOut((r.work_carried_out as string) || "");
    setPartsUsed((r.parts_used as string) || "");

    // Parse notes to get any additional data including signatures
    try {
      const notesData = JSON.parse((r.notes as string) || "{}");
      setNotes(notesData.additional_notes || "");
      // Signature data
      setEngineerSignature(notesData.engineerSignature || "");
      if (notesData.engineerSignDate) {
        setEngineerSignDate(new Date(notesData.engineerSignDate));
      }
      setEngineerSignTime(notesData.engineerSignTime || "");
      setCustomerNotPresent(notesData.customerNotPresent || false);
      setCustomerSignature(notesData.customerSignature || "");
      if (notesData.customerSignDate) {
        setCustomerSignDate(new Date(notesData.customerSignDate));
      }
      setCustomerSignTime(notesData.customerSignTime || "");
    } catch {
      setNotes((r.notes as string) || "");
    }
  };

  const handleSave = async (complete = false) => {
    if (!reportId) return;

    setSaving(true);
    try {
      const notesJson = JSON.stringify({
        report_type: "asd",
        asset_id: asset.id,
        asset_name: asset.item_name,
        additional_notes: notes,
        engineerSignature,
        engineerSignDate: engineerSignDate?.toISOString(),
        engineerSignTime,
        customerNotPresent,
        customerSignature,
        customerSignDate: customerSignDate?.toISOString(),
        customerSignTime,
      });

      await supabase
        .from("service_reports")
        .update({
          engineer_name: engineerName,
          client_name: clientName,
          checklist: JSON.parse(JSON.stringify(checklist)),
          system_condition: systemCondition,
          defects_found: defectsFound,
          recommendations,
          work_carried_out: workCarriedOut,
          parts_used: partsUsed,
          notes: notesJson,
          status: complete ? "completed" : "draft",
        })
        .eq("id", reportId);

      toast.success(complete ? "ASD report completed" : "ASD report saved");
      if (complete) {
        onOpenChange(false);
        onSuccess?.();
      }
    } catch (error) {
      console.error("Failed to save ASD report:", error);
      toast.error("Failed to save ASD service report");
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteVisit = async () => {
    if (!reportId) return;

    setSaving(true);
    try {
      const notesJson = JSON.stringify({
        report_type: "asd",
        asset_id: asset.id,
        asset_name: asset.item_name,
        additional_notes: notes,
        engineerSignature,
        engineerSignDate: engineerSignDate?.toISOString(),
        engineerSignTime,
        customerNotPresent,
        customerSignature,
        customerSignDate: customerSignDate?.toISOString(),
        customerSignTime,
      });

      await supabase
        .from("service_reports")
        .update({
          engineer_name: engineerName,
          client_name: clientName,
          checklist: JSON.parse(JSON.stringify(checklist)),
          system_condition: systemCondition,
          defects_found: defectsFound,
          recommendations,
          work_carried_out: workCarriedOut,
          parts_used: partsUsed,
          notes: notesJson,
          status: "completed",
        })
        .eq("id", reportId);

      // Mark the visit as completed
      const { error: visitError } = await supabase
        .from("visits")
        .update({ status: "completed" })
        .eq("id", visit.id);

      if (visitError) throw visitError;

      toast.success("Visit completed successfully");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Failed to complete visit:", error);
      toast.error("Failed to complete visit");
    } finally {
      setSaving(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wind className="h-5 w-5" />
            ASD Service Report - {asset.item_name}
          </DialogTitle>
          <DialogDescription>
            {visit.visit_type} at {visit.sites?.name} - {visit.visit_date}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="details" className="flex items-center gap-1">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Details</span>
            </TabsTrigger>
            <TabsTrigger value="checklist" className="flex items-center gap-1">
              <ClipboardCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Checklist</span>
            </TabsTrigger>
            <TabsTrigger value="summary" className="flex items-center gap-1">
              <FileCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Summary</span>
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Notes</span>
            </TabsTrigger>
            <TabsTrigger value="signoff" className="flex items-center gap-1">
              <PenTool className="w-4 h-4" />
              <span className="hidden sm:inline">Sign-off</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4">
            <TabsContent value="details" className="mt-0 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Certificate Number</Label>
                  <Input
                    value={reportNumber}
                    readOnly
                    className="bg-muted/50 font-mono"
                    placeholder="Auto-generated"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Engineer Name</Label>
                  <Input
                    value={engineerName}
                    onChange={(e) => setEngineerName(e.target.value)}
                    placeholder="Engineer name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client Representative</Label>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Client name"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">ASD Unit Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Unit Name</Label>
                    <Input value={asset.item_name} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Manufacturer</Label>
                    <Input value={asset.manufacturer || "—"} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Input value={asset.model || "—"} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Input value={asset.location || "—"} disabled className="bg-muted" />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="checklist" className="mt-0">
              <ASDReportChecklist
                checklist={checklist}
                onChange={setChecklist}
              />
            </TabsContent>

            <TabsContent value="summary" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label>System Condition</Label>
                <Select value={systemCondition} onValueChange={setSystemCondition}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select overall condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="satisfactory">Satisfactory</SelectItem>
                    <SelectItem value="requires_attention">Requires Attention</SelectItem>
                    <SelectItem value="unsatisfactory">Unsatisfactory</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Defects Found</Label>
                <Textarea
                  value={defectsFound}
                  onChange={(e) => setDefectsFound(e.target.value)}
                  placeholder="List any defects or faults identified..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Recommendations</Label>
                <Textarea
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  placeholder="Recommended actions or improvements..."
                  className="min-h-[100px]"
                />
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label>Work Carried Out</Label>
                <Textarea
                  value={workCarriedOut}
                  onChange={(e) => setWorkCarriedOut(e.target.value)}
                  placeholder="Describe work performed during this visit..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Parts Used</Label>
                <Textarea
                  value={partsUsed}
                  onChange={(e) => setPartsUsed(e.target.value)}
                  placeholder="List any parts or materials used..."
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Additional Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any other observations or comments..."
                  className="min-h-[100px]"
                />
              </div>
            </TabsContent>

            <TabsContent value="signoff" className="mt-0 space-y-4">
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
                        id="asdCustomerNotPresent"
                        checked={customerNotPresent}
                        onCheckedChange={(checked) => setCustomerNotPresent(!!checked)}
                      />
                      <Label htmlFor="asdCustomerNotPresent" className="text-sm cursor-pointer">
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
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
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
          </div>
        </Tabs>

        <DialogFooter className="border-t pt-4 flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Draft
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

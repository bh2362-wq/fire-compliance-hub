import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { SignaturePad } from "@/components/ui/signature-pad";
import { toast } from "sonner";
import { Loader2, Wind, ClipboardCheck, Settings, FileCheck, FileText, Download, PenTool, CalendarIcon, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ASDChecklist, getDefaultASDChecklist } from "@/services/asdChecklistService";
import { MultiASDChecklist, ASDChecklistData, initializeASDChecklists } from "./MultiASDChecklist";

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
  assets: ASDAsset[];  // Changed from single asset to array
  onSuccess?: () => void;
  showCompleteVisit?: boolean;
}

export function ASDReportDialog({
  open,
  onOpenChange,
  visit,
  assets,
  onSuccess,
  showCompleteVisit = false,
}: ASDReportDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("details");

  // Determine if report is locked (completed)
  const [isLocked, setIsLocked] = useState(false);

  // Multi-unit state
  const [units, setUnits] = useState<ASDChecklistData[]>([]);
  const hasMultipleUnits = assets.length > 1;

  // Form state
  const [reportNumber, setReportNumber] = useState("");
  const [engineerName, setEngineerName] = useState("");
  const [clientName, setClientName] = useState("");
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

  // Customer signature persistence
  const [customerId, setCustomerId] = useState<string | null>(null);

  useEffect(() => {
    if (open && user && assets.length > 0) {
      loadOrCreateReport();
    }
  }, [open, user, visit.id, assets]);

  const loadOrCreateReport = async () => {
    if (!user || assets.length === 0) return;
    setLoading(true);

    try {
      // Load site with customer info including stored signature
      const { data: siteData } = await supabase
        .from("sites")
        .select("customer_id, customers(id, client_signature, contact_name)")
        .eq("id", visit.site_id)
        .maybeSingle();

      if (siteData?.customers) {
        const customer = siteData.customers as { id: string; client_signature: string | null; contact_name: string | null };
        setCustomerId(customer.id);
        if (customer.client_signature) {
          setCustomerSignature(customer.client_signature);
        }
        if (customer.contact_name && !clientName) {
          setClientName(customer.contact_name);
        }
      }

      // Build asset IDs for query
      const assetIds = assets.map(a => a.id);
      const notesPattern = `%"report_type":"asd"%`;

      // Check for existing ASD report for this visit (single report for all ASD units)
      const { data: existing } = await supabase
        .from("service_reports")
        .select("*")
        .eq("visit_id", visit.id)
        .like("notes", notesPattern)
        .maybeSingle();

      if (existing) {
        setReportId(existing.id);
        setIsLocked(existing.status === "completed");
        populateForm(existing);
      } else {
        // Initialize unit checklists from assets
        const initialUnits = initializeASDChecklists(assets);
        setUnits(initialUnits);

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
            panel_manufacturer: assets[0]?.manufacturer || "",
            panel_model: assets[0]?.model || "",
            panel_location: assets[0]?.location || "",
            report_number: numberData || null,
            notes: JSON.stringify({ 
              report_type: "asd", 
              asset_ids: assetIds,
              units: initialUnits,
            }),
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
    setSystemCondition((r.system_condition as string) || "");
    setDefectsFound((r.defects_found as string) || "");
    setRecommendations((r.recommendations as string) || "");
    setWorkCarriedOut((r.work_carried_out as string) || "");
    setPartsUsed((r.parts_used as string) || "");

    // Parse notes to get units data and signatures
    try {
      const notesData = JSON.parse((r.notes as string) || "{}");
      setNotes(notesData.additional_notes || "");
      
      // Load units data if available (new multi-unit format)
      if (notesData.units && Array.isArray(notesData.units)) {
        setUnits(notesData.units);
      } else {
        // Fallback for old single-asset format or missing units
        const initialUnits = initializeASDChecklists(assets);
        
        // If there's a checklist at report level, use it for the first/matching unit
        const checklistData = r.checklist as ASDChecklist | null;
        if (checklistData && initialUnits.length > 0) {
          // For old format with single asset_id, find the matching unit
          const oldAssetId = notesData.asset_id;
          if (oldAssetId) {
            const matchingIndex = initialUnits.findIndex(u => u.assetId === oldAssetId);
            if (matchingIndex >= 0) {
              initialUnits[matchingIndex].checklist = checklistData;
            } else {
              // If no match found, apply to first unit
              initialUnits[0].checklist = checklistData;
            }
          } else {
            // No asset_id in notes, apply to first unit
            initialUnits[0].checklist = checklistData;
          }
        }
        setUnits(initialUnits);
      }

      // Signature data
      setEngineerSignature(notesData.engineerSignature || "");
      if (notesData.engineerSignDate) {
        setEngineerSignDate(new Date(notesData.engineerSignDate));
      }
      setEngineerSignTime(notesData.engineerSignTime || "");
      setCustomerNotPresent(notesData.customerNotPresent || false);
      if (notesData.customerSignature) {
        setCustomerSignature(notesData.customerSignature);
      }
      if (notesData.customerSignDate) {
        setCustomerSignDate(new Date(notesData.customerSignDate));
      }
      setCustomerSignTime(notesData.customerSignTime || "");
    } catch {
      setNotes((r.notes as string) || "");
      // Initialize units from assets as fallback
      setUnits(initializeASDChecklists(assets));
    }
  };

  const handleSave = async (complete = false) => {
    if (!reportId) return;

    setSaving(true);
    try {
      const assetIds = assets.map(a => a.id);
      const notesJson = JSON.stringify({
        report_type: "asd",
        asset_ids: assetIds,
        units: units,
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
          checklist: JSON.parse(JSON.stringify(hasMultipleUnits ? getDefaultASDChecklist() : (units[0]?.checklist || getDefaultASDChecklist()))),
          system_condition: systemCondition,
          defects_found: defectsFound,
          recommendations,
          work_carried_out: workCarriedOut,
          parts_used: partsUsed,
          notes: notesJson,
          status: complete ? "completed" : "draft",
        })
        .eq("id", reportId);

      // Save customer signature to customer for future reports
      if (customerSignature && customerId && !customerNotPresent && complete) {
        await supabase
          .from("customers")
          .update({ client_signature: customerSignature })
          .eq("id", customerId);
      }

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
      const assetIds = assets.map(a => a.id);
      const notesJson = JSON.stringify({
        report_type: "asd",
        asset_ids: assetIds,
        units: units,
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
          checklist: JSON.parse(JSON.stringify(hasMultipleUnits ? getDefaultASDChecklist() : (units[0]?.checklist || getDefaultASDChecklist()))),
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

      // Save customer signature to customer for future reports
      if (customerSignature && customerId && !customerNotPresent) {
        await supabase
          .from("customers")
          .update({ client_signature: customerSignature })
          .eq("id", customerId);
      }

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

  const primaryAsset = assets[0];

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center gap-2 flex-wrap">
          <Wind className="h-5 w-5" />
          <span>ASD Service Report</span>
          {hasMultipleUnits && (
            <Badge variant="secondary">
              {assets.length} units
            </Badge>
          )}
          {isLocked && (
            <Badge variant="secondary" className="bg-muted">
              <Lock className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline">Completed - Read Only</span>
              <span className="sm:hidden">Locked</span>
            </Badge>
          )}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="truncate">
          {visit.visit_type} at {visit.sites?.name} - {visit.visit_date}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <ResponsiveDialogBody className="py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="details" className="flex items-center gap-1 text-xs sm:text-sm px-1 sm:px-3">
              <Settings className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Details</span>
            </TabsTrigger>
            <TabsTrigger value="checklist" className="flex items-center gap-1 text-xs sm:text-sm px-1 sm:px-3">
              <ClipboardCheck className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Checklist</span>
            </TabsTrigger>
            <TabsTrigger value="summary" className="flex items-center gap-1 text-xs sm:text-sm px-1 sm:px-3">
              <FileCheck className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Summary</span>
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex items-center gap-1 text-xs sm:text-sm px-1 sm:px-3">
              <FileText className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Notes</span>
            </TabsTrigger>
            <TabsTrigger value="signoff" className="flex items-center gap-1 text-xs sm:text-sm px-1 sm:px-3">
              <PenTool className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Sign-off</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1">
            <TabsContent value="details" className="mt-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    disabled={isLocked}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client Representative</Label>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Client name"
                    disabled={isLocked}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">
                  ASD Unit{hasMultipleUnits ? "s" : ""} Information
                </h4>
                {hasMultipleUnits ? (
                  <div className="space-y-2">
                    {assets.map((asset, index) => (
                      <div
                        key={asset.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border"
                      >
                        <Wind className="w-5 h-5 text-primary" />
                        <div className="flex-1">
                          <div className="font-medium">{asset.item_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {[asset.manufacturer, asset.model, asset.location]
                              .filter(Boolean)
                              .join(" • ") || "ASD Unit"}
                          </div>
                        </div>
                        {index === 0 && (
                          <Badge variant="secondary" className="text-xs">Primary</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Unit Name</Label>
                      <Input value={primaryAsset?.item_name || ""} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label>Manufacturer</Label>
                      <Input value={primaryAsset?.manufacturer || "—"} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label>Model</Label>
                      <Input value={primaryAsset?.model || "—"} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Input value={primaryAsset?.location || "—"} disabled className="bg-muted" />
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="checklist" className="mt-0">
              <MultiASDChecklist
                units={units}
                onChange={setUnits}
                readonly={isLocked}
              />
            </TabsContent>

            <TabsContent value="summary" className="mt-0 space-y-4">
              <div className="space-y-2">
                <Label>System Condition</Label>
                <Select value={systemCondition} onValueChange={setSystemCondition} disabled={isLocked}>
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
                  disabled={isLocked}
                />
              </div>

              <div className="space-y-2">
                <Label>Recommendations</Label>
                <Textarea
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  placeholder="Recommended actions or improvements..."
                  className="min-h-[100px]"
                  disabled={isLocked}
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
                  disabled={isLocked}
                />
              </div>

              <div className="space-y-2">
                <Label>Parts Used</Label>
                <Textarea
                  value={partsUsed}
                  onChange={(e) => setPartsUsed(e.target.value)}
                  placeholder="List any parts or materials used..."
                  className="min-h-[80px]"
                  disabled={isLocked}
                />
              </div>

              <div className="space-y-2">
                <Label>Additional Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any other observations or comments..."
                  className="min-h-[100px]"
                  disabled={isLocked}
                />
              </div>
            </TabsContent>

            <TabsContent value="signoff" className="mt-0 space-y-4">
              {/* Signature Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Engineer Signature Card */}
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b">
                    <span className="font-medium text-sm">Engineer Signature</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <SignaturePad
                      value={engineerSignature}
                      onChange={setEngineerSignature}
                      disabled={isLocked}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal h-9",
                                !engineerSignDate && "text-muted-foreground"
                              )}
                              disabled={isLocked}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {engineerSignDate ? format(engineerSignDate, "dd/MM/yyyy") : "Select"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-popover" align="start">
                            <Calendar
                              mode="single"
                              selected={engineerSignDate}
                              onSelect={setEngineerSignDate}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Time</Label>
                        <Input
                          type="time"
                          value={engineerSignTime}
                          onChange={(e) => setEngineerSignTime(e.target.value)}
                          className="h-9"
                          disabled={isLocked}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Customer Signature Card */}
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b">
                    <span className="font-medium text-sm">Customer Signature</span>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="customerNotPresent"
                        checked={customerNotPresent}
                        onCheckedChange={(checked) => setCustomerNotPresent(checked as boolean)}
                        disabled={isLocked}
                      />
                      <label htmlFor="customerNotPresent" className="text-xs text-muted-foreground">
                        Not present
                      </label>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    {customerNotPresent ? (
                      <div className="h-[150px] flex items-center justify-center bg-muted/30 rounded-lg border border-dashed">
                        <p className="text-sm text-muted-foreground text-center">
                          Customer was not available to sign off on this work.
                        </p>
                      </div>
                    ) : (
                      <SignaturePad
                        value={customerSignature}
                        onChange={setCustomerSignature}
                        disabled={isLocked}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal h-9",
                                !customerSignDate && "text-muted-foreground"
                              )}
                              disabled={customerNotPresent || isLocked}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {customerSignDate ? format(customerSignDate, "dd/MM/yyyy") : "Select"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-popover" align="start">
                            <Calendar
                              mode="single"
                              selected={customerSignDate}
                              onSelect={setCustomerSignDate}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Time</Label>
                        <Input
                          type="time"
                          value={customerSignTime}
                          onChange={(e) => setCustomerSignTime(e.target.value)}
                          className="h-9"
                          disabled={customerNotPresent || isLocked}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Generate Report / Download Actions */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium">Report Actions</h4>
                    <p className="text-xs text-muted-foreground">
                      Generate or download a PDF of this ASD service report
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        // Save current state before generating
                        await handleSave(false);
                        toast.success("Report saved - PDF generation coming soon");
                      }}
                      disabled={saving}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Generate Report
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        // Save current state before downloading
                        await handleSave(false);
                        toast.success("Report saved - PDF download coming soon");
                      }}
                      disabled={saving}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download PDF
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </ResponsiveDialogBody>

      <ResponsiveDialogFooter className="flex-wrap gap-2">
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
            Close
          </Button>
          {!isLocked && (
            <>
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} className="flex-1 sm:flex-none">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <span className="hidden sm:inline">Save Draft</span>
                <span className="sm:hidden">Save</span>
              </Button>
              {showCompleteVisit ? (
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
              )}
            </>
          )}
        </div>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}

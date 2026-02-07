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
import { Loader2, Phone, ClipboardCheck, Settings, FileCheck, FileText, Download, PenTool, CalendarIcon, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getDefaultDisabledRefugeChecklist } from "@/services/disabledRefugeChecklistService";
import { MultiDisabledRefugeChecklist, DisabledRefugeChecklistData, initializeDisabledRefugeChecklists } from "./MultiDisabledRefugeChecklist";
import { generateDisabledRefugeReportPDF } from "@/lib/pdfGenerator";
import { AIRewriteButton } from "@/components/reports/AIRewriteButton";
 import { InvoicePromptDialog } from "./InvoicePromptDialog";
 import { CustomerCreateInvoiceDialog } from "@/components/customers/CustomerCreateInvoiceDialog";

interface DisabledRefugeAsset {
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

interface DisabledRefugeReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: VisitForReport;
  assets: DisabledRefugeAsset[];
  onSuccess?: () => void;
  showCompleteVisit?: boolean;
}

export function DisabledRefugeReportDialog({
  open,
  onOpenChange,
  visit,
  assets,
  onSuccess,
  showCompleteVisit = false,
}: DisabledRefugeReportDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("details");

  // Determine if report is locked (completed)
  const [isLocked, setIsLocked] = useState(false);
 
   // Invoice prompt state
   const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);
   const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
   const [customerInfoForInvoice, setCustomerInfoForInvoice] = useState<{
     id: string;
     name: string;
     xero_contact_id: string | null;
   } | null>(null);
   const [siteInfoForInvoice, setSiteInfoForInvoice] = useState<{
     id: string;
     name: string;
     address?: string | null;
     city?: string | null;
   } | null>(null);
   const [contractPoNumber, setContractPoNumber] = useState<string | null>(null);
   const [contractUnitPrice, setContractUnitPrice] = useState<number | null>(null);

  // Multi-unit state
  const [units, setUnits] = useState<DisabledRefugeChecklistData[]>([]);
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
    if (open && user) {
      loadOrCreateReport();
    }
  }, [open, user, visit.id, assets]);

  const loadOrCreateReport = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Load site with customer info including stored signature
      const { data: siteData } = await supabase
        .from("sites")
         .select("id, name, address, city, customer_id, customers(id, name, client_signature, contact_name, xero_contact_id)")
        .eq("id", visit.site_id)
        .maybeSingle();

      if (siteData?.customers) {
         const customer = siteData.customers as { id: string; name: string; client_signature: string | null; contact_name: string | null; xero_contact_id: string | null };
        setCustomerId(customer.id);
        if (customer.client_signature) {
          setCustomerSignature(customer.client_signature);
        }
        if (customer.contact_name && !clientName) {
          setClientName(customer.contact_name);
        }
         
         // Set customer info for invoice
         setCustomerInfoForInvoice({
           id: customer.id,
           name: customer.name,
           xero_contact_id: customer.xero_contact_id,
         });
         
         setSiteInfoForInvoice({
           id: siteData.id,
           name: siteData.name,
           address: siteData.address,
           city: siteData.city,
         });
      }
 
       // Fetch service contracts to get PO number and unit price (match by disabled_refuge service type)
       try {
         const { data: contracts } = await supabase
           .from("site_service_contracts")
           .select("po_number, unit_price")
           .eq("site_id", visit.site_id)
           .eq("service_type", "disabled_refuge")
           .limit(1);
         
         if (contracts && contracts.length > 0) {
           setContractPoNumber(contracts[0].po_number);
           setContractUnitPrice(contracts[0].unit_price);
         } else {
           // Fallback: get any contract with a PO number
           const { data: fallbackContracts } = await supabase
             .from("site_service_contracts")
             .select("po_number, unit_price")
             .eq("site_id", visit.site_id)
             .not("po_number", "is", null)
             .limit(1);
           
           if (fallbackContracts && fallbackContracts.length > 0) {
             setContractPoNumber(fallbackContracts[0].po_number);
             setContractUnitPrice(fallbackContracts[0].unit_price);
           }
         }
       } catch (error) {
         console.error("Failed to load service contracts:", error);
       }

      // Build asset IDs for query
      const assetIds = assets.map(a => a.id);
      const notesPattern = `%"report_type":"disabled_refuge"%`;

      // Check for existing disabled refuge report for this visit
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
      } else if (assets.length > 0) {
        // Only create new report if we have assets
        // Initialize unit checklists from assets
        const initialUnits = initializeDisabledRefugeChecklists(assets);
        setUnits(initialUnits);

        // Get auto-generated report number (use CERT type)
        const { data: numberData, error: numberError } = await supabase
          .rpc('get_next_report_number', { report_type: 'CERT' });
        
        if (numberError) {
          console.error("Failed to generate report number:", numberError);
        }

        // Create new disabled refuge report
        const { data: newReport, error } = await supabase
          .from("service_reports")
          .insert({
            visit_id: visit.id,
            site_id: visit.site_id,
            created_by: user.id,
            checklist: JSON.parse(JSON.stringify(getDefaultDisabledRefugeChecklist())),
            engineer_name: user.user_metadata?.full_name || "",
            panel_manufacturer: assets[0]?.manufacturer || "",
            panel_model: assets[0]?.model || "",
            panel_location: assets[0]?.location || "",
            report_number: numberData || null,
            notes: JSON.stringify({ 
              report_type: "disabled_refuge", 
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
      } else {
        toast.error("No disabled refuge units found for this report");
      }
    } catch (error) {
      console.error("Failed to load disabled refuge report:", error);
      toast.error("Failed to load disabled refuge service report");
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
      
      // Load units data if available
      if (notesData.units && Array.isArray(notesData.units)) {
        setUnits(notesData.units);
      } else {
        // Fallback: initialize from assets
        setUnits(initializeDisabledRefugeChecklists(assets));
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
      setUnits(initializeDisabledRefugeChecklists(assets));
    }
  };

  const handleSave = async (complete = false) => {
    if (!reportId) return;

    setSaving(true);
    try {
      const assetIds = assets.map(a => a.id);
      const notesJson = JSON.stringify({
        report_type: "disabled_refuge",
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
          checklist: JSON.parse(JSON.stringify(hasMultipleUnits ? getDefaultDisabledRefugeChecklist() : (units[0]?.checklist || getDefaultDisabledRefugeChecklist()))),
          system_condition: systemCondition,
          defects_found: defectsFound,
          recommendations,
          work_carried_out: workCarriedOut,
          parts_used: partsUsed,
          notes: notesJson,
          status: complete ? "completed" : "draft",
        })
        .eq("id", reportId);

      // Save customer signature for future reports
      if (customerSignature && customerId && !customerNotPresent && complete) {
        await supabase
          .from("customers")
          .update({ client_signature: customerSignature })
          .eq("id", customerId);
      }

      toast.success(complete ? "Disabled refuge report completed" : "Disabled refuge report saved");
      if (complete) {
         // Show invoice prompt if customer has Xero connection
         if (customerInfoForInvoice?.xero_contact_id) {
           setShowInvoicePrompt(true);
         } else {
           onOpenChange(false);
           onSuccess?.();
         }
      }
    } catch (error) {
      console.error("Failed to save disabled refuge report:", error);
      toast.error("Failed to save disabled refuge service report");
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
        report_type: "disabled_refuge",
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
          checklist: JSON.parse(JSON.stringify(hasMultipleUnits ? getDefaultDisabledRefugeChecklist() : (units[0]?.checklist || getDefaultDisabledRefugeChecklist()))),
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

      // Save customer signature for future reports
      if (customerSignature && customerId && !customerNotPresent) {
        await supabase
          .from("customers")
          .update({ client_signature: customerSignature })
          .eq("id", customerId);
      }

      toast.success("Visit completed successfully");
       // Show invoice prompt if customer has Xero connection
       if (customerInfoForInvoice?.xero_contact_id) {
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
 
  const handleDownloadPDF = async () => {
    try {
      // Fetch site info for PDF
      const { data: siteData } = await supabase
        .from("sites")
        .select("name, address, city, postcode, contact_name, contact_phone, contact_email")
        .eq("id", visit.site_id)
        .maybeSingle();

      if (!siteData) {
        toast.error("Could not load site information");
        return;
      }

      // Build unit data from current state
      const pdfUnits = units.map((u) => ({
        assetId: u.assetId,
        assetName: u.assetName,
        manufacturer: u.manufacturer,
        model: u.model,
        location: u.location,
        checklist: u.checklist,
        defects: u.defects,
        recommendations: u.recommendations,
        systemCondition: u.systemCondition,
      }));

      generateDisabledRefugeReportPDF(
        {
          reportNumber: reportNumber,
          reportDate: visit.visit_date,
          engineerName: engineerName,
          clientName: clientName,
          units: pdfUnits,
          // Global summary from Summary tab
          systemCondition: systemCondition,
          defectsFound: defectsFound,
          recommendations: recommendations,
          workCarriedOut: workCarriedOut,
          partsUsed: partsUsed,
          notes: notes,
          // Signatures
          engineerSignature: engineerSignature,
          engineerSignDate: engineerSignDate?.toISOString(),
          engineerSignTime: engineerSignTime,
          customerNotPresent: customerNotPresent,
          customerSignature: customerSignature,
          customerSignDate: customerSignDate?.toISOString(),
          customerSignTime: customerSignTime,
        },
        siteData,
        visit.visit_date,
        visit.visit_type
      );

      toast.success("PDF downloaded");
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

  const primaryAsset = assets[0];

  return (
     <>
     <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center gap-2 flex-wrap">
          <Phone className="h-5 w-5" />
          <span>Disabled Refuge Service Report</span>
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
                  Disabled Refuge Unit{hasMultipleUnits ? "s" : ""} Information
                </h4>
                {hasMultipleUnits ? (
                  <div className="space-y-2">
                    {assets.map((asset, index) => (
                      <div
                        key={asset.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border"
                      >
                        <Phone className="w-5 h-5 text-primary" />
                        <div className="flex-1">
                          <div className="font-medium">{asset.item_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {[asset.manufacturer, asset.model, asset.location]
                              .filter(Boolean)
                              .join(" • ") || "EVC Unit"}
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
              <MultiDisabledRefugeChecklist
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
                  <SelectContent className="z-[200]">
                    <SelectItem value="satisfactory">Satisfactory</SelectItem>
                    <SelectItem value="requires_attention">Requires Attention</SelectItem>
                    <SelectItem value="unsatisfactory">Unsatisfactory</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Defects Found</Label>
                  {!isLocked && (
                    <AIRewriteButton
                      text={defectsFound}
                      type="defects"
                      onRewrite={setDefectsFound}
                    />
                  )}
                </div>
                <Textarea
                  value={defectsFound}
                  onChange={(e) => setDefectsFound(e.target.value)}
                  placeholder="List any defects or faults identified..."
                  className="min-h-[100px]"
                  disabled={isLocked}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Recommendations</Label>
                  {!isLocked && (
                    <AIRewriteButton
                      text={recommendations}
                      type="recommendations"
                      onRewrite={setRecommendations}
                    />
                  )}
                </div>
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
                      Generate or download a PDF of this disabled refuge service report
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await handleSave(false);
                        handleDownloadPDF();
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
                        await handleSave(false);
                        handleDownloadPDF();
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
     
     {/* Invoice Prompt Dialog */}
     <InvoicePromptDialog
       open={showInvoicePrompt}
       onOpenChange={setShowInvoicePrompt}
       onConfirm={handleInvoicePromptConfirm}
       onDecline={handleInvoicePromptDecline}
       siteName={siteInfoForInvoice?.name || visit.sites?.name || ""}
     />
 
     {/* Invoice Creation Dialog */}
     {customerInfoForInvoice && siteInfoForInvoice && (
       <CustomerCreateInvoiceDialog
         open={showInvoiceDialog}
         onOpenChange={(open) => {
           if (!open) handleInvoiceDialogClose();
         }}
         customerId={customerInfoForInvoice.id}
         customerName={customerInfoForInvoice.name}
         xeroContactId={customerInfoForInvoice.xero_contact_id}
         sites={[{
           id: siteInfoForInvoice.id,
           name: siteInfoForInvoice.name,
           address: siteInfoForInvoice.address || null,
           city: siteInfoForInvoice.city || null,
         }]}
         onSuccess={handleInvoiceDialogClose}
          jobReportData={{
            jobType: visit.visit_type,
            reportDate: visit.visit_date,
            reportNumber: reportNumber,
            poNumber: contractPoNumber || undefined,
            unitPrice: contractUnitPrice || undefined,
            siteName: siteInfoForInvoice.name,
          }}
       />
     )}
   </>
  );
}

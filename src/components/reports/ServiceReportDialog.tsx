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
import { Loader2, FileText, ClipboardCheck, Settings, FileCheck, Download, AlertCircle, PenTool, CalendarIcon, Lock, Mail, Building2 } from "lucide-react";
import SiteFormDialog from "@/components/sites/SiteFormDialog";
import { getSiteById, type Site } from "@/services/siteService";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  ServiceReport,
  BS5839Checklist,
  getDefaultChecklist,
  getServiceReport,
  createServiceReport,
  updateServiceReport,
  assignReportNumber,
  SYSTEM_TYPES,
} from "@/services/serviceReportService";
import { ServiceReportChecklist } from "./ServiceReportChecklist";
import { MultiPanelChecklist, PanelChecklistData, initializePanelChecklists } from "./MultiPanelChecklist";
import { generateServiceReportPDF } from "@/lib/pdfGenerator";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AIRewriteButton } from "@/components/reports/AIRewriteButton";
 import { InvoicePromptDialog } from "./InvoicePromptDialog";
 import { CustomerCreateInvoiceDialog } from "@/components/customers/CustomerCreateInvoiceDialog";
 import { EmailReportDialog } from "./EmailReportDialog";
 import { getCompanySettings } from "@/services/companySettingsService";
 import { createBafeCertificate, generateBafeCertNumber } from "@/services/bafeCertificateService";

interface VisitForReport {
  id: string;
  visit_type: string;
  visit_date: string;
  site_id: string;
  sites?: { name: string; address?: string | null; city?: string | null; postcode?: string | null; contact_name?: string | null; contact_phone?: string | null; contact_email?: string | null } | null;
}

interface ServiceReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: VisitForReport;
  onSuccess?: () => void;
  showCompleteVisit?: boolean;
}

export function ServiceReportDialog({
  open,
  onOpenChange,
  visit,
  onSuccess,
  showCompleteVisit = false,
}: ServiceReportDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [activeTab, setActiveTab] = useState("details");
 
   // Invoice prompt state
   const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);
   const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
   const [customerInfo, setCustomerInfo] = useState<{
     id: string;
     name: string;
     xero_contact_id: string | null;
   } | null>(null);
   const [siteInfoForInvoice, setSiteInfoForInvoice] = useState<{
     id: string;
     name: string;
     address?: string | null;
     city?: string | null;
     contact_email?: string | null;
   } | null>(null);
   const [contractPoNumber, setContractPoNumber] = useState<string | null>(null);
   const [contractUnitPrice, setContractUnitPrice] = useState<number | null>(null);
   const [customerEmailRecipients, setCustomerEmailRecipients] = useState<string>("");

   // Email state
   const [showEmailDialog, setShowEmailDialog] = useState(false);
   const [companyName, setCompanyName] = useState("BHO Fire Ltd");
   const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
   // BAFE prompt state
   const [showBafePrompt, setShowBafePrompt] = useState(false);
  const [creatingBafe, setCreatingBafe] = useState(false);
  // Site edit state
  const [showSiteEditDialog, setShowSiteEditDialog] = useState(false);
  const [siteForEdit, setSiteForEdit] = useState<Site | null>(null);
  const [siteRefreshKey, setSiteRefreshKey] = useState(0);

  const handleOpenSiteEdit = async () => {
    const { site, error } = await getSiteById(visit.site_id);
    if (error || !site) {
      toast.error("Failed to load site for editing");
      return;
    }
    setSiteForEdit(site);
    setShowSiteEditDialog(true);
  };

  const handleSiteEditSuccess = () => {
    setShowSiteEditDialog(false);
    setSiteRefreshKey((k) => k + 1);
    toast.success("Site updated. Re-download the PDF and re-upload to SharePoint to apply the changes.");
  };
  // Determine if report is locked (completed)
  const isLocked = report?.status === "completed";

  // Multi-panel state
  const [panels, setPanels] = useState<PanelChecklistData[]>([]);
  const [hasMultiplePanels, setHasMultiplePanels] = useState(false);

  // Form state
  const [reportNumber, setReportNumber] = useState("");
  const [engineerName, setEngineerName] = useState("");
  const [clientName, setClientName] = useState("");
  const [panelManufacturer, setPanelManufacturer] = useState("");
  const [panelModel, setPanelModel] = useState("");
  const [panelLocation, setPanelLocation] = useState("");
  const [systemType, setSystemType] = useState("");
  const [zonesCount, setZonesCount] = useState<number | "">("");
  const [devicesCount, setDevicesCount] = useState<number | "">("");
  const [checklist, setChecklist] = useState<BS5839Checklist>(getDefaultChecklist());
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
      loadReport();
    }
  }, [open, user, visit.id]);

  const loadReport = async () => {
    if (!user) return;
    setLoading(true);

    try {
       // Fetch site info with customer details for invoice
       const { data: site } = await supabase
         .from("sites")
         .select("id, name, address, city, contact_email, customer_id, customers(id, name, contact_email, email_recipients, xero_contact_id)")
         .eq("id", visit.site_id)
         .maybeSingle();
 
       if (site) {
         const customerData = site.customers as { id: string; name: string; contact_email: string | null; email_recipients: string | null; xero_contact_id: string | null } | null;
         
         setSiteInfoForInvoice({
           id: site.id,
           name: site.name,
           address: site.address,
           city: site.city,
           contact_email: site.contact_email || customerData?.contact_email || null,
         });
         
         if (customerData) {
           setCustomerInfo({
             id: customerData.id,
             name: customerData.name,
             xero_contact_id: customerData.xero_contact_id,
           });
           if (customerData.email_recipients) {
             setCustomerEmailRecipients(customerData.email_recipients);
           }
         }
       }

       // Load company settings for email
       try {
         const settings = await getCompanySettings();
         if (settings) {
           setCompanyName(settings.company_name || "BHO Fire Ltd");
           setLogoUrl(settings.report_logo_url || settings.company_logo_url || undefined);
         }
       } catch { /* ignore */ }
 
       // Fetch service contracts to get PO number and unit price (match by fire service type)
       try {
         const { data: contracts } = await supabase
           .from("site_service_contracts")
           .select("po_number, unit_price")
           .eq("site_id", visit.site_id)
           .eq("service_type", "fire")
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
 
      // Load fire panels from site_assets table (always get latest from DB)
      const { data: assets } = await supabase
        .from("site_assets")
        .select("id, item_name, manufacturer, model, location")
        .eq("site_id", visit.site_id)
        .eq("asset_type", "fire")
        .order("created_at", { ascending: true }); // Ensure consistent ordering

      let existingReport = await getServiceReport(visit.id);

      if (!existingReport) {
        // Create draft without assigning number yet (number assigned when completing)
        existingReport = await createServiceReport(visit.id, visit.site_id, user.id, {
          engineer_name: user.user_metadata?.full_name || "",
        }, 'CERT', false);  // false = don't assign number now
      }
      // Note: Legacy reports without numbers will get a number assigned when they complete

      setReport(existingReport);
      populateForm(existingReport);

      // Handle multi-panel setup - merge stored data with current assets
      if (assets && assets.length > 1) {
        setHasMultiplePanels(true);
        
        // Initialize all current panels from assets
        let mergedPanels = initializePanelChecklists(assets);
        
        // If report has stored panel data, merge it with current assets
        if (existingReport.notes) {
          try {
            const notesData = JSON.parse(existingReport.notes);
            if (notesData.panel_checklists && Array.isArray(notesData.panel_checklists)) {
              mergedPanels = mergedPanels.map((panel) => {
                const stored = notesData.panel_checklists.find(
                  (s: PanelChecklistData) => s.assetId === panel.assetId
                );
                if (stored) {
                  return {
                    ...panel,
                    checklist: stored.checklist,
                    defects: stored.defects || "",
                    recommendations: stored.recommendations || "",
                  };
                }
                return panel;
              });
            }
          } catch {
            // Not JSON, continue with fresh panels
          }
        }
        
        setPanels(mergedPanels);
      } else if (assets && assets.length === 1) {
        // Single panel - pre-fill details
        setHasMultiplePanels(false);
        setPanelManufacturer(assets[0].manufacturer || "");
        setPanelModel(assets[0].model || "");
        setPanelLocation(assets[0].location || "");
      } else {
        setHasMultiplePanels(false);
      }
    } catch (error) {
      console.error("Failed to load report:", error);
      toast.error("Failed to load service report");
    } finally {
      setLoading(false);
    }
  };

  const populateForm = (r: ServiceReport) => {
    setReportNumber(r.report_number || "");
    setEngineerName(r.engineer_name || "");
    setClientName(r.client_name || "");
    setPanelManufacturer(r.panel_manufacturer || "");
    setPanelModel(r.panel_model || "");
    setPanelLocation(r.panel_location || "");
    setSystemType(r.system_type || "");
    setZonesCount(r.zones_count || "");
    setDevicesCount(r.devices_count || "");
    setChecklist(r.checklist || getDefaultChecklist());
    setSystemCondition(r.system_condition || "");
    setDefectsFound(r.defects_found || "");
    setRecommendations(r.recommendations || "");
    setWorkCarriedOut(r.work_carried_out || "");
    setPartsUsed(r.parts_used || "");
    
    // Try parsing notes for additional data
    try {
      const notesData = JSON.parse(r.notes || "{}");
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
      setNotes(r.notes || "");
    }
  };

  const handleSave = async (complete = false) => {
    if (!report) return;

    setSaving(true);
    try {
      // If completing and no report number yet, assign one now
      let finalReportNumber = reportNumber;
      if (complete && !report.report_number) {
        const newNumber = await assignReportNumber(report.id, 'CERT');
        if (newNumber) {
          finalReportNumber = newNumber;
          setReportNumber(newNumber);
        }
      }

      // Build notes JSON with all data including signatures
      const notesJson: Record<string, unknown> = {
        report_type: "fire_alarm",
        additional_notes: notes,
        engineerSignature,
        engineerSignDate: engineerSignDate?.toISOString(),
        engineerSignTime,
        customerNotPresent,
        customerSignature,
        customerSignDate: customerSignDate?.toISOString(),
        customerSignTime,
      };

      if (hasMultiplePanels) {
        notesJson.multi_panel = true;
        notesJson.panel_checklists = panels;
      }

      const notesValue = JSON.stringify(notesJson);

      await updateServiceReport(report.id, {
        report_number: finalReportNumber || null,
        engineer_name: engineerName,
        client_name: clientName,
        panel_manufacturer: panelManufacturer,
        panel_model: panelModel,
        panel_location: panelLocation,
        system_type: systemType,
        zones_count: zonesCount === "" ? null : zonesCount,
        devices_count: devicesCount === "" ? null : devicesCount,
        checklist: hasMultiplePanels ? getDefaultChecklist() : checklist, // Single panel uses main checklist
        system_condition: systemCondition,
        defects_found: defectsFound,
        recommendations,
        work_carried_out: workCarriedOut,
        parts_used: partsUsed,
        notes: notesValue,
        status: "completed",
      });

      toast.success(complete ? `Service report ${finalReportNumber || ""} completed` : "Service report saved");
      if (defectsFound && defectsFound.trim()) {
        toast.info("NCR auto-raised in QMS for defects found", {
          description: "A Non-Conformance Report has been automatically created from the defects recorded.",
          duration: 6000,
        });
      }
      if (complete) {
         // Show invoice prompt if customer has Xero connection
         if (customerInfo?.xero_contact_id) {
           setShowInvoicePrompt(true);
         } else {
           setShowBafePrompt(true);
         }
      }
    } catch (error) {
      console.error("Failed to save report:", error);
      toast.error("Failed to save service report");
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteVisit = async () => {
    if (!report) return;

    setSaving(true);
    try {
      // If no report number yet, assign one now
      let finalReportNumber = reportNumber;
      if (!report.report_number) {
        const newNumber = await assignReportNumber(report.id, 'CERT');
        if (newNumber) {
          finalReportNumber = newNumber;
          setReportNumber(newNumber);
        }
      }

      // Build notes JSON with all data including signatures
      const notesJson: Record<string, unknown> = {
        report_type: "fire_alarm",
        additional_notes: notes,
        engineerSignature,
        engineerSignDate: engineerSignDate?.toISOString(),
        engineerSignTime,
        customerNotPresent,
        customerSignature,
        customerSignDate: customerSignDate?.toISOString(),
        customerSignTime,
      };

      if (hasMultiplePanels) {
        notesJson.multi_panel = true;
        notesJson.panel_checklists = panels;
      }

      const notesValue = JSON.stringify(notesJson);

      await updateServiceReport(report.id, {
        report_number: finalReportNumber || null,
        engineer_name: engineerName,
        client_name: clientName,
        panel_manufacturer: panelManufacturer,
        panel_model: panelModel,
        panel_location: panelLocation,
        system_type: systemType,
        zones_count: zonesCount === "" ? null : zonesCount,
        devices_count: devicesCount === "" ? null : devicesCount,
        checklist: hasMultiplePanels ? getDefaultChecklist() : checklist,
        system_condition: systemCondition,
        defects_found: defectsFound,
        recommendations,
        work_carried_out: workCarriedOut,
        parts_used: partsUsed,
        notes: notesValue,
        status: "completed",
      });

      // Mark the visit as completed
      const { error: visitError } = await supabase
        .from("visits")
        .update({ status: "completed" })
        .eq("id", visit.id);

      if (visitError) throw visitError;

      toast.success(`Visit ${finalReportNumber || ""} completed successfully`);
       // Show invoice prompt if customer has Xero connection
       if (customerInfo?.xero_contact_id) {
         setShowInvoicePrompt(true);
       } else {
         setShowBafePrompt(true);
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
     setShowBafePrompt(true);
   };
 
   const handleInvoiceDialogClose = () => {
     setShowInvoiceDialog(false);
     setShowBafePrompt(true);
   };

   const handleBafeConfirm = async () => {
     if (!user?.id) return;
     setCreatingBafe(true);
     try {
       const certNumber = await generateBafeCertNumber("maintenance");
       await createBafeCertificate({
         site_id: visit.site_id,
         certificate_type: "maintenance",
         certificate_number: certNumber,
         issued_date: new Date().toISOString().split("T")[0],
         issued_by: user.id,
         linked_report_id: report?.id || null,
       });
       toast.success(`BAFE Maintenance Certificate ${certNumber} recorded`);
     } catch (err) {
       console.error("Failed to create BAFE certificate:", err);
       toast.error("Failed to record BAFE certificate");
     } finally {
       setCreatingBafe(false);
       setShowBafePrompt(false);
       onOpenChange(false);
       onSuccess?.();
     }
   };

   const handleBafeDecline = () => {
     setShowBafePrompt(false);
     onOpenChange(false);
     onSuccess?.();
   };
 
  const handleDownloadPDF = async () => {
    if (!report) return;

    setDownloading(true);
    try {
      // Fetch full site info for PDF
      const { data: siteData } = await supabase
        .from("sites")
        .select("name, address, city, postcode, contact_name, contact_phone, contact_email")
        .eq("id", visit.site_id)
        .maybeSingle();

      const siteInfo = siteData || { name: visit.sites?.name || "Unknown Site" };

      // Build signature data from current form state
      const signatureData = {
        engineerSignature,
        engineerSignDate: engineerSignDate ? format(engineerSignDate, "dd/MM/yyyy") : "",
        engineerSignTime,
        customerNotPresent,
        customerSignature,
        customerSignDate: customerSignDate ? format(customerSignDate, "dd/MM/yyyy") : "",
        customerSignTime,
      };

      generateServiceReportPDF(
        {
          ...report,
          engineer_name: engineerName,
          client_name: clientName,
          panel_manufacturer: panelManufacturer,
          panel_model: panelModel,
          panel_location: panelLocation,
          system_type: systemType,
          zones_count: zonesCount === "" ? null : zonesCount,
          devices_count: devicesCount === "" ? null : devicesCount,
          checklist: hasMultiplePanels ? panels[0]?.checklist || getDefaultChecklist() : checklist,
          system_condition: systemCondition,
          defects_found: defectsFound,
          recommendations,
          work_carried_out: workCarriedOut,
          parts_used: partsUsed,
          notes,
        },
        siteInfo,
        { visit_type: visit.visit_type, visit_date: visit.visit_date },
        hasMultiplePanels ? panels : undefined,
        signatureData
      );

      toast.success("PDF downloaded successfully");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  // Generate PDF as base64 for email attachment
  const generatePdfBase64 = async (): Promise<string> => {
    if (!report) throw new Error("No report loaded");
    const { data: siteData } = await supabase
      .from("sites")
      .select("name, address, city, postcode, contact_name, contact_phone, contact_email")
      .eq("id", visit.site_id)
      .maybeSingle();
    const siteInfo = siteData || { name: visit.sites?.name || "Unknown Site" };
    const signatureData = {
      engineerSignature, engineerSignDate: engineerSignDate ? format(engineerSignDate, "dd/MM/yyyy") : "",
      engineerSignTime, customerNotPresent, customerSignature,
      customerSignDate: customerSignDate ? format(customerSignDate, "dd/MM/yyyy") : "", customerSignTime,
    };
    const base64 = generateServiceReportPDF(
      { ...report, engineer_name: engineerName, client_name: clientName, panel_manufacturer: panelManufacturer, panel_model: panelModel, panel_location: panelLocation, system_type: systemType, zones_count: zonesCount === "" ? null : zonesCount, devices_count: devicesCount === "" ? null : devicesCount, checklist: hasMultiplePanels ? panels[0]?.checklist || getDefaultChecklist() : checklist, system_condition: systemCondition, defects_found: defectsFound, recommendations, work_carried_out: workCarriedOut, parts_used: partsUsed, notes },
      siteInfo, { visit_type: visit.visit_type, visit_date: visit.visit_date },
      hasMultiplePanels ? panels : undefined, signatureData, true
    );
    if (!base64) throw new Error("Failed to generate PDF");
    return base64 as string;
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
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center gap-2 flex-wrap">
          <FileText className="h-5 w-5" />
          <span className="hidden sm:inline">BS5839:2025 Service Report</span>
          <span className="sm:hidden">Service Report</span>
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
        {hasMultiplePanels && (
          <Alert className="bg-primary/5 border-primary/20 mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This site has {panels.length} fire panels. Each panel has its own checklist tab.
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="details" className="flex items-center gap-1 text-xs sm:text-sm">
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

              {!hasMultiplePanels && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">System Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Panel Manufacturer</Label>
                      <Input
                        value={panelManufacturer}
                        onChange={(e) => setPanelManufacturer(e.target.value)}
                        placeholder="e.g., Kentec, Advanced, Morley"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Panel Model</Label>
                      <Input
                        value={panelModel}
                        onChange={(e) => setPanelModel(e.target.value)}
                        placeholder="Panel model/type"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Panel Location</Label>
                      <Input
                        value={panelLocation}
                        onChange={(e) => setPanelLocation(e.target.value)}
                        placeholder="e.g., Main Reception"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>System Category</Label>
                      <Select value={systemType} onValueChange={setSystemType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select system type" />
                        </SelectTrigger>
                        <SelectContent>
                          {SYSTEM_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Number of Zones</Label>
                      <Input
                        type="number"
                        value={zonesCount}
                        onChange={(e) => setZonesCount(e.target.value ? parseInt(e.target.value) : "")}
                        placeholder="Zones"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Number of Devices</Label>
                      <Input
                        type="number"
                        value={devicesCount}
                        onChange={(e) => setDevicesCount(e.target.value ? parseInt(e.target.value) : "")}
                        placeholder="Total devices"
                      />
                    </div>
                  </div>
                </div>
              )}

              {hasMultiplePanels && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">System Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>System Category</Label>
                      <Select value={systemType} onValueChange={setSystemType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select system type" />
                        </SelectTrigger>
                        <SelectContent>
                          {SYSTEM_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Total Panels</Label>
                      <Input value={panels.length} disabled className="bg-muted" />
                    </div>
                    <div className="space-y-2">
                      <Label>Number of Zones</Label>
                      <Input
                        type="number"
                        value={zonesCount}
                        onChange={(e) => setZonesCount(e.target.value ? parseInt(e.target.value) : "")}
                        placeholder="Total zones"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Number of Devices</Label>
                      <Input
                        type="number"
                        value={devicesCount}
                        onChange={(e) => setDevicesCount(e.target.value ? parseInt(e.target.value) : "")}
                        placeholder="Total devices"
                      />
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="checklist" className="mt-0">
              {hasMultiplePanels ? (
                <MultiPanelChecklist
                  panels={panels}
                  onChange={setPanels}
                />
              ) : (
                <ServiceReportChecklist
                  checklist={checklist}
                  onChange={setChecklist}
                />
              )}
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
                <div className="flex items-center justify-between">
                  <Label>Defects Found</Label>
                  <AIRewriteButton
                    text={defectsFound}
                    type="defects"
                    onRewrite={setDefectsFound}
                  />
                </div>
                <Textarea
                  value={defectsFound}
                  onChange={(e) => setDefectsFound(e.target.value)}
                  placeholder="List any defects or faults identified..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Recommendations</Label>
                  <AIRewriteButton
                    text={recommendations}
                    type="recommendations"
                    onRewrite={setRecommendations}
                  />
                </div>
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
                <div className="flex items-center justify-between">
                  <Label>Work Carried Out</Label>
                  <AIRewriteButton
                    text={workCarriedOut}
                    type="works"
                    onRewrite={setWorkCarriedOut}
                  />
                </div>
                <Textarea
                  value={workCarriedOut}
                  onChange={(e) => setWorkCarriedOut(e.target.value)}
                  placeholder="Describe work performed during this visit..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Parts Used</Label>
                  <AIRewriteButton
                    text={partsUsed}
                    type="parts"
                    onRewrite={setPartsUsed}
                  />
                </div>
                <Textarea
                  value={partsUsed}
                  onChange={(e) => setPartsUsed(e.target.value)}
                  placeholder="List any parts or materials used..."
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Additional Notes</Label>
                  <AIRewriteButton
                    text={notes}
                    type="notes"
                    onRewrite={setNotes}
                  />
                </div>
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
      </ResponsiveDialogBody>

      <ResponsiveDialogFooter className="flex-wrap gap-2">
        <Button variant="outline" onClick={handleDownloadPDF} disabled={downloading} className="w-full sm:w-auto sm:mr-auto">
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          <span className="hidden sm:inline">Download PDF</span>
          <span className="sm:hidden">PDF</span>
        </Button>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
            Close
          </Button>
          {isLocked ? (
            <>
              <Button variant="outline" onClick={() => setShowEmailDialog(true)} className="flex-1 sm:flex-none">
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
         siteName={siteInfoForInvoice?.name || visit.sites?.name || ""}
       />
 
       {/* Invoice Creation Dialog */}
       {customerInfo && siteInfoForInvoice && (
         <CustomerCreateInvoiceDialog
           open={showInvoiceDialog}
           onOpenChange={(open) => {
             if (!open) handleInvoiceDialogClose();
           }}
           customerId={customerInfo.id}
           customerName={customerInfo.name}
           xeroContactId={customerInfo.xero_contact_id}
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
              poNumber: contractPoNumber || (visit as any).client_po_number || undefined,
              unitPrice: contractUnitPrice || undefined,
              siteName: siteInfoForInvoice.name,
            }}
         />
       )}

       {/* BAFE Certificate Prompt */}
       <Dialog open={showBafePrompt} onOpenChange={setShowBafePrompt}>
         <DialogContent>
           <div className="space-y-4">
             <div className="flex items-center gap-3">
               <div className="p-3 rounded-full bg-primary/10">
                 <FileCheck className="h-6 w-6 text-primary" />
               </div>
               <div>
                 <h3 className="font-semibold text-foreground">BAFE SP203-1 Certificate</h3>
                 <p className="text-sm text-muted-foreground">
                   Would you like to record a BAFE Maintenance Certificate for this site?
                 </p>
               </div>
             </div>
             <div className="flex justify-end gap-2">
               <Button variant="outline" onClick={handleBafeDecline}>Skip</Button>
               <Button onClick={handleBafeConfirm} disabled={creatingBafe}>
                 {creatingBafe ? "Recording..." : "Record Certificate"}
               </Button>
             </div>
           </div>
         </DialogContent>
       </Dialog>
     </ResponsiveDialog>
  );
}

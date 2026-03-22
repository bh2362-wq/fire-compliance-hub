import { useState, useEffect } from "react";
import { format, addDays } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, FileText, CalendarIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchXeroContacts,
  createXeroInvoice,
  getXeroConnection,
  XeroContact,
  InvoiceLineItem,
} from "@/services/xeroService";
import { updateVisitStatus } from "@/hooks/useVisits";
import { cn } from "@/lib/utils";
import { getServiceContracts, getServiceTypeLabel, ServiceContract } from "@/services/serviceContractService";
import { getServiceReport, ServiceReport } from "@/services/serviceReportService";
import { supabase } from "@/integrations/supabase/client";

interface VisitForInvoice {
  id: string;
  visit_type: string;
  visit_date: string;
  site_id: string;
  sites?: { name: string } | null;
  notes?: string | null;
}

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: VisitForInvoice;
  onSuccess?: () => void;
  defaultContactId?: string | null;
}

// Map asset types to service contract types (from visit notes.asset_type)
const ASSET_TYPE_TO_SERVICE_TYPE: Record<string, string> = {
  fire_panel: "fire",
  asd: "aspirator",
  gas_suppression: "gas_suppression",
  room_integrity: "room_integrity",
  fire_curtain: "fire_curtain",
  disabled_refuge: "disabled_refuge",
  emergency_lighting: "emergency_lighting",
  intruder_alarm: "intruder_alarm",
  nurse_call: "nurse_call",
};

// Map visit types to service contract types (fallback if no asset_type)
const VISIT_TYPE_TO_SERVICE_TYPE: Record<string, string> = {
  quarterly_service: "fire",
  annual_inspection: "fire",
  biannual_service: "fire", // Default, overridden by asset_type
  aspirator_service: "aspirator",
  gas_suppression_service: "gas_suppression",
  room_integrity_test: "room_integrity",
  fire_curtain_service: "fire_curtain",
  disabled_refuge_service: "disabled_refuge",
  emergency_lighting_service: "emergency_lighting",
  intruder_alarm_service: "intruder_alarm",
  nurse_call_service: "nurse_call",
};

// Visit types that should NOT auto-fill from contracts
const SKIP_CONTRACT_AUTOFILL = ["emergency", "remedial", "callout"];

// Frequency labels for reference
const FREQUENCY_LABELS: Record<string, string> = {
  "1m": "Monthly",
  "3m": "Quarterly",
  "6m": "6 Month",
  "12m": "Annual",
};

// Default line items based on visit type (fallback when no contract exists)
const VISIT_TYPE_LINE_ITEMS: Record<string, InvoiceLineItem[]> = {
  quarterly_service: [
    { description: "Fire Alarm Quarterly Service - Routine testing and maintenance of fire alarm system", quantity: 1, unitAmount: 150 },
    { description: "Engineer labour (hourly rate)", quantity: 2, unitAmount: 65 },
  ],
  annual_inspection: [
    { description: "Fire Alarm Annual Inspection - Full system inspection and certification", quantity: 1, unitAmount: 350 },
    { description: "Engineer labour (hourly rate)", quantity: 4, unitAmount: 65 },
    { description: "Annual certification documentation", quantity: 1, unitAmount: 50 },
  ],
  emergency: [
    { description: "Emergency Callout - Out of hours response", quantity: 1, unitAmount: 195 },
    { description: "Engineer labour (emergency rate)", quantity: 1, unitAmount: 95 },
  ],
  remedial: [
    { description: "Remedial Works - Fault repair and system restoration", quantity: 1, unitAmount: 0 },
    { description: "Engineer labour (hourly rate)", quantity: 1, unitAmount: 65 },
    { description: "Parts and materials", quantity: 1, unitAmount: 0 },
  ],
  installation: [
    { description: "Fire Alarm Installation", quantity: 1, unitAmount: 0 },
    { description: "Engineer labour (hourly rate)", quantity: 8, unitAmount: 65 },
    { description: "Equipment and materials", quantity: 1, unitAmount: 0 },
  ],
  commissioning: [
    { description: "Fire Alarm System Commissioning", quantity: 1, unitAmount: 250 },
    { description: "Engineer labour (hourly rate)", quantity: 4, unitAmount: 65 },
    { description: "Commissioning certificate", quantity: 1, unitAmount: 75 },
  ],
};

interface LineItemContext {
  contract?: ServiceContract | null;
  siteName?: string;
  reportNumber?: string | null;
  serviceDate?: string | null;
  poNumber?: string | null;
}

const getDefaultLineItems = (visitType: string, context: LineItemContext = {}): InvoiceLineItem[] => {
  const { contract, siteName, reportNumber, serviceDate, poNumber } = context;
  
  // If we have a contract, use its price
  if (contract && contract.unit_price > 0) {
    const serviceLabel = getServiceTypeLabel(contract.service_type);
    const frequencyLabel = contract.frequency 
      ? FREQUENCY_LABELS[contract.frequency] || contract.frequency
      : "";
    
    // Build multi-line description
    const lines: string[] = [];
    lines.push(`${serviceLabel} Service${frequencyLabel ? ` ${frequencyLabel}` : ""} - ${siteName || "Site"}`);
    if (reportNumber) {
      lines.push(`Report: ${reportNumber}`);
    }
    if (serviceDate) {
      lines.push(`Service Date: ${serviceDate}`);
    }
    if (poNumber) {
      lines.push(`PO: ${poNumber}`);
    }
    
    return [
      { description: lines.join("\n"), quantity: 1, unitAmount: contract.unit_price },
    ];
  }
  
  // Fallback to default line items
  return VISIT_TYPE_LINE_ITEMS[visitType] || [
    { description: "", quantity: 1, unitAmount: 0 },
  ];
};

// Helper to parse visit notes and get asset_type
const getAssetTypeFromVisit = (visit: VisitForInvoice): string | null => {
  if (!visit.notes) return null;
  try {
    const parsed = typeof visit.notes === "string" ? JSON.parse(visit.notes) : visit.notes;
    return parsed?.asset_type || null;
  } catch {
    return null;
  }
};

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  visit,
  onSuccess,
  defaultContactId,
}: CreateInvoiceDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<XeroContact[]>([]);
  const [selectedContact, setSelectedContact] = useState<string>("");
  const [poNumber, setPoNumber] = useState("");
  const [reference, setReference] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(addDays(new Date(), 28));
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([
    { description: "", quantity: 1, unitAmount: 0 },
  ]);

  useEffect(() => {
    if (open && user) {
      checkConnection();
      loadContacts();
      loadServiceContract();
      // Reset due date to 30 days from now
      setDueDate(addDays(new Date(), 28));
      // Reset selected contact - will be auto-selected after contacts load
      setSelectedContact("");
    }
  }, [open, user, visit]);

  const loadServiceContract = async () => {
    // Skip contract auto-fill for callouts and remedial works
    if (SKIP_CONTRACT_AUTOFILL.includes(visit.visit_type)) {
      setPoNumber("");
      setReference(`${visit.visit_type} - ${visit.sites?.name || "Site"} - ${visit.visit_date}`);
      setLineItems(getDefaultLineItems(visit.visit_type));
      return;
    }

    try {
      // Fetch contracts and service report in parallel
      const [contracts, serviceReport] = await Promise.all([
        getServiceContracts(visit.site_id),
        getServiceReport(visit.id),
      ]);
      
      // First try to get service type from asset_type in notes
      const assetType = getAssetTypeFromVisit(visit);
      let serviceType = assetType ? ASSET_TYPE_TO_SERVICE_TYPE[assetType] : null;
      
      // Fallback to visit type mapping if no asset_type
      if (!serviceType) {
        serviceType = VISIT_TYPE_TO_SERVICE_TYPE[visit.visit_type];
      }
      
      const matchingContract = serviceType 
        ? contracts.find(c => c.service_type === serviceType)
        : null;
      
      // Get the PO number from contract
      const contractPoNumber = matchingContract?.po_number || "";
      setPoNumber(contractPoNumber);
      
      // Build reference from contract: "Service Type + Frequency"
      if (matchingContract) {
        const serviceLabel = getServiceTypeLabel(matchingContract.service_type);
        const frequencyLabel = matchingContract.frequency 
          ? FREQUENCY_LABELS[matchingContract.frequency] || matchingContract.frequency
          : "";
        setReference(`${serviceLabel} Service${frequencyLabel ? ` ${frequencyLabel}` : ""}`);
      } else {
        setReference(`${visit.visit_type} - ${visit.sites?.name || "Site"} - ${visit.visit_date}`);
      }
      
      // Get service date from report (use engineer sign date if available, else report_date)
      let serviceDate: string | null = null;
      if (serviceReport) {
        // Try to get the sign-off date from notes
        try {
          const notesData = serviceReport.notes ? JSON.parse(serviceReport.notes) : null;
          if (notesData?.engineerSignDate) {
            serviceDate = format(new Date(notesData.engineerSignDate), "dd/MM/yyyy");
          }
        } catch { /* ignore parse errors */ }
        
        // Fallback to report_date
        if (!serviceDate && serviceReport.report_date) {
          serviceDate = format(new Date(serviceReport.report_date), "dd/MM/yyyy");
        }
      }
      
      // Auto-fill line items with contract price and report details
      setLineItems(getDefaultLineItems(visit.visit_type, {
        contract: matchingContract,
        siteName: visit.sites?.name,
        reportNumber: serviceReport?.report_number,
        serviceDate,
        poNumber: contractPoNumber,
      }));
    } catch (error) {
      console.error("Failed to load service contract:", error);
      // Fallback to default line items
      setLineItems(getDefaultLineItems(visit.visit_type));
      setPoNumber("");
      setReference(`${visit.visit_type} - ${visit.sites?.name || "Site"} - ${visit.visit_date}`);
    }
  };

  // Auto-select contact when defaultContactId is provided and contacts are loaded
  useEffect(() => {
    if (defaultContactId && contacts.length > 0 && !selectedContact) {
      const matchingContact = contacts.find(c => c.ContactID === defaultContactId);
      if (matchingContact) {
        setSelectedContact(matchingContact.ContactID);
      }
    }
  }, [defaultContactId, contacts, selectedContact]);

  const checkConnection = async () => {
    if (!user) return;
    try {
      const conn = await getXeroConnection(user.id);
      setHasConnection(!!conn);
    } catch (error) {
      setHasConnection(false);
    }
  };

  const loadContacts = async () => {
    setLoadingContacts(true);
    try {
      // Fetch all contacts so new customers can be invoiced too
      const data = await fetchXeroContacts();
      setContacts(data);
    } catch (error) {
      console.error("Failed to load contacts:", error);
    } finally {
      setLoadingContacts(false);
    }
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: 1, unitAmount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof InvoiceLineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0);
  };

  const handleSubmit = async () => {
    if (!selectedContact) {
      toast.error("Please select a contact");
      return;
    }

    const validItems = lineItems.filter(item => item.description && item.unitAmount > 0);
    if (validItems.length === 0) {
      toast.error("Please add at least one line item with a description and amount");
      return;
    }

    setLoading(true);
    try {
      const contact = contacts.find(c => c.ContactID === selectedContact);
      // Use PO number as the Xero reference (this maps to the Reference field in Xero)
      const xeroReference = poNumber || reference;
      const result = await createXeroInvoice(
        visit.id,
        selectedContact,
        contact?.Name || "",
        validItems,
        xeroReference,
        dueDate ? format(dueDate, "yyyy-MM-dd") : undefined
      );

      // Update visit status to "invoiced"
      await updateVisitStatus(visit.id, "invoiced");

      toast.success(`Invoice ${result.number} created successfully`);
      onOpenChange(false);
      onSuccess?.();
      
      // Reset form
      setSelectedContact("");
      setPoNumber("");
      setReference("");
      setLineItems([{ description: "", quantity: 1, unitAmount: 0 }]);
    } catch (error: any) {
      console.error("Failed to create invoice:", error);
      toast.error(error.message || "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  if (hasConnection === false) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xero Not Connected</DialogTitle>
            <DialogDescription>
              You need to connect your Xero account before creating invoices.
              Go to Settings to connect Xero.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Create Invoice
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Create a Xero invoice for {visit.visit_type} at {visit.sites?.name}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <ResponsiveDialogBody className="py-4 space-y-4">
        <div className="space-y-2">
          <Label>Contact</Label>
          <Select value={selectedContact} onValueChange={setSelectedContact}>
            <SelectTrigger>
              <SelectValue placeholder={loadingContacts ? "Loading contacts..." : "Select a contact"} />
            </SelectTrigger>
            <SelectContent>
              {contacts.map((contact) => (
                <SelectItem key={contact.ContactID} value={contact.ContactID}>
                  {contact.Name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>PO Number</Label>
            <Input
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="Customer PO number"
            />
          </div>
          <div className="space-y-2">
            <Label>Reference</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Invoice reference"
            />
          </div>
          <div className="space-y-2">
            <Label>Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(dueDate, "dd/MM/yyyy") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 pointer-events-auto" align="start" sideOffset={4}>
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>

          <div className="space-y-3">
            {lineItems.map((item, index) => (
              <div key={index} className="flex flex-col sm:flex-row gap-2 items-start p-3 sm:p-0 border sm:border-0 rounded-lg sm:rounded-none">
                <div className="flex-1 w-full">
                  <Label className="sm:hidden text-xs text-muted-foreground mb-1">Description</Label>
                  <Textarea
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateLineItem(index, "description", e.target.value)}
                    className="min-h-[60px]"
                  />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <div className="flex-1 sm:w-20 sm:flex-none">
                    <Label className="sm:hidden text-xs text-muted-foreground mb-1">Qty</Label>
                    <Input
                      type="number"
                      placeholder="Qty"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, "quantity", parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="flex-1 sm:w-28 sm:flex-none">
                    <Label className="sm:hidden text-xs text-muted-foreground mb-1">Amount (£)</Label>
                    <Input
                      type="number"
                      placeholder="Amount"
                      min={0}
                      step={0.01}
                      value={item.unitAmount || ""}
                      onChange={(e) => updateLineItem(index, "unitAmount", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLineItem(index)}
                    disabled={lineItems.length === 1}
                    className="shrink-0 mt-auto sm:mt-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <div className="text-lg font-semibold">
            Total: £{calculateTotal().toFixed(2)}
          </div>
        </div>
      </ResponsiveDialogBody>

      <ResponsiveDialogFooter className="gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={loading} className="flex-1 sm:flex-none">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Invoice
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
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
import { Loader2, Plus, Trash2, FileText, CalendarIcon, Building2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchXeroContacts,
  createXeroInvoice,
  updateDraftInvoice,
  getXeroConnection,
  getNextInvoiceNumber,
  XeroContact,
  InvoiceLineItem,
} from "@/services/xeroService";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface EditInvoiceData {
  invoiceId: string;
  invoiceNumber: string;
  contactId: string;
  contactName: string;
  reference: string;
  dueDate: string;
  total: number;
  lineItems: InvoiceLineItem[];
}

interface ManualInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  editInvoice?: EditInvoiceData | null;
}

const SERVICE_TYPES = [
  { value: "quarterly_service", label: "Quarterly Service" },
  { value: "biannual_service", label: "6-Monthly Service" },
  { value: "annual_inspection", label: "Annual Inspection" },
  { value: "emergency", label: "Emergency Callout" },
  { value: "remedial", label: "Remedial Works" },
  { value: "supply_only", label: "Supply Only" },
];

const SERVICE_TYPE_LINE_ITEMS: Record<string, InvoiceLineItem[]> = {
  quarterly_service: [
    { description: "Fire Alarm Quarterly Service - Routine testing and maintenance", quantity: 1, unitAmount: 150 },
    { description: "Engineer labour (hourly rate)", quantity: 2, unitAmount: 65 },
  ],
  biannual_service: [
    { description: "Fire Alarm 6-Monthly Service - Comprehensive testing and maintenance", quantity: 1, unitAmount: 225 },
    { description: "Engineer labour (hourly rate)", quantity: 3, unitAmount: 65 },
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
  supply_only: [
    { description: "Parts/Equipment Supply", quantity: 1, unitAmount: 0 },
  ],
};

interface Site {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  customer_id: string | null;
}

const DRAFT_STORAGE_KEY = "invoice_draft";

interface InvoiceDraft {
  selectedContact: string;
  selectedSite: string;
  serviceType: string;
  poNumber: string;
  invoiceNumber: string;
  dueDate: string | null;
  lineItems: InvoiceLineItem[];
  savedAt: string;
}

function saveDraft(draft: Omit<InvoiceDraft, "savedAt">) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
  } catch {}
}

function loadDraft(): InvoiceDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {}
}

export function ManualInvoiceDialog({
  open,
  onOpenChange,
  onSuccess,
  editInvoice,
}: ManualInvoiceDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<XeroContact[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedContact, setSelectedContact] = useState<string>("");
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [serviceType, setServiceType] = useState<string>("quarterly_service");
  const [poNumber, setPoNumber] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(addDays(new Date(), 30));
  const [loadingInvoiceNumber, setLoadingInvoiceNumber] = useState(false);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(
    SERVICE_TYPE_LINE_ITEMS.quarterly_service
  );
  const [hasDraft, setHasDraft] = useState(false);
  const draftRestoredRef = useRef(false);
  const skipAutoSaveRef = useRef(false);

  const isEditMode = !!editInvoice;

  // Auto-save draft whenever form values change (only for new invoices)
  useEffect(() => {
    if (!open || skipAutoSaveRef.current || isEditMode) return;
    const hasData = selectedContact || selectedSite || poNumber || 
      lineItems.some(li => li.description && li.unitAmount > 0);
    if (hasData) {
      saveDraft({
        selectedContact,
        selectedSite,
        serviceType,
        poNumber,
        invoiceNumber,
        dueDate: dueDate ? dueDate.toISOString() : null,
        lineItems,
      });
    }
  }, [open, selectedContact, selectedSite, serviceType, poNumber, invoiceNumber, dueDate, lineItems, isEditMode]);

  useEffect(() => {
    if (open && user) {
      checkConnection();
      loadContacts();
      loadSites();

      if (isEditMode && editInvoice) {
        // Edit mode: populate from existing invoice data
        draftRestoredRef.current = true;
        setHasDraft(false);
        setSelectedContact(editInvoice.contactId);
        setSelectedSite("");
        setPoNumber(editInvoice.reference || "");
        setInvoiceNumber(editInvoice.invoiceNumber);
        setDueDate(editInvoice.dueDate ? new Date(editInvoice.dueDate) : addDays(new Date(), 30));
        setLineItems(editInvoice.lineItems.length > 0 ? editInvoice.lineItems : SERVICE_TYPE_LINE_ITEMS.quarterly_service);
      } else {
        // New invoice mode
        const draft = loadDraft();
        if (draft) {
          setHasDraft(true);
          draftRestoredRef.current = true;
          setSelectedContact(draft.selectedContact);
          setSelectedSite(draft.selectedSite);
          setServiceType(draft.serviceType);
          setPoNumber(draft.poNumber);
          setInvoiceNumber(draft.invoiceNumber);
          setDueDate(draft.dueDate ? new Date(draft.dueDate) : addDays(new Date(), 30));
          setLineItems(draft.lineItems.length > 0 ? draft.lineItems : SERVICE_TYPE_LINE_ITEMS.quarterly_service);
        } else {
          setHasDraft(false);
          draftRestoredRef.current = false;
          setSelectedContact("");
          setSelectedSite("");
          setServiceType("quarterly_service");
          setPoNumber("");
          setDueDate(addDays(new Date(), 30));
          setLineItems(SERVICE_TYPE_LINE_ITEMS.quarterly_service);
          fetchNextInvoiceNumber();
        }
      }
    }
  }, [open, user, isEditMode, editInvoice]);

  const fetchNextInvoiceNumber = async () => {
    setLoadingInvoiceNumber(true);
    try {
      const nextNumber = await getNextInvoiceNumber();
      setInvoiceNumber(nextNumber || "");
    } catch (error) {
      console.error("Failed to fetch next invoice number:", error);
      setInvoiceNumber("");
    } finally {
      setLoadingInvoiceNumber(false);
    }
  };

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
      const data = await fetchXeroContacts();
      setContacts(data);
    } catch (error) {
      console.error("Failed to load contacts:", error);
    } finally {
      setLoadingContacts(false);
    }
  };

  const loadSites = async () => {
    setLoadingSites(true);
    try {
      const { data, error } = await supabase
        .from("sites")
        .select("id, name, address, city, customer_id")
        .order("name");
      
      if (error) throw error;
      setSites(data || []);
    } catch (error) {
      console.error("Failed to load sites:", error);
    } finally {
      setLoadingSites(false);
    }
  };

  // Auto-fill contact when site is selected
  useEffect(() => {
    const autoFillContact = async () => {
      if (selectedSite && contacts.length > 0) {
        const site = sites.find(s => s.id === selectedSite);
        if (site?.customer_id) {
          // Fetch customer to get xero_contact_id
          const { data: customer } = await supabase
            .from("customers")
            .select("xero_contact_id")
            .eq("id", site.customer_id)
            .single();
          
          if (customer?.xero_contact_id) {
            // Find matching contact in the loaded contacts
            const matchingContact = contacts.find(c => c.ContactID === customer.xero_contact_id);
            if (matchingContact) {
              setSelectedContact(matchingContact.ContactID);
            }
          }
        }
      }
    };
    
    autoFillContact();
  }, [selectedSite, sites, contacts]);

  useEffect(() => {
    // Skip auto-updating line items if we just restored a draft
    if (draftRestoredRef.current) {
      draftRestoredRef.current = false;
      return;
    }
    // Update line items when service type changes
    setLineItems(SERVICE_TYPE_LINE_ITEMS[serviceType] || SERVICE_TYPE_LINE_ITEMS.remedial);
  }, [serviceType]);

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

    if (!isEditMode && !selectedSite) {
      toast.error("Please select a site");
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
      const site = sites.find(s => s.id === selectedSite);
      const serviceLabel = SERVICE_TYPES.find(s => s.value === serviceType)?.label || serviceType;
      const invoiceReference = poNumber || `${serviceLabel} - ${site?.name || ""}`;

      if (isEditMode && editInvoice) {
        // Update existing draft invoice in Xero
        const result = await updateDraftInvoice(
          editInvoice.invoiceId,
          selectedContact,
          contact?.Name || "",
          validItems,
          invoiceReference,
          dueDate ? format(dueDate, "yyyy-MM-dd") : undefined,
          invoiceNumber || undefined
        );

        toast.success(`Invoice ${result.number} updated successfully`);
        onOpenChange(false);
        onSuccess?.();
      } else {
        // Create a visit record for invoice tracking
        const { data: visit, error: visitError } = await supabase
          .from("visits")
          .insert({
            site_id: selectedSite,
            visit_type: serviceType,
            visit_date: new Date().toISOString().split("T")[0],
            status: "completed",
            notes: `Manual invoice: ${invoiceReference}`,
            devices_tested: 0,
            total_devices: 0,
            coverage_percentage: 0,
          })
          .select()
          .single();

        if (visitError) throw visitError;

        const result = await createXeroInvoice(
          visit.id,
          selectedContact,
          contact?.Name || "",
          validItems,
          invoiceReference,
          dueDate ? format(dueDate, "yyyy-MM-dd") : undefined,
          invoiceNumber || undefined
        );

        if (result.emailSent) {
          toast.success(`Invoice ${result.number} created and emailed to customer`);
        } else {
          toast.success(`Invoice ${result.number} created successfully`);
        }
        clearDraft();
        onOpenChange(false);
        onSuccess?.();
      }
    } catch (error: any) {
      console.error("Failed to create/update invoice:", error);
      toast.error(error.message || "Failed to create/update invoice");
    } finally {
      setLoading(false);
    }
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setHasDraft(false);
    skipAutoSaveRef.current = true;
    setSelectedContact("");
    setSelectedSite("");
    setServiceType("quarterly_service");
    setPoNumber("");
    setDueDate(addDays(new Date(), 30));
    setLineItems(SERVICE_TYPE_LINE_ITEMS.quarterly_service);
    setInvoiceNumber("");
    fetchNextInvoiceNumber();
    // Re-enable auto-save after reset
    setTimeout(() => { skipAutoSaveRef.current = false; }, 100);
    toast.info("Draft discarded");
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
          {isEditMode ? "Edit Draft Invoice" : "Create Invoice"}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {isEditMode ? `Editing draft invoice ${editInvoice?.invoiceNumber}` : "Create a new Xero invoice manually"}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <ResponsiveDialogBody className="py-4 space-y-4">
        {hasDraft && (
          <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
            <span className="text-muted-foreground">Draft restored from your previous session</span>
            <Button variant="ghost" size="sm" onClick={handleDiscardDraft} className="text-destructive hover:text-destructive">
              Discard Draft
            </Button>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Site
            </Label>
            <div className="flex gap-2">
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={loadingSites ? "Loading..." : "Select a site"} />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                      {site.city && ` - ${site.city}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSite && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedSite("")}
                  className="shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Contact (Bill To)</Label>
            <div className="flex gap-2">
              <Select value={selectedContact} onValueChange={setSelectedContact}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={loadingContacts ? "Loading..." : "Select a contact"} />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((contact) => (
                    <SelectItem key={contact.ContactID} value={contact.ContactID}>
                      {contact.Name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedContact && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedContact("")}
                  className="shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Service Type</Label>
          <Select value={serviceType} onValueChange={setServiceType}>
            <SelectTrigger>
              <SelectValue placeholder="Select service type" />
            </SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Invoice Number</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder={loadingInvoiceNumber ? "Loading..." : "e.g. 23315"}
                disabled={loadingInvoiceNumber}
              />
              <p className="text-xs text-muted-foreground">
                Auto-filled from last invoice
              </p>
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
                <PopoverContent className="w-auto p-0" align="start">
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
            <div className="space-y-2">
              <Label>PO Number</Label>
              <Input
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="Purchase order number (optional)"
              />
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
              <div className="hidden sm:flex gap-2 items-center text-sm text-muted-foreground font-medium">
                <div className="flex-1">Description</div>
                <div className="w-24 text-center">Unit Price (£)</div>
                <div className="w-20 text-center">Qty</div>
                <div className="w-9"></div>
              </div>
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
                    <div className="flex-1 sm:w-24 sm:flex-none">
                      <Label className="sm:hidden text-xs text-muted-foreground mb-1">Unit Price (£)</Label>
                      <Input
                        type="number"
                        placeholder="£0.00"
                        min={0}
                        step={0.01}
                        value={item.unitAmount || ""}
                        onChange={(e) => updateLineItem(index, "unitAmount", parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="flex-1 sm:w-20 sm:flex-none">
                      <Label className="sm:hidden text-xs text-muted-foreground mb-1">Qty</Label>
                      <Input
                        type="number"
                        placeholder="1"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateLineItem(index, "quantity", parseInt(e.target.value) || 1)}
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
        <Button onClick={handleSubmit} disabled={loading || (!isEditMode && !selectedSite) || !selectedContact} className="flex-1 sm:flex-none">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditMode ? "Update Invoice" : "Create Invoice"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}

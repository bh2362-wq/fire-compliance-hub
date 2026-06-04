import { useState, useEffect } from "react";
import { format, addDays } from "date-fns";
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
import { Loader2, Plus, Trash2, FileText, MapPin, CalendarIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  createXeroInvoice,
  getXeroConnection,
  getNextInvoiceNumber,
  InvoiceLineItem,
} from "@/services/xeroService";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Site {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
}

// Job report data for auto-filling invoice fields
interface JobReportData {
  jobType?: string;
  reportDate?: string;
  reportNumber?: string;
  poNumber?: string;
  unitPrice?: number;
  siteName?: string;
  jobDescription?: string;
  visitDate?: string;
  materials?: { name: string; qty: string; cost: string }[];
}

interface CustomerCreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  xeroContactId: string | null;
  sites: Site[];
  onSuccess?: () => void;
  // Optional job report data for auto-filling
  jobReportData?: JobReportData;
}

const SERVICE_TYPES = [
  { value: "quarterly_service", label: "Quarterly Service" },
  { value: "biannual_service", label: "6-Monthly Service" },
  { value: "annual_inspection", label: "Annual Inspection" },
  { value: "callout", label: "Callout" },
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

export function CustomerCreateInvoiceDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  xeroContactId,
  sites,
  onSuccess,
  jobReportData,
}: CustomerCreateInvoiceDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [serviceType, setServiceType] = useState<string>("quarterly_service");
  const [reference, setReference] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(addDays(new Date(), 30));
  const [loadingInvoiceNumber, setLoadingInvoiceNumber] = useState(false);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(
    SERVICE_TYPE_LINE_ITEMS.quarterly_service
  );
  const [restoredFromCache, setRestoredFromCache] = useState(false);

  const cacheKey = `customer-invoice-draft-${customerId}`;

  useEffect(() => {
    if (open && user) {
      checkConnection();
      fetchNextInvoiceNumber();

      // Try restoring from cache first
      const cached = localStorage.getItem(cacheKey);
      if (cached && !jobReportData) {
        try {
          const data = JSON.parse(cached);
          setSelectedSite(data.selectedSite || "");
          setServiceType(data.serviceType || "quarterly_service");
          setReference(data.reference || "");
          setDueDate(data.dueDate ? new Date(data.dueDate) : addDays(new Date(), 30));
          setLineItems(data.lineItems?.length ? data.lineItems : SERVICE_TYPE_LINE_ITEMS.quarterly_service);
          setRestoredFromCache(true);
          return;
        } catch { /* fall through to defaults */ }
      }
      
      // If we have job report data, use it to auto-fill the invoice
      if (jobReportData) {
        // Auto-select the first site (should be the job's site)
        if (sites.length > 0) {
          setSelectedSite(sites[0].id);
        }
        
        if (jobReportData.jobType === "emergency") {
          // External jobType uses the legacy "emergency" tag from the
          // job-report source; we map to the renamed internal value.
          setServiceType("callout");
        } else if (jobReportData.jobType === "service") {
          setServiceType("quarterly_service");
        } else if (jobReportData.jobType === "repair" || jobReportData.jobType === "remedial") {
          setServiceType("remedial");
        } else {
          setServiceType("quarterly_service");
        }
        
        // Due date should be 28 days from now
        setDueDate(addDays(new Date(), 28));
        
        // Reference should be the PO number from the report
        if (jobReportData.poNumber) {
          setReference(jobReportData.poNumber);
        } else {
          setReference("");
        }
      } else {
        // Reset form to defaults
        setSelectedSite("");
        setServiceType("quarterly_service");
        setReference("");
        setDueDate(addDays(new Date(), 30));
        setLineItems(SERVICE_TYPE_LINE_ITEMS.quarterly_service);
      }
      setRestoredFromCache(true);
    }
  }, [open, user, jobReportData, sites]);

  // Auto-save form data to localStorage
  useEffect(() => {
    if (!open || !restoredFromCache) return;
    const data = {
      selectedSite,
      serviceType,
      reference,
      dueDate: dueDate?.toISOString(),
      lineItems,
    };
    localStorage.setItem(cacheKey, JSON.stringify(data));
  }, [open, selectedSite, serviceType, reference, dueDate, lineItems, cacheKey, restoredFromCache]);

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

  // Build the line item description based on job report data
  const buildJobLineItemDescription = (): string => {
    if (!jobReportData) return "";
    
    const lines: string[] = [];
    
    // First line: job type + site name
    if (jobReportData.jobType === "emergency") {
      lines.push(`Callout - ${jobReportData.siteName || "Site"}`);
    } else {
      const typeLabel = SERVICE_TYPES.find(s => s.value === serviceType)?.label || jobReportData.jobType || "Service";
      lines.push(`${typeLabel} - ${jobReportData.siteName || "Site"}`);
    }
    
    // Worksheet/report number
    if (jobReportData.reportNumber) {
      lines.push(`Worksheet: ${jobReportData.reportNumber}`);
    }
    
    // Visit date
    if (jobReportData.visitDate) {
      lines.push(`Date of Visit: ${format(new Date(jobReportData.visitDate), "dd/MM/yyyy")}`);
    }
    
    // PO number
    if (jobReportData.poNumber) {
      lines.push(`PO: ${jobReportData.poNumber}`);
    }
    
    // Brief job description
    if (jobReportData.jobDescription) {
      // Truncate to first 200 chars for invoice brevity
      const brief = jobReportData.jobDescription.length > 200 
        ? jobReportData.jobDescription.substring(0, 200) + "..."
        : jobReportData.jobDescription;
      lines.push(brief);
    }
    
    return lines.join("\n");
  };

  useEffect(() => {
    // If we have job report data, always use a single line item with full description
    if (jobReportData && selectedSite) {
      const description = buildJobLineItemDescription();
      const price = jobReportData.unitPrice || 0;
      const items: { description: string; quantity: number; unitAmount: number }[] = [
        { description: description || "Service", quantity: 1, unitAmount: price },
      ];
      
      // Add materials as separate line items
      if (jobReportData.materials && jobReportData.materials.length > 0) {
        for (const mat of jobReportData.materials) {
          if (mat.name && mat.name.trim()) {
            const qty = parseFloat(mat.qty) || 1;
            const cost = parseFloat(mat.cost) || 0;
            items.push({ description: mat.name, quantity: qty, unitAmount: cost });
          }
        }
      }
      
      setLineItems(items);
    } else if (!jobReportData) {
      // Update line items when service type changes (no job report data)
      setLineItems(SERVICE_TYPE_LINE_ITEMS[serviceType] || SERVICE_TYPE_LINE_ITEMS.remedial);
    }
    
    // Update reference when site or service type changes (only if no job report data providing PO)
    if (selectedSite && !jobReportData?.poNumber) {
      const site = sites.find(s => s.id === selectedSite);
      if (site && !jobReportData) {
        const serviceLabel = SERVICE_TYPES.find(s => s.value === serviceType)?.label || serviceType;
        setReference(`${serviceLabel} - ${site.name}`);
      }
    }
  }, [serviceType, selectedSite, sites]);

  const checkConnection = async () => {
    if (!user) return;
    try {
      const conn = await getXeroConnection(user.id);
      setHasConnection(!!conn);
    } catch (error) {
      setHasConnection(false);
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
    if (!selectedSite) {
      toast.error("Please select a site");
      return;
    }

    if (!xeroContactId) {
      toast.error("This customer is not linked to a Xero contact");
      return;
    }

    const validItems = lineItems.filter(item => item.description && item.unitAmount > 0);
    if (validItems.length === 0) {
      toast.error("Please add at least one line item with a description and amount");
      return;
    }

    setLoading(true);
    try {
      let visitId: string | null = null;

      // Only create a visit for service types that require one (not supply_only)
      if (serviceType !== "supply_only") {
        const { data: visit, error: visitError } = await supabase
          .from("service_visits")
          .insert({
            site_id: selectedSite,
            visit_type: serviceType,
            visit_date: new Date().toISOString().split("T")[0],
            status: "completed",
            notes: `Invoice created from customer page: ${reference}`,
          })
          .select()
          .single();

        if (visitError) throw visitError;
        visitId = visit.id;
      }

      // For supply_only, we need to create a minimal visit record just for Xero tracking
      // OR we can skip the visit entirely and just create the invoice
      // Let's create a supply-only visit just for tracking purposes but mark it differently
      if (!visitId) {
        // Create a supply-only pseudo-visit for invoice tracking
        const { data: supplyVisit, error: supplyError } = await supabase
          .from("service_visits")
          .insert({
            site_id: selectedSite,
            visit_type: "supply_only",
            visit_date: new Date().toISOString().split("T")[0],
            status: "completed",
            notes: `Supply Only - ${reference}`,
            devices_tested: 0,
            total_devices: 0,
            coverage_percentage: 0,
          })
          .select()
          .single();

        if (supplyError) throw supplyError;
        visitId = supplyVisit.id;
      }

      // Create the invoice in Xero
      const result = await createXeroInvoice(
        visitId,
        xeroContactId,
        customerName,
        validItems,
        reference,
        dueDate ? format(dueDate, "yyyy-MM-dd") : undefined,
        invoiceNumber || undefined // pass invoice number if specified
      );

      if (result.emailSent) {
        toast.success(`Invoice ${result.number} created and emailed to customer`);
      } else {
        toast.success(`Invoice ${result.number} created (email not sent - check customer has email in Xero)`);
      }
      localStorage.removeItem(cacheKey);
      setRestoredFromCache(false);
      onOpenChange(false);
      onSuccess?.();
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

  if (!xeroContactId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customer Not Linked</DialogTitle>
            <DialogDescription>
              This customer is not linked to a Xero contact. Edit the customer
              and link them to a Xero contact before creating invoices.
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Create Invoice
          </DialogTitle>
          <DialogDescription>
            Create a Xero invoice for {customerName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Site
            </Label>
            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger>
                <SelectValue placeholder="Select a site" />
              </SelectTrigger>
              <SelectContent>
                {sites.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No sites available
                  </SelectItem>
                ) : (
                  sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                      {site.city && ` - ${site.city}`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
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

          <div className="grid grid-cols-3 gap-4">
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
              <p className="text-xs text-muted-foreground">
                Default: 30 days
              </p>
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Invoice reference"
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
              <div className="flex gap-2 items-center text-sm text-muted-foreground font-medium">
                <div className="flex-1">Description</div>
                <div className="w-24 text-center">Unit Price (£)</div>
                <div className="w-20 text-center">Qty</div>
                <div className="w-9"></div>
              </div>
              {lineItems.map((item, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Textarea
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, "description", e.target.value)}
                      className="min-h-[60px]"
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      placeholder="£0.00"
                      min={0}
                      step={0.01}
                      value={item.unitAmount || ""}
                      onChange={(e) => updateLineItem(index, "unitAmount", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="w-20">
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
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t">
            <div className="text-lg font-semibold">
              Total: £{calculateTotal().toFixed(2)}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !selectedSite}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

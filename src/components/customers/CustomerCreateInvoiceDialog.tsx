import { useState, useEffect } from "react";
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
import { toast } from "sonner";
import { Loader2, Plus, Trash2, FileText, MapPin } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  createXeroInvoice,
  getXeroConnection,
  InvoiceLineItem,
} from "@/services/xeroService";
import { supabase } from "@/integrations/supabase/client";

interface Site {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
}

interface CustomerCreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  xeroContactId: string | null;
  sites: Site[];
  onSuccess?: () => void;
}

const SERVICE_TYPES = [
  { value: "quarterly_service", label: "Quarterly Service" },
  { value: "biannual_service", label: "6-Monthly Service" },
  { value: "annual_inspection", label: "Annual Inspection" },
  { value: "emergency", label: "Emergency Callout" },
  { value: "remedial", label: "Remedial Works" },
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
};

export function CustomerCreateInvoiceDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  xeroContactId,
  sites,
  onSuccess,
}: CustomerCreateInvoiceDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [serviceType, setServiceType] = useState<string>("quarterly_service");
  const [reference, setReference] = useState("");
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(
    SERVICE_TYPE_LINE_ITEMS.quarterly_service
  );

  useEffect(() => {
    if (open && user) {
      checkConnection();
      // Reset form
      setSelectedSite("");
      setServiceType("quarterly_service");
      setReference("");
      setLineItems(SERVICE_TYPE_LINE_ITEMS.quarterly_service);
    }
  }, [open, user]);

  useEffect(() => {
    // Update line items when service type changes
    setLineItems(SERVICE_TYPE_LINE_ITEMS[serviceType] || SERVICE_TYPE_LINE_ITEMS.remedial);
    
    // Update reference when site or service type changes
    if (selectedSite) {
      const site = sites.find(s => s.id === selectedSite);
      if (site) {
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
      // First create a visit record for this invoice
      const { data: visit, error: visitError } = await supabase
        .from("visits")
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

      // Create the invoice in Xero
      const result = await createXeroInvoice(
        visit.id,
        xeroContactId,
        customerName,
        validItems,
        reference
      );

      toast.success(`Invoice ${result.number} created successfully`);
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

          <div className="space-y-2">
            <Label>Reference</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Invoice reference"
            />
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
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Textarea
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, "description", e.target.value)}
                      className="min-h-[60px]"
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      placeholder="Qty"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, "quantity", parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="w-28">
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

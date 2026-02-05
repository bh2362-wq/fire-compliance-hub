import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  fetchSuppliers,
  createPurchaseOrder,
  updatePurchaseOrder,
  Supplier,
  PurchaseOrder,
  PurchaseOrderLineItem,
} from "@/services/purchaseOrderService";
import { useAuth } from "@/contexts/AuthContext";

interface PurchaseOrderFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editPurchaseOrder?: PurchaseOrder | null;
}

interface LineItemInput {
  description: string;
  quantity: number;
  unit_price: number;
}

const PurchaseOrderFormDialog = ({
  open,
  onOpenChange,
  onSuccess,
  editPurchaseOrder,
}: PurchaseOrderFormDialogProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [vatRate, setVatRate] = useState(20);
  const [lineItems, setLineItems] = useState<LineItemInput[]>([
    { description: "", quantity: 1, unit_price: 0 },
  ]);

  const isEditing = !!editPurchaseOrder;

  useEffect(() => {
    if (open) {
      loadSuppliers();
      
      if (editPurchaseOrder) {
        // Populate form with existing data
        setSupplierId(editPurchaseOrder.supplier_id);
        setOrderDate(editPurchaseOrder.order_date);
        setExpectedDeliveryDate(editPurchaseOrder.expected_delivery_date || "");
        setReference(editPurchaseOrder.reference || "");
        setNotes(editPurchaseOrder.notes || "");
        setVatRate(editPurchaseOrder.vat_rate || 20);
        
        if (editPurchaseOrder.line_items && editPurchaseOrder.line_items.length > 0) {
          setLineItems(
            editPurchaseOrder.line_items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
            }))
          );
        } else {
          setLineItems([{ description: "", quantity: 1, unit_price: 0 }]);
        }
      } else {
        // Reset form for new PO
        setSupplierId("");
        setOrderDate(format(new Date(), "yyyy-MM-dd"));
        setExpectedDeliveryDate("");
        setReference("");
        setNotes("");
        setVatRate(20);
        setLineItems([{ description: "", quantity: 1, unit_price: 0 }]);
      }
    }
  }, [open, editPurchaseOrder]);

  const loadSuppliers = async () => {
    try {
      const data = await fetchSuppliers();
      setSuppliers(data);
    } catch (error) {
      console.error("Error loading suppliers:", error);
    }
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", quantity: 1, unit_price: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof LineItemInput, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const calculateSubtotal = () => {
    return lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  };

  const calculateVat = () => {
    return calculateSubtotal() * (vatRate / 100);
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateVat();
  };

  const handleSubmit = async () => {
    if (!supplierId) {
      toast.error("Please select a supplier");
      return;
    }

    if (!lineItems.some((item) => item.description.trim())) {
      toast.error("Please add at least one line item");
      return;
    }

    if (!user?.id) {
      toast.error("You must be logged in");
      return;
    }

    try {
      setLoading(true);

      const formattedLineItems: Partial<PurchaseOrderLineItem>[] = lineItems
        .filter((item) => item.description.trim())
        .map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.quantity * item.unit_price,
        }));

      if (isEditing && editPurchaseOrder) {
        await updatePurchaseOrder(
          editPurchaseOrder.id,
          {
            order_date: orderDate,
            expected_delivery_date: expectedDeliveryDate || null,
            reference: reference || null,
            notes: notes || null,
            vat_rate: vatRate,
          },
          formattedLineItems
        );
        toast.success("Purchase order updated");
      } else {
        await createPurchaseOrder(
          {
            supplier_id: supplierId,
            order_date: orderDate,
            expected_delivery_date: expectedDeliveryDate || null,
            reference: reference || null,
            notes: notes || null,
            vat_rate: vatRate,
          },
          formattedLineItems,
          user.id
        );
        toast.success("Purchase order created");
      }

      onSuccess();
    } catch (error) {
      console.error("Error saving purchase order:", error);
      toast.error(isEditing ? "Failed to update purchase order" : "Failed to create purchase order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Purchase Order" : "New Purchase Order"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId} disabled={isEditing}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Order Date</Label>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Expected Delivery</Label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Reference</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. Project name, Job number"
              />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </div>

            <div className="space-y-2">
              {lineItems.map((item, index) => (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, "description", e.target.value)}
                    />
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      placeholder="Qty"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateLineItem(index, "quantity", parseFloat(e.target.value) || 1)}
                    />
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      placeholder="Unit Price"
                      step="0.01"
                      min={0}
                      value={item.unit_price || ""}
                      onChange={(e) => updateLineItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="w-28 flex items-center justify-end text-sm font-medium">
                    £{(item.quantity * item.unit_price).toFixed(2)}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLineItem(index)}
                    disabled={lineItems.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>£{calculateSubtotal().toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm items-center gap-4">
                <span className="text-muted-foreground">VAT</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="w-20 h-8"
                    value={vatRate}
                    onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-muted-foreground">%</span>
                  <span className="w-24 text-right">£{calculateVat().toFixed(2)}</span>
                </div>
              </div>
              <div className="flex justify-between font-semibold text-lg border-t pt-2">
                <span>Total</span>
                <span>£{calculateTotal().toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes for this order"
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? (isEditing ? "Updating..." : "Creating...") : (isEditing ? "Update Purchase Order" : "Create Purchase Order")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PurchaseOrderFormDialog;

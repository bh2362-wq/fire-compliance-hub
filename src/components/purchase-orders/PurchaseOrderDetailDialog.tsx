import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, CheckCircle, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  fetchPurchaseOrderById,
  updatePurchaseOrder,
  syncPurchaseOrderToXero,
  PurchaseOrder,
  PO_STATUS_CONFIG,
} from "@/services/purchaseOrderService";

interface PurchaseOrderDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrderId: string | null;
  onUpdate: () => void;
}

const PurchaseOrderDetailDialog = ({
  open,
  onOpenChange,
  purchaseOrderId,
  onUpdate,
}: PurchaseOrderDetailDialogProps) => {
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (open && purchaseOrderId) {
      loadPurchaseOrder();
    } else {
      setPurchaseOrder(null);
    }
  }, [open, purchaseOrderId]);

  const loadPurchaseOrder = async () => {
    if (!purchaseOrderId) return;
    try {
      setLoading(true);
      const data = await fetchPurchaseOrderById(purchaseOrderId);
      setPurchaseOrder(data);
    } catch (error) {
      console.error("Error loading purchase order:", error);
      toast.error("Failed to load purchase order");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!purchaseOrder) return;
    try {
      await updatePurchaseOrder(purchaseOrder.id, { status: newStatus });
      toast.success(`Status updated to ${PO_STATUS_CONFIG[newStatus]?.label || newStatus}`);
      loadPurchaseOrder();
      onUpdate();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  const handleSyncToXero = async () => {
    if (!purchaseOrder) return;

    if (!purchaseOrder.supplier?.xero_contact_id) {
      toast.error("Supplier must be linked to Xero before syncing");
      return;
    }

    try {
      setSyncing(true);
      await syncPurchaseOrderToXero(purchaseOrder);
      toast.success("Purchase order synced to Xero");
      loadPurchaseOrder();
      onUpdate();
    } catch (error: any) {
      console.error("Error syncing to Xero:", error);
      toast.error(error.message || "Failed to sync to Xero");
    } finally {
      setSyncing(false);
    }
  };

  if (!purchaseOrder) {
    return null;
  }

  const statusConfig = PO_STATUS_CONFIG[purchaseOrder.status] || PO_STATUS_CONFIG.draft;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3">
              {purchaseOrder.po_number}
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
              {purchaseOrder.xero_purchase_order_id && (
                <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Synced to Xero
                </Badge>
              )}
            </DialogTitle>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* Supplier & Order Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Supplier</span>
                <p className="font-medium">{purchaseOrder.supplier?.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Order Date</span>
                <p className="font-medium">
                  {format(new Date(purchaseOrder.order_date), "dd MMM yyyy")}
                </p>
              </div>
              {purchaseOrder.expected_delivery_date && (
                <div>
                  <span className="text-muted-foreground">Expected Delivery</span>
                  <p className="font-medium">
                    {format(new Date(purchaseOrder.expected_delivery_date), "dd MMM yyyy")}
                  </p>
                </div>
              )}
              {purchaseOrder.reference && (
                <div>
                  <span className="text-muted-foreground">Reference</span>
                  <p className="font-medium">{purchaseOrder.reference}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Line Items */}
            <div>
              <h4 className="font-semibold mb-3">Line Items</h4>
              <div className="space-y-2">
                {purchaseOrder.line_items?.map((item) => (
                  <div key={item.id} className="flex justify-between py-2 border-b last:border-0">
                    <div className="flex-1">
                      <p className="font-medium">{item.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.quantity} x £{item.unit_price.toFixed(2)}
                      </p>
                    </div>
                    <span className="font-medium">£{item.total_price.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>£{purchaseOrder.subtotal?.toFixed(2) || "0.00"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    VAT ({purchaseOrder.vat_rate || 20}%)
                  </span>
                  <span>£{purchaseOrder.vat_amount?.toFixed(2) || "0.00"}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                  <span>Total</span>
                  <span>£{purchaseOrder.total_amount?.toFixed(2) || "0.00"}</span>
                </div>
              </div>
            </div>

            {purchaseOrder.notes && (
              <>
                <Separator />
                <div>
                  <h4 className="font-semibold mb-2">Notes</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {purchaseOrder.notes}
                  </p>
                </div>
              </>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              {/* Status change */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Select value={purchaseOrder.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1" />

              {/* Sync to Xero */}
              {!purchaseOrder.xero_purchase_order_id && purchaseOrder.supplier?.xero_contact_id && (
                <Button onClick={handleSyncToXero} disabled={syncing}>
                  <Send className="w-4 h-4 mr-2" />
                  {syncing ? "Syncing..." : "Send to Xero"}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PurchaseOrderDetailDialog;
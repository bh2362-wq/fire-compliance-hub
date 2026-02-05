import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Send, Download, ExternalLink, Loader2, Package, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  fetchPurchaseOrderById,
  updatePurchaseOrder,
  syncPurchaseOrderToXero,
  updatePurchaseOrderStatusInXero,
  deletePurchaseOrder,
  copyPurchaseOrder,
  PurchaseOrder,
  PO_STATUS_CONFIG,
} from "@/services/purchaseOrderService";
import { downloadPurchaseOrderPDF } from "@/lib/purchaseOrderPdfGenerator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  const { user } = useAuth();
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [markingReceived, setMarkingReceived] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  const handleDownloadPDF = async () => {
    if (!purchaseOrder) return;

    try {
      setDownloading(true);
      
      // Fetch company settings
      const { data: companySettings } = await supabase
        .from("company_settings")
        .select("*")
        .single();

      await downloadPurchaseOrderPDF(purchaseOrder, companySettings);
      toast.success("PDF downloaded");
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  const handleMarkReceived = async () => {
    if (!purchaseOrder) return;

    try {
      setMarkingReceived(true);

      // Update local status
      await updatePurchaseOrder(purchaseOrder.id, { status: "received" });

      // If synced to Xero, update status there too (mark as BILLED)
      if (purchaseOrder.xero_purchase_order_id) {
        try {
          await updatePurchaseOrderStatusInXero(
            purchaseOrder.xero_purchase_order_id,
            "BILLED"
          );
          toast.success("Marked as received and updated in Xero");
        } catch (xeroError: any) {
          console.error("Xero update error:", xeroError);
          toast.success("Marked as received locally. Xero update failed.");
        }
      } else {
        toast.success("Marked as received");
      }

      loadPurchaseOrder();
      onUpdate();
    } catch (error) {
      console.error("Error marking as received:", error);
      toast.error("Failed to mark as received");
    } finally {
      setMarkingReceived(false);
    }
  };

  const handleCopy = async () => {
    if (!purchaseOrder || !user) return;

    try {
      setCopying(true);
      const newPo = await copyPurchaseOrder(purchaseOrder, user.id);
      toast.success(`Created ${newPo.po_number} as a copy`);
      onOpenChange(false);
      onUpdate();
    } catch (error) {
      console.error("Error copying purchase order:", error);
      toast.error("Failed to copy purchase order");
    } finally {
      setCopying(false);
    }
  };

  const handleDelete = async () => {
    if (!purchaseOrder) return;

    try {
      setDeleting(true);
      await deletePurchaseOrder(purchaseOrder.id, purchaseOrder.xero_purchase_order_id);
      
      const message = purchaseOrder.xero_purchase_order_id
        ? `${purchaseOrder.po_number} deleted and removed from Xero`
        : `${purchaseOrder.po_number} deleted`;
      toast.success(message);
      
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onUpdate();
    } catch (error: any) {
      console.error("Error deleting purchase order:", error);
      toast.error(error.message || "Failed to delete purchase order");
    } finally {
      setDeleting(false);
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
                {purchaseOrder.supplier?.email && (
                  <p className="text-xs text-muted-foreground">{purchaseOrder.supplier.email}</p>
                )}
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

              {/* Copy PO */}
              <Button variant="outline" onClick={handleCopy} disabled={copying}>
                {copying ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                Copy
              </Button>

              {/* Download PDF */}
              <Button variant="outline" onClick={handleDownloadPDF} disabled={downloading}>
                {downloading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Download PDF
              </Button>

              {/* Mark as Received */}
              {purchaseOrder.status === "sent" && (
                <Button
                  variant="outline"
                  onClick={handleMarkReceived}
                  disabled={markingReceived}
                >
                  {markingReceived ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Package className="w-4 h-4 mr-2" />
                  )}
                  Mark Received
                </Button>
              )}

              {/* Sync to Xero */}
              {!purchaseOrder.xero_purchase_order_id && purchaseOrder.supplier?.xero_contact_id && (
                <Button onClick={handleSyncToXero} disabled={syncing}>
                  {syncing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Send to Xero
                </Button>
              )}

              {/* Delete PO */}
              <Button
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Delete
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {purchaseOrder?.po_number}?
              {purchaseOrder?.xero_purchase_order_id && (
                <span className="block mt-2 font-medium text-warning">
                  This will also void/delete the PO in Xero.
                </span>
              )}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

export default PurchaseOrderDetailDialog;
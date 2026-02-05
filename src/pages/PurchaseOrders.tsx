import { useState, useEffect } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, MoreVertical, Eye, Trash2, Send, Users, Download, Ban, Copy, Pencil, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  fetchPurchaseOrders,
  fetchPurchaseOrderById,
  deletePurchaseOrder,
  syncPurchaseOrderToXero,
  updatePurchaseOrderStatusInXero,
  updatePurchaseOrder,
  copyPurchaseOrder,
  PurchaseOrder,
  PO_STATUS_CONFIG,
} from "@/services/purchaseOrderService";
import { useAuth } from "@/contexts/AuthContext";
import PurchaseOrderFormDialog from "@/components/purchase-orders/PurchaseOrderFormDialog";
import PurchaseOrderDetailDialog from "@/components/purchase-orders/PurchaseOrderDetailDialog";
import SuppliersDialog from "@/components/purchase-orders/SuppliersDialog";
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

const PurchaseOrders = () => {
  const { user } = useAuth();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editPO, setEditPO] = useState<PurchaseOrder | null>(null);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [poToDelete, setPoToDelete] = useState<PurchaseOrder | null>(null);
  const [poToVoid, setPoToVoid] = useState<PurchaseOrder | null>(null);

  const loadPurchaseOrders = async () => {
    try {
      setLoading(true);
      const data = await fetchPurchaseOrders();
      setPurchaseOrders(data);
    } catch (error) {
      console.error("Error loading purchase orders:", error);
      toast.error("Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPurchaseOrders();
  }, []);

  const handleDelete = async () => {
    if (!poToDelete) return;
    try {
      setActionLoading(poToDelete.id);
      await deletePurchaseOrder(poToDelete.id, poToDelete.xero_purchase_order_id);
      toast.success("Purchase order deleted");
      loadPurchaseOrders();
    } catch (error: any) {
      console.error("Error deleting purchase order:", error);
      toast.error(error.message || "Failed to delete purchase order");
    } finally {
      setPoToDelete(null);
      setActionLoading(null);
    }
  };

  const handleVoid = async () => {
    if (!poToVoid || !poToVoid.xero_purchase_order_id) return;
    try {
      setActionLoading(poToVoid.id);
      await updatePurchaseOrderStatusInXero(poToVoid.xero_purchase_order_id, "DELETED");
      await updatePurchaseOrder(poToVoid.id, { 
        status: "cancelled",
        xero_status: "DELETED" 
      });
      toast.success(`${poToVoid.po_number} voided`);
      loadPurchaseOrders();
    } catch (error: any) {
      console.error("Error voiding purchase order:", error);
      toast.error(error.message || "Failed to void purchase order");
    } finally {
      setPoToVoid(null);
      setActionLoading(null);
    }
  };

  const handleSyncToXero = async (po: PurchaseOrder) => {
    try {
      setActionLoading(po.id);
      // Fetch full PO with line items
      const fullPO = await fetchPurchaseOrderById(po.id);
      if (!fullPO) throw new Error("Purchase order not found");
      
      await syncPurchaseOrderToXero(fullPO);
      toast.success(`${po.po_number} synced to Xero`);
      loadPurchaseOrders();
    } catch (error: any) {
      console.error("Error syncing to Xero:", error);
      toast.error(error.message || "Failed to sync to Xero");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyToDraft = async (po: PurchaseOrder) => {
    if (!user?.id) return;
    try {
      setActionLoading(po.id);
      // Fetch full PO with line items
      const fullPO = await fetchPurchaseOrderById(po.id);
      if (!fullPO) throw new Error("Purchase order not found");
      
      const newPO = await copyPurchaseOrder(fullPO, user.id);
      toast.success(`Created ${newPO.po_number} as draft`);
      loadPurchaseOrders();
    } catch (error: any) {
      console.error("Error copying purchase order:", error);
      toast.error(error.message || "Failed to copy purchase order");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEdit = async (po: PurchaseOrder) => {
    // Fetch full PO with line items for editing
    const fullPO = await fetchPurchaseOrderById(po.id);
    if (fullPO) {
      setEditPO(fullPO);
      setShowForm(true);
    }
  };

  const handleViewDetail = (po: PurchaseOrder) => {
    setSelectedPO(po);
    setShowDetail(true);
  };

  const draftOrders = purchaseOrders.filter((po) => po.status === "draft");
  const sentOrders = purchaseOrders.filter((po) => po.status === "sent");
  const receivedOrders = purchaseOrders.filter((po) => po.status === "received");
  const paidOrders = purchaseOrders.filter((po) => po.status === "paid");
  const cancelledOrders = purchaseOrders.filter((po) => po.status === "cancelled");

  const renderTable = (orders: PurchaseOrder[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>PO Number</TableHead>
          <TableHead>Supplier</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[80px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              No purchase orders found
            </TableCell>
          </TableRow>
        ) : (
          orders.map((po) => {
            const statusConfig = PO_STATUS_CONFIG[po.status] || PO_STATUS_CONFIG.draft;
            return (
              <TableRow
                key={po.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleViewDetail(po)}
              >
                <TableCell className="font-medium">{po.po_number}</TableCell>
                <TableCell>{po.supplier?.name || "Unknown"}</TableCell>
                <TableCell>{format(new Date(po.order_date), "dd MMM yyyy")}</TableCell>
                <TableCell className="text-muted-foreground">{po.reference || "-"}</TableCell>
                <TableCell className="text-right font-medium">
                  £{po.total_amount?.toFixed(2) || "0.00"}
                </TableCell>
                <TableCell>
                  <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" disabled={actionLoading === po.id}>
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewDetail(po); }}>
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      
                      {/* Edit - only for drafts */}
                      {po.status === "draft" && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(po); }}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      
                      {/* Sync to Xero - only for drafts not yet synced */}
                      {po.status === "draft" && !po.xero_purchase_order_id && po.supplier?.xero_contact_id && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSyncToXero(po); }}>
                          <Send className="w-4 h-4 mr-2" />
                          Sync to Xero
                        </DropdownMenuItem>
                      )}
                      
                      {/* Copy to Draft - available for all */}
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCopyToDraft(po); }}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy to Draft
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator />
                      
                      {/* Void - only for synced POs that aren't already voided */}
                      {po.xero_purchase_order_id && po.status !== "cancelled" && (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setPoToVoid(po); }}
                        >
                          <Ban className="w-4 h-4 mr-2" />
                          Void
                        </DropdownMenuItem>
                      )}
                      
                      {/* Delete - for drafts or cancelled */}
                      {(po.status === "draft" || po.status === "cancelled") && (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setPoToDelete(po); }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Purchase Orders</h2>
            <p className="text-muted-foreground">Manage supplier orders and sync to Xero</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setShowSuppliers(true)}>
              <Users className="w-4 h-4 mr-2" />
              Suppliers
            </Button>
            <Button variant="hero" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Purchase Order
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="draft">
          <TabsList>
            <TabsTrigger value="draft">
              Draft ({draftOrders.length})
            </TabsTrigger>
            <TabsTrigger value="sent">
              Sent ({sentOrders.length})
            </TabsTrigger>
            <TabsTrigger value="received">
              Received ({receivedOrders.length})
            </TabsTrigger>
            <TabsTrigger value="paid">
              Paid ({paidOrders.length})
            </TabsTrigger>
            {cancelledOrders.length > 0 && (
              <TabsTrigger value="voided">
                Voided ({cancelledOrders.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="draft" className="bg-card rounded-xl border border-border mt-4">
            {renderTable(draftOrders)}
          </TabsContent>
          <TabsContent value="sent" className="bg-card rounded-xl border border-border mt-4">
            {renderTable(sentOrders)}
          </TabsContent>
          <TabsContent value="received" className="bg-card rounded-xl border border-border mt-4">
            {renderTable(receivedOrders)}
          </TabsContent>
          <TabsContent value="paid" className="bg-card rounded-xl border border-border mt-4">
            {renderTable(paidOrders)}
          </TabsContent>
          <TabsContent value="voided" className="bg-card rounded-xl border border-border mt-4">
            {renderTable(cancelledOrders)}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <PurchaseOrderFormDialog
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditPO(null);
        }}
        editPurchaseOrder={editPO}
        onSuccess={() => {
          loadPurchaseOrders();
          setShowForm(false);
          setEditPO(null);
        }}
      />

      <PurchaseOrderDetailDialog
        open={showDetail}
        onOpenChange={setShowDetail}
        purchaseOrderId={selectedPO?.id || null}
        onUpdate={loadPurchaseOrders}
      />

      <SuppliersDialog
        open={showSuppliers}
        onOpenChange={setShowSuppliers}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!poToDelete} onOpenChange={() => setPoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {poToDelete?.po_number}.
              {poToDelete?.xero_purchase_order_id && (
                <span className="block mt-2">
                  This will also remove it from Xero.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Void Confirmation */}
      <AlertDialog open={!!poToVoid} onOpenChange={() => setPoToVoid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void {poToVoid?.po_number}?
              <span className="block mt-2">
                This will cancel the PO in Xero but keep the local record for reference.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleVoid} className="bg-destructive text-destructive-foreground">
              Void
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default PurchaseOrders;

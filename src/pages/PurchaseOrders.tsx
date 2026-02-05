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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, MoreVertical, Eye, Trash2, Send, Users, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  fetchPurchaseOrders,
  deletePurchaseOrder,
  PurchaseOrder,
  PO_STATUS_CONFIG,
} from "@/services/purchaseOrderService";
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
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [poToDelete, setPoToDelete] = useState<string | null>(null);

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
      await deletePurchaseOrder(poToDelete);
      toast.success("Purchase order deleted");
      loadPurchaseOrders();
    } catch (error) {
      console.error("Error deleting purchase order:", error);
      toast.error("Failed to delete purchase order");
    } finally {
      setPoToDelete(null);
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
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleViewDetail(po)}>
                        <Eye className="w-4 h-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      {po.status === "draft" && (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPoToDelete(po.id);
                          }}
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
        </Tabs>
      </div>

      {/* Dialogs */}
      <PurchaseOrderFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={() => {
          loadPurchaseOrders();
          setShowForm(false);
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

      <AlertDialog open={!!poToDelete} onOpenChange={() => setPoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the purchase order.
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
    </DashboardLayout>
  );
};

export default PurchaseOrders;
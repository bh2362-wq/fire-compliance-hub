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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Download, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchSuppliers,
  createSupplier,
  fetchXeroSuppliers,
  importSupplierFromXero,
  Supplier,
} from "@/services/purchaseOrderService";
import { useAuth } from "@/contexts/AuthContext";

interface SuppliersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SuppliersDialog = ({ open, onOpenChange }: SuppliersDialogProps) => {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [xeroSuppliers, setXeroSuppliers] = useState<Partial<Supplier>[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingXero, setLoadingXero] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postcode: "",
  });

  useEffect(() => {
    if (open) {
      loadSuppliers();
    }
  }, [open]);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const data = await fetchSuppliers();
      setSuppliers(data);
    } catch (error) {
      console.error("Error loading suppliers:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadXeroSuppliers = async () => {
    try {
      setLoadingXero(true);
      const data = await fetchXeroSuppliers();
      // Filter out already imported suppliers
      const existingXeroIds = suppliers.map((s) => s.xero_contact_id).filter(Boolean);
      const filtered = data.filter((s) => !existingXeroIds.includes(s.xero_contact_id!));
      setXeroSuppliers(filtered);
    } catch (error: any) {
      console.error("Error loading Xero suppliers:", error);
      toast.error(error.message || "Failed to load Xero suppliers");
    } finally {
      setLoadingXero(false);
    }
  };

  const handleImportFromXero = async (xeroSupplier: Partial<Supplier>) => {
    if (!user?.id) return;
    try {
      setImporting(xeroSupplier.xero_contact_id!);
      await importSupplierFromXero(xeroSupplier, user.id);
      toast.success(`Imported ${xeroSupplier.name}`);
      loadSuppliers();
      setXeroSuppliers((prev) =>
        prev.filter((s) => s.xero_contact_id !== xeroSupplier.xero_contact_id)
      );
    } catch (error: any) {
      console.error("Error importing supplier:", error);
      toast.error(error.message || "Failed to import supplier");
    } finally {
      setImporting(null);
    }
  };

  const handleAddSupplier = async () => {
    if (!newSupplier.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    if (!user?.id) return;

    try {
      await createSupplier(newSupplier, user.id);
      toast.success("Supplier added");
      setShowAddForm(false);
      setNewSupplier({
        name: "",
        contact_name: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        postcode: "",
      });
      loadSuppliers();
    } catch (error) {
      console.error("Error adding supplier:", error);
      toast.error("Failed to add supplier");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suppliers</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="existing">
          <TabsList className="mb-4">
            <TabsTrigger value="existing">My Suppliers ({suppliers.length})</TabsTrigger>
            <TabsTrigger value="import" onClick={loadXeroSuppliers}>
              Import from Xero
            </TabsTrigger>
          </TabsList>

          <TabsContent value="existing">
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setShowAddForm(!showAddForm)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Supplier
                </Button>
              </div>

              {showAddForm && (
                <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
                  <h4 className="font-medium">New Supplier</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Name *</Label>
                      <Input
                        value={newSupplier.name}
                        onChange={(e) =>
                          setNewSupplier({ ...newSupplier, name: e.target.value })
                        }
                        placeholder="Supplier name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Name</Label>
                      <Input
                        value={newSupplier.contact_name}
                        onChange={(e) =>
                          setNewSupplier({ ...newSupplier, contact_name: e.target.value })
                        }
                        placeholder="Contact person"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={newSupplier.email}
                        onChange={(e) =>
                          setNewSupplier({ ...newSupplier, email: e.target.value })
                        }
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={newSupplier.phone}
                        onChange={(e) =>
                          setNewSupplier({ ...newSupplier, phone: e.target.value })
                        }
                        placeholder="Phone number"
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Address</Label>
                      <Input
                        value={newSupplier.address}
                        onChange={(e) =>
                          setNewSupplier({ ...newSupplier, address: e.target.value })
                        }
                        placeholder="Street address"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input
                        value={newSupplier.city}
                        onChange={(e) =>
                          setNewSupplier({ ...newSupplier, city: e.target.value })
                        }
                        placeholder="City"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Postcode</Label>
                      <Input
                        value={newSupplier.postcode}
                        onChange={(e) =>
                          setNewSupplier({ ...newSupplier, postcode: e.target.value })
                        }
                        placeholder="Postcode"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowAddForm(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddSupplier}>Save Supplier</Button>
                  </div>
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Xero Linked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : suppliers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No suppliers yet. Add one or import from Xero.
                      </TableCell>
                    </TableRow>
                  ) : (
                    suppliers.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell className="font-medium">{supplier.name}</TableCell>
                        <TableCell>{supplier.contact_name || "-"}</TableCell>
                        <TableCell>{supplier.email || "-"}</TableCell>
                        <TableCell>
                          {supplier.xero_contact_id ? (
                            <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">
                              <ExternalLink className="w-3 h-3 mr-1" />
                              Linked
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="import">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Import suppliers from your Xero account. Only contacts marked as suppliers in Xero
                will appear here.
              </p>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingXero ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                        Loading Xero suppliers...
                      </TableCell>
                    </TableRow>
                  ) : xeroSuppliers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No new suppliers to import from Xero
                      </TableCell>
                    </TableRow>
                  ) : (
                    xeroSuppliers.map((supplier) => (
                      <TableRow key={supplier.xero_contact_id}>
                        <TableCell className="font-medium">{supplier.name}</TableCell>
                        <TableCell>{supplier.email || "-"}</TableCell>
                        <TableCell>{supplier.city || "-"}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleImportFromXero(supplier)}
                            disabled={importing === supplier.xero_contact_id}
                          >
                            {importing === supplier.xero_contact_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Download className="w-4 h-4 mr-1" />
                                Import
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SuppliersDialog;
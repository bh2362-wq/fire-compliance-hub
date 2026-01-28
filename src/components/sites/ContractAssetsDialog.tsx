import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Package } from "lucide-react";
import {
  ContractAsset,
  ContractAssetInsert,
  getContractAssets,
  createContractAsset,
  updateContractAsset,
  deleteContractAsset,
  getAssetItemsForDiscipline,
} from "@/services/contractAssetService";
import { ServiceContract, getServiceTypeLabel } from "@/services/serviceContractService";
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

interface ContractAssetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: ServiceContract;
}

export function ContractAssetsDialog({ open, onOpenChange, contract }: ContractAssetsDialogProps) {
  const [assets, setAssets] = useState<ContractAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ContractAsset | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [itemName, setItemName] = useState("");
  const [itemType, setItemType] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [loopsCount, setLoopsCount] = useState("");
  const [zonesCount, setZonesCount] = useState("");
  const [location, setLocation] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [notes, setNotes] = useState("");

  const assetItems = getAssetItemsForDiscipline(contract.service_type);

  useEffect(() => {
    if (open) {
      loadAssets();
    }
  }, [open, contract.id]);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const data = await getContractAssets(contract.id);
      setAssets(data);
    } catch (error) {
      console.error("Failed to load assets:", error);
      toast.error("Failed to load assets");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setItemName("");
    setItemType("");
    setManufacturer("");
    setModel("");
    setLoopsCount("");
    setZonesCount("");
    setLocation("");
    setSerialNumber("");
    setNotes("");
    setEditingAsset(null);
    setShowForm(false);
  };

  const handleAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const handleEdit = (asset: ContractAsset) => {
    setEditingAsset(asset);
    setItemName(asset.item_name);
    setItemType(asset.item_type || "");
    setManufacturer(asset.manufacturer || "");
    setModel(asset.model || "");
    setLoopsCount(asset.loops_count?.toString() || "");
    setZonesCount(asset.zones_count?.toString() || "");
    setLocation(asset.location || "");
    setSerialNumber(asset.serial_number || "");
    setNotes(asset.notes || "");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!itemName) {
      toast.error("Please select an item type");
      return;
    }

    setSaving(true);
    try {
      const assetData: ContractAssetInsert = {
        contract_id: contract.id,
        item_name: itemName,
        item_type: itemType || null,
        manufacturer: manufacturer || null,
        model: model || null,
        loops_count: loopsCount ? parseInt(loopsCount, 10) : null,
        zones_count: zonesCount ? parseInt(zonesCount, 10) : null,
        location: location || null,
        serial_number: serialNumber || null,
        notes: notes || null,
      };

      if (editingAsset) {
        await updateContractAsset(editingAsset.id, assetData);
        toast.success("Asset updated");
      } else {
        await createContractAsset(assetData);
        toast.success("Asset added");
      }

      resetForm();
      loadAssets();
    } catch (error) {
      console.error("Failed to save asset:", error);
      toast.error("Failed to save asset");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteContractAsset(deleteId);
      toast.success("Asset deleted");
      loadAssets();
    } catch (error) {
      console.error("Failed to delete asset:", error);
      toast.error("Failed to delete asset");
    } finally {
      setDeleteId(null);
    }
  };

  const getItemLabel = (value: string) => {
    return assetItems.find((i) => i.value === value)?.label || value;
  };

  // Show loops/zones fields for relevant item types
  const showLoopsZones = ["control_panel", "repeater_panel", "aspirating_unit"].includes(itemName);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {getServiceTypeLabel(contract.service_type)} Assets
            </DialogTitle>
          </DialogHeader>

          {showForm ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="item-name">Item *</Label>
                  <Select value={itemName} onValueChange={setItemName}>
                    <SelectTrigger id="item-name">
                      <SelectValue placeholder="Select item" />
                    </SelectTrigger>
                    <SelectContent>
                      {assetItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-type">Type/Category</Label>
                  <Input
                    id="item-type"
                    value={itemType}
                    onChange={(e) => setItemType(e.target.value)}
                    placeholder="e.g., Addressable, Conventional"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="manufacturer">Manufacturer</Label>
                  <Input
                    id="manufacturer"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    placeholder="e.g., Gent, Hochiki, Kentec"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g., Vigilon, S-Quad"
                  />
                </div>
              </div>

              {showLoopsZones && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="loops-count">Number of Loops</Label>
                    <Input
                      id="loops-count"
                      type="number"
                      min="0"
                      value={loopsCount}
                      onChange={(e) => setLoopsCount(e.target.value)}
                      placeholder="e.g., 2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zones-count">Number of Zones</Label>
                    <Input
                      id="zones-count"
                      type="number"
                      min="0"
                      value={zonesCount}
                      onChange={(e) => setZonesCount(e.target.value)}
                      placeholder="e.g., 8"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., Main Reception, Plant Room"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serial-number">Serial Number</Label>
                  <Input
                    id="serial-number"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="e.g., SN123456"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional details..."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingAsset ? "Update" : "Add"} Asset
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex justify-end">
                <Button size="sm" onClick={handleAdd}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Asset
                </Button>
              </div>

              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : assets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No assets configured. Add assets to track equipment for this contract.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Manufacturer / Model</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-center">Loops</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assets.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell>
                          <div className="font-medium">{getItemLabel(asset.item_name)}</div>
                          {asset.item_type && (
                            <div className="text-xs text-muted-foreground">{asset.item_type}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {asset.manufacturer || asset.model ? (
                            <>
                              <div>{asset.manufacturer || "—"}</div>
                              <div className="text-xs text-muted-foreground">{asset.model || ""}</div>
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>{asset.location || "—"}</TableCell>
                        <TableCell className="text-center">
                          {asset.loops_count ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(asset)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(asset.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this asset? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

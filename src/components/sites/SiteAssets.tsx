import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Server, Wind, Lightbulb, ShieldAlert, Pencil, Trash2, Loader2, Flame, Box, Accessibility, PanelTop } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SiteAsset {
  id: string;
  site_id: string;
  asset_type: string;
  item_name: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  location: string | null;
  zones_count: number | null;
  loops_count: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SiteAssetsProps {
  siteId: string;
}

const ASSET_TYPES = [
  { value: "fire_panel", label: "Fire Alarm Panel", icon: Server, color: "text-destructive" },
  { value: "asd", label: "ASD (Aspirating)", icon: Wind, color: "text-primary" },
  { value: "gas_suppression", label: "Gas Suppression", icon: Flame, color: "text-orange-500" },
  { value: "room_integrity", label: "Room Integrity", icon: Box, color: "text-cyan-500" },
  { value: "disabled_refuge", label: "Disabled Refuge", icon: Accessibility, color: "text-blue-500" },
  { value: "fire_curtain", label: "Fire Curtain", icon: PanelTop, color: "text-rose-500" },
  { value: "emergency_lighting", label: "Emergency Lighting", icon: Lightbulb, color: "text-warning" },
  { value: "intruder_alarm", label: "Intruder Alarm", icon: ShieldAlert, color: "text-accent" },
  { value: "other", label: "Other", icon: Server, color: "text-muted-foreground" },
];

export function SiteAssets({ siteId }: SiteAssetsProps) {
  const [assets, setAssets] = useState<SiteAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<SiteAsset | null>(null);
  const [deleteAsset, setDeleteAsset] = useState<SiteAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [assetType, setAssetType] = useState("fire_panel");
  const [itemName, setItemName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [location, setLocation] = useState("");
  const [zonesCount, setZonesCount] = useState<number | "">("");
  const [loopsCount, setLoopsCount] = useState<number | "">("");
  const [notes, setNotes] = useState("");

  const fetchAssets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_assets")
      .select("*")
      .eq("site_id", siteId)
      .order("asset_type", { ascending: true })
      .order("item_name", { ascending: true });

    if (!error && data) {
      setAssets(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAssets();
  }, [siteId]);

  const resetForm = () => {
    setAssetType("fire_panel");
    setItemName("");
    setManufacturer("");
    setModel("");
    setSerialNumber("");
    setLocation("");
    setZonesCount("");
    setLoopsCount("");
    setNotes("");
    setEditingAsset(null);
  };

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (asset: SiteAsset) => {
    setEditingAsset(asset);
    setAssetType(asset.asset_type);
    setItemName(asset.item_name);
    setManufacturer(asset.manufacturer || "");
    setModel(asset.model || "");
    setSerialNumber(asset.serial_number || "");
    setLocation(asset.location || "");
    setZonesCount(asset.zones_count || "");
    setLoopsCount(asset.loops_count || "");
    setNotes(asset.notes || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!itemName.trim()) {
      toast.error("Asset name is required");
      return;
    }

    setSaving(true);
    try {
      const assetData = {
        site_id: siteId,
        asset_type: assetType,
        item_name: itemName.trim(),
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        serial_number: serialNumber.trim() || null,
        location: location.trim() || null,
        zones_count: zonesCount === "" ? null : zonesCount,
        loops_count: loopsCount === "" ? null : loopsCount,
        notes: notes.trim() || null,
      };

      if (editingAsset) {
        const { error } = await supabase
          .from("site_assets")
          .update(assetData)
          .eq("id", editingAsset.id);

        if (error) throw error;
        toast.success("Asset updated");
      } else {
        const { error } = await supabase
          .from("site_assets")
          .insert(assetData);

        if (error) throw error;
        toast.success("Asset added");
      }

      setDialogOpen(false);
      resetForm();
      fetchAssets();
    } catch (error) {
      console.error("Failed to save asset:", error);
      toast.error("Failed to save asset");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteAsset) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("site_assets")
        .delete()
        .eq("id", deleteAsset.id);

      if (error) throw error;
      toast.success("Asset deleted");
      setDeleteAsset(null);
      fetchAssets();
    } catch (error) {
      console.error("Failed to delete asset:", error);
      toast.error("Failed to delete asset");
    } finally {
      setDeleting(false);
    }
  };

  const getAssetTypeConfig = (type: string) => {
    return ASSET_TYPES.find((t) => t.value === type) || ASSET_TYPES[8];
  };

  const groupedAssets = assets.reduce((acc, asset) => {
    const type = asset.asset_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(asset);
    return acc;
  }, {} as Record<string, SiteAsset[]>);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-end mb-4">
        <Button variant="hero" size="sm" onClick={openAddDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Add Asset
        </Button>
      </div>

      {assets.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Server className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p>No assets added yet.</p>
          <p className="text-sm">Add fire panels, ASD units, and other equipment.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedAssets).map(([type, typeAssets]) => {
            const config = getAssetTypeConfig(type);
            const Icon = config.icon;

            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={`w-4 h-4 ${config.color}`} />
                  <h4 className="font-medium text-foreground">{config.label}</h4>
                  <Badge variant="secondary" className="text-xs">
                    {typeAssets.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {typeAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{asset.item_name}</p>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          {asset.manufacturer && <span>{asset.manufacturer}</span>}
                          {asset.model && <span>{asset.model}</span>}
                          {asset.location && <span>📍 {asset.location}</span>}
                          {asset.zones_count && <span>{asset.zones_count} zones</span>}
                          {asset.loops_count && <span>{asset.loops_count} loops</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(asset)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteAsset(asset)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingAsset ? "Edit Asset" : "Add Site Asset"}
            </DialogTitle>
            <DialogDescription>
              Add equipment or systems installed at this site.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Asset Type</Label>
              <Select value={assetType} onValueChange={setAssetType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Asset Name *</Label>
              <Input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g., Main Fire Panel, ASD Unit 1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Manufacturer</Label>
                <Input
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="e.g., Kentec"
                />
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g., Syncro AS"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Serial Number</Label>
                <Input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="S/N"
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Main Reception"
                />
              </div>
            </div>

            {(assetType === "fire_panel" || assetType === "asd") && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Zones</Label>
                  <Input
                    type="number"
                    value={zonesCount}
                    onChange={(e) => setZonesCount(e.target.value ? parseInt(e.target.value) : "")}
                    placeholder="Number of zones"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Loops</Label>
                  <Input
                    type="number"
                    value={loopsCount}
                    onChange={(e) => setLoopsCount(e.target.value ? parseInt(e.target.value) : "")}
                    placeholder="Number of loops"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="hero" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingAsset ? "Update" : "Add Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteAsset} onOpenChange={(open) => !open && setDeleteAsset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteAsset?.item_name}"?
              <br />
              <span className="text-destructive font-medium">
                This action cannot be undone.
              </span>
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
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

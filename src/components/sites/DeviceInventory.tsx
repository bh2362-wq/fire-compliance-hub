import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Cpu, Search, ChevronLeft, ChevronRight, Upload, Pencil, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Device {
  id: string;
  loop: string;
  address: string;
  device_type: string;
  location: string | null;
  zone: string | null;
  status: string | null;
  last_tested_at: string | null;
}

interface DeviceInventoryProps {
  siteId: string;
  onImportClick?: () => void;
}

const ITEMS_PER_PAGE = 10;

const DeviceInventory = ({ siteId, onImportClick }: DeviceInventoryProps) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deletingDevice, setDeletingDevice] = useState<Device | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    loop: "",
    address: "",
    device_type: "",
    location: "",
    zone: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    const fetchDevices = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("devices")
        .select("id, loop, address, device_type, location, zone, status, last_tested_at")
        .eq("site_id", siteId)
        .order("loop", { ascending: true })
        .order("address", { ascending: true });

      if (!error && data) {
        setDevices(data);
      }
      setLoading(false);
    };

    fetchDevices();
  }, [siteId]);

  const filteredDevices = devices.filter((device) =>
    [device.loop, device.address, device.device_type, device.location, device.zone]
      .filter(Boolean)
      .some((field) => field?.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPages = Math.ceil(filteredDevices.length / ITEMS_PER_PAGE);
  const paginatedDevices = filteredDevices.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const handleEditClick = (device: Device) => {
    setEditingDevice(device);
    setEditForm({
      loop: device.loop,
      address: device.address,
      device_type: device.device_type,
      location: device.location || "",
      zone: device.zone || "",
    });
  };

  const handleEditSave = async () => {
    if (!editingDevice) return;

    setSaving(true);
    const { error } = await supabase
      .from("devices")
      .update({
        loop: editForm.loop,
        address: editForm.address,
        device_type: editForm.device_type,
        location: editForm.location || null,
        zone: editForm.zone || null,
      })
      .eq("id", editingDevice.id);

    setSaving(false);

    if (error) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === editingDevice.id
            ? {
                ...d,
                loop: editForm.loop,
                address: editForm.address,
                device_type: editForm.device_type,
                location: editForm.location || null,
                zone: editForm.zone || null,
              }
            : d
        )
      );
      toast({
        title: "Device updated",
        description: `${editForm.device_type} at Loop ${editForm.loop}, Address ${editForm.address} updated.`,
      });
      setEditingDevice(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingDevice) return;

    setSaving(true);
    const { error } = await supabase
      .from("devices")
      .delete()
      .eq("id", deletingDevice.id);

    setSaving(false);

    if (error) {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setDevices((prev) => prev.filter((d) => d.id !== deletingDevice.id));
      toast({
        title: "Device deleted",
        description: `${deletingDevice.device_type} at Loop ${deletingDevice.loop}, Address ${deletingDevice.address} removed.`,
      });
      setDeletingDevice(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border">
          <Skeleton className="h-6 w-40 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="p-6 space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Device Inventory</h3>
            <p className="text-sm text-muted-foreground">
              {devices.length} device{devices.length !== 1 ? "s" : ""} registered
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search devices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          {onImportClick && (
            <Button variant="outline" size="sm" onClick={onImportClick}>
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
          )}
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="p-12 text-center">
          <Cpu className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No devices registered</h3>
          <p className="text-muted-foreground mb-4">
            Import a device inventory CSV to get started.
          </p>
          {onImportClick && (
            <Button variant="hero" onClick={onImportClick}>
              <Upload className="w-4 h-4 mr-2" />
              Import Devices
            </Button>
          )}
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-20">Loop</TableHead>
                <TableHead className="w-24">Address</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead>Last Tested</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedDevices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell className="font-mono text-sm">{device.loop}</TableCell>
                  <TableCell className="font-mono text-sm">{device.address}</TableCell>
                  <TableCell>{device.device_type}</TableCell>
                  <TableCell className="text-muted-foreground">{device.location || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{device.zone || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        device.status === "active"
                          ? "bg-success/10 text-success border-success/20"
                          : "bg-muted text-muted-foreground border-border"
                      }
                    >
                      {device.status || "Unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {device.last_tested_at
                      ? formatDistanceToNow(new Date(device.last_tested_at), { addSuffix: true })
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEditClick(device)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeletingDevice(device)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredDevices.length)} of{" "}
                {filteredDevices.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Device Dialog */}
      <Dialog open={!!editingDevice} onOpenChange={(open) => !open && setEditingDevice(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Device</DialogTitle>
            <DialogDescription>
              Update device details for Loop {editForm.loop}, Address {editForm.address}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-loop">Loop</Label>
                <Input
                  id="edit-loop"
                  value={editForm.loop}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, loop: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-address">Address</Label>
                <Input
                  id="edit-address"
                  value={editForm.address}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, address: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type">Device Type</Label>
              <Input
                id="edit-type"
                value={editForm.device_type}
                onChange={(e) => setEditForm((prev) => ({ ...prev, device_type: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-location">Location</Label>
              <Input
                id="edit-location"
                value={editForm.location}
                onChange={(e) => setEditForm((prev) => ({ ...prev, location: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-zone">Zone</Label>
              <Input
                id="edit-zone"
                value={editForm.zone}
                onChange={(e) => setEditForm((prev) => ({ ...prev, zone: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDevice(null)}>
              Cancel
            </Button>
            <Button variant="hero" onClick={handleEditSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingDevice} onOpenChange={(open) => !open && setDeletingDevice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Device</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingDevice?.device_type}</strong> at Loop {deletingDevice?.loop}, Address {deletingDevice?.address}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
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
};

export default DeviceInventory;

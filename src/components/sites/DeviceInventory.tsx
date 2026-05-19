import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Cpu, Search, ChevronLeft, ChevronRight, Pencil, Trash2, Loader2, Plus, Filter, Download, X, ChevronDown, AlertTriangle } from "lucide-react";
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
  raw_import_data?: Record<string, unknown> | null;
  imported_source_columns?: string[] | null;
}

interface DeviceInventoryProps {
  siteId: string;
  onImportClick?: () => void;
}

interface Filters {
  loop: string;
  zone: string;
  deviceTypes: string[];
  status: string;
}

const ITEMS_PER_PAGE = 10;

const DeviceInventory = ({ siteId, onImportClick }: DeviceInventoryProps) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deletingDevice, setDeletingDevice] = useState<Device | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [purging, setPurging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    loop: "",
    zone: "",
    deviceTypes: [],
    status: "",
  });
  const [editForm, setEditForm] = useState({
    loop: "",
    address: "",
    device_type: "",
    location: "",
    zone: "",
  });
  const { toast } = useToast();

  const filterOptions = useMemo(() => {
    const loops = [...new Set(devices.map((d) => d.loop).filter(Boolean))].sort();
    const zones = [...new Set(devices.map((d) => d.zone).filter(Boolean) as string[])].sort();
    const types = [...new Set(devices.map((d) => d.device_type).filter(Boolean))].sort();
    const statuses = [...new Set(devices.map((d) => d.status).filter(Boolean) as string[])].sort();
    return { loops, zones, types, statuses };
  }, [devices]);

  const importColumns = useMemo(() => {
    const core = new Set(["loop", "address", "type", "device type", "location", "zone"]);
    return Array.from(new Set(devices.flatMap((device) => device.imported_source_columns || Object.keys(device.raw_import_data || {}))))
      .filter((column) => !core.has(column.toLowerCase()));
  }, [devices]);

  const activeFilterCount = [filters.loop, filters.zone, filters.status].filter(Boolean).length + (filters.deviceTypes.length > 0 ? 1 : 0);

  useEffect(() => {
    const fetchDevices = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("devices")
        .select("id, loop, address, device_type, location, zone, status, last_tested_at, raw_import_data, imported_source_columns")
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

  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      const matchesSearch =
        !search ||
        [device.loop, device.address, device.device_type, device.location, device.zone]
          .filter(Boolean)
          .some((field) => field?.toLowerCase().includes(search.toLowerCase()));

      const matchesLoop = !filters.loop || device.loop === filters.loop;
      const matchesZone = !filters.zone || device.zone === filters.zone;
      const matchesType = filters.deviceTypes.length === 0 || filters.deviceTypes.includes(device.device_type);
      const matchesStatus = !filters.status || device.status === filters.status;

      return matchesSearch && matchesLoop && matchesZone && matchesType && matchesStatus;
    });
  }, [devices, search, filters]);

  const totalPages = Math.ceil(filteredDevices.length / ITEMS_PER_PAGE);
  const paginatedDevices = filteredDevices.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters]);

  const clearFilters = () => {
    setFilters({ loop: "", zone: "", deviceTypes: [], status: "" });
  };

  const toggleDeviceType = (type: string) => {
    setFilters((prev) => ({
      ...prev,
      deviceTypes: prev.deviceTypes.includes(type)
        ? prev.deviceTypes.filter((t) => t !== type)
        : [...prev.deviceTypes, type],
    }));
  };

  const handleExport = () => {
    if (filteredDevices.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }

    const headers = ["Loop", "Address", "Type", "Location", "Zone", ...importColumns, "Status", "Last Tested"];
    const rows = filteredDevices.map((device) => [
      device.loop, device.address, device.device_type, device.location || "",
      device.zone || "",
      ...importColumns.map((column) => String(device.raw_import_data?.[column] ?? "")),
      device.status || "",
      device.last_tested_at ? new Date(device.last_tested_at).toLocaleDateString() : "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `device-inventory-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: "Export complete", description: `Exported ${filteredDevices.length} devices to CSV.` });
  };

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
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === editingDevice.id
            ? { ...d, loop: editForm.loop, address: editForm.address, device_type: editForm.device_type, location: editForm.location || null, zone: editForm.zone || null }
            : d
        )
      );
      toast({ title: "Device updated" });
      setEditingDevice(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingDevice) return;
    setSaving(true);
    const { error } = await supabase.from("devices").delete().eq("id", deletingDevice.id);
    setSaving(false);

    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setDevices((prev) => prev.filter((d) => d.id !== deletingDevice.id));
      toast({ title: "Device deleted" });
      setDeletingDevice(null);
    }
  };

  const handlePurgeAll = async () => {
    if (purgeConfirm.trim().toUpperCase() !== "PURGE") return;
    setPurging(true);
    const { error, count } = await supabase
      .from("devices")
      .delete({ count: "exact" })
      .eq("site_id", siteId);
    setPurging(false);

    if (error) {
      toast({ title: "Purge failed", description: error.message, variant: "destructive" });
    } else {
      setDevices([]);
      toast({ title: "Inventory purged", description: `Removed ${count ?? 0} devices. You can now re-import.` });
      setPurgeOpen(false);
      setPurgeConfirm("");
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
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
      <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          {devices.length} device{devices.length !== 1 ? "s" : ""} registered
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-40" />
          </div>
          <Button variant={filtersOpen || activeFilterCount > 0 ? "secondary" : "outline"} size="sm" onClick={() => setFiltersOpen(!filtersOpen)}>
            <Filter className="w-4 h-4 mr-1" />
            {activeFilterCount > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5 bg-primary text-primary-foreground">{activeFilterCount}</Badge>}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4" />
          </Button>
          {onImportClick && (
            <Button variant="outline" size="sm" onClick={onImportClick}>
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          )}
          {devices.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setPurgeOpen(true)} className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30">
              <Trash2 className="w-4 h-4 mr-1" />
              Purge All
            </Button>
          )}
        </div>
      </div>

      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleContent>
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-end gap-3 flex-wrap">
            <Select value={filters.loop} onValueChange={(v) => setFilters((p) => ({ ...p, loop: v === "all" ? "" : v }))}>
              <SelectTrigger className="w-28 h-8"><SelectValue placeholder="Loop" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All loops</SelectItem>
                {filterOptions.loops.map((l) => <SelectItem key={l} value={l}>Loop {l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.zone} onValueChange={(v) => setFilters((p) => ({ ...p, zone: v === "all" ? "" : v }))}>
              <SelectTrigger className="w-28 h-8"><SelectValue placeholder="Zone" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All zones</SelectItem>
                {filterOptions.zones.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
              </SelectContent>
            </Select>
            {activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8"><X className="w-3 h-3 mr-1" />Clear</Button>}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {filteredDevices.length === 0 ? (
        <div className="p-12 text-center">
          <Cpu className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No devices found</h3>
          <p className="text-muted-foreground mb-4">Add devices to this site's inventory.</p>
          {onImportClick && <Button variant="hero" onClick={onImportClick}><Plus className="w-4 h-4 mr-2" />Add Devices</Button>}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loop</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Zone</TableHead>
                {importColumns.map((column) => <TableHead key={column}>{column}</TableHead>)}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedDevices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell className="font-medium">{device.loop}</TableCell>
                  <TableCell>{device.address}</TableCell>
                  <TableCell>{device.device_type}</TableCell>
                  <TableCell className="text-muted-foreground">{device.location || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{device.zone || "—"}</TableCell>
                  {importColumns.map((column) => (
                    <TableCell key={column} className="max-w-40 truncate text-muted-foreground">
                      {String(device.raw_import_data?.[column] ?? "") || "—"}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Badge variant={device.status === "active" ? "default" : "secondary"}>{device.status || "unknown"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleEditClick(device)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeletingDevice(device)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          {totalPages > 1 && (
            <div className="p-4 border-t border-border flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={!!editingDevice} onOpenChange={(o) => !o && setEditingDevice(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Device</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Loop</Label><Input value={editForm.loop} onChange={(e) => setEditForm((p) => ({ ...p, loop: e.target.value }))} /></div>
              <div><Label>Address</Label><Input value={editForm.address} onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))} /></div>
            </div>
            <div><Label>Type</Label><Input value={editForm.device_type} onChange={(e) => setEditForm((p) => ({ ...p, device_type: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Location</Label><Input value={editForm.location} onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))} /></div>
              <div><Label>Zone</Label><Input value={editForm.zone} onChange={(e) => setEditForm((p) => ({ ...p, zone: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDevice(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingDevice} onOpenChange={(o) => !o && setDeletingDevice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Device</AlertDialogTitle><AlertDialogDescription>Delete {deletingDevice?.device_type} at Loop {deletingDevice?.loop}, Address {deletingDevice?.address}?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={purgeOpen} onOpenChange={(o) => { if (!o) { setPurgeOpen(false); setPurgeConfirm(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Purge entire device inventory?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes all <strong>{devices.length}</strong> devices for this site so you can start a fresh import. This cannot be undone. Service history and reports that reference these devices will lose their device links.
              <br /><br />
              Type <strong>PURGE</strong> below to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={purgeConfirm}
            onChange={(e) => setPurgeConfirm(e.target.value)}
            placeholder="Type PURGE to confirm"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handlePurgeAll(); }}
              disabled={purging || purgeConfirm.trim().toUpperCase() !== "PURGE"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {purging ? <Loader2 className="w-4 h-4 animate-spin" /> : "Purge All Devices"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DeviceInventory;

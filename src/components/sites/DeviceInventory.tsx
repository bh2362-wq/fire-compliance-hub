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
import { Skeleton } from "@/components/ui/skeleton";
import { Cpu, Search, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

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
    </div>
  );
};

export default DeviceInventory;

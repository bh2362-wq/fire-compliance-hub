import { ParsedDevice, ParseResult } from "@/lib/parsers/csvParser";
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
  CheckCircle,
  XCircle,
  AlertCircle,
  HelpCircle,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState, useMemo } from "react";

interface ParsedResultsTableProps {
  result: ParseResult;
  fileName: string;
}

const statusConfig = {
  passed: {
    label: "Passed",
    icon: CheckCircle,
    className: "bg-success/10 text-success border-success/20",
  },
  fault: {
    label: "Fault",
    icon: XCircle,
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  untested: {
    label: "Untested",
    icon: AlertCircle,
    className: "bg-warning/10 text-warning border-warning/20",
  },
  unknown: {
    label: "Unknown",
    icon: HelpCircle,
    className: "bg-muted text-muted-foreground border-border",
  },
};

const ITEMS_PER_PAGE = 10;

const ParsedResultsTable = ({ result, fileName }: ParsedResultsTableProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filteredDevices = useMemo(() => {
    return result.devices.filter((device) => {
      const matchesSearch =
        !searchQuery ||
        device.loop.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.deviceType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.location.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = !statusFilter || device.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [result.devices, searchQuery, statusFilter]);

  const totalPages = Math.ceil(filteredDevices.length / ITEMS_PER_PAGE);
  const paginatedDevices = filteredDevices.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const exportToCSV = () => {
    const headers = ["Loop", "Address", "Type", "Location", "Status"];
    const rows = result.devices.map((d) => [
      d.loop,
      d.address,
      d.deviceType,
      d.location,
      d.status,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parsed-${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Total Devices"
          value={result.summary.totalDevices}
          variant="default"
        />
        <SummaryCard
          label="Passed"
          value={result.summary.testedDevices}
          variant="success"
          onClick={() => setStatusFilter(statusFilter === "passed" ? null : "passed")}
          active={statusFilter === "passed"}
        />
        <SummaryCard
          label="Faults"
          value={result.summary.faultDevices}
          variant="destructive"
          onClick={() => setStatusFilter(statusFilter === "fault" ? null : "fault")}
          active={statusFilter === "fault"}
        />
        <SummaryCard
          label="Untested"
          value={result.summary.unknownDevices}
          variant="warning"
          onClick={() => setStatusFilter(statusFilter === "untested" ? null : "untested")}
          active={statusFilter === "untested"}
        />
      </div>

      {/* Errors */}
      {result.errors.length > 0 && (
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
          <p className="font-medium mb-1">Parsing warnings:</p>
          <ul className="list-disc list-inside space-y-1">
            {result.errors.slice(0, 3).map((error, i) => (
              <li key={i}>{error}</li>
            ))}
            {result.errors.length > 3 && (
              <li>...and {result.errors.length - 3} more</li>
            )}
          </ul>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search devices..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {statusFilter && (
            <Button variant="ghost" size="sm" onClick={() => setStatusFilter(null)}>
              Clear filter
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-20">Loop</TableHead>
              <TableHead className="w-24">Address</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="w-28">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedDevices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No devices found matching your criteria
                </TableCell>
              </TableRow>
            ) : (
              paginatedDevices.map((device) => {
                const status = statusConfig[device.status as keyof typeof statusConfig] ||
                  statusConfig.unknown;
                const StatusIcon = status.icon;

                return (
                  <TableRow key={device.id}>
                    <TableCell className="font-mono text-sm">{device.loop}</TableCell>
                    <TableCell className="font-mono text-sm">{device.address}</TableCell>
                    <TableCell>{device.deviceType}</TableCell>
                    <TableCell className="text-muted-foreground">{device.location}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={status.className}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {status.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredDevices.length)} of{" "}
              {filteredDevices.length} devices
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
      </div>
    </div>
  );
};

interface SummaryCardProps {
  label: string;
  value: number;
  variant: "default" | "success" | "destructive" | "warning";
  onClick?: () => void;
  active?: boolean;
}

const SummaryCard = ({ label, value, variant, onClick, active }: SummaryCardProps) => {
  const variantStyles = {
    default: "bg-card",
    success: "bg-success/5 hover:bg-success/10",
    destructive: "bg-destructive/5 hover:bg-destructive/10",
    warning: "bg-warning/5 hover:bg-warning/10",
  };

  const textStyles = {
    default: "text-foreground",
    success: "text-success",
    destructive: "text-destructive",
    warning: "text-warning",
  };

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border transition-all ${
        onClick ? "cursor-pointer" : ""
      } ${variantStyles[variant]} ${
        active ? "ring-2 ring-accent" : "border-border"
      }`}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${textStyles[variant]}`}>{value}</p>
    </div>
  );
};

export default ParsedResultsTable;

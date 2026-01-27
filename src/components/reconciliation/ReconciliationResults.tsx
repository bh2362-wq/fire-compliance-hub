import { useState } from "react";
import { ReconciliationResult } from "@/services/reconciliationService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  AlertTriangle,
  HelpCircle,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface ReconciliationResultsProps {
  result: ReconciliationResult;
}

const ITEMS_PER_PAGE = 10;

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
    icon: AlertTriangle,
    className: "bg-warning/10 text-warning border-warning/20",
  },
  unknown: {
    label: "Unknown",
    icon: HelpCircle,
    className: "bg-muted text-muted-foreground border-border",
  },
};

const ReconciliationResults = ({ result }: ReconciliationResultsProps) => {
  const [matchedPage, setMatchedPage] = useState(1);
  const [unmatchedPage, setUnmatchedPage] = useState(1);
  const [missingPage, setMissingPage] = useState(1);

  const coverageColor = result.coverage >= 95 ? "text-success" : result.coverage >= 80 ? "text-warning" : "text-destructive";
  const passRateColor = result.passRate >= 95 ? "text-success" : result.passRate >= 80 ? "text-warning" : "text-destructive";

  const exportResults = () => {
    const headers = ["Category", "Loop", "Address", "Type", "Location", "Status"];
    const rows = [
      ...result.matched.map((m) => [
        "Matched",
        m.device.loop,
        m.device.address,
        m.device.device_type,
        m.device.location || "",
        m.status,
      ]),
      ...result.unmatched.map((u) => [
        "Unmatched",
        u.loop,
        u.address,
        u.device_type || "",
        u.location || "",
        u.status,
      ]),
      ...result.missing.map((m) => [
        "Missing",
        m.loop,
        m.address,
        m.device_type,
        m.location || "",
        "Not Tested",
      ]),
    ];

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliation-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <SummaryCard
          label="Coverage"
          value={`${result.coverage}%`}
          subtext={`${result.totalTested} of ${result.totalInventory} devices`}
          className={coverageColor}
        />
        <SummaryCard
          label="Pass Rate"
          value={`${result.passRate}%`}
          subtext={`${result.summary.passed} passed`}
          className={passRateColor}
        />
        <SummaryCard
          label="Matched"
          value={result.summary.matched}
          subtext="Devices found in inventory"
          className="text-success"
        />
        <SummaryCard
          label="Unmatched"
          value={result.summary.unmatched}
          subtext="Not in inventory"
          className="text-warning"
        />
        <SummaryCard
          label="Missing"
          value={result.summary.missing}
          subtext="Not tested"
          className="text-destructive"
        />
      </div>

      {/* Coverage Progress Bar */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-foreground">Test Coverage</h4>
          <Button variant="outline" size="sm" onClick={exportResults}>
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
        <div className="h-4 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              result.coverage >= 95 ? "bg-success" : result.coverage >= 80 ? "bg-warning" : "bg-destructive"
            }`}
            style={{ width: `${result.coverage}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-sm text-muted-foreground">
          <span>{result.totalTested} devices tested</span>
          <span>{result.summary.missing} devices missing</span>
        </div>
      </div>

      {/* Detailed Tables */}
      <Tabs defaultValue="matched" className="space-y-4">
        <TabsList>
          <TabsTrigger value="matched">
            Matched ({result.summary.matched})
          </TabsTrigger>
          <TabsTrigger value="unmatched">
            Unmatched ({result.summary.unmatched})
          </TabsTrigger>
          <TabsTrigger value="missing">
            Missing ({result.summary.missing})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matched">
          <DeviceTable
            type="matched"
            data={result.matched}
            currentPage={matchedPage}
            onPageChange={setMatchedPage}
          />
        </TabsContent>

        <TabsContent value="unmatched">
          <DeviceTable
            type="unmatched"
            data={result.unmatched}
            currentPage={unmatchedPage}
            onPageChange={setUnmatchedPage}
          />
        </TabsContent>

        <TabsContent value="missing">
          <DeviceTable
            type="missing"
            data={result.missing}
            currentPage={missingPage}
            onPageChange={setMissingPage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

interface SummaryCardProps {
  label: string;
  value: string | number;
  subtext: string;
  className?: string;
}

const SummaryCard = ({ label, value, subtext, className }: SummaryCardProps) => (
  <div className="bg-card rounded-xl border border-border p-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className={`text-2xl font-bold ${className}`}>{value}</p>
    <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
  </div>
);

interface DeviceTableProps {
  type: "matched" | "unmatched" | "missing";
  data: any[];
  currentPage: number;
  onPageChange: (page: number) => void;
}

const DeviceTable = ({ type, data, currentPage, onPageChange }: DeviceTableProps) => {
  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);
  const paginatedData = data.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (data.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
        {type === "matched" && "No matched devices"}
        {type === "unmatched" && "All devices matched to inventory"}
        {type === "missing" && "All inventory devices were tested"}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-20">Loop</TableHead>
            <TableHead className="w-24">Address</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Location</TableHead>
            {type === "matched" && <TableHead className="w-28">Status</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedData.map((item, index) => {
            const isMatched = type === "matched";
            const isMissing = type === "missing";
            const device = isMatched ? item.device : item;
            const status = isMatched ? item.status : null;
            const statusInfo = status ? statusConfig[status as keyof typeof statusConfig] || statusConfig.unknown : null;
            const StatusIcon = statusInfo?.icon;

            return (
              <TableRow key={index}>
                <TableCell className="font-mono text-sm">
                  {isMatched ? device.loop : item.loop}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {isMatched ? device.address : item.address}
                </TableCell>
                <TableCell>
                  {isMatched ? device.device_type : isMissing ? item.device_type : item.device_type || "Unknown"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {isMatched ? device.location || "-" : isMissing ? item.location || "-" : item.location || "-"}
                </TableCell>
                {isMatched && statusInfo && StatusIcon && (
                  <TableCell>
                    <Badge variant="outline" className={statusInfo.className}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {statusInfo.label}
                    </Badge>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
            {Math.min(currentPage * ITEMS_PER_PAGE, data.length)} of {data.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
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
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReconciliationResults;

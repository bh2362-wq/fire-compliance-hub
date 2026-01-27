import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import { Site, parseDeviceCSV, parseDeviceRows, importDevices, DeviceImport } from "@/services/siteService";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

interface DeviceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: Site;
  onSuccess: () => void;
}

const DeviceImportDialog = ({ open, onOpenChange, site, onSuccess }: DeviceImportDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedDevices, setParsedDevices] = useState<DeviceImport[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const { toast } = useToast();

  const parseSheet = useCallback((wb: XLSX.WorkBook, sheetName: string) => {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const { devices, errors } = parseDeviceRows(rows);
    setParsedDevices(devices);
    setParseErrors(errors);

    if (devices.length === 0 && errors.length > 0) {
      toast({
        title: "Parse failed",
        description: errors[0],
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleSheetChange = useCallback((sheetName: string) => {
    setSelectedSheet(sheetName);
    if (workbook) {
      parseSheet(workbook, sheetName);
    }
  }, [workbook, parseSheet]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFileName(file.name);
    setParsedDevices([]);
    setParseErrors([]);
    setSheetNames([]);
    setSelectedSheet("");
    setWorkbook(null);

    try {
      const isExcel = file.name.match(/\.(xlsx?|xls)$/i);

      if (isExcel) {
        // Handle Excel files
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const sheets = wb.SheetNames;
        
        setWorkbook(wb);
        setSheetNames(sheets);

        if (sheets.length === 1) {
          // Single sheet - parse immediately
          setSelectedSheet(sheets[0]);
          parseSheet(wb, sheets[0]);
        } else {
          // Multiple sheets - let user select
          setSelectedSheet(sheets[0]);
          parseSheet(wb, sheets[0]);
        }
      } else {
        // Handle CSV files
        const content = await file.text();
        const { devices, errors } = parseDeviceCSV(content);
        setParsedDevices(devices);
        setParseErrors(errors);

        if (devices.length === 0 && errors.length > 0) {
          toast({
            title: "Parse failed",
            description: errors[0],
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("File parse error:", error);
      toast({
        title: "File read error",
        description: "Could not read the file. Please check the format.",
        variant: "destructive",
      });
    }

    setLoading(false);
  }, [toast, parseSheet]);

  const handleImport = async () => {
    if (parsedDevices.length === 0) return;

    setImporting(true);
    const { imported, errors, error } = await importDevices(site.id, parsedDevices);
    setImporting(false);

    if (error) {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Import complete",
        description: `Successfully imported ${imported} devices${errors.length > 0 ? ` with ${errors.length} errors` : ""}`,
      });
      onSuccess();
      onOpenChange(false);
      // Reset state
      setParsedDevices([]);
      setParseErrors([]);
      setFileName("");
      setSheetNames([]);
      setSelectedSheet("");
      setWorkbook(null);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setParsedDevices([]);
    setParseErrors([]);
    setFileName("");
    setSheetNames([]);
    setSelectedSheet("");
    setWorkbook(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Import Device Inventory</DialogTitle>
          <DialogDescription>
            Import devices for <span className="font-medium text-foreground">{site.name}</span> from a CSV or Excel file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Format Info */}
          <div className="p-4 bg-muted/50 rounded-lg text-sm">
            <p className="font-medium text-foreground mb-2">Supported Formats</p>
            <p className="text-muted-foreground mb-2">
              <code className="text-accent">.csv</code>, <code className="text-accent">.xls</code>, <code className="text-accent">.xlsx</code>
            </p>
            <p className="text-muted-foreground mb-2">
              Required columns: <code className="text-accent">loop</code>, <code className="text-accent">address</code>, <code className="text-accent">type</code>
            </p>
            <p className="text-muted-foreground">
              Optional columns: <code className="text-accent">location</code>, <code className="text-accent">zone</code>
            </p>
          </div>

          {/* File Upload */}
          <div className="space-y-3">
            <label
              htmlFor="import-file"
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors"
            >
              {loading ? (
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              ) : fileName ? (
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-8 h-8 text-accent" />
                  <div className="text-left">
                    <p className="font-medium text-foreground">{fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      {parsedDevices.length} devices parsed
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">CSV or Excel files</p>
                </>
              )}
              <input
                id="import-file"
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={handleFileSelect}
                disabled={loading || importing}
              />
            </label>
          </div>

          {/* Sheet Selector for Excel files with multiple sheets */}
          {sheetNames.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="sheet-select">Select Sheet</Label>
              <Select value={selectedSheet} onValueChange={handleSheetChange}>
                <SelectTrigger id="sheet-select">
                  <SelectValue placeholder="Select a sheet" />
                </SelectTrigger>
                <SelectContent>
                  {sheetNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Parse Results */}
          {parsedDevices.length > 0 && (
            <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">{parsedDevices.length} devices ready to import</span>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                <p>Sample: Loop {parsedDevices[0].loop}, Address {parsedDevices[0].address} - {parsedDevices[0].device_type}</p>
              </div>
            </div>
          )}

          {/* Parse Errors */}
          {parseErrors.length > 0 && (
            <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg">
              <div className="flex items-center gap-2 text-warning mb-2">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">{parseErrors.length} parsing issues</span>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 max-h-24 overflow-y-auto">
                {parseErrors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {parseErrors.length > 5 && (
                  <li>...and {parseErrors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="hero"
            onClick={handleImport}
            disabled={parsedDevices.length === 0 || importing}
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Import {parsedDevices.length} Devices
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeviceImportDialog;
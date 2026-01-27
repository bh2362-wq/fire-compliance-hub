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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Settings2, FileText, ClipboardPaste } from "lucide-react";
import { 
  Site, 
  parseDeviceCSV, 
  parseDeviceRows, 
  parseDeviceRowsWithMapping,
  detectColumnMapping,
  importDevices, 
  DeviceImport,
  ColumnMapping,
  ManualValues,
  BulkReplaceMap
} from "@/services/siteService";
import { BulkReplaceMap as DialogBulkReplaceMap } from "./ColumnMappingDialog";
import { useToast } from "@/hooks/use-toast";
import ColumnMappingDialog from "./ColumnMappingDialog";
import { parsePDF } from "@/lib/parsers/pdfParser";
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
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [suggestedMapping, setSuggestedMapping] = useState<Partial<ColumnMapping>>({});
  const [currentMapping, setCurrentMapping] = useState<ColumnMapping | null>(null);
  const [currentManualValues, setCurrentManualValues] = useState<ManualValues>({});
  const [currentBulkReplaces, setCurrentBulkReplaces] = useState<BulkReplaceMap>({});
  const [isPdfFile, setIsPdfFile] = useState(false);
  const [importMode, setImportMode] = useState<"file" | "paste">("file");
  const [pastedText, setPastedText] = useState("");
  const { toast } = useToast();

  const parseWithMapping = useCallback((
    rows: Record<string, unknown>[], 
    mapping: ColumnMapping, 
    manualValues: ManualValues = {},
    bulkReplaces: BulkReplaceMap = {}
  ) => {
    const { devices, errors } = parseDeviceRowsWithMapping(rows, mapping, manualValues, bulkReplaces);
    setParsedDevices(devices);
    setParseErrors(errors);
    setCurrentMapping(mapping);
    setCurrentManualValues(manualValues);
    setCurrentBulkReplaces(bulkReplaces);

    if (devices.length === 0 && errors.length > 0) {
      toast({
        title: "Parse failed",
        description: errors[0],
        variant: "destructive",
      });
    }
  }, [toast]);

  const parseSheet = useCallback((wb: XLSX.WorkBook, sheetName: string) => {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    
    if (rows.length === 0) {
      setParseErrors(["No data rows found in the sheet"]);
      setParsedDevices([]);
      return;
    }

    setRawRows(rows);
    const columns = Object.keys(rows[0]);
    setAvailableColumns(columns);

    // Try to detect column mapping
    const { mapping, complete } = detectColumnMapping(columns);
    setSuggestedMapping(mapping);

    if (complete) {
      // All required columns found - parse immediately
      const { devices, errors } = parseDeviceRows(rows);
      setParsedDevices(devices);
      setParseErrors(errors);
      setCurrentMapping(mapping as ColumnMapping);

      if (devices.length === 0 && errors.length > 0) {
        toast({
          title: "Parse failed",
          description: errors[0],
          variant: "destructive",
        });
      }
    } else {
      // Missing required columns - show mapping dialog
      setParsedDevices([]);
      setParseErrors([]);
      setShowMappingDialog(true);
    }
  }, [toast]);

  const handleSheetChange = useCallback((sheetName: string) => {
    setSelectedSheet(sheetName);
    setCurrentMapping(null);
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
    setRawRows([]);
    setAvailableColumns([]);
    setCurrentMapping(null);
    setCurrentManualValues({});
    setCurrentBulkReplaces({});
    setIsPdfFile(false);

    try {
      const isPdf = file.name.match(/\.pdf$/i);
      const isExcel = file.name.match(/\.(xlsx?|xls)$/i);

      if (isPdf) {
        // Handle PDF files - no column mapping needed
        setIsPdfFile(true);
        const result = await parsePDF(file);
        
        if (result.success && result.devices.length > 0) {
          // Convert parsed PDF devices to DeviceImport format
          const devices: DeviceImport[] = result.devices.map((d) => ({
            loop: String(d.loop || "1"),
            address: String(d.address || ""),
            device_type: d.deviceType || "Unknown",
            location: d.location || undefined,
            zone: undefined,
          }));
          
          setParsedDevices(devices);
          setParseErrors(result.errors || []);
        } else {
          setParseErrors(result.errors || ["Failed to parse PDF"]);
          toast({
            title: "Parse failed",
            description: result.errors?.[0] || "Could not extract devices from PDF",
            variant: "destructive",
          });
        }
      } else if (isExcel) {
        // Handle Excel files
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const sheets = wb.SheetNames;
        
        setWorkbook(wb);
        setSheetNames(sheets);
        setSelectedSheet(sheets[0]);
        parseSheet(wb, sheets[0]);
      } else {
        // Handle CSV files
        const content = await file.text();
        const { devices, errors } = parseDeviceCSV(content);
        
        if (devices.length === 0 && errors.some(e => e.includes("must contain"))) {
          // CSV missing columns - convert to rows format for mapping
          const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
          if (lines.length >= 1) {
            const headers = lines[0].split(",").map(h => h.trim());
            const rows: Record<string, unknown>[] = [];
            
            for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
              const row: Record<string, unknown> = {};
              headers.forEach((h, idx) => {
                row[h] = values[idx] || "";
              });
              rows.push(row);
            }
            
            setRawRows(rows);
            setAvailableColumns(headers);
            const { mapping } = detectColumnMapping(headers);
            setSuggestedMapping(mapping);
            setShowMappingDialog(true);
          }
        } else {
          setParsedDevices(devices);
          setParseErrors(errors);
        }

        if (devices.length === 0 && errors.length > 0 && !errors.some(e => e.includes("must contain"))) {
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

  const handleMappingConfirm = useCallback((mapping: ColumnMapping, manualValues: ManualValues, bulkReplaces: DialogBulkReplaceMap) => {
    setShowMappingDialog(false);
    parseWithMapping(rawRows, mapping, manualValues, bulkReplaces as BulkReplaceMap);
  }, [rawRows, parseWithMapping]);

  const handleOpenMappingDialog = () => {
    if (availableColumns.length > 0) {
      setShowMappingDialog(true);
    }
  };

  const parsePastedData = useCallback((text: string) => {
    if (!text.trim()) {
      setParsedDevices([]);
      setParseErrors([]);
      setRawRows([]);
      setAvailableColumns([]);
      return;
    }

    setLoading(true);

    try {
      // Split into lines and detect delimiter (tab or comma)
      const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
      
      if (lines.length === 0) {
        setParseErrors(["No data found in pasted text"]);
        setLoading(false);
        return;
      }

      // Detect delimiter: tab-separated (from Excel/sheets) or comma-separated
      const firstLine = lines[0];
      const hasTab = firstLine.includes("\t");
      const delimiter = hasTab ? "\t" : ",";

      // Parse headers from first line
      const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));
      
      // Parse data rows
      const rows: Record<string, unknown>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ""));
        if (values.some(v => v)) { // Skip empty rows
          const row: Record<string, unknown> = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || "";
          });
          rows.push(row);
        }
      }

      if (rows.length === 0) {
        setParseErrors(["No data rows found. Make sure to include a header row."]);
        setLoading(false);
        return;
      }

      setRawRows(rows);
      setAvailableColumns(headers);

      // Try to detect column mapping
      const { mapping, complete } = detectColumnMapping(headers);
      setSuggestedMapping(mapping);

      if (complete) {
        // All required columns found - parse immediately
        const { devices, errors } = parseDeviceRows(rows);
        setParsedDevices(devices);
        setParseErrors(errors);
        setCurrentMapping(mapping as ColumnMapping);

        if (devices.length > 0) {
          toast({
            title: "Data parsed",
            description: `${devices.length} devices ready to import`,
          });
        }
      } else {
        // Missing required columns - show mapping dialog
        setParsedDevices([]);
        setParseErrors([]);
        setShowMappingDialog(true);
      }
    } catch (error) {
      console.error("Paste parse error:", error);
      setParseErrors(["Failed to parse pasted data"]);
    }

    setLoading(false);
  }, [toast]);

  const handlePasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPastedText(e.target.value);
  };

  const handleParsePasted = () => {
    parsePastedData(pastedText);
  };

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
      setRawRows([]);
      setAvailableColumns([]);
      setCurrentMapping(null);
      setCurrentManualValues({});
      setCurrentBulkReplaces({});
      setIsPdfFile(false);
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
    setRawRows([]);
    setAvailableColumns([]);
    setCurrentMapping(null);
    setCurrentManualValues({});
    setCurrentBulkReplaces({});
    setIsPdfFile(false);
    setImportMode("file");
    setPastedText("");
  };

  const handleTabChange = (value: string) => {
    setImportMode(value as "file" | "paste");
    // Reset state when switching tabs
    setParsedDevices([]);
    setParseErrors([]);
    setFileName("");
    setSheetNames([]);
    setSelectedSheet("");
    setWorkbook(null);
    setRawRows([]);
    setAvailableColumns([]);
    setCurrentMapping(null);
    setPastedText("");
    setIsPdfFile(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Import Device Inventory</DialogTitle>
            <DialogDescription>
              Import devices for <span className="font-medium text-foreground">{site.name}</span>
            </DialogDescription>
          </DialogHeader>

          <Tabs value={importMode} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file" className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload File
              </TabsTrigger>
              <TabsTrigger value="paste" className="flex items-center gap-2">
                <ClipboardPaste className="w-4 h-4" />
                Paste Data
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="space-y-4 mt-4">
              {/* Format Info */}
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p className="text-muted-foreground">
                  Supported: <code className="text-accent">.csv</code>, <code className="text-accent">.xls</code>, <code className="text-accent">.xlsx</code>, <code className="text-accent">.pdf</code>
                </p>
              </div>

              {/* File Upload */}
              <label
                htmlFor="import-file"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                ) : fileName ? (
                  <div className="flex items-center gap-3">
                    {isPdfFile ? (
                      <FileText className="w-8 h-8 text-accent" />
                    ) : (
                      <FileSpreadsheet className="w-8 h-8 text-accent" />
                    )}
                    <div className="text-left">
                      <p className="font-medium text-foreground">{fileName}</p>
                      <p className="text-sm text-muted-foreground">
                        {parsedDevices.length} devices parsed
                        {isPdfFile && " (PDF - auto-mapped)"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground">CSV, Excel, or PDF files</p>
                  </>
                )}
                <input
                  id="import-file"
                  type="file"
                  accept=".csv,.xls,.xlsx,.pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={loading || importing}
                />
              </label>

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
            </TabsContent>

            <TabsContent value="paste" className="space-y-4 mt-4">
              {/* Paste Instructions */}
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p className="text-muted-foreground">
                  Paste data from Excel or any spreadsheet. Include a header row with columns like <code className="text-accent">loop</code>, <code className="text-accent">address</code>, <code className="text-accent">type</code>
                </p>
              </div>

              {/* Paste Textarea */}
              <div className="space-y-2">
                <Label htmlFor="paste-data">Paste Device Data</Label>
                <Textarea
                  id="paste-data"
                  placeholder="loop&#9;address&#9;type&#9;location
1&#9;001&#9;Optical Smoke&#9;Ground Floor
1&#9;002&#9;Heat Detector&#9;Kitchen
..."
                  className="min-h-[150px] font-mono text-sm"
                  value={pastedText}
                  onChange={handlePasteChange}
                  disabled={loading || importing}
                />
              </div>

              {/* Parse Button */}
              <Button
                type="button"
                variant="outline"
                onClick={handleParsePasted}
                disabled={!pastedText.trim() || loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <ClipboardPaste className="w-4 h-4 mr-2" />
                    Parse Pasted Data
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>

          {/* Column Mapping Button - only for CSV/Excel/Paste, not PDF */}
          {availableColumns.length > 0 && !isPdfFile && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenMappingDialog}
              className="w-full"
            >
              <Settings2 className="w-4 h-4 mr-2" />
              {currentMapping ? "Reconfigure Column Mapping" : "Configure Column Mapping"}
            </Button>
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

      <ColumnMappingDialog
        open={showMappingDialog}
        onOpenChange={setShowMappingDialog}
        availableColumns={availableColumns}
        suggestedMapping={suggestedMapping}
        sampleData={rawRows.slice(0, 3)}
        onConfirm={handleMappingConfirm}
      />
    </>
  );
};

export default DeviceImportDialog;
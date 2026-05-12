import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, Download, Trash2, RefreshCw, Search,
  AlertCircle, CheckCircle2, FileSpreadsheet, Plus, Pencil, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  getPriceList, uploadPriceList, deletePriceListItem, updatePriceListItem,
  parsePriceListCsvWithOverrides, downloadPriceListTemplate,
  getExcelSheets, parseExcelSheetFull,
  type PriceListItem, type ParsedPriceRow, type ExcelSheetInfo, type ParseResult,
} from "@/services/priceListService";

interface PriceListManagerProps {
  initialPreview?: { rows: ParsedPriceRow[]; sourceName: string } | null;
  onPreviewConsumed?: () => void;
}

export function PriceListManager({ initialPreview, onPreviewConsumed }: PriceListManagerProps = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ParsedPriceRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [runningCron, setRunningCron] = useState(false);
  const [replaceAll, setReplaceAll] = useState(false);
  const [search, setSearch] = useState("");
  const [excelBuffer, setExcelBuffer] = useState<ArrayBuffer | null>(null);
  const [excelSheets, setExcelSheets] = useState<ExcelSheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [sheetSearch, setSheetSearch] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("list");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [colOverrides, setColOverrides] = useState<Partial<Record<string, number>>>({});
  const [rawCsvText, setRawCsvText] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ unit_cost: string; labour_cost: string; description: string; manufacturer: string; part_number: string }>({ unit_cost: "", labour_cost: "", description: "", manufacturer: "", part_number: "" });

  // Load incoming preview rows from email scanner
  const previewLoadedRef = useRef<string | null>(null);
  if (initialPreview && previewLoadedRef.current !== initialPreview.sourceName) {
    previewLoadedRef.current = initialPreview.sourceName;
    setPreview(initialPreview.rows);
    setActiveTab("upload");
    setParseResult({ rows: initialPreview.rows, allPricesZero: false } as ParseResult);
    onPreviewConsumed?.();
  }

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["price-list"],
    queryFn: () => getPriceList(false), // show all including inactive
  });

  const activeItems = items.filter(i => i.is_active);

  function applyParseResult(result: ParseResult, sheetLabel?: string) {
    setParseResult(result);
    setColOverrides({});
    setPreview(result.rows);
    setActiveTab("upload");
    if (result.rows.length === 0) {
      toast.error("No valid rows found — check column headers");
      return;
    }
    if (result.allPricesZero) {
      toast.warning(`${result.rows.length} rows parsed but prices are all £0 — use the column mapper below to fix this`);
    } else {
      const label = sheetLabel ? ` from "${sheetLabel}"` : "";
      toast.success(`${result.rows.length} items parsed${label}`);
    }
  }

  function parseFile(file: File) {
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".xlsm");
    const isCsv   = file.name.endsWith(".csv") || file.type.includes("csv");

    if (!isExcel && !isCsv) {
      toast.error("Please upload a .csv, .xlsx, or .xls file");
      return;
    }

    const reader = new FileReader();

    if (isExcel) {
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        const sheets = getExcelSheets(buffer);
        if (sheets.length === 0) { toast.error("No sheets found in workbook"); return; }
        setExcelBuffer(buffer);
        setExcelSheets(sheets);
        setRawCsvText("");
        if (sheets.length === 1) {
          const result = parseExcelSheetFull(buffer, sheets[0].name);
          setSelectedSheet(sheets[0].name);
          applyParseResult(result, sheets[0].name);
        } else {
          setSelectedSheet("");
          setPreview([]);
          setActiveTab("upload");
          toast.info(`${sheets.length} sheets found — select a sheet below to import`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => {
        const csv = e.target?.result as string;
        setExcelBuffer(null);
        setExcelSheets([]);
        setSelectedSheet("");
        setRawCsvText(csv);
        const result = parsePriceListCsvWithOverrides(csv);
        applyParseResult(result);
      };
      reader.readAsText(file);
    }
  }

  function handleSheetSelect(sheetName: string) {
    if (!excelBuffer) return;
    setSelectedSheet(sheetName);
    setSheetSearch("");
    const result = parseExcelSheetFull(excelBuffer, sheetName);
    applyParseResult(result, sheetName);
  }

  function applyColumnOverride(field: string, colIdx: number) {
    const newOverrides = { ...colOverrides, [field]: colIdx };
    setColOverrides(newOverrides);
    // Re-parse with updated overrides
    if (excelBuffer && selectedSheet) {
      const result = parseExcelSheetFull(excelBuffer, selectedSheet, newOverrides as any);
      setParseResult(result);
      setPreview(result.rows);
    } else if (rawCsvText) {
      const result = parsePriceListCsvWithOverrides(rawCsvText, newOverrides as any);
      setParseResult(result);
      setPreview(result.rows);
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    parseFile(e.dataTransfer.files[0]);
  }, []);

  async function handleImport() {
    if (!user || !preview.length) return;
    setUploading(true);
    try {
      const { created, errors } = await uploadPriceList(preview, {
        createdBy: user.id, replaceAll,
      });
      errors.forEach(e => toast.error(e));
      toast.success(`${created} items imported to price list`);
      setPreview([]);
      qc.invalidateQueries({ queryKey: ["price-list"] });
    } catch (err: any) {
      toast.error(err.message || "Import failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this item?")) return;
    try {
      await deletePriceListItem(id);
      qc.invalidateQueries({ queryKey: ["price-list"] });
      toast.success("Item removed");
    } catch { toast.error("Failed to remove"); }
  }

  function startEdit(item: PriceListItem) {
    setEditingId(item.id);
    setEditValues({
      unit_cost: String(item.unit_cost),
      labour_cost: String(item.labour_cost),
      description: item.description,
      manufacturer: item.manufacturer || "",
      part_number: item.part_number || "",
    });
  }

  async function saveEdit(id: string) {
    try {
      await updatePriceListItem(id, {
        description: editValues.description,
        manufacturer: editValues.manufacturer || null,
        part_number: editValues.part_number || null,
        unit_cost: parseFloat(editValues.unit_cost) || 0,
        labour_cost: parseFloat(editValues.labour_cost) || 0,
      });
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["price-list"] });
      toast.success("Item updated");
    } catch { toast.error("Failed to update"); }
  }

  async function handlePurgeAll() {
    if (!confirm(`Delete ALL ${items.filter(i => i.is_active).length} active price list items? This cannot be undone.`)) return;
    setPurging(true);
    try {
      const { error } = await supabase
        .from("price_list_items")
        .delete()
        .gte("created_at", "1970-01-01");
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["price-list"] });
      toast.success("Price list cleared");
    } catch (err: any) {
      toast.error(err.message || "Failed to purge");
    } finally {
      setPurging(false);
    }
  }

  async function handleRunCron() {
    setRunningCron(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-supplier-prices", {});
      if (error) throw new Error(error.message);
      const { imported = 0, updated = 0, errors = [] } = data || {};
      qc.invalidateQueries({ queryKey: ["price-list"] });
      if (imported > 0 || updated > 0) {
        toast.success(`Import complete — ${imported} new items, ${updated} prices updated`);
      } else {
        toast.info("No new prices found in recent supplier emails");
      }
      if (errors.length > 0) errors.forEach((e: string) => toast.error(e));
    } catch (err: any) {
      toast.error(err.message || "Import failed — check Outlook connection and API key");
    } finally {
      setRunningCron(false);
    }
  }

  const filtered = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.description.toLowerCase().includes(q) ||
      i.manufacturer?.toLowerCase().includes(q) ||
      i.part_number?.toLowerCase().includes(q) ||
      i.category?.toLowerCase().includes(q)
    );
  });

  const categoryColors: Record<string, string> = {
    Detector: "bg-blue-100 text-blue-800", Sounder: "bg-green-100 text-green-800",
    VAD: "bg-purple-100 text-purple-800", "Sounder/VAD": "bg-purple-100 text-purple-800",
    MCP: "bg-orange-100 text-orange-800", Panel: "bg-red-100 text-red-800",
    Cable: "bg-yellow-100 text-yellow-800", Other: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold text-sm">Price List</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {activeItems.length} active items — used by Email Scanner to auto-price quotes
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={downloadPriceListTemplate} className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />Template
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" />Upload
          </Button>
          <Button variant="outline" size="sm" onClick={handleRunCron} disabled={runningCron} className="gap-1.5 text-xs">
            {runningCron ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Import from Email
          </Button>
          <Button variant="outline" size="sm" onClick={handlePurgeAll} disabled={purging || items.length === 0} className="gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/5">
            {purging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Purge All
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.xlsm,text/csv" className="hidden" onChange={e => { if (e.target.files?.[0]) parseFile(e.target.files[0]); e.target.value = ""; }} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="list" className="text-xs">
            Current List <Badge variant="secondary" className="ml-1 text-[9px]">{activeItems.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="upload" className="text-xs">
            Upload {preview.length > 0 && <Badge className="ml-1 text-[9px] bg-primary">{preview.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── Current list tab ── */}
        <TabsContent value="list" className="mt-3">
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search description, manufacturer, part number…"
              className="pl-8 h-8 text-sm"
            />
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm border rounded-lg bg-muted/20">
              <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>{items.length === 0 ? "No price list loaded yet. Upload a CSV above." : "No items match your search."}</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="text-xs w-[100px]">Part No.</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs w-[80px]">Manufacturer</TableHead>
                      <TableHead className="text-xs w-[90px]">Category</TableHead>
                      <TableHead className="text-xs w-[80px] text-right">Unit £</TableHead>
                      <TableHead className="text-xs w-[80px] text-right">Labour £</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(item => (
                      <TableRow key={item.id} className={cn(!item.is_active && "opacity-40")}>
                        <TableCell className="text-[11px] font-mono">{item.part_number || "—"}</TableCell>
                        <TableCell className="text-xs">{item.description}</TableCell>
                        <TableCell className="text-xs">{item.manufacturer || "—"}</TableCell>
                        <TableCell>
                          {item.category && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", categoryColors[item.category] ?? "bg-gray-100 text-gray-700")}>
                              {item.category}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">£{Number(item.unit_cost).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">£{Number(item.labour_cost).toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="px-4 py-2 border-t text-[11px] text-muted-foreground bg-muted/20">
                Showing {filtered.length} of {items.length} items
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Upload tab ── */}
        <TabsContent value="upload" className="mt-3 space-y-3">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/20"
            )}
          >
            <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-sm font-medium">Drop CSV or Excel file here, or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">
              CSV, Excel (.xlsx/.xls) — Required: Description, Unit Cost. Optional: Part Number, Manufacturer, Category, Labour
            </p>
          </div>

          {/* Excel sheet selector */}
          {excelSheets.length > 0 && (
            <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">
                  Select sheet to import
                  <span className="ml-1.5 text-muted-foreground font-normal">({excelSheets.length} sheets found)</span>
                </p>
                {selectedSheet && (
                  <span className="text-[10px] text-green-700 dark:text-green-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {selectedSheet}
                  </span>
                )}
              </div>
              {excelSheets.length > 6 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={sheetSearch}
                    onChange={e => setSheetSearch(e.target.value)}
                    placeholder="Search sheet names…"
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              )}
              <div className="max-h-48 overflow-y-auto rounded-md border bg-background divide-y divide-border">
                {excelSheets
                  .filter(s => !sheetSearch || s.name.toLowerCase().includes(sheetSearch.toLowerCase()))
                  .map(sheet => (
                    <button
                      key={sheet.name}
                      type="button"
                      onClick={() => { setSheetSearch(""); handleSheetSelect(sheet.name); }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2 hover:bg-accent/40",
                        selectedSheet === sheet.name && "bg-primary/10 text-primary font-semibold"
                      )}
                    >
                      <span className="truncate">{sheet.name}</span>
                      <span className="text-muted-foreground flex-shrink-0">{sheet.rowCount} rows</span>
                    </button>
                  ))}
                {excelSheets.filter(s => !sheetSearch || s.name.toLowerCase().includes(sheetSearch.toLowerCase())).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No sheets match "{sheetSearch}"</p>
                )}
              </div>
            </div>
          )}

          {/* Column mapper — shown when prices are all zero */}
          {parseResult && parseResult.allPricesZero && parseResult.detectedHeaders.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">Prices not detected automatically</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-500 mt-0.5">
                    We found these columns: <span className="font-mono">{parseResult.detectedHeaders.join(", ")}</span>
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-500">Select which column contains the price:</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {[
                  { field: "unit_cost", label: "Price / Unit Cost column *" },
                  { field: "description", label: "Description column" },
                  { field: "labour_cost", label: "Labour column (optional)" },
                ].map(({ field, label }) => (
                  <div key={field} className="space-y-1">
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
                    <select
                      className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                      value={colOverrides[field] !== undefined ? String(colOverrides[field]) : (
                        parseResult.mappedColumns[field]
                          ? String(parseResult.detectedHeaders.indexOf(parseResult.mappedColumns[field]))
                          : ""
                      )}
                      onChange={e => { if (e.target.value !== "") applyColumnOverride(field, parseInt(e.target.value)); }}
                    >
                      <option value="">— select column —</option>
                      {parseResult.detectedHeaders.map((h, i) => (
                        <option key={i} value={String(i)}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {!parseResult.allPricesZero && (
                <p className="text-[11px] text-green-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Prices detected — review preview below
                </p>
              )}
            </div>
          )}

          {preview.length > 0 && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-semibold">{preview.length} items ready to import</p>
                  <label className="flex items-center gap-2 mt-1 cursor-pointer">
                    <input type="checkbox" checked={replaceAll} onChange={e => setReplaceAll(e.target.checked)} className="rounded" />
                    <span className="text-xs text-muted-foreground">Replace entire price list (deactivate existing items)</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPreview([])} disabled={uploading}>Clear</Button>
                  <Button size="sm" onClick={handleImport} disabled={uploading}>
                    {uploading ? "Importing…" : `Import ${preview.length} Items`}
                  </Button>
                </div>
              </div>

              {/* Preview table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs">Manufacturer</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs text-right">Unit £</TableHead>
                        <TableHead className="text-xs text-right">Labour £</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((row, i) => (
                        <TableRow key={i} className={cn(row._error && "bg-destructive/5")}>
                          <TableCell className="text-xs text-muted-foreground">{row._rowIndex}</TableCell>
                          <TableCell className="text-xs">
                            {row.description}
                            {row._error && <span className="text-destructive text-[10px] ml-1 flex items-center gap-0.5"><AlertCircle className="w-2.5 h-2.5" />{row._error}</span>}
                          </TableCell>
                          <TableCell className="text-xs">{row.manufacturer || "—"}</TableCell>
                          <TableCell className="text-xs">{row.category || "—"}</TableCell>
                          <TableCell className="text-xs text-right font-mono">£{row.unit_cost.toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">£{row.labour_cost.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

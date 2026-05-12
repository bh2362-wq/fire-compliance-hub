import { useState, useRef, useCallback } from "react";
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
  AlertCircle, CheckCircle2, FileSpreadsheet, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  getPriceList, uploadPriceList, deletePriceListItem,
  parsePriceListCsv, downloadPriceListTemplate,
  type PriceListItem, type ParsedPriceRow,
} from "@/services/priceListService";

export function PriceListManager() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ParsedPriceRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replaceAll, setReplaceAll] = useState(false);
  const [search, setSearch] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["price-list"],
    queryFn: () => getPriceList(false), // show all including inactive
  });

  const activeItems = items.filter(i => i.is_active);

  function parseFile(file: File) {
    if (!file.name.endsWith(".csv") && !file.type.includes("csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parsePriceListCsv(e.target?.result as string);
      if (parsed.length === 0) { toast.error("No valid rows found — check column headers"); return; }
      setPreview(parsed);
      toast.success(`${parsed.length} items parsed — review below before importing`);
    };
    reader.readAsText(file);
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadPriceListTemplate} className="gap-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />Template CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" />Upload CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { if (e.target.files?.[0]) parseFile(e.target.files[0]); e.target.value = ""; }} />
        </div>
      </div>

      <Tabs defaultValue={preview.length ? "upload" : "list"}>
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
            <p className="text-sm font-medium">Drop your CSV here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">
              Required: Description, Unit Cost. Optional: Part Number, Manufacturer, Category, Labour
            </p>
          </div>

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

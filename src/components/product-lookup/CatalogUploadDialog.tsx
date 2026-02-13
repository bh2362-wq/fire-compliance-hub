import { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, FileText, Trash2, AlertTriangle, ClipboardPaste } from "lucide-react";
import { insertSupplierProducts, deleteAllSupplierProducts } from "@/services/supplierProductService";
import { toast } from "sonner";

interface CatalogUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  currentCount: number;
}

export function CatalogUploadDialog({ open, onOpenChange, onSuccess, currentCount }: CatalogUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [tab, setTab] = useState("paste");

  const parsePastedData = (text: string) => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const products: Array<{ product_code: string; description: string; trade_price: number; category?: string }> = [];

    for (const line of lines) {
      // Try tab-separated first (Excel copy), then comma-separated
      let cols = line.split("\t");
      if (cols.length >= 3) {
        // Tab-separated path
        const cleaned = cols.map(c => c.trim());
        let priceIdx = -1;
        for (let i = cleaned.length - 1; i >= 1; i--) {
          const val = cleaned[i].replace(/[£$,]/g, "");
          if (!isNaN(parseFloat(val)) && val.length > 0) { priceIdx = i; break; }
        }
        const product_code = cleaned[0];
        if (!product_code || /^(product code|code|sku)$/i.test(product_code)) continue;
        const trade_price = priceIdx >= 0 ? parseFloat(cleaned[priceIdx].replace(/[£$,]/g, "")) || 0 : 0;
        const descParts = cleaned.slice(1, priceIdx >= 0 ? priceIdx : cleaned.length);
        const description = descParts.join(" ").trim() || product_code;
        let category: string | undefined;
        if (priceIdx > 2) category = cleaned[priceIdx - 1] || undefined;
        products.push({ product_code, description, trade_price, category });
        continue;
      }

      // Try comma-separated
      cols = line.split(",");
      if (cols.length >= 3) {
        const cleaned = cols.map(c => c.trim());
        let priceIdx = -1;
        for (let i = cleaned.length - 1; i >= 1; i--) {
          const val = cleaned[i].replace(/[£$,]/g, "");
          if (!isNaN(parseFloat(val)) && val.length > 0) { priceIdx = i; break; }
        }
        const product_code = cleaned[0];
        if (!product_code || /^(product code|code|sku)$/i.test(product_code)) continue;
        const trade_price = priceIdx >= 0 ? parseFloat(cleaned[priceIdx].replace(/[£$,]/g, "")) || 0 : 0;
        const descParts = cleaned.slice(1, priceIdx >= 0 ? priceIdx : cleaned.length);
        const description = descParts.join(" ").trim() || product_code;
        let category: string | undefined;
        if (priceIdx > 2) category = cleaned[priceIdx - 1] || undefined;
        products.push({ product_code, description, trade_price, category });
        continue;
      }

      // Space-separated fallback: product_code is first token, price is last token, description is everything in between
      const tokens = line.split(/\s+/);
      if (tokens.length < 3) continue;
      const product_code = tokens[0];
      if (/^(product code|code|sku)$/i.test(product_code)) continue;
      const lastToken = tokens[tokens.length - 1].replace(/[£$,]/g, "");
      const trade_price = parseFloat(lastToken);
      if (isNaN(trade_price)) continue; // last token must be a price
      const description = tokens.slice(1, tokens.length - 1).join(" ").trim();
      if (!description) continue;
      products.push({ product_code, description, trade_price });
    }

    return products;
  };

  const handlePasteUpload = async () => {
    if (!pasteText.trim()) { toast.error("Paste your product data first"); return; }

    setUploading(true);
    setProgress("Parsing pasted data...");
    setProgressPercent(20);

    try {
      const products = parsePastedData(pasteText);

      if (products.length === 0) {
        throw new Error("No products found. Make sure each row has at least a product code and description, separated by tabs or commas.");
      }

      // Deduplicate
      const seen = new Set<string>();
      const unique = products.filter(p => {
        if (seen.has(p.product_code)) return false;
        seen.add(p.product_code);
        return true;
      });

      setProgress(`Saving ${unique.length} products to database...`);
      setProgressPercent(60);

      const { count, error } = await insertSupplierProducts(unique);
      if (error) throw error;

      setProgressPercent(100);
      toast.success(`Imported ${count} products`);
      setPasteText("");
      setProgress("");
      setProgressPercent(0);
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Import failed");
      setProgress("");
      setProgressPercent(0);
    } finally {
      setUploading(false);
    }
  };

  const handleCsvUpload = async () => {
    if (!file) { toast.error("Select a CSV file"); return; }

    setUploading(true);
    setProgress("Reading file...");
    setProgressPercent(10);

    try {
      const text = await file.text();
      setProgressPercent(30);
      setProgress("Parsing products...");

      const products = parsePastedData(text);

      if (products.length === 0) {
        throw new Error("No products found in file. Ensure columns: product code, description, price.");
      }

      const seen = new Set<string>();
      const unique = products.filter(p => {
        if (seen.has(p.product_code)) return false;
        seen.add(p.product_code);
        return true;
      });

      setProgress(`Saving ${unique.length} products...`);
      setProgressPercent(70);

      const { count, error } = await insertSupplierProducts(unique);
      if (error) throw error;

      setProgressPercent(100);
      toast.success(`Imported ${count} products from ${file.name}`);
      setFile(null);
      setProgress("");
      setProgressPercent(0);
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
      setProgress("");
      setProgressPercent(0);
    } finally {
      setUploading(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      const { error } = await deleteAllSupplierProducts();
      if (error) throw error;
      toast.success("Catalog cleared");
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to clear");
    } finally {
      setClearing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Supplier Catalog</DialogTitle>
          <DialogDescription>Add products by pasting text/spreadsheet data or uploading a CSV/text file.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {currentCount > 0 && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="text-sm">
                <span className="font-medium">{currentCount.toLocaleString()}</span> products in catalog
              </div>
              <Button variant="outline" size="sm" onClick={handleClear} disabled={clearing}>
                {clearing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
                Clear All
              </Button>
            </div>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="paste" className="flex-1 gap-1.5">
                <ClipboardPaste className="h-3.5 w-3.5" /> Paste Text / Data
              </TabsTrigger>
              <TabsTrigger value="csv" className="flex-1 gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Upload File
              </TabsTrigger>
            </TabsList>

            <TabsContent value="paste" className="space-y-3 mt-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Copy rows from Excel, Google Sheets, or any text source and paste below. Expected columns (tab or comma separated):</p>
                <p className="font-mono bg-muted px-2 py-1 rounded">Product Code | Description | Price</p>
              </div>
              <Textarea
                placeholder={"S4-34805EP\tAutomatic detector\t45.50\nHFC-WSR-03\tWall sounder red\t32.00\n..."}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={8}
                className="font-mono text-xs"
                disabled={uploading}
              />
              {pasteText.trim() && !uploading && (
                <p className="text-xs text-muted-foreground">
                  {pasteText.split("\n").filter(l => l.trim()).length} rows detected
                </p>
              )}
            </TabsContent>

            <TabsContent value="csv" className="space-y-3 mt-3">
              <div className="text-xs text-muted-foreground">
                <p>Upload a CSV, TSV, or plain text file with columns: Product Code, Description, Price (optional: Category)</p>
              </div>
              <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-3">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
                <Input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="max-w-xs mx-auto"
                  disabled={uploading}
                />
              </div>
              {file && !uploading && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="truncate flex-1">{file.name}</span>
                  <span className="text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {uploading && (
            <div className="space-y-2">
              <Progress value={progressPercent} className="h-2" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span className="flex-1">{progress}</span>
              </div>
            </div>
          )}

          {currentCount > 0 && !uploading && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>New imports will add to existing products. Use "Clear All" first to replace.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>Cancel</Button>
          {tab === "paste" ? (
            <Button onClick={handlePasteUpload} disabled={uploading || !pasteText.trim()}>
              {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> : <><ClipboardPaste className="mr-2 h-4 w-4" /> Import Products</>}
            </Button>
          ) : (
            <Button onClick={handleCsvUpload} disabled={uploading || !file}>
              {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> : <><Upload className="mr-2 h-4 w-4" /> Upload & Import</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

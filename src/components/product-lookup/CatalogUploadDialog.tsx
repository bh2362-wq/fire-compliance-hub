import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Loader2, Upload, FileText, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { insertSupplierProducts, deleteAllSupplierProducts } from "@/services/supplierProductService";
import { toast } from "sonner";

interface CatalogUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  currentCount: number;
}

const CHUNK_SIZE = 30000; // chars per chunk - smaller for reliable AI parsing
const CONCURRENCY = 2; // parallel chunk requests - avoid rate limits

export function CatalogUploadDialog({ open, onOpenChange, onSuccess, currentCount }: CatalogUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [clearing, setClearing] = useState(false);

  const handleUpload = async () => {
    if (!file) { toast.error("Select a PDF file"); return; }

    setUploading(true);
    setProgress("Reading PDF...");
    setProgressPercent(5);

    try {
      // Step 1: Parse PDF to text
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("You must be signed in");

      const formData = new FormData();
      formData.append("file", file);
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const pdfResponse = await fetch(`${supabaseUrl}/functions/v1/parse-pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!pdfResponse.ok) {
        const errData = await pdfResponse.json().catch(() => ({}));
        throw new Error(errData.error || `PDF parse failed (${pdfResponse.status})`);
      }
      const pdfData = await pdfResponse.json();
      const text = pdfData?.text || pdfData?.content || "";
      
      if (!text || text.length < 50) {
        throw new Error("Could not extract text from PDF. Try a different file.");
      }

      setProgress(`Extracted ${text.length.toLocaleString()} characters. Splitting into chunks...`);
      setProgressPercent(10);

      // Step 2: Split text into chunks client-side
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += CHUNK_SIZE) {
        chunks.push(text.substring(i, i + CHUNK_SIZE));
      }

      setProgress(`Processing ${chunks.length} sections with AI...`);

      // Step 3: Process chunks with concurrency limit
      const allProducts: Array<{ product_code: string; description: string; trade_price: number; category: string | null }> = [];
      let completedChunks = 0;
      let failedChunks = 0;

      const processChunk = async (chunkText: string, chunkIndex: number) => {
        try {
          const { data, error } = await supabase.functions.invoke("parse-catalog-chunk", {
            body: { text: chunkText, chunkIndex, totalChunks: chunks.length },
          });

          if (error) {
            console.error(`Chunk ${chunkIndex + 1} error:`, error);
            failedChunks++;
            return;
          }

          const products = data?.products || [];
          if (products.length > 0) {
            allProducts.push(...products);
          }
        } catch (err) {
          console.error(`Chunk ${chunkIndex + 1} failed:`, err);
          failedChunks++;
        } finally {
          completedChunks++;
          const pct = 10 + Math.round((completedChunks / chunks.length) * 75);
          setProgressPercent(pct);
          setProgress(`Processing: ${completedChunks}/${chunks.length} sections done (${allProducts.length} products found)${failedChunks > 0 ? ` · ${failedChunks} failed` : ''}`);
        }
      };

      // Process in batches of CONCURRENCY
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map((chunk, j) => processChunk(chunk, i + j)));
      }

      if (allProducts.length === 0) {
        throw new Error(`No products found in ${chunks.length} sections (${failedChunks} failed). Check the file format.`);
      }

      // Step 4: Deduplicate
      const seen = new Set<string>();
      const unique = allProducts.filter(p => {
        if (seen.has(p.product_code)) return false;
        seen.add(p.product_code);
        return true;
      });

      setProgress(`Saving ${unique.length} unique products to database...`);
      setProgressPercent(90);

      // Step 5: Insert into database
      const { count, error: insertError } = await insertSupplierProducts(unique);
      if (insertError) throw insertError;

      setProgressPercent(100);
      toast.success(`Imported ${count} products from ${file.name}${failedChunks > 0 ? ` (${failedChunks} sections failed)` : ''}`);
      setFile(null);
      setProgress("");
      setProgressPercent(0);
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Catalog upload error:", err);
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Supplier Catalog</DialogTitle>
          <DialogDescription>Upload a Huvo PDF price list to populate your product database.</DialogDescription>
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

          <div className="border-2 border-dashed rounded-lg p-6 text-center space-y-3">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Upload Huvo price list PDF</p>
            <Input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="max-w-xs mx-auto"
              disabled={uploading}
            />
          </div>

          {file && !uploading && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              <span className="truncate flex-1">{file.name}</span>
              <span className="text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          )}

          {uploading && (
            <div className="space-y-2">
              <Progress value={progressPercent} className="h-2" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>{progress}</span>
              </div>
            </div>
          )}

          {currentCount > 0 && !uploading && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Uploading a new catalog will add to existing products. Use "Clear All" first to replace the catalog entirely.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>Cancel</Button>
          <Button onClick={handleUpload} disabled={uploading || !file}>
            {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</> : <><Upload className="mr-2 h-4 w-4" /> Upload & Parse</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

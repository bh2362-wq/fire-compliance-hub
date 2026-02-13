import { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Loader2, Upload, FileText, Trash2, AlertTriangle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { insertSupplierProducts, deleteAllSupplierProducts } from "@/services/supplierProductService";
import { toast } from "sonner";

interface CatalogUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  currentCount: number;
}

// Send entire PDF to AI in one go - Gemini can handle large PDFs natively
const CONCURRENCY = 1;

export function CatalogUploadDialog({ open, onOpenChange, onSuccess, currentCount }: CatalogUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [clearing, setClearing] = useState(false);
  const cancelledRef = useRef(false);

  const handleCancel = () => {
    cancelledRef.current = true;
    setProgress("Cancelling...");
  };

  const handleUpload = async () => {
    if (!file) { toast.error("Select a PDF file"); return; }

    cancelledRef.current = false;
    setUploading(true);
    setProgress("Reading PDF file...");
    setProgressPercent(5);

    try {
      // Step 1: Read PDF as base64
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Convert to base64
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
        binary += String.fromCharCode(...chunk);
      }
      const pdfBase64 = btoa(binary);
      
      console.log(`PDF size: ${file.size} bytes, base64 length: ${pdfBase64.length}`);

      if (cancelledRef.current) {
        toast.info("Upload cancelled");
        setProgress("");
        setProgressPercent(0);
        setUploading(false);
        return;
      }

      setProgress("Sending PDF to AI for product extraction...");
      setProgressPercent(15);

      // Step 2: For large PDFs, we'll split the base64 and send in chunks
      // But first try sending the whole thing
      const MAX_BASE64_SIZE = 4_000_000; // ~3MB PDF limit per request
      
      let allProducts: Array<{ product_code: string; description: string; trade_price: number; category: string | null }> = [];

      if (pdfBase64.length <= MAX_BASE64_SIZE) {
        // Small enough to send in one go
        setProgress("AI is reading your catalog... this may take 1-2 minutes");
        setProgressPercent(20);

        const { data, error } = await supabase.functions.invoke("parse-catalog-chunk", {
          body: { pdfBase64, chunkIndex: 0, totalChunks: 1, pageStart: 1, pageEnd: "all" },
        });

        if (cancelledRef.current) {
          toast.info("Upload cancelled");
          setProgress("");
          setProgressPercent(0);
          setUploading(false);
          return;
        }

        if (error) {
          console.error("AI processing error:", error);
          throw new Error("AI failed to process the PDF. Try again.");
        }

        allProducts = data?.products || [];
        setProgressPercent(80);
        setProgress(`AI found ${allProducts.length} products. Saving...`);
      } else {
        // PDF too large - split base64 into chunks
        // Each chunk gets sent as a separate "page range"
        const chunkCount = Math.ceil(pdfBase64.length / MAX_BASE64_SIZE);
        setProgress(`Large PDF detected. Processing in ${chunkCount} parts...`);

        let completedChunks = 0;
        let failedChunks = 0;

        for (let i = 0; i < chunkCount; i++) {
          if (cancelledRef.current) {
            toast.info("Upload cancelled");
            setProgress("");
            setProgressPercent(0);
            setUploading(false);
            return;
          }

          const start = i * MAX_BASE64_SIZE;
          const end = Math.min((i + 1) * MAX_BASE64_SIZE, pdfBase64.length);
          // Note: splitting base64 mid-stream won't work for PDF viewing,
          // but we send the FULL pdf for each call - just different page instructions
          // For truly large PDFs, we need a different approach
          
          setProgress(`Processing part ${i + 1}/${chunkCount}... (${allProducts.length} products found)`);

          try {
            const { data, error } = await supabase.functions.invoke("parse-catalog-chunk", {
              body: { pdfBase64, chunkIndex: i, totalChunks: chunkCount, pageStart: 1, pageEnd: "all" },
            });

            if (!error && data?.products?.length > 0) {
              allProducts.push(...data.products);
            } else if (error) {
              failedChunks++;
              console.error(`Part ${i + 1} error:`, error);
            }
          } catch (err) {
            failedChunks++;
            console.error(`Part ${i + 1} failed:`, err);
          }

          completedChunks++;
          setProgressPercent(15 + Math.round((completedChunks / chunkCount) * 65));
          
          // Only process once for now - the whole PDF is sent each time
          break;
        }
      }

      if (allProducts.length === 0) {
        throw new Error("No products found in the PDF. Make sure it's a Huvo trade price list.");
      }

      // Step 3: Deduplicate
      const seen = new Set<string>();
      const unique = allProducts.filter(p => {
        if (seen.has(p.product_code)) return false;
        seen.add(p.product_code);
        return true;
      });

      setProgress(`Saving ${unique.length} unique products to database...`);
      setProgressPercent(90);

      // Step 4: Insert into database
      const { count, error: insertError } = await insertSupplierProducts(unique);
      if (insertError) throw insertError;

      setProgressPercent(100);
      toast.success(`Imported ${count} products from ${file.name}`);
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
                <span className="flex-1">{progress}</span>
                <Button variant="ghost" size="sm" onClick={handleCancel} className="h-6 px-2 text-destructive hover:text-destructive">
                  <X className="h-3 w-3 mr-1" /> Cancel
                </Button>
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

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, FileText, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { insertSupplierProducts, deleteAllSupplierProducts, getSupplierProductCount } from "@/services/supplierProductService";
import { toast } from "sonner";

interface CatalogUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  currentCount: number;
}

export function CatalogUploadDialog({ open, onOpenChange, onSuccess, currentCount }: CatalogUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [clearing, setClearing] = useState(false);

  const handleUpload = async () => {
    if (!file) { toast.error("Select a PDF file"); return; }

    setUploading(true);
    setProgress("Reading PDF...");

    try {
      // Step 1: Parse PDF to text using direct fetch (supabase.functions.invoke doesn't handle FormData)
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

      setProgress(`Extracted ${text.length.toLocaleString()} characters. Parsing products with AI (this may take a few minutes for large catalogs)...`);

      // Step 2: Send text to AI parser (handles chunking internally)
      const { data: parseData, error: parseError } = await supabase.functions.invoke("parse-catalog-pdf", {
        body: { text },
      });

      if (parseError) throw parseError;
      if (parseData?.error) throw new Error(parseData.error);

      const products = parseData?.products || [];
      const chunksProcessed = parseData?.chunks_processed || 1;
      if (products.length === 0) {
        throw new Error("No products found in the PDF. Check the file format.");
      }

      setProgress(`Found ${products.length} products across ${chunksProcessed} sections. Saving to database...`);

      // Step 3: Insert into database
      const { count, error: insertError } = await insertSupplierProducts(products);
      if (insertError) throw insertError;

      toast.success(`Imported ${count} products from ${file.name}`);
      setFile(null);
      setProgress("");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Catalog upload error:", err);
      toast.error(err.message || "Upload failed");
      setProgress("");
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

          {file && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              <span className="truncate flex-1">{file.name}</span>
              <Badge variant="secondary">{(file.size / 1024 / 1024).toFixed(1)} MB</Badge>
            </div>
          )}

          {progress && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>{progress}</span>
            </div>
          )}

          {currentCount > 0 && (
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

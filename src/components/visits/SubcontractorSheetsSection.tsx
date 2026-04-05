import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Upload, FileText, Image, Trash2, Loader2, Download, FileCheck } from "lucide-react";

interface SubcontractorSheet {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number | null;
  storage_path: string;
  description: string | null;
  created_at: string;
}

interface SubcontractorSheetsSectionProps {
  visitId: string;
  onSheetsChange?: (count: number) => void;
}

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const SubcontractorSheetsSection = ({ visitId, onSheetsChange }: SubcontractorSheetsSectionProps) => {
  const [sheets, setSheets] = useState<SubcontractorSheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const fetchSheets = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("visit_subcontractor_sheets")
        .select("*")
        .eq("visit_id", visitId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const items = (data || []) as SubcontractorSheet[];
      setSheets(items);
      onSheetsChange?.(items.length);
    } catch (err) {
      console.error("Error fetching subcontractor sheets:", err);
    } finally {
      setLoading(false);
    }
  }, [visitId, onSheetsChange]);

  useEffect(() => {
    fetchSheets();
  }, [fetchSheets]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const storagePath = `${visitId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        // Upload to storage
        const { error: storageError } = await supabase.storage
          .from("visit-attachments")
          .upload(storagePath, file, { contentType: file.type });

        if (storageError) throw storageError;

        // Create DB record
        const { error: dbError } = await supabase
          .from("visit_subcontractor_sheets")
          .insert({
            visit_id: visitId,
            file_name: file.name,
            file_type: file.type || "application/octet-stream",
            file_size: file.size,
            storage_path: storagePath,
            uploaded_by: user?.id || null,
          });

        if (dbError) throw dbError;
      }

      toast({ title: "Uploaded", description: `${files.length} subcontractor sheet(s) uploaded` });
      fetchSheets();
    } catch (err) {
      console.error("Error uploading:", err);
      toast({ title: "Upload failed", description: "Could not upload file(s)", variant: "destructive" });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleDelete = async (sheet: SubcontractorSheet) => {
    try {
      await supabase.storage.from("visit-attachments").remove([sheet.storage_path]);
      const { error } = await supabase.from("visit_subcontractor_sheets").delete().eq("id", sheet.id);
      if (error) throw error;
      setSheets((prev) => prev.filter((s) => s.id !== sheet.id));
      onSheetsChange?.(sheets.length - 1);
      toast({ title: "Deleted", description: "Subcontractor sheet removed" });
    } catch (err) {
      console.error("Error deleting:", err);
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const handleDownload = async (sheet: SubcontractorSheet) => {
    const { data } = supabase.storage.from("visit-attachments").getPublicUrl(sheet.storage_path);
    if (data?.publicUrl) {
      window.open(data.publicUrl, "_blank");
    }
  };

  const isImage = (type: string) => type.startsWith("image/");

  return (
    <div className="space-y-3 pt-2 border-t">
      <div className="flex items-center justify-between">
        <Label className="text-base flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-primary" />
          Subcontractor Sheets
          {sheets.length > 0 && (
            <Badge variant="secondary" className="text-xs">{sheets.length}</Badge>
          )}
        </Label>
        <label className="cursor-pointer">
          <input
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.heic,image/*,application/pdf"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
          <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
            <span>
              {uploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Upload Sheets
            </span>
          </Button>
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        Upload subcontractor job sheets, photos, or certificates. These will be included in the client report.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading sheets...
        </div>
      ) : sheets.length === 0 ? (
        <div className="text-sm text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
          No subcontractor sheets uploaded
        </div>
      ) : (
        <div className="space-y-2">
          {sheets.map((sheet) => (
            <div key={sheet.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 border">
              {isImage(sheet.file_type) ? (
                <Image className="w-4 h-4 text-primary flex-shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-destructive flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{sheet.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(sheet.file_size)} • {format(new Date(sheet.created_at), "MMM d, yyyy HH:mm")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(sheet)}>
                  <Download className="w-3.5 h-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive/60 hover:text-destructive" onClick={() => handleDelete(sheet)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SubcontractorSheetsSection;

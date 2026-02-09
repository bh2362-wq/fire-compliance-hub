import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface SharePointUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderPath: string;
  fileName: string;
  generatePdfBase64: () => Promise<string | null>;
}

export function SharePointUploadDialog({
  open,
  onOpenChange,
  folderPath: defaultFolder,
  fileName,
  generatePdfBase64,
}: SharePointUploadDialogProps) {
  const [folder, setFolder] = useState(defaultFolder);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!folder.trim()) {
      toast.error("Please enter a folder path");
      return;
    }

    setUploading(true);
    try {
      const fileBase64 = await generatePdfBase64();
      if (!fileBase64) {
        throw new Error("Failed to generate PDF");
      }

      const { data, error } = await supabase.functions.invoke("upload-to-sharepoint", {
        body: {
          folderPath: folder.trim(),
          fileName,
          fileBase64,
          contentType: "application/pdf",
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast.success(`Uploaded to SharePoint: ${data.fileName}`);
      onOpenChange(false);
    } catch (err: any) {
      console.error("SharePoint upload failed:", err);
      toast.error(err.message || "Failed to upload to SharePoint");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload to SharePoint
          </DialogTitle>
          <DialogDescription>
            Upload this report to Microsoft OneDrive/SharePoint. The folder will be created if it
            doesn't exist.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="folder-path">
              <FolderOpen className="w-3.5 h-3.5 inline mr-1" />
              Folder Path
            </Label>
            <Input
              id="folder-path"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="e.g., /sites/towerbm"
            />
            <p className="text-xs text-muted-foreground">
              Path in OneDrive where the file will be saved
            </p>
          </div>

          <div className="space-y-2">
            <Label>File Name</Label>
            <p className="text-sm text-foreground bg-muted px-3 py-2 rounded-md">{fileName}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

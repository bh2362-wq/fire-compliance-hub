import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Image, Check, FolderOpen, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface SharePointFile {
  name: string;
  id: string;
  size: number;
  mimeType: string;
  webUrl: string;
  downloadUrl: string;
  lastModified: string;
  thumbnailUrl: string;
}

interface SharePointPhotoBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderPath: string;
  onImport: (photos: { url: string; caption: string; fileName: string }[]) => void;
}

export function SharePointPhotoBrowser({
  open,
  onOpenChange,
  folderPath,
  onImport,
}: SharePointPhotoBrowserProps) {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<SharePointFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(
        `${baseUrl}/functions/v1/sharepoint-list-files?path=${encodeURIComponent(folderPath)}&images=true`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!res.ok) throw new Error("Failed to load photos");
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err) {
      console.error("Failed to list SharePoint photos:", err);
      toast.error("Failed to load SharePoint photos");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && folderPath) {
      setSelected(new Set());
      fetchFiles();
    }
  }, [open, folderPath]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map((f) => f.id)));
    }
  };

  const handleImport = async () => {
    const selectedFiles = files.filter((f) => selected.has(f.id));
    if (selectedFiles.length === 0) return;

    setImporting(true);
    try {
      const photos = selectedFiles.map((f) => ({
        url: f.downloadUrl || f.thumbnailUrl || f.webUrl,
        caption: f.name.replace(/\.[^/.]+$/, ""),
        fileName: f.name,
      }));

      onImport(photos);
      toast.success(`${photos.length} photo(s) imported from SharePoint`);
      onOpenChange(false);
    } catch (err) {
      console.error("Import error:", err);
      toast.error("Failed to import photos");
    } finally {
      setImporting(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            SharePoint Photos
          </DialogTitle>
          <DialogDescription className="text-xs truncate">
            {folderPath}/Photos
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 py-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
              disabled={files.length === 0}
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              {selected.size === files.length && files.length > 0 ? "Deselect All" : "Select All"}
            </Button>
            {selected.size > 0 && (
              <Badge variant="secondary">{selected.size} selected</Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={fetchFiles} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Image className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No photos found</p>
              <p className="text-xs mt-1">Upload photos to the SharePoint Photos folder first</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-1">
              {files.map((file) => {
                const isSelected = selected.has(file.id);
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => toggleSelect(file.id)}
                    className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="aspect-square bg-muted">
                      <img
                        src={file.thumbnailUrl || file.downloadUrl}
                        alt={file.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/placeholder.svg";
                        }}
                      />
                    </div>
                    <div className="absolute top-2 left-2">
                      <Checkbox
                        checked={isSelected}
                        className="bg-background/80 backdrop-blur-sm"
                      />
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <p className="text-[10px] text-white truncate">{file.name}</p>
                      <p className="text-[9px] text-white/70">{formatSize(file.size)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={selected.size === 0 || importing}
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Image className="w-4 h-4 mr-2" />
                Import {selected.size > 0 ? `(${selected.size})` : ""}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

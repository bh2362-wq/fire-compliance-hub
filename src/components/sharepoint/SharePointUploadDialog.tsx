import { useState, useEffect } from "react";
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
import { Loader2, Upload, FolderOpen, ChevronRight, ChevronDown, Folder, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SharePointUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderPath: string;
  fileName: string;
  generatePdfBase64: () => Promise<string | null>;
}

interface FolderItem {
  name: string;
  id: string;
  path: string;
  childCount: number;
}

interface FolderNode {
  item: FolderItem | null; // null for root
  children: FolderItem[];
  loaded: boolean;
  expanded: boolean;
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
  const [folderTree, setFolderTree] = useState<Record<string, FolderNode>>({});
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);

  // Load root folders when dialog opens
  useEffect(() => {
    if (open) {
      loadFolders("");
    }
  }, [open]);

  const loadFolders = async (path: string) => {
    if (folderTree[path]?.loaded) {
      // Toggle expand/collapse
      setFolderTree((prev) => ({
        ...prev,
        [path]: { ...prev[path], expanded: !prev[path].expanded },
      }));
      return;
    }

    setLoadingPath(path);
    setTreeError(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(
        `${baseUrl}/functions/v1/sharepoint-list-folders?path=${encodeURIComponent(path)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load folders");
      }

      const result = await res.json();
      const folders: FolderItem[] = result.folders || [];

      setFolderTree((prev) => ({
        ...prev,
        [path]: {
          item: path ? prev[path]?.item || null : null,
          children: folders,
          loaded: true,
          expanded: true,
        },
      }));
    } catch (err: any) {
      console.error("Failed to load folders:", err);
      setTreeError(err.message || "Failed to load folders");
    } finally {
      setLoadingPath(null);
    }
  };

  const handleSelectFolder = (path: string) => {
    setFolder(path);
  };

  const handleUpload = async () => {
    if (!folder.trim()) {
      toast.error("Please enter or select a folder path");
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

  const renderFolderLevel = (parentPath: string, depth: number = 0) => {
    const node = folderTree[parentPath];
    if (!node || !node.expanded) return null;

    return (
      <div className="space-y-0.5">
        {node.children.length === 0 && node.loaded && (
          <p className="text-xs text-muted-foreground pl-6 py-1 italic">No subfolders</p>
        )}
        {node.children.map((child) => {
          const isSelected = folder === child.path;
          const childNode = folderTree[child.path];
          const isExpanded = childNode?.expanded;
          const isLoading = loadingPath === child.path;

          return (
            <div key={child.id}>
              <div
                className={cn(
                  "flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/80 transition-colors text-sm",
                  isSelected && "bg-primary/10 text-primary font-medium"
                )}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
              >
                <button
                  type="button"
                  className="p-0.5 hover:bg-muted rounded shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    loadFolders(child.path);
                  }}
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  ) : isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
                <div
                  className="flex items-center gap-2 flex-1 min-w-0"
                  onClick={() => handleSelectFolder(child.path)}
                >
                  <Folder className={cn("w-4 h-4 shrink-0", isSelected ? "text-primary" : "text-primary/60")} />
                  <span className="truncate">{child.name}</span>
                </div>
              </div>
              {renderFolderLevel(child.path, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload to SharePoint
          </DialogTitle>
          <DialogDescription>
            Browse and select a folder, or type a path manually. The folder will be created if it doesn't exist.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Folder Tree Browser */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5" />
              Browse Folders
            </Label>
            <div className="border rounded-lg bg-muted/30">
              <ScrollArea className="h-[220px]">
                <div className="p-2">
                  {/* Root level */}
                  <div
                    className={cn(
                      "flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/80 transition-colors text-sm",
                      folder === "" && "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    <button
                      type="button"
                      className="p-0.5 hover:bg-muted rounded shrink-0"
                      onClick={() => loadFolders("")}
                    >
                      {loadingPath === "" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                      ) : folderTree[""]?.expanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </button>
                    <div
                      className="flex items-center gap-2 flex-1"
                      onClick={() => handleSelectFolder("")}
                    >
                      <Folder className="w-4 h-4 text-primary/60 shrink-0" />
                      <span>OneDrive (Root)</span>
                    </div>
                  </div>
                  {renderFolderLevel("", 1)}

                  {treeError && (
                    <p className="text-xs text-destructive px-2 py-2">{treeError}</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Manual path input */}
          <div className="space-y-2">
            <Label htmlFor="folder-path">
              <FolderPlus className="w-3.5 h-3.5 inline mr-1" />
              Folder Path
            </Label>
            <Input
              id="folder-path"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="e.g., sites/towerbm or type a new path"
            />
            <p className="text-xs text-muted-foreground">
              Select from the tree above or type a custom path (will be created if it doesn't exist)
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

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Cloud, Loader2, FolderPlus, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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

interface CreateSharePointFolderButtonProps {
  entityType: "customer" | "site";
  entityId: string;
  entityName: string;
  customerName?: string; // for sites, to build nested path
  existingFolder?: string | null;
  onFolderCreated?: (folderPath: string) => void;
  size?: "sm" | "default";
}

export function CreateSharePointFolderButton({
  entityType,
  entityId,
  entityName,
  customerName,
  existingFolder,
  onFolderCreated,
  size = "sm",
}: CreateSharePointFolderButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [folderPath, setFolderPath] = useState("");
  const [webUrl, setWebUrl] = useState<string | null>(null);

  const getDefaultPath = () => {
    const sanitize = (name: string) =>
      name.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();

    if (entityType === "customer") {
      return `Customers/${sanitize(entityName)}`;
    } else {
      // Site: nested under customer
      if (customerName) {
        return `Customers/${sanitize(customerName)}/${sanitize(entityName)}`;
      }
      return `Sites/${sanitize(entityName)}`;
    }
  };

  const handleOpen = () => {
    setFolderPath(existingFolder || getDefaultPath());
    setWebUrl(null);
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!folderPath.trim()) {
      toast.error("Please enter a folder path");
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("sharepoint-create-folder", {
        body: {
          folderPath: folderPath.trim(),
          entityType,
          entityId,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setWebUrl(data.webUrl || null);
      toast.success(`SharePoint folder created: ${data.folderPath}`);
      onFolderCreated?.(data.folderPath);
    } catch (err: any) {
      console.error("SharePoint folder creation failed:", err);
      toast.error(err.message || "Failed to create SharePoint folder");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Button variant="outline" size={size} onClick={handleOpen}>
        {existingFolder ? (
          <>
            <Cloud className="w-4 h-4 mr-2" />
            SharePoint Folder
          </>
        ) : (
          <>
            <FolderPlus className="w-4 h-4 mr-2" />
            Create SharePoint Folder
          </>
        )}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="w-5 h-5" />
              {existingFolder ? "SharePoint Folder" : "Create SharePoint Folder"}
            </DialogTitle>
            <DialogDescription>
              {existingFolder
                ? "View or update the SharePoint folder for this " + entityType
                : `Create a folder in SharePoint for ${entityName}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sp-folder-path">Folder Path</Label>
              <Input
                id="sp-folder-path"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="e.g., Customers/Acme Ltd"
              />
              <p className="text-xs text-muted-foreground">
                Path in OneDrive — will be created if it doesn't exist
              </p>
            </div>

            {webUrl && (
              <div className="bg-muted/50 rounded-lg p-3">
                <a
                  href={webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in SharePoint
                </a>
              </div>
            )}

            {existingFolder && !webUrl && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                Current folder: <span className="font-medium text-foreground">{existingFolder}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {webUrl ? "Close" : "Cancel"}
            </Button>
            {!webUrl && (
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FolderPlus className="w-4 h-4 mr-2" />
                    {existingFolder ? "Update Folder" : "Create Folder"}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";
import { deleteSite } from "@/services/siteService";
import { useToast } from "@/hooks/use-toast";

interface DeleteSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteName: string;
  siteId: string;
  onSuccess: () => void;
}

const DeleteSiteDialog = ({ open, onOpenChange, siteName, siteId, onSuccess }: DeleteSiteDialogProps) => {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const canDelete = confirmText.toLowerCase() === "delete";

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);

    const { error } = await deleteSite(siteId);
    if (error) {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Site deleted",
        description: `${siteName} has been permanently removed.`,
      });
      onSuccess();
    }
    setDeleting(false);
    setConfirmText("");
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) setConfirmText(""); onOpenChange(v); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <AlertDialogTitle>Delete Site</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left">
            You are about to permanently delete <span className="font-semibold text-foreground">{siteName}</span>. 
            This will also remove all associated devices, visits, reports, and uploads. This action <span className="font-semibold text-destructive">cannot be undone</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="confirm-delete" className="text-sm text-muted-foreground">
            Type <span className="font-mono font-semibold text-foreground">delete</span> to confirm
          </Label>
          <Input
            id="confirm-delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type delete here"
            autoComplete="off"
          />
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => { setConfirmText(""); onOpenChange(false); }} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canDelete || deleting}
          >
            {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Delete Site
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteSiteDialog;

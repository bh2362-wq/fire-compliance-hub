import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, FileText, Calendar, ClipboardList, Cpu, Upload, HardHat, FileSignature, Server, Shield } from "lucide-react";
import { deleteSite } from "@/services/siteService";
import { fetchSiteDependencies, hasDependencies, forceDeleteSite, SiteDependencies } from "@/services/siteDeletionService";
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
  const [loading, setLoading] = useState(false);
  const [deps, setDeps] = useState<SiteDependencies | null>(null);
  const [forceMode, setForceMode] = useState(false);
  const { toast } = useToast();

  const canDelete = confirmText.toLowerCase() === "delete";

  useEffect(() => {
    if (open && siteId) {
      setLoading(true);
      setForceMode(false);
      setDeps(null);
      fetchSiteDependencies(siteId).then((d) => {
        setDeps(d);
        setLoading(false);
      });
    }
  }, [open, siteId]);

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);

    const hasBlocking = deps && hasDependencies(deps);

    if (hasBlocking && forceMode) {
      const { error } = await forceDeleteSite(siteId);
      if (error) {
        toast({ title: "Force delete failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Site deleted", description: `${siteName} and all linked records have been permanently removed.` });
        onSuccess();
      }
    } else {
      const { error } = await deleteSite(siteId);
      if (error) {
        toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Site deleted", description: `${siteName} has been permanently removed.` });
        onSuccess();
      }
    }

    setDeleting(false);
    setConfirmText("");
    onOpenChange(false);
  };

  const hasBlocking = deps && hasDependencies(deps);

  const depItems = deps ? [
    { label: "Visits", count: deps.visits.length, icon: Calendar, items: deps.visits.map(v => `${v.visit_type} — ${new Date(v.visit_date).toLocaleDateString()} (${v.status || "scheduled"})`) },
    { label: "Service Reports", count: deps.serviceReports.length, icon: ClipboardList, items: deps.serviceReports.map(r => r.report_number || r.id.slice(0, 8)) },
    { label: "Appointments", count: deps.appointments.length, icon: Calendar, items: deps.appointments.map(a => `${a.title} — ${new Date(a.appointment_date).toLocaleDateString()}`) },
    { label: "Devices", count: deps.devices, icon: Cpu },
    { label: "File Uploads", count: deps.fileUploads, icon: Upload },
    { label: "RAMS Documents", count: deps.ramsDocuments, icon: HardHat },
    { label: "Quotations", count: deps.quotations, icon: FileSignature },
    { label: "Service Contracts", count: deps.serviceContracts, icon: FileText },
    { label: "Site Assets", count: deps.siteAssets, icon: Server },
    { label: "Email Logs", count: deps.emailLogs, icon: Shield },
  ].filter(d => d.count > 0) : [];

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) { setConfirmText(""); setForceMode(false); } onOpenChange(v); }}>
      <AlertDialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <AlertDialogTitle>Delete Site</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left">
            You are about to permanently delete <span className="font-semibold text-foreground">{siteName}</span>.
            This action <span className="font-semibold text-destructive">cannot be undone</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking for linked records…
          </div>
        )}

        {!loading && hasBlocking && (
          <div className="space-y-3">
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-3">
              <p className="text-sm font-medium text-warning mb-1">⚠️ This site has linked records</p>
              <p className="text-xs text-muted-foreground">
                A standard delete will fail. You can force-delete to remove all linked records first.
              </p>
            </div>

            <div className="space-y-1.5">
              {depItems.map((dep) => (
                <div key={dep.label} className="bg-muted/50 rounded-lg p-2.5">
                  <div className="flex items-center gap-2">
                    <dep.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{dep.label}</span>
                    <Badge variant="secondary" className="text-xs ml-auto">{dep.count}</Badge>
                  </div>
                  {dep.items && dep.items.length > 0 && (
                    <div className="mt-1.5 pl-5 space-y-0.5">
                      {dep.items.slice(0, 5).map((item, i) => (
                        <p key={i} className="text-xs text-muted-foreground truncate">{item}</p>
                      ))}
                      {dep.items.length > 5 && (
                        <p className="text-xs text-muted-foreground italic">+ {dep.items.length - 5} more</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {!forceMode && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => setForceMode(true)}
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Force Delete — Remove All Linked Records
              </Button>
            )}
          </div>
        )}

        {!loading && !hasBlocking && deps && (
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-sm text-muted-foreground">✓ No linked records found. This site can be safely deleted.</p>
          </div>
        )}

        {(!hasBlocking || forceMode) && !loading && (
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
        )}

        <AlertDialogFooter>
          <Button variant="outline" onClick={() => { setConfirmText(""); setForceMode(false); onOpenChange(false); }} disabled={deleting}>
            Cancel
          </Button>
          {(!hasBlocking || forceMode) && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!canDelete || deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {forceMode ? "Force Delete Site" : "Delete Site"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteSiteDialog;

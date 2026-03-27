import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HardHat, FileDown, Eye, Trash2, Plus, Mail } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  RamsDocument,
  getRamsDocumentsBySite,
  deleteRamsDocument,
} from "@/services/ramsService";
import { generateRamsPDF } from "@/lib/ramsPdfGenerator";
import { RamsDocumentDialog } from "@/components/rams/RamsDocumentDialog";
import { RamsPreviewDialog } from "@/components/rams/RamsPreviewDialog";
import { EmailRamsDialog } from "@/components/rams/EmailRamsDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SiteRamsDocumentsProps {
  siteId: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-warning/10 text-warning border-warning/20",
  approved: "bg-success/10 text-success border-success/20",
  superseded: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

export function SiteRamsDocuments({ siteId }: SiteRamsDocumentsProps) {
  const [editDoc, setEditDoc] = useState<RamsDocument | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<RamsDocument | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [emailDoc, setEmailDoc] = useState<RamsDocument | null>(null);

  const { data: documents = [], refetch } = useQuery({
    queryKey: ["rams-documents-site", siteId],
    queryFn: () => getRamsDocumentsBySite(siteId),
  });

  const handleDownload = async (doc: RamsDocument) => {
    setDownloading(doc.id);
    try {
      await generateRamsPDF(doc);
      toast.success("RAMS PDF downloaded");
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteRamsDocument(deleteId);
      toast.success("RAMS document deleted");
      refetch();
    } catch {
      toast.error("Failed to delete");
    }
    setDeleteId(null);
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <HardHat className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No RAMS documents for this site yet.</p>
        <p className="text-xs mt-1">Use the "New RAMS" button above to create one.</p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-border">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between py-3 px-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{doc.rams_number}</span>
                <Badge variant="outline" className={statusColors[doc.status] || ""}>
                  {doc.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="text-sm font-medium text-foreground truncate mt-0.5">{doc.title}</p>
              <p className="text-xs text-muted-foreground">
                v{doc.version} | Created {format(new Date(doc.created_at), "dd/MM/yyyy")}
                {doc.review_date && ` | Review ${format(new Date(doc.review_date), "dd/MM/yyyy")}`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setPreviewDoc(doc)} title="Preview">
                <Eye className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setEmailDoc(doc)} title="Email to Client">
                <Mail className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDownload(doc)}
                disabled={downloading === doc.id}
                title="Download PDF"
              >
                <FileDown className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setEditDoc(doc); setEditOpen(true); }}
                title="Edit"
              >
                <HardHat className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteId(doc.id)}
                title="Delete"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <RamsDocumentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        document={editDoc}
        preselectedSiteId={siteId}
        onSuccess={() => refetch()}
      />

      {previewDoc && (
        <RamsPreviewDialog
          open={!!previewDoc}
          onOpenChange={(open) => !open && setPreviewDoc(null)}
          document={previewDoc}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete RAMS Document?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

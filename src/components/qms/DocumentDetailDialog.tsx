import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
} from "@/components/ui/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Hash,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { QMSDocument, fetchDocumentVersions } from "@/services/qmsService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DocumentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: QMSDocument | null;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    case "pending_approval":
      return <Badge className="bg-yellow-500"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    case "draft":
      return <Badge variant="secondary"><FileText className="h-3 w-3 mr-1" />Draft</Badge>;
    case "obsolete":
      return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Obsolete</Badge>;
    default:
      return null;
  }
};

export const DocumentDetailDialog = ({ open, onOpenChange, document }: DocumentDetailDialogProps) => {
  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: ["qms-document-versions", document?.id],
    queryFn: () => fetchDocumentVersions(document!.id),
    enabled: !!document?.id,
  });

  const handleDownload = async (fileUrl: string, fileName: string | null) => {
    try {
      const { data, error } = await supabase.storage
        .from("qms-attachments")
        .download(fileUrl);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = fileName || "document";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch {
      toast.error("Failed to download file");
    }
  };

  if (!document) return null;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {document.title}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          <span className="font-mono">{document.document_number}</span>
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <ResponsiveDialogBody className="space-y-6 pb-6">
        {/* Status & Category */}
        <div className="flex flex-wrap items-center gap-2">
          {getStatusBadge(document.status)}
          {document.category && (
            <Badge variant="outline">{document.category.name}</Badge>
          )}
        </div>

        {/* Description */}
        {document.description && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
            <p className="text-sm">{document.description}</p>
          </div>
        )}

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">Version</p>
              <p className="font-medium">{document.current_version}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">Last Updated</p>
              <p className="font-medium">{format(new Date(document.updated_at), "dd MMM yyyy")}</p>
            </div>
          </div>
          {document.review_frequency_months && (
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground">Review Cycle</p>
                <p className="font-medium">{document.review_frequency_months} months</p>
              </div>
            </div>
          )}
          {document.next_review_date && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground">Next Review</p>
                <p className={`font-medium ${new Date(document.next_review_date) < new Date() ? "text-destructive" : ""}`}>
                  {format(new Date(document.next_review_date), "dd MMM yyyy")}
                </p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Version History */}
        <div>
          <h4 className="text-sm font-medium mb-3">Version History</h4>
          {versionsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !versions || versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No versions uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">v{v.version_number}</Badge>
                      {v.file_name && (
                        <span className="text-sm truncate">{v.file_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{format(new Date(v.created_at), "dd MMM yyyy HH:mm")}</span>
                      {v.file_size && <span>{(v.file_size / 1024).toFixed(0)} KB</span>}
                    </div>
                    {v.changes_summary && (
                      <p className="text-xs text-muted-foreground mt-1">{v.changes_summary}</p>
                    )}
                  </div>
                  {v.file_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDownload(v.file_url!, v.file_name)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </ResponsiveDialogBody>
    </ResponsiveDialog>
  );
};

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
} from "@/components/ui/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Upload,
  Mail,
} from "lucide-react";
import { format } from "date-fns";
import {
  QMSDocument,
  fetchDocumentVersions,
  uploadDocumentVersion,
  approveDocument,
  unlockDocument,
  fetchLatestApproval,
} from "@/services/qmsService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { generateQMSDocumentPDF } from "@/lib/qmsDocumentPdfGenerator";
import { EmailDocumentDialog } from "./EmailDocumentDialog";
import { RecreateFromUploadDialog } from "./RecreateFromUploadDialog";
import { Lock, ShieldCheck, Unlock } from "lucide-react";

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
  const { user } = useAuth();
  const { isOwner } = useUserRole();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [changesSummary, setChangesSummary] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [recreateOpen, setRecreateOpen] = useState(false);
  const isApproved = document?.status === "approved";

  const approveMutation = useMutation({
    mutationFn: () => approveDocument(document!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qms-documents"] });
      queryClient.invalidateQueries({ queryKey: ["qms-document-approval", document?.id] });
      toast.success("Document approved and locked");
    },
    onError: (err) => {
      const obj = err as { message?: string; code?: string; details?: string };
      toast.error("Couldn't approve document", {
        description: [obj.message, obj.details, obj.code && `[${obj.code}]`]
          .filter(Boolean).join(" — ") || "Unknown error",
      });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: () => unlockDocument(document!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qms-documents"] });
      queryClient.invalidateQueries({ queryKey: ["qms-document-approval", document?.id] });
      toast.success("Document unlocked for revision");
    },
    onError: (err) => {
      const obj = err as { message?: string; code?: string; details?: string };
      toast.error("Couldn't unlock document", {
        description: [obj.message, obj.details, obj.code && `[${obj.code}]`]
          .filter(Boolean).join(" — ") || "Unknown error",
      });
    },
  });

  const { data: approval } = useQuery({
    queryKey: ["qms-document-approval", document?.id],
    queryFn: () => fetchLatestApproval(document!.id),
    enabled: !!document?.id && isApproved,
  });

  const handleGeneratePDF = async () => {
    if (!document) return;
    setGeneratingPdf(true);
    try {
      await generateQMSDocumentPDF(document);
      toast.success("Branded PDF generated and downloaded");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("Failed to generate PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: ["qms-document-versions", document?.id],
    queryFn: () => fetchDocumentVersions(document!.id),
    enabled: !!document?.id,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !document || !user) throw new Error("Missing data");
      return uploadDocumentVersion(document.id, selectedFile, user.id, changesSummary);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qms-document-versions", document?.id] });
      queryClient.invalidateQueries({ queryKey: ["qms-documents"] });
      toast.success("New version uploaded successfully");
      setSelectedFile(null);
      setChangesSummary("");
    },
    onError: (err) => {
      console.error("Upload error:", err);
      toast.error("Failed to upload new version");
    },
  });

  const handleDownload = async (fileUrl: string, fileName: string | null) => {
    try {
      const { data, error } = await supabase.storage
        .from("qms-attachments")
        .createSignedUrl(fileUrl, 300);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("No signed URL returned");

      const downloadName = fileName || fileUrl.split("/").pop() || "document";
      const separator = data.signedUrl.includes("?") ? "&" : "?";
      const forcedDownloadUrl = `${data.signedUrl}${separator}download=${encodeURIComponent(downloadName)}`;

      const popup = window.open(forcedDownloadUrl, "_blank", "noopener,noreferrer");
      if (popup) {
        toast.success("Download started");
        return;
      }

      const fallbackLink = window.document.createElement("a");
      fallbackLink.href = forcedDownloadUrl;
      fallbackLink.target = "_blank";
      fallbackLink.rel = "noopener noreferrer";
      window.document.body.appendChild(fallbackLink);
      fallbackLink.click();
      fallbackLink.remove();

      if (window.self !== window.top) {
        window.prompt("Copy this secure download link and open it in a new tab:", forcedDownloadUrl);
        toast.info("Browser blocked auto-download; link shown to copy");
        return;
      }

      toast.success("Download started");
    } catch (err) {
      console.error("Download error:", err);
      toast.error("Failed to create download link");
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

        {/* Approval — director-only. The RPC asserts the role server-side,
            but we hide the button for non-owners to keep the UI clean. */}
        {isApproved ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-emerald-900">
              <ShieldCheck className="h-4 w-4" />
              Approved &amp; locked
            </div>
            {approval && (
              <p className="text-xs text-emerald-800/80 mt-1">
                Approved by <span className="font-medium">{approval.approver_name || "Director"}</span>
                {approval.approved_at && (
                  <> on {format(new Date(approval.approved_at), "dd MMM yyyy 'at' HH:mm")}</>
                )}
              </p>
            )}
            {isOwner && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 h-7 text-xs text-emerald-900 hover:bg-emerald-100"
                onClick={() => unlockMutation.mutate()}
                disabled={unlockMutation.isPending}
              >
                <Unlock className="h-3.5 w-3.5 mr-1.5" />
                {unlockMutation.isPending ? "Unlocking…" : "Unlock for revision"}
              </Button>
            )}
          </div>
        ) : isOwner ? (
          <Button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="w-full"
          >
            <Lock className="h-4 w-4 mr-2" />
            {approveMutation.isPending ? "Approving…" : "Approve & lock as Director"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only the Director can approve this document.
          </p>
        )}

        {/* Generate / Email Branded PDF */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={handleGeneratePDF}
            disabled={generatingPdf}
            variant="outline"
          >
            <Download className="h-4 w-4 mr-2" />
            {generatingPdf ? "Generating..." : "Download PDF"}
          </Button>
          <Button onClick={() => setEmailDialogOpen(true)} variant="outline">
            <Mail className="h-4 w-4 mr-2" />
            Email Document
          </Button>
        </div>

        {/* Recreate as template — converts a doc whose body lives in
            an uploaded file (legacy H&S policy etc.) into a real
            template document so it picks up the BHO header +
            AUTHORISATION block + director signature. */}
        <div className="pt-1">
          <Button
            onClick={() => setRecreateOpen(true)}
            variant="ghost"
            className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Recreate as template document (apply standard layout + director signature)
          </Button>
        </div>

        <EmailDocumentDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          document={document}
        />

        <RecreateFromUploadDialog
          source={document}
          open={recreateOpen}
          onOpenChange={(o) => {
            setRecreateOpen(o);
            if (!o) onOpenChange(false); // close the detail dialog too on success/cancel
          }}
        />

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

        {/* Upload New Version */}
        <div>
          <h4 className="text-sm font-medium mb-3">Upload New Version</h4>
          {isApproved ? (
            <p className="text-xs text-muted-foreground rounded-md border bg-muted/40 p-3">
              <Lock className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              This document is approved and locked. {isOwner
                ? "Unlock it above to upload a revised version."
                : "Ask the Director to unlock it before uploading a new version."}
            </p>
          ) : (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            {!selectedFile ? (
              <Button
                variant="outline"
                className="w-full border-dashed"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Choose File to Upload
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{selectedFile.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({(selectedFile.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>
                    Change
                  </Button>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Changes Summary (optional)</Label>
                  <Input
                    value={changesSummary}
                    onChange={(e) => setChangesSummary(e.target.value)}
                    placeholder="e.g., Updated risk assessment section"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadMutation.isPending ? "Uploading..." : "Upload as New Version"}
                </Button>
              </div>
            )}
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
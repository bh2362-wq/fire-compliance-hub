import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Download,
  Mail,
  Trash2,
  FileText,
  Loader2,
  Archive,
  Eye,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getCompanySettings } from "@/services/companySettingsService";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "pava_record", label: "PAVA Record" },
  { value: "subcontractor_report", label: "Subcontractor Report" },
  { value: "external_certificate", label: "External Certificate" },
  { value: "site_survey", label: "Site Survey" },
  { value: "risk_assessment", label: "Risk Assessment" },
  { value: "photograph", label: "Photograph" },
  { value: "correspondence", label: "Correspondence" },
  { value: "manufacturer_documentation", label: "Manufacturer Documentation" },
  { value: "other", label: "Other" },
];

const categoryLabel = (v: string) =>
  CATEGORIES.find((c) => c.value === v)?.label ?? v;

const ACCEPT =
  "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/heic";

interface SiteDocumentsProps {
  siteId: string;
  /** Optional - if omitted, resolved from the site row */
  customerId?: string | null;
  /** Optional - filter and pin uploads to a specific visit */
  serviceVisitId?: string | null;
  /** Optional - default title prefix (e.g. visit type) */
  defaultTitlePrefix?: string;
}

interface DocRow {
  id: string;
  category: string;
  title: string;
  description: string | null;
  document_date: string;
  file_path: string;
  file_size_bytes: number;
  file_mime_type: string;
  file_original_name: string;
  uploaded_at: string;
  service_visit_id: string | null;
  share_with_customer: boolean;
  is_archived: boolean;
  issued_by: string | null;
}

const fmtSize = (b: number) =>
  b < 1024
    ? `${b} B`
    : b < 1024 * 1024
    ? `${(b / 1024).toFixed(1)} KB`
    : `${(b / 1024 / 1024).toFixed(1)} MB`;

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export function SiteDocuments({
  siteId,
  customerId,
  serviceVisitId,
  defaultTitlePrefix,
}: SiteDocumentsProps) {
  const [resolvedCustomerId, setResolvedCustomerId] = useState<string | null>(
    customerId ?? null
  );
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [emailDoc, setEmailDoc] = useState<DocRow | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocRow | null>(null);
  const [editDoc, setEditDoc] = useState<DocRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (resolvedCustomerId) return;
    supabase
      .from("sites")
      .select("customer_id")
      .eq("id", siteId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.customer_id) setResolvedCustomerId(data.customer_id);
      });
  }, [siteId, resolvedCustomerId]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("visit_documents")
      .select(
        "id,category,title,description,issued_by,document_date,file_path,file_size_bytes,file_mime_type,file_original_name,uploaded_at,service_visit_id,share_with_customer,is_archived"
      )
      .eq("site_id", siteId)
      .order("document_date", { ascending: false });

    if (!showArchived) q = q.eq("is_archived", false);
    if (serviceVisitId) q = q.eq("service_visit_id", serviceVisitId);

    const { data, error } = await q;
    if (error) {
      console.error(error);
      toast.error("Failed to load documents");
    } else {
      setDocs((data as DocRow[]) || []);
    }
    setLoading(false);
  }, [siteId, serviceVisitId, showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = async (doc: DocRow) => {
    const { data, error } = await supabase.storage
      .from("visit-documents")
      .createSignedUrl(doc.file_path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Failed to generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleArchive = async (doc: DocRow) => {
    if (!confirm(`Archive "${doc.title}"?`)) return;
    const { error } = await supabase
      .from("visit_documents")
      .update({ is_archived: true })
      .eq("id", doc.id);
    if (error) {
      toast.error("Failed to archive");
      return;
    }
    toast.success("Document archived");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {docs.length} document{docs.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-border"
            />
            Show archived
          </label>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Document
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Loading…
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No documents uploaded yet</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Category</th>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Size</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr
                  key={d.id}
                  className={`border-t border-border hover:bg-muted/30 ${
                    d.is_archived ? "opacity-55" : ""
                  }`}
                >
                  <td className="p-3">
                    <div className="font-medium text-foreground flex items-center gap-2">
                      {d.title}
                      {d.is_archived && (
                        <Badge variant="outline" className="text-[10px]">
                          Archived
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-xs">
                      {d.file_original_name}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline">{categoryLabel(d.category)}</Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {format(new Date(d.document_date), "dd MMM yyyy")}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {fmtSize(d.file_size_bytes)}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPreviewDoc(d)}
                      title="View"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDownload(d)}
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditDoc(d)}
                      title="Edit details"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEmailDoc(d)}
                      title="Email to customer"
                    >
                      <Mail className="w-4 h-4" />
                    </Button>
                    {!d.is_archived && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleArchive(d)}
                        title="Archive"
                      >
                        <Archive className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        siteId={siteId}
        customerId={resolvedCustomerId}
        serviceVisitId={serviceVisitId ?? null}
        defaultTitlePrefix={defaultTitlePrefix}
        onUploaded={load}
        onResolveCustomerId={setResolvedCustomerId}
      />

      {resolvedCustomerId && (
        <EmailDialog
          doc={emailDoc}
          siteId={siteId}
          customerId={resolvedCustomerId}
          onClose={() => setEmailDoc(null)}
        />
      )}

      <PreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
      <EditDialog doc={editDoc} onClose={() => setEditDoc(null)} onSaved={load} />
    </div>
  );
}


/* ---------- Preview dialog ---------- */

function PreviewDialog({
  doc,
  onClose,
}: {
  doc: DocRow | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doc) {
      setUrl(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    // Route through the edge function so every view is access-checked and
    // written to the audit log.
    supabase.functions
      .invoke("generate-signed-url", {
        body: { document_id: doc.id, expires_in_seconds: 600 },
      })
      .then(({ data, error: err }) => {
        if (err || !data?.signed_url) {
          setError(err?.message ?? "Could not load this document");
        } else {
          setUrl(data.signed_url);
        }
      })
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [doc]);

  const isImage = doc?.file_mime_type?.startsWith("image/");
  const isPdf = doc?.file_mime_type === "application/pdf";

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{doc?.title}</DialogTitle>
          <DialogDescription>
            {doc ? categoryLabel(doc.category) : ""}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-8 text-center">{error}</p>
        ) : url && isImage ? (
          <img
            src={url}
            alt={doc?.title}
            className="max-h-[70vh] w-full object-contain rounded"
          />
        ) : url && isPdf ? (
          <iframe
            src={url}
            title={doc?.title}
            className="w-full h-[70vh] rounded border border-border"
          />
        ) : url ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              This file type can't be previewed inline.
            </p>
            <Button asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <Download className="w-4 h-4 mr-2" />
                Download {doc?.file_original_name}
              </a>
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}


/* ---------- Edit metadata dialog ---------- */

function EditDialog({
  doc,
  onClose,
  onSaved,
}: {
  doc: DocRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("other");
  const [docDate, setDocDate] = useState("");
  const [description, setDescription] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (doc) {
      setTitle(doc.title);
      setCategory(doc.category);
      setDocDate(doc.document_date);
      setDescription(doc.description ?? "");
      setIssuedBy(doc.issued_by ?? "");
    }
  }, [doc]);

  const handleSave = async () => {
    if (!doc) return;
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("visit_documents")
      .update({
        title: title.trim(),
        category,
        document_date: docDate,
        description: description.trim() || null,
        issued_by: issuedBy.trim() || null,
      })
      .eq("id", doc.id);
    setBusy(false);
    if (error) {
      toast.error("Failed to save changes");
      return;
    }
    toast.success("Document updated");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit document details</DialogTitle>
          <DialogDescription>
            Update the metadata for this document.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Document date</Label>
            <Input
              type="date"
              value={docDate}
              onChange={(e) => setDocDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Issued by (optional)</Label>
            <Input
              value={issuedBy}
              onChange={(e) => setIssuedBy(e.target.value)}
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ---------- Upload dialog ---------- */

function UploadDialog({
  open,
  onOpenChange,
  siteId,
  customerId,
  serviceVisitId,
  defaultTitlePrefix,
  onUploaded,
  onResolveCustomerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteId: string;
  customerId: string | null;
  serviceVisitId: string | null;
  defaultTitlePrefix?: string;
  onUploaded: () => void;
  onResolveCustomerId?: (id: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("subcontractor_report");
  const [docDate, setDocDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [description, setDescription] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setTitle("");
      setCategory("subcontractor_report");
      setDocDate(format(new Date(), "yyyy-MM-dd"));
      setDescription("");
      setIssuedBy("");
    }
  }, [open]);

  const handleFile = (f: File | null) => {
    setFile(f);
    if (f && !title) {
      const base = f.name.replace(/\.[^.]+$/, "");
      setTitle(defaultTitlePrefix ? `${defaultTitlePrefix} — ${base}` : base);
    }
  };

  const sanitize = (s: string) =>
    s.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();

  const handleUpload = async () => {
    if (!file) {
      toast.error("Select a file");
      return;
    }
    if (!title.trim()) {
      toast.error("Enter a title");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("File too large (25MB max)");
      return;
    }

    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) throw new Error("Not authenticated");

      let effectiveCustomerId = customerId;
      if (!effectiveCustomerId) {
        const { data: siteRow } = await supabase
          .from("sites")
          .select("customer_id")
          .eq("id", siteId)
          .maybeSingle();
        effectiveCustomerId = siteRow?.customer_id ?? null;
        if (effectiveCustomerId) onResolveCustomerId?.(effectiveCustomerId);
      }
      if (!effectiveCustomerId) throw new Error("Site has no linked customer");

      const ext = file.name.split(".").pop() || "bin";
      const safeName = sanitize(file.name) || `document.${ext}`;
      const path = `sites/${siteId}/${crypto.randomUUID()}-${safeName}`;

      // 1. Upload to Storage bucket
      const { error: upErr } = await supabase.storage
        .from("visit-documents")
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw upErr;

      // 2. Insert DB row
      const { error: dbErr } = await supabase.from("visit_documents").insert({
        site_id: siteId,
        customer_id: effectiveCustomerId,
        service_visit_id: serviceVisitId,
        category,
        title: title.trim(),
        description: description.trim() || null,
        issued_by: issuedBy.trim() || null,
        document_date: docDate,
        file_path: path,
        file_size_bytes: file.size,
        file_mime_type: file.type || "application/octet-stream",
        file_original_name: file.name,
        uploaded_by: userId,
      });
      if (dbErr) throw dbErr;

      // 3. Best-effort mirror to SharePoint (silent on failure)
      try {
        const { data: site } = await supabase
          .from("sites")
          .select("sharepoint_folder")
          .eq("id", siteId)
          .maybeSingle();
        if (site?.sharepoint_folder) {
          const base64 = await fileToBase64(file);
          await supabase.functions.invoke("upload-to-sharepoint", {
            body: {
              folderPath: `${site.sharepoint_folder}/Documents`,
              fileName: safeName,
              fileBase64: base64,
              contentType: file.type || "application/octet-stream",
            },
          });
        }
      } catch (e) {
        console.warn("SharePoint mirror failed (non-fatal):", e);
      }

      toast.success("Document uploaded");
      onOpenChange(false);
      onUploaded();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            PDF, Word, or image. Max 25MB. Stored in the site folder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>File</Label>
            <Input
              type="file"
              accept={ACCEPT}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Document Date</Label>
              <Input
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q2 Service Sheet"
            />
          </div>

          <div className="space-y-1">
            <Label>Issued By (optional)</Label>
            <Input
              value={issuedBy}
              onChange={(e) => setIssuedBy(e.target.value)}
              placeholder="e.g. ACME Subcontractors"
            />
          </div>

          <div className="space-y-1">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading…
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

/* ---------- Email dialog ---------- */

function EmailDialog({
  doc,
  siteId,
  customerId,
  onClose,
}: {
  doc: DocRow | null;
  siteId: string;
  customerId: string;
  onClose: () => void;
}) {
  const open = !!doc;
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [siteName, setSiteName] = useState("");

  useEffect(() => {
    if (!doc) return;
    setSending(false);
    (async () => {
      const [{ data: site }, { data: cust }] = await Promise.all([
        supabase
          .from("sites")
          .select("name, contact_email")
          .eq("id", siteId)
          .maybeSingle(),
        supabase
          .from("customers")
          .select("contact_email, email_recipients, report_email_recipients")
          .eq("id", customerId)
          .maybeSingle(),
      ]);

      setSiteName(site?.name || "");

      const all = new Set<string>();
      const push = (v?: string | null) =>
        (v || "")
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((e) => all.add(e));
      push(site?.contact_email);
      push(cust?.contact_email);
      push(cust?.report_email_recipients);
      push(cust?.email_recipients);

      setRecipients(Array.from(all).join(", "));
      setSubject(`${doc.title} — ${site?.name || "Service Sheet"}`);
      setMessage(
        `Please find attached: ${doc.title}.\n\nIf you have any questions, please get in touch.`
      );
    })();
  }, [doc, siteId, customerId]);

  const handleSend = async () => {
    if (!doc) return;
    const emails = recipients
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (!emails.length) {
      toast.error("Add at least one recipient");
      return;
    }

    setSending(true);
    try {
      // Download file from storage and convert to base64
      const { data: fileData, error: dlErr } = await supabase.storage
        .from("visit-documents")
        .download(doc.file_path);
      if (dlErr || !fileData) throw dlErr || new Error("Download failed");

      const base64: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = String(r.result || "");
          resolve(s.includes(",") ? s.split(",")[1] : s);
        };
        r.onerror = reject;
        r.readAsDataURL(fileData);
      });

      const company = await getCompanySettings();

      const { error } = await supabase.functions.invoke("send-report-email", {
        body: {
          to: emails,
          subject,
          siteName,
          reportNumber: doc.title,
          reportDate: format(new Date(doc.document_date), "dd/MM/yyyy"),
          pdfBase64: base64,
          companyName: company?.company_name,
          logoUrl: company?.report_logo_url || company?.company_logo_url,
          emailBody: message,
          documentType: categoryLabel(doc.category),
          // Override the attached filename to keep original extension
          additionalAttachments: [],
        },
      });
      if (error) throw error;

      // Mark as shared with customer
      await supabase
        .from("visit_documents")
        .update({ share_with_customer: true })
        .eq("id", doc.id);

      toast.success(`Sent to ${emails.length} recipient(s)`);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Document
          </DialogTitle>
          <DialogDescription>
            {doc ? `Send "${doc.title}" to the customer.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Recipients</Label>
            <Input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="name@example.com, another@example.com"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated. Pre-filled with site & customer contacts.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Mail className="w-4 h-4 mr-2" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SiteDocuments;

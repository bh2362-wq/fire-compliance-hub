import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, ArrowLeft, Trash2, Upload, ExternalLink, Pencil } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listCompanyDocuments,
  createCompanyDocument,
  updateCompanyDocument,
  deleteCompanyDocument,
  COMPANY_DOC_CATEGORY_LABELS,
  type CompanyDocument,
  type CompanyDocumentCategory,
} from "@/services/tenderService";

export default function TenderLibrary() {
  const [docs, setDocs] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CompanyDocument | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setDocs(await listCompanyDocuments());
    } catch (e) {
      toast.error("Couldn't load library", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const grouped = docs.reduce((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {} as Record<CompanyDocumentCategory, CompanyDocument[]>);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <Link to="/dashboard/tenders" className="text-xs text-primary hover:underline flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back to tenders
            </Link>
            <h1 className="text-2xl font-bold mt-1">Document library</h1>
            <p className="text-sm text-muted-foreground">
              Company profile, accreditations, insurance certs, sample reports, and policies you bundle into tender packs.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add document
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : docs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No documents in the library yet. Add your company profile, accreditation certificates,
              and sample reports to make them available to every tender pack.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(Object.keys(COMPANY_DOC_CATEGORY_LABELS) as CompanyDocumentCategory[]).map((cat) => {
              const items = grouped[cat] ?? [];
              if (items.length === 0) return null;
              return (
                <section key={cat} className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {COMPANY_DOC_CATEGORY_LABELS[cat]} · {items.length}
                  </h3>
                  <div className="space-y-1.5">
                    {items.map((d) => (
                      <div key={d.id} className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm truncate">{d.title}</p>
                            {d.version && <Badge variant="outline" className="text-[10px]">{d.version}</Badge>}
                            {d.expires_at && (
                              <span className="text-[11px] text-muted-foreground">
                                expires {format(new Date(d.expires_at), "dd MMM yyyy")}
                              </span>
                            )}
                          </div>
                          {d.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{d.description}</p>
                          )}
                        </div>
                        {d.file_url && (
                          <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(d)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <DocumentEditorDialog
          open={createOpen || !!editing}
          existing={editing}
          onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditing(null); } }}
          onSaved={load}
        />
      </div>
    </DashboardLayout>
  );
}

function DocumentEditorDialog({
  open, onOpenChange, existing, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: CompanyDocument | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CompanyDocumentCategory>("accreditation");
  const [description, setDescription] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileStoragePath, setFileStoragePath] = useState("");
  const [version, setVersion] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setTitle(existing.title);
      setCategory(existing.category);
      setDescription(existing.description ?? "");
      setFileUrl(existing.file_url ?? "");
      setFileStoragePath(existing.file_storage_path ?? "");
      setVersion(existing.version ?? "");
      setExpiresAt(existing.expires_at ?? "");
    } else {
      setTitle(""); setCategory("accreditation"); setDescription(""); setFileUrl(""); setFileStoragePath(""); setVersion(""); setExpiresAt("");
    }
  }, [open, existing]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("tender-assets").upload(path, file, { upsert: false });
      if (error) throw error;
      // Persist storage path so the pack-builder can mint fresh signed URLs
      // server-side (signed URLs in file_url expire after a year).
      setFileStoragePath(path);
      const { data: signed } = await supabase.storage.from("tender-assets").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signed?.signedUrl) {
        setFileUrl(signed.signedUrl);
        toast.success("File uploaded");
      }
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        category,
        description: description.trim() || null,
        file_url: fileUrl.trim() || null,
        file_storage_path: fileStoragePath.trim() || null,
        version: version.trim() || null,
        expires_at: expiresAt || null,
      };
      if (existing) {
        await updateCompanyDocument(existing.id, payload);
        toast.success("Document updated");
      } else {
        await createCompanyDocument(payload);
        toast.success("Document added");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirm(`Delete "${existing.title}"?`)) return;
    try {
      await deleteCompanyDocument(existing.id);
      toast.success("Document deleted");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error("Couldn't delete", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit document" : "Add document"}</DialogTitle>
          <DialogDescription>
            Reusable across every tender pack. Use a hosted PDF URL or upload a file.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. BAFE SP203-1 Certificate" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as CompanyDocumentCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(COMPANY_DOC_CATEGORY_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Version / date</Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="May 2026" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Expires</Label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">File URL (or upload below)</Label>
            <Input type="url" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://..." />
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
              className="hidden"
              id="doc-upload"
            />
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => document.getElementById("doc-upload")?.click()}
              disabled={uploading}
              className="w-full"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
              Upload PDF
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description / notes</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="flex-row gap-2 sm:justify-between">
          {existing ? (
            <Button variant="ghost" size="sm" onClick={remove} className="text-destructive">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || uploading}>
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              {existing ? "Save" : "Add"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

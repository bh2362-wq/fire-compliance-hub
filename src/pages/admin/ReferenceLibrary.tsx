import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Upload, FileText, Loader2, CheckCircle2, AlertCircle, Clock,
  RefreshCw, Trash2, ChevronDown, ChevronRight, AlertTriangle,
} from "lucide-react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { extractEdgeError } from "@/lib/edgeError";
import { extractPdfInBrowser, extractTxtInBrowser, ocrPdfInBrowser, ScannedPdfError, ExtractedPdf } from "@/lib/refLibPdfExtract";

type DocType =
  | "standard" | "fia_guidance" | "manufacturer_doc" | "past_quote"
  | "sop" | "tender_template" | "compliance_pack" | "other";

const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: "standard", label: "Standard (BS / EN / ISO)" },
  { value: "fia_guidance", label: "FIA guidance" },
  { value: "manufacturer_doc", label: "Manufacturer doc" },
  { value: "past_quote", label: "Past quote (voice ref)" },
  { value: "sop", label: "SOP / method statement" },
  { value: "tender_template", label: "Tender template" },
  { value: "compliance_pack", label: "Compliance / QMS pack" },
  { value: "other", label: "Other" },
];

interface RefDoc {
  id: string;
  title: string;
  doc_type: DocType;
  standard_reference: string | null;
  edition: string | null;
  publisher: string | null;
  source_filename: string | null;
  source_storage_path: string | null;
  effective_date: string | null;
  page_count: number | null;
  chunk_count: number;
  total_tokens: number;
  ingest_status: "pending" | "processing" | "completed" | "failed";
  ingest_error: string | null;
  ingested_at: string | null;
  uploaded_at: string;
}

interface ChunkPreview {
  id: string;
  chunk_index: number;
  content_preview: string | null;
  section_title: string | null;
  page_number: number | null;
}

const REF_DOCS = "ref_lib_documents" as const;
const REF_CHUNKS = "ref_lib_chunks" as const;
const refLib = () => ({
  from: (tbl: "documents" | "chunks") =>
    (supabase as any).from(tbl === "documents" ? REF_DOCS : REF_CHUNKS),
});

const ACCEPT = ".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_BYTES = 100 * 1024 * 1024;

function sanitiseFilename(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot > 0 ? name.substring(0, lastDot) : name;
  const ext = lastDot > 0 ? name.substring(lastDot) : "";
  const cleanBase = base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 100);
  return cleanBase + ext.toLowerCase();
}

function StatusPill({ s }: { s: RefDoc["ingest_status"] }) {
  if (s === "pending") return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
  if (s === "processing") return <Badge className="gap-1 bg-blue-500 hover:bg-blue-500"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
  if (s === "completed") return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3" />Completed</Badge>;
  return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Failed</Badge>;
}

export default function ReferenceLibrary() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<RefDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // upload form
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocType>("standard");
  const [stdRef, setStdRef] = useState("");
  const [edition, setEdition] = useState("");
  const [publisher, setPublisher] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [resettingStuck, setResettingStuck] = useState(false);

  // expand / actions
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [chunkPreviews, setChunkPreviews] = useState<Record<string, ChunkPreview[]>>({});
  const [pendingDelete, setPendingDelete] = useState<RefDoc | null>(null);
  const [reingestId, setReingestId] = useState<string | null>(null);
  const [overwriteTarget, setOverwriteTarget] = useState<{ id: string; title: string } | null>(null);

  // Any signed-in user can READ; only owner/admin role can WRITE.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setIsAdmin(false); return; }
    (async () => {
      try {
        // Primary: query user_roles directly using RLS "Users can view own roles"
        const { data: rows, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        if (error) console.warn("[ReferenceLibrary] user_roles query error:", error);
        const roles = (rows ?? []).map((r: any) => r.role);
        const admin = roles.includes("owner") || roles.includes("admin");
        console.log("[ReferenceLibrary] user", user.email, "roles:", roles, "isAdmin:", admin);
        setIsAdmin(admin);
      } catch (e) {
        console.error("[ReferenceLibrary] admin check failed:", e);
        setIsAdmin(false);
      }
    })();
  }, [user, authLoading]);


  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await refLib().from("documents").select("*").order("uploaded_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setDocs((data ?? []) as RefDoc[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (user) fetchDocs(); }, [user, fetchDocs]);

  // poll while anything is processing/pending (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    const active = docs.some((d) => d.ingest_status === "processing" || d.ingest_status === "pending");
    if (!active) return;
    const t = setInterval(fetchDocs, 4000);
    return () => clearInterval(t);
  }, [isAdmin, docs, fetchDocs]);

  const stats = useMemo(() => {
    const total = docs.length;
    const chunks = docs.reduce((s, d) => s + (d.chunk_count ?? 0), 0);
    const tokens = docs.reduce((s, d) => s + (d.total_tokens ?? 0), 0);
    return { total, chunks, tokens };
  }, [docs]);

  const handlePickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_BYTES) { toast.error("File exceeds 100 MB"); return; }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const resetForm = () => {
    setFile(null); setTitle(""); setStdRef(""); setEdition(""); setPublisher(""); setEffectiveDate("");
    setDocType("standard"); setUploadStage(null); setUploadProgress(0);
  };

  const runIngest = async (document_id: string, pages: string[], totalPages: number) => {
    // Send pages to the edge function in batches to stay within CPU/timeout limits.
    const PAGE_BATCH = 25;
    let nextChunkIndex = 0;
    let finalResult: { chunk_count: number; total_tokens: number; duration_ms: number } | null = null;
    for (let offset = 0; offset < pages.length; offset += PAGE_BATCH) {
      const slice = pages.slice(offset, offset + PAGE_BATCH);
      const isLast = offset + PAGE_BATCH >= pages.length;
      const { data, error } = await supabase.functions.invoke("ingest-reference-document", {
        body: {
          document_id,
          pages: slice,
          total_pages: totalPages,
          page_offset: offset,
          chunk_index_offset: nextChunkIndex,
          finalize: isLast,
        },
      });
      if (error) throw new Error(error.message);
      if (data && data.success === false) throw new Error(data.error || "Ingest failed");
      nextChunkIndex = Number(data?.next_chunk_index ?? nextChunkIndex);
      // Update progress bar 70% → 95% across batches
      const pct = 70 + Math.round(((offset + slice.length) / pages.length) * 25);
      setUploadProgress(Math.min(95, pct));
      setUploadStage(`Embedding pages ${offset + 1}–${Math.min(offset + PAGE_BATCH, pages.length)} of ${pages.length}…`);
      if (isLast) {
        finalResult = {
          chunk_count: Number(data?.chunk_count ?? nextChunkIndex),
          total_tokens: Number(data?.total_tokens ?? 0),
          duration_ms: Number(data?.duration_ms ?? 0),
        };
      }
    }
    return finalResult ?? { chunk_count: nextChunkIndex, total_tokens: 0, duration_ms: 0 };
  };


  const extractInBrowser = async (f: File): Promise<ExtractedPdf> => {
    const name = f.name.toLowerCase();
    if (name.endsWith(".pdf")) {
      try {
        return await extractPdfInBrowser(f, (p, t) => {
          // 25% → 60% during extraction
          const pct = 25 + Math.round((p / t) * 35);
          setUploadProgress(pct);
          setUploadStage(`Extracting text… page ${p} of ${t}`);
        });
      } catch (err) {
        if (!(err instanceof ScannedPdfError)) throw err;
        toast.info("Scanned PDF detected — running OCR instead");
        return ocrPdfInBrowser(
          f,
          async (pageNumber, totalPages, imageDataUrl) => {
            const { data, error } = await supabase.functions.invoke("ocr-reference-page", {
              body: { image: imageDataUrl, page_number: pageNumber, total_pages: totalPages },
            });
            if (error) throw new Error(await extractEdgeError(error, "OCR failed"));
            if (data?.success === false) throw new Error(data.error || "OCR failed");
            return String(data?.text ?? "");
          },
          (p, t) => {
            const pct = 25 + Math.round((p / t) * 35);
            setUploadProgress(pct);
            setUploadStage(`Running OCR… page ${p} of ${t}`);
          },
        );
      }
    }
    if (name.endsWith(".txt")) return extractTxtInBrowser(f);
    if (name.endsWith(".docx")) {
      throw new Error("DOCX uploads are temporarily unsupported — convert to PDF or TXT first.");
    }
    throw new Error(`Unsupported file type: ${f.name}`);
  };

  const performUpload = async (existingDocId?: string) => {
    if (!file) { toast.error("Choose a file"); return; }
    setUploadBusy(true);
    setUploadProgress(0);
    let createdId: string | null = existingDocId ?? null;
    let storagePath: string | null = null;
    try {
      // Phase 1 — upload archival copy to Storage (0–25%)
      setUploadStage("Uploading PDF to storage…");
      setUploadProgress(5);
      const folder = crypto.randomUUID();
      const safeName = sanitiseFilename(file.name);
      storagePath = `${folder}/${safeName}`;
      const { error: upErr } = await supabase.storage.from("reference-library")
        .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      setUploadProgress(25);

      // Phase 2 — extract text in the browser (25–60%)
      setUploadStage("Extracting text…");
      const extracted = await extractInBrowser(file);
      if (!extracted.pages.length || extracted.pages.every((p) => !p.trim())) {
        throw new Error("No extractable text found in this file");
      }
      setUploadProgress(60);

      // Insert/update the document row
      if (existingDocId) {
        await refLib().from("chunks").delete().eq("document_id", existingDocId);
        const { error: updErr } = await refLib().from("documents").update({
          title: title.trim(),
          doc_type: docType,
          standard_reference: stdRef.trim() || null,
          edition: edition.trim() || null,
          publisher: publisher.trim() || null,
          effective_date: effectiveDate || null,
          source_filename: file.name,
          source_storage_path: storagePath,
          page_count: extracted.totalPages,
          ingest_status: "pending",
          ingest_error: null,
          chunk_count: 0,
          total_tokens: 0,
        }).eq("id", existingDocId);
        if (updErr) throw new Error(`Update document row failed: ${updErr.message}`);
      } else {
        const { data: doc, error: insErr } = await refLib().from("documents").insert({
          title: title.trim(),
          doc_type: docType,
          standard_reference: stdRef.trim() || null,
          edition: edition.trim() || null,
          publisher: publisher.trim() || null,
          effective_date: effectiveDate || null,
          source_filename: file.name,
          source_storage_path: storagePath,
          page_count: extracted.totalPages,
          uploaded_by: user?.id ?? null,
          ingest_status: "pending",
        }).select("id").single();
        if (insErr || !doc) throw new Error(`Create document row failed: ${insErr?.message}`);
        createdId = doc.id as string;
      }

      // Phase 3 — embeddings (60–95%)
      setUploadStage(`Generating embeddings for ${extracted.pages.length} pages…`);
      setUploadProgress(70);
      await fetchDocs();
      const result = await runIngest(createdId!, extracted.pages, extracted.totalPages);

      // Phase 4 — done (95–100%)
      setUploadProgress(100);
      setUploadStage(`Complete: ${result.chunk_count} chunks, ${result.total_tokens.toLocaleString()} tokens`);
      toast.success(`Ingested: ${result.chunk_count} chunks`);
      await fetchDocs();
      setTimeout(resetForm, 1800);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Ingest failed");
      setUploadStage(`Error: ${err.message || "failed"}`);
      // Mark row as failed if we created one
      if (createdId) {
        await refLib().from("documents").update({
          ingest_status: "failed",
          ingest_error: String(err?.message || err).slice(0, 1000),
        }).eq("id", createdId);
      }
      await fetchDocs();
    } finally {
      setUploadBusy(false);
    }
  };

  const handleUpload = async () => {
    if (!file) { toast.error("Choose a file"); return; }
    if (!title.trim()) { toast.error("Title is required"); return; }

    // Check for an existing row with the same source_filename
    const { data: existingRows } = await refLib().from("documents")
      .select("id, ingest_status, title")
      .eq("source_filename", file.name)
      .order("created_at", { ascending: false })
      .limit(1);
    const existing = (existingRows ?? [])[0] as { id: string; ingest_status: RefDoc["ingest_status"]; title: string } | undefined;

    if (existing) {
      if (existing.ingest_status === "failed") {
        await performUpload(existing.id);
        return;
      }
      if (existing.ingest_status === "completed") {
        setOverwriteTarget({ id: existing.id, title: existing.title });
        return;
      }
      toast.error("A document with this filename is already being processed");
      return;
    }

    await performUpload();
  };

  const handleReingest = async (id: string) => {
    setReingestId(id);
    try {
      // Fetch the doc to re-download its source file from Storage
      const { data: doc, error: docErr } = await refLib().from("documents")
        .select("source_storage_path, source_filename").eq("id", id).single();
      if (docErr || !doc?.source_storage_path) throw new Error("Source file not found in storage");

      const { data: blob, error: dlErr } = await supabase.storage
        .from("reference-library").download(doc.source_storage_path);
      if (dlErr || !blob) throw new Error(`Download failed: ${dlErr?.message}`);
      const f = new File([blob], doc.source_filename || "document.pdf", { type: blob.type || "application/pdf" });
      const extracted = await extractInBrowser(f);

      await refLib().from("documents").update({
        ingest_status: "pending", ingest_error: null,
        page_count: extracted.totalPages, chunk_count: 0, total_tokens: 0,
      }).eq("id", id);
      await refLib().from("chunks").delete().eq("document_id", id);
      await fetchDocs();
      const r = await runIngest(id, extracted.pages, extracted.totalPages);
      toast.success(`Re-ingested: ${r.chunk_count} chunks`);
      await fetchDocs();
    } catch (e: any) {
      toast.error(e.message || "Re-ingest failed");
      await refLib().from("documents").update({
        ingest_status: "failed",
        ingest_error: String(e?.message || e).slice(0, 1000),
      }).eq("id", id);
      await fetchDocs();
    } finally {
      setReingestId(null);
    }
  };

  const handleResetStuck = async () => {
    setResettingStuck(true);
    try {
      const { data, error } = await (supabase as any).rpc("reset_stuck_ref_lib_ingests");
      if (error) throw new Error(error.message);
      const count = Number(data ?? 0);
      toast.success(count > 0 ? `Reset ${count} stuck ingest${count === 1 ? "" : "s"}` : "No stuck ingests");
      await fetchDocs();
    } catch (e: any) {
      toast.error(e.message || "Reset failed");
    } finally {
      setResettingStuck(false);
    }
  };

  const handleDelete = async (doc: RefDoc) => {
    try {
      if (doc.source_storage_path) {
        await supabase.storage.from("reference-library").remove([doc.source_storage_path]);
      }
      const { error } = await refLib().from("documents").delete().eq("id", doc.id);
      if (error) throw new Error(error.message);
      toast.success("Deleted");
      await fetchDocs();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setPendingDelete(null);
    }
  };

  const toggleExpand = async (doc: RefDoc) => {
    const next = !expanded[doc.id];
    setExpanded((p) => ({ ...p, [doc.id]: next }));
    if (next && !chunkPreviews[doc.id]) {
      const { data } = await refLib().from("chunks")
        .select("id, chunk_index, content_preview, section_title, page_number")
        .eq("document_id", doc.id).order("chunk_index").limit(3);
      setChunkPreviews((p) => ({ ...p, [doc.id]: (data ?? []) as ChunkPreview[] }));
    }
  };

  if (authLoading || isAdmin === null) {
    return <DashboardLayout><div className="p-6 text-sm text-muted-foreground">Loading…</div></DashboardLayout>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  // Any signed-in user can view (read-only); admin actions hidden below.

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Reference Library</h1>
          <p className="text-sm text-muted-foreground">
            Authoritative documents used to ground AI-generated content.
          </p>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Documents</div>
            <div className="text-2xl font-semibold">{stats.total}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Chunks</div>
            <div className="text-2xl font-semibold">{stats.chunks.toLocaleString()}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total tokens</div>
            <div className="text-2xl font-semibold">{stats.tokens.toLocaleString()}</div>
          </CardContent></Card>
        </div>

        {/* Upload — admin only */}
        {isAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-base">Upload document</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label
              htmlFor="ref-file"
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault(); setDragging(false);
                handlePickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 cursor-pointer transition-colors ${
                dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
              }`}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <div className="text-sm">
                {file ? (
                  <span className="flex items-center gap-2"><FileText className="h-4 w-4" />{file.name} <span className="text-muted-foreground">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></span>
                ) : (
                  <span><span className="text-primary font-medium">Click to choose</span> or drag a PDF / DOCX / TXT (max 100 MB)</span>
                )}
              </div>
              <input
                id="ref-file" type="file" accept={ACCEPT} className="hidden"
                onChange={(e) => handlePickFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. BS 5839-1:2025 Code of Practice" />
              </div>
              <div className="space-y-1.5">
                <Label>Document type *</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stdref">Standard reference</Label>
                <Input id="stdref" value={stdRef} onChange={(e) => setStdRef(e.target.value)} placeholder="e.g. BS 5839-1:2025" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edition">Edition</Label>
                <Input id="edition" value={edition} onChange={(e) => setEdition(e.target.value)} placeholder="e.g. 2025" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="publisher">Publisher</Label>
                <Input id="publisher" value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="e.g. BSI, FIA, Honeywell Gent" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="effdate">Effective date</Label>
                <Input id="effdate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
              </div>
            </div>

            {(uploadBusy || uploadProgress > 0) && (
              <div className="space-y-1.5">
                <Progress value={uploadProgress} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {uploadBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                    {uploadStage ?? ""}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground min-h-[1.25rem]">
                {!uploadBusy && uploadStage && uploadProgress === 0 ? uploadStage : null}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={resetForm} disabled={uploadBusy}>Reset</Button>
                <Button onClick={handleUpload} disabled={uploadBusy || !file}>
                  {uploadBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                  Upload and ingest
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Documents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Documents</CardTitle>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button variant="ghost" size="sm" onClick={handleResetStuck} disabled={resettingStuck}>
                  {resettingStuck ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-1.5" />}
                  Reset stuck ingests
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={fetchDocs} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Standard</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead className="text-right">Chunks</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ingested</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={isAdmin ? 9 : 8} className="text-center text-sm text-muted-foreground py-8">No documents yet.</TableCell></TableRow>
                )}
                {docs.map((d) => (
                  <Fragment key={d.id}>
                    <TableRow className="cursor-pointer" onClick={() => toggleExpand(d)}>
                      <TableCell>{expanded[d.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell className="font-medium">{d.title}</TableCell>
                      <TableCell><span className="text-xs">{DOC_TYPES.find((t) => t.value === d.doc_type)?.label ?? d.doc_type}</span></TableCell>
                      <TableCell><span className="text-xs">{d.standard_reference ?? "—"}</span></TableCell>
                      <TableCell className="text-right text-xs">{d.page_count ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{d.chunk_count}</TableCell>
                      <TableCell><StatusPill s={d.ingest_status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.ingested_at ? formatDistanceToNow(new Date(d.ingested_at), { addSuffix: true }) : "—"}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="ghost" disabled={reingestId === d.id || d.ingest_status === "processing"} onClick={() => handleReingest(d.id)}>
                              {reingestId === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(d)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    {expanded[d.id] && (
                      <TableRow key={d.id + "-exp"}>
                        <TableCell />
                        <TableCell colSpan={isAdmin ? 8 : 7} className="bg-muted/40">
                          <div className="space-y-3 py-2 text-xs">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              <div><span className="text-muted-foreground">Publisher:</span> {d.publisher ?? "—"}</div>
                              <div><span className="text-muted-foreground">Edition:</span> {d.edition ?? "—"}</div>
                              <div><span className="text-muted-foreground">Effective:</span> {d.effective_date ?? "—"}</div>
                              <div><span className="text-muted-foreground">Tokens:</span> {d.total_tokens.toLocaleString()}</div>
                              <div className="col-span-2 md:col-span-4 break-all">
                                <span className="text-muted-foreground">File:</span> {d.source_filename} — <code>{d.source_storage_path}</code>
                              </div>
                              {d.ingest_error && (
                                <div className="col-span-2 md:col-span-4 text-destructive">
                                  <span className="font-medium">Error:</span> {d.ingest_error}
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="text-muted-foreground mb-1">First chunks:</div>
                              {(chunkPreviews[d.id] ?? []).length === 0 ? (
                                <div className="text-muted-foreground italic">No chunks yet.</div>
                              ) : (
                                <ul className="space-y-1.5">
                                  {chunkPreviews[d.id].map((c) => (
                                    <li key={c.id} className="border-l-2 border-primary/40 pl-2">
                                      <div className="text-muted-foreground text-[10px]">
                                        #{c.chunk_index}{c.page_number != null ? ` · p.${c.page_number}` : ""}{c.section_title ? ` · ${c.section_title}` : ""}
                                      </div>
                                      <div>{c.content_preview}</div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.title} — this also removes the source file and {pendingDelete?.chunk_count ?? 0} chunks. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && handleDelete(pendingDelete)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!overwriteTarget} onOpenChange={(o) => !o && setOverwriteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing document?</AlertDialogTitle>
            <AlertDialogDescription>
              A completed document with this filename already exists ("{overwriteTarget?.title}").
              Re-ingesting will overwrite its chunks and embeddings with the new upload. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = overwriteTarget?.id;
                setOverwriteTarget(null);
                if (id) performUpload(id);
              }}
            >
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  Upload, FileText, Loader2, CheckCircle2, AlertCircle, Clock,
  RefreshCw, Trash2, ChevronDown, ChevronRight,
} from "lucide-react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const refLib = () => (supabase as any).schema("reference_library");

const ACCEPT = ".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_BYTES = 100 * 1024 * 1024;

function StatusPill({ s }: { s: RefDoc["ingest_status"] }) {
  if (s === "pending") return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
  if (s === "processing") return <Badge className="gap-1 bg-blue-500 hover:bg-blue-500"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
  if (s === "completed") return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3" />Completed</Badge>;
  return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Failed</Badge>;
}

export default function ReferenceLibrary() {
  const { user, loading: authLoading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
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

  // expand / actions
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [chunkPreviews, setChunkPreviews] = useState<Record<string, ChunkPreview[]>>({});
  const [pendingDelete, setPendingDelete] = useState<RefDoc | null>(null);
  const [reingestId, setReingestId] = useState<string | null>(null);

  // gate to finance/admin role (same pattern as MarketData)
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setAllowed(false); return; }
    (async () => {
      const { data } = await supabase.rpc("has_finance_role", { _user_id: user.id });
      setAllowed(Boolean(data));
    })();
  }, [user, authLoading]);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await refLib().from("documents").select("*").order("uploaded_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    setDocs((data ?? []) as RefDoc[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) fetchDocs(); }, [allowed, fetchDocs]);

  // poll while anything is processing/pending
  useEffect(() => {
    if (!allowed) return;
    const active = docs.some((d) => d.ingest_status === "processing" || d.ingest_status === "pending");
    if (!active) return;
    const t = setInterval(fetchDocs, 4000);
    return () => clearInterval(t);
  }, [allowed, docs, fetchDocs]);

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
    setDocType("standard"); setUploadStage(null);
  };

  const runIngest = async (document_id: string) => {
    const { data, error } = await supabase.functions.invoke("ingest-reference-document", { body: { document_id } });
    if (error) throw new Error(error.message);
    if (data && data.success === false) throw new Error(data.error || "Ingest failed");
    return data as { chunk_count: number; total_tokens: number; duration_ms: number };
  };

  const handleUpload = async () => {
    if (!file) { toast.error("Choose a file"); return; }
    if (!title.trim()) { toast.error("Title is required"); return; }
    setUploadBusy(true);
    let createdId: string | null = null;
    let storagePath: string | null = null;
    try {
      setUploadStage("Uploading…");
      const folder = crypto.randomUUID();
      storagePath = `${folder}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("reference-library")
        .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      const { data: doc, error: insErr } = await refLib().from("documents").insert({
        title: title.trim(),
        doc_type: docType,
        standard_reference: stdRef.trim() || null,
        edition: edition.trim() || null,
        publisher: publisher.trim() || null,
        effective_date: effectiveDate || null,
        source_filename: file.name,
        source_storage_path: storagePath,
        uploaded_by: user?.id ?? null,
        ingest_status: "pending",
      }).select("id").single();
      if (insErr || !doc) throw new Error(`Create document row failed: ${insErr?.message}`);
      createdId = doc.id as string;

      setUploadStage("Extracting text & generating embeddings…");
      await fetchDocs();
      const result = await runIngest(createdId);
      setUploadStage(`Complete: ${result.chunk_count} chunks, ${result.total_tokens.toLocaleString()} tokens`);
      toast.success(`Ingested: ${result.chunk_count} chunks`);
      await fetchDocs();
      setTimeout(resetForm, 1500);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Ingest failed");
      setUploadStage(`Error: ${err.message || "failed"}`);
      await fetchDocs();
    } finally {
      setUploadBusy(false);
    }
  };

  const handleReingest = async (id: string) => {
    setReingestId(id);
    try {
      await refLib().from("documents").update({ ingest_status: "pending", ingest_error: null }).eq("id", id);
      // also clear old chunks so re-ingest doesn't double up
      await refLib().from("chunks").delete().eq("document_id", id);
      await fetchDocs();
      const r = await runIngest(id);
      toast.success(`Re-ingested: ${r.chunk_count} chunks`);
      await fetchDocs();
    } catch (e: any) {
      toast.error(e.message || "Re-ingest failed");
      await fetchDocs();
    } finally {
      setReingestId(null);
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

  if (authLoading || allowed === null) {
    return <DashboardLayout><div className="p-6 text-sm text-muted-foreground">Loading…</div></DashboardLayout>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!allowed) return <DashboardLayout><div className="p-6 text-sm">Admin access required.</div></DashboardLayout>;

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

        {/* Upload */}
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

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground min-h-[1.25rem]">
                {uploadStage && (uploadBusy ? <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />{uploadStage}</span> : uploadStage)}
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

        {/* Documents */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Documents</CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchDocs} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">No documents yet.</TableCell></TableRow>
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
                    </TableRow>
                    {expanded[d.id] && (
                      <TableRow key={d.id + "-exp"}>
                        <TableCell />
                        <TableCell colSpan={8} className="bg-muted/40">
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
    </DashboardLayout>
  );
}

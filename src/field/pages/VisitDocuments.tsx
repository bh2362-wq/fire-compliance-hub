import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Upload, Trash2, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  VISIT_DOCUMENT_CATEGORIES,
  VisitDocumentCategory,
  VisitDocument,
  fileValidationError,
  listVisitDocuments,
  uploadVisitDocument,
} from "@/services/visitDocumentService";

const RED = "#C22126";

const ACCEPT = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/heic",
].join(",");

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Drop the extension and turn separators into spaces for a sensible default title.
function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || name;
}

interface PendingDoc {
  localId: string;
  file: File;
  category: VisitDocumentCategory;
  title: string;
  documentDate: string;
  status: "editing" | "uploading" | "done" | "error";
  error?: string;
}

export function VisitDocuments() {
  const { visitId } = useParams<{ visitId: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);

  const { data: visit } = useQuery({
    queryKey: ["field-visit-doc-context", visitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_visits")
        .select("id, visit_type, site_id, sites:site_id(customer_id)")
        .eq("id", visitId)
        .single();
      if (error) throw error;
      return data as unknown as {
        id: string;
        visit_type: string | null;
        site_id: string;
        sites: { customer_id: string } | null;
      };
    },
    enabled: !!visitId,
  });

  const { data: docs, refetch } = useQuery({
    queryKey: ["field-visit-documents", visitId],
    queryFn: () => listVisitDocuments(visitId!),
    enabled: !!visitId,
  });

  // Brief: PAVA commissioning visits default to pava_record, everything else
  // to photograph (the most common engineer upload).
  const defaultCategory: VisitDocumentCategory =
    visit?.visit_type === "pava_commissioning" ? "pava_record" : "photograph";

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPickError(null);
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const next: PendingDoc[] = [];
    for (const file of files) {
      const err = fileValidationError(file);
      if (err) {
        setPickError(err);
        continue;
      }
      next.push({
        localId: crypto.randomUUID(),
        file,
        category: defaultCategory,
        title: titleFromFilename(file.name),
        documentDate: todayISO(),
        status: "editing",
      });
    }
    if (next.length) setPending((p) => [...p, ...next]);
  };

  const patchPending = (localId: string, patch: Partial<PendingDoc>) =>
    setPending((p) => p.map((d) => (d.localId === localId ? { ...d, ...patch } : d)));

  const removePending = (localId: string) =>
    setPending((p) => p.filter((d) => d.localId !== localId));

  const saveAll = async () => {
    if (!visit || !visit.sites) return;
    const toUpload = pending.filter((d) => d.status === "editing" || d.status === "error");
    for (const doc of toUpload) {
      if (!doc.title.trim()) {
        patchPending(doc.localId, { status: "error", error: "Title is required" });
        continue;
      }
      patchPending(doc.localId, { status: "uploading", error: undefined });
      try {
        await uploadVisitDocument({
          file: doc.file,
          serviceVisitId: visit.id,
          siteId: visit.site_id,
          customerId: visit.sites.customer_id,
          category: doc.category,
          title: doc.title.trim(),
          documentDate: doc.documentDate,
        });
        patchPending(doc.localId, { status: "done" });
      } catch (e) {
        patchPending(doc.localId, {
          status: "error",
          error: (e as Error).message || "Upload failed",
        });
      }
    }
    await refetch();
    // Clear the ones that succeeded; keep failures on screen for retry.
    setPending((p) => p.filter((d) => d.status !== "done"));
  };

  const hasUploadable = pending.some((d) => d.status === "editing" || d.status === "error");

  return (
    <div className="p-3 space-y-2">
      <div className="bg-white rounded-xl p-3">
        <p className="text-sm font-medium text-zinc-900">Visit documents</p>
        <p className="text-xs text-zinc-500">
          Attach PAVA records, sub-contractor reports, certificates, surveys or photos.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPT}
        onChange={handlePick}
        className="hidden"
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full bg-white rounded-xl p-3 flex items-center gap-3 active:scale-[0.99] transition"
      >
        <Upload className="w-5 h-5" style={{ color: RED }} />
        <div className="text-left flex-1">
          <p className="text-sm font-medium text-zinc-900">Attach document</p>
          <p className="text-[10px] text-zinc-500">PDF, Word, or photo · max 25 MB</p>
        </div>
      </button>

      {pickError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{pickError}</p>
        </div>
      )}

      {/* Pending uploads — per-file tagging */}
      {pending.map((d) => (
        <div key={d.localId} className="bg-white rounded-xl p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-zinc-900 truncate flex-1">{d.file.name}</p>
            {d.status === "uploading" ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            ) : (
              <button onClick={() => removePending(d.localId)} aria-label="Remove">
                <Trash2 className="w-4 h-4 text-zinc-400" />
              </button>
            )}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">Category</label>
            <select
              value={d.category}
              disabled={d.status === "uploading"}
              onChange={(e) =>
                patchPending(d.localId, { category: e.target.value as VisitDocumentCategory })
              }
              className="w-full mt-0.5 border border-zinc-200 rounded-lg px-2 py-2 text-sm"
            >
              {VISIT_DOCUMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">Title</label>
            <input
              value={d.title}
              disabled={d.status === "uploading"}
              onChange={(e) => patchPending(d.localId, { title: e.target.value })}
              className="w-full mt-0.5 border border-zinc-200 rounded-lg px-2 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">Document date</label>
            <input
              type="date"
              value={d.documentDate}
              disabled={d.status === "uploading"}
              onChange={(e) => patchPending(d.localId, { documentDate: e.target.value })}
              className="w-full mt-0.5 border border-zinc-200 rounded-lg px-2 py-2 text-sm"
            />
          </div>

          {d.status === "error" && (
            <p className="text-xs text-red-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {d.error}
            </p>
          )}
        </div>
      ))}

      {hasUploadable && (
        <button
          onClick={saveAll}
          className="w-full text-white rounded-lg py-3 text-sm font-medium active:scale-[0.98] transition"
          style={{ backgroundColor: RED }}
        >
          Save {pending.filter((d) => d.status === "editing" || d.status === "error").length} document(s)
        </button>
      )}

      {/* Already-uploaded documents */}
      <div className="pt-1">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 px-1 mb-1">
          Attached ({docs?.length ?? 0})
        </p>
        {!docs || docs.length === 0 ? (
          <p className="text-xs text-zinc-400 italic px-1 py-2">No documents attached yet.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc: VisitDocument) => (
              <div key={doc.id} className="bg-white rounded-xl p-3 flex items-start gap-3">
                <FileText className="w-5 h-5 flex-shrink-0" style={{ color: RED }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 truncate">{doc.title}</p>
                  <p className="text-[10px] text-zinc-500">
                    {VISIT_DOCUMENT_CATEGORIES.find((c) => c.value === doc.category)?.label ??
                      doc.category}
                    {" · "}
                    {doc.document_date}
                  </p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

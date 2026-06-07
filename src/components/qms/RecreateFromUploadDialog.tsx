import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  createDocument,
  fetchDocumentCategories,
  getLatestDocumentVersionSignedUrl,
  markDocumentObsolete,
  QMSDocument,
} from "@/services/qmsService";

// Why this dialog exists
//   The H&S policy (and likely a few other legacy entries) was added
//   to the QMS library by uploading a PDF rather than typing the body
//   into the standard template. Result: downloads of those docs miss
//   the BHO branding header + the AUTHORISATION block + the director
//   signature added in #191 — auditors see "two different layouts" in
//   the same library.
//
//   This dialog converts an uploaded-file document into a real
//   template document in one click:
//     1. Fetch a short-lived signed URL to the latest version's file
//     2. Extract the text client-side via pdfjs-dist (already a dep)
//     3. Pre-fill the create-document form with the source doc's
//        title / category and the extracted text in `description`
//     4. User reviews + saves → new qms_documents row created via
//        the existing createDocument service (which auto-numbers)
//     5. Source document gets status='obsolete' so it stops showing
//        on the active list. The original upload + version history
//        stays intact for audit traceability.

interface RecreateFromUploadDialogProps {
  source: QMSDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

async function extractPdfText(url: string): Promise<string> {
  // pdfjs-dist is already in the project (AIAssistant uses it for
  // doc analysis). Lazy-imported here so the QMS bundle doesn't
  // ship the worker unless this flow actually runs.
  const pdfjs: any = await import("pdfjs-dist");
  // @ts-ignore — worker URL import is bundler-handled
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Couldn't download the source file (HTTP ${resp.status})`);
  const buf = await resp.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  const max = Math.min(pdf.numPages, 50);
  for (let i = 1; i <= max; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join(" ") + "\n\n";
  }
  return text.trim();
}

export function RecreateFromUploadDialog({ source, open, onOpenChange }: RecreateFromUploadDialogProps) {
  const queryClient = useQueryClient();
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [markObsolete, setMarkObsolete] = useState(true);

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [reviewFreq, setReviewFreq] = useState<number>(12);

  const { data: categories } = useQuery({
    queryKey: ["qms-document-categories"],
    queryFn: fetchDocumentCategories,
    enabled: open,
  });

  // Reset + kick off the extract every time the dialog opens for a
  // new source document.
  useEffect(() => {
    if (!open || !source) return;
    setTitle(source.title);
    setCategoryId(source.category_id ?? "");
    setReviewFreq(source.review_frequency_months ?? 12);
    setDescription(source.description ?? "");
    setExtractError(null);
    setMarkObsolete(true);

    let cancelled = false;
    setExtracting(true);
    (async () => {
      try {
        const file = await getLatestDocumentVersionSignedUrl(source.id);
        if (!file) {
          if (!cancelled) setExtractError("This document has no uploaded file to convert from. You can still create the new template manually.");
          return;
        }
        const text = await extractPdfText(file.url);
        if (cancelled) return;
        // Only overwrite description if we got something useful — keeps
        // any text the user has already typed if the extract is empty.
        if (text && text.length > 0) {
          setDescription((prev) => (prev && prev.trim().length > 0 ? prev : text));
        }
      } catch (e) {
        if (!cancelled) setExtractError(e instanceof Error ? e.message : "Couldn't extract text from the file");
      } finally {
        if (!cancelled) setExtracting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, source]);

  const recreate = useMutation({
    mutationFn: async () => {
      if (!source) throw new Error("No source document");
      if (!title.trim()) throw new Error("Title is required");
      await createDocument({
        title: title.trim(),
        description: description.trim() || null,
        category_id: categoryId || null,
        review_frequency_months: reviewFreq,
        status: "draft",
      });
      if (markObsolete) {
        await markDocumentObsolete(source.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qms-documents"] });
      toast.success("Document recreated", {
        description: markObsolete
          ? "The original was marked obsolete. The new template-based copy will pick up the director signature on download."
          : "The new template-based copy will pick up the director signature on download.",
      });
      onOpenChange(false);
    },
    onError: (e) => {
      const obj = e as { message?: string; details?: string; code?: string };
      toast.error("Couldn't recreate document", {
        description: [obj.message, obj.details, obj.code && `[${obj.code}]`].filter(Boolean).join(" — ")
          || "Unknown error",
      });
    },
    onSettled: () => setSaving(false),
  });

  const handleSave = () => {
    setSaving(true);
    recreate.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" /> Recreate as template document
          </DialogTitle>
          <DialogDescription>
            Converts an uploaded PDF into a template-based QMS document so it picks
            up the BHO header + AUTHORISATION block + director signature on download.
            The original upload + version history is preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {extractError && (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p>{extractError}</p>
            </div>
          )}

          <div>
            <Label htmlFor="rc-title" className="text-xs">Title</Label>
            <Input
              id="rc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="rc-category" className="text-xs">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId} disabled={saving}>
              <SelectTrigger id="rc-category">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {(categories ?? []).map((c: { id: string; name: string }) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="rc-review" className="text-xs">Review frequency (months)</Label>
            <Select value={String(reviewFreq)} onValueChange={(v) => setReviewFreq(Number(v))} disabled={saving}>
              <SelectTrigger id="rc-review">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                <SelectItem value="6">6 months</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="24">24 months</SelectItem>
                <SelectItem value="36">36 months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="rc-body" className="text-xs">
              Document body
              <span className="text-muted-foreground ml-1">
                {extracting
                  ? "(extracting from uploaded PDF…)"
                  : "(extracted from the uploaded PDF — review + edit before saving)"}
              </span>
            </Label>
            {extracting ? (
              <Skeleton className="h-48 w-full mt-1" />
            ) : (
              <Textarea
                id="rc-body"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={14}
                disabled={saving}
                className="font-mono text-xs"
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {description.length.toLocaleString()} characters
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={markObsolete}
              onChange={(e) => setMarkObsolete(e.target.checked)}
              disabled={saving}
            />
            <span>
              Mark the original {source ? <code className="text-xs">{source.document_number}</code> : null} as
              {" "}<strong>obsolete</strong> after saving
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || extracting || !title.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileText className="w-4 h-4 mr-1.5" />}
            Create template document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

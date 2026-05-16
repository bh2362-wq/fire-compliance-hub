/**
 * ImportPriceListPdfDialog.tsx
 *
 * Imports supplier price lists from selectable PDF text or pasted text.
 * The client extracts PDF text first, then sends small text chunks to the
 * extract-pdf-prices edge function to avoid oversized AI requests/rate limits.
 */

import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileText, Trash2, CheckCircle2, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ExtractedRow {
  part_number:  string;
  description:  string;
  manufacturer: string;
  category:     string;
  unit_cost:    number;
  labour_cost:  number;
  selected:     boolean;
}

interface Props {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?:  () => void;
}

const CATEGORIES = [
  "Detector", "Sounder", "VAD", "MCP", "Panel",
  "Cable", "Interface", "Battery", "Other",
];

const TEXT_CHUNK_SIZE = 5500;
const PAUSE_BETWEEN_CHUNKS_MS = 2500;
const MAX_CHUNK_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 5000;

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRateLimitError(message: string): boolean {
  const m = (message || "").toLowerCase();
  return m.includes("429") || m.includes("rate limit") || m.includes("rate_limit");
}

function splitTextIntoChunks(text: string, maxChars = TEXT_CHUNK_SIZE): string[] {
  const cleaned = text.replace(/\r/g, "").trim();
  if (!cleaned) return [];

  const chunks: string[] = [];
  let current = "";

  for (const line of cleaned.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxChars && current) {
      chunks.push(current.trim());
      current = line;
    } else {
      current = next;
    }

    while (current.length > maxChars) {
      chunks.push(current.slice(0, maxChars).trim());
      current = current.slice(maxChars);
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function dedupeRows(rows: ExtractedRow[]): ExtractedRow[] {
  const map = new Map<string, ExtractedRow>();
  rows.forEach(row => {
    const key = row.part_number.trim().toLowerCase();
    if (key) map.set(key, row);
  });
  return Array.from(map.values());
}

async function extractPdfText(file: File, onPage: (page: number, total: number) => void): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  let text = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(" ");
    text += `\n\n--- Page ${pageNumber} ---\n${pageText}`;
    onPage(pageNumber, pdf.numPages);
  }

  return text;
}

export function ImportPriceListPdfDialog({ open, onOpenChange, onSuccess }: Props) {
  const [step,          setStep]         = useState<"upload" | "review" | "done">("upload");
  const [supplierName,  setSupplierName] = useState("");
  const [fileName,      setFileName]     = useState("");
  const [loading,       setLoading]      = useState(false);
  const [rows,          setRows]         = useState<ExtractedRow[]>([]);
  const [saving,        setSaving]       = useState(false);
  const [mode,          setMode]         = useState<"pdf" | "text">("pdf");
  const [pastedText,    setPastedText]   = useState("");
  const [progress,      setProgress]     = useState(0);
  const [progressText,  setProgressText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("upload");
    setSupplierName("");
    setFileName("");
    setRows([]);
    setLoading(false);
    setSaving(false);
    setMode("pdf");
    setPastedText("");
    setProgress(0);
    setProgressText("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function normaliseRows(rawRows: any[]): ExtractedRow[] {
    return rawRows
      .filter(r => r?.part_number && Number(r?.unit_cost) > 0)
      .map((r) => ({
        part_number:  String(r.part_number  || "").trim(),
        description:  String(r.description  || "").trim(),
        manufacturer: String(r.manufacturer || supplierName || "").trim(),
        category:     CATEGORIES.includes(r.category) ? r.category : "Other",
        unit_cost:    Number(r.unit_cost)   || 0,
        labour_cost:  Number(r.labour_cost) || 0,
        selected:     true,
      }));
  }

  async function extractFromText(text: string, sourceName: string) {
    const chunks = splitTextIntoChunks(text);
    if (chunks.length === 0) {
      toast.error("No text found to process");
      return;
    }

    setLoading(true);
    setProgress(10);
    setProgressText(`Processing ${chunks.length} text section${chunks.length !== 1 ? "s" : ""}…`);

    try {
      const extractedRows: ExtractedRow[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunkLabel = `section ${i + 1} of ${chunks.length}`;
        setProgress(15 + Math.round((i / chunks.length) * 75));

        let attempt = 0;
        let success = false;
        let lastError: any = null;

        while (attempt <= MAX_CHUNK_RETRIES && !success) {
          if (attempt === 0) {
            setProgressText(`Extracting prices from ${chunkLabel}…`);
          } else {
            setProgressText(`Retry ${attempt}/${MAX_CHUNK_RETRIES} for ${chunkLabel} (rate limited)…`);
          }

          const { data, error } = await supabase.functions.invoke("extract-pdf-prices", {
            body: {
              emailText: chunks[i],
              filename: sourceName,
              supplierName: supplierName.trim() || undefined,
              chunkSize: TEXT_CHUNK_SIZE,
            },
          });

          const errMessage = error?.message || data?.error || "";
          if (!errMessage) {
            extractedRows.push(...normaliseRows(data?.rows || []));
            success = true;
            break;
          }

          lastError = new Error(errMessage);

          if (!isRateLimitError(errMessage) || attempt >= MAX_CHUNK_RETRIES) {
            throw lastError;
          }

          const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          const totalSeconds = Math.ceil(delayMs / 1000);
          for (let s = totalSeconds; s > 0; s--) {
            setProgressText(`Rate limited on ${chunkLabel} — retry ${attempt + 1}/${MAX_CHUNK_RETRIES} in ${s}s…`);
            await wait(1000);
          }
          attempt++;
        }

        if (!success && lastError) throw lastError;

        if (i < chunks.length - 1) {
          setProgressText(`Section ${i + 1} done (${extractedRows.length} items so far) — pausing before section ${i + 2}…`);
          await wait(PAUSE_BETWEEN_CHUNKS_MS);
        }
      }

      const uniqueRows = dedupeRows(extractedRows);
      setProgress(100);
      setProgressText(`Completed — ${uniqueRows.length} item${uniqueRows.length !== 1 ? "s" : ""} found`);

      if (uniqueRows.length === 0) {
        toast.warning("No priced items found. Check the text contains part numbers and prices.");
        return;
      }

      setRows(uniqueRows);
      setStep("review");
      toast.success(`${uniqueRows.length} item${uniqueRows.length !== 1 ? "s" : ""} extracted — review and confirm`);
    } catch (e: any) {
      console.error("Price list extract error:", e);
      toast.error(`Failed to extract prices: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF file");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("PDF is too large — maximum 20 MB");
      return;
    }

    setFileName(file.name);
    setLoading(true);
    setProgress(5);
    setProgressText("Reading PDF text…");

    try {
      const text = await extractPdfText(file, (page, total) => {
        setProgress(5 + Math.round((page / total) * 20));
        setProgressText(`Reading PDF text — page ${page} of ${total}…`);
      });

      if (text.trim().length < 80) {
        toast.warning("This PDF does not contain enough selectable text. Copy/paste the price list text instead.");
        setMode("text");
        setProgress(0);
        setProgressText("");
        return;
      }

      await extractFromText(text, file.name);
    } catch (e: any) {
      console.error("PDF text read error:", e);
      toast.error("Could not read selectable text from this PDF. Try copying and pasting the price list text.");
      setMode("text");
      setProgress(0);
      setProgressText("");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasteImport() {
    if (pastedText.trim().length < 20) {
      toast.error("Paste the price list text first");
      return;
    }
    setFileName("Pasted price list text");
    await extractFromText(pastedText, "pasted-price-list.txt");
  }

  function toggleRow(i: number) {
    setRows(prev => prev.map((r, idx) =>
      idx === i ? { ...r, selected: !r.selected } : r
    ));
  }

  function toggleAll() {
    const allSelected = rows.every(r => r.selected);
    setRows(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  }

  function deleteRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i));
  }

  function editRow(i: number, field: keyof ExtractedRow, value: string | number) {
    setRows(prev => prev.map((r, idx) =>
      idx === i ? { ...r, [field]: value } : r
    ));
  }

  async function handleSave() {
    const selected = rows.filter(r => r.selected);
    if (selected.length === 0) {
      toast.error("Select at least one item to import");
      return;
    }

    setSaving(true);
    try {
      const upsertRows = selected.map(r => ({
        part_number:   r.part_number,
        description:   r.description,
        manufacturer:  r.manufacturer || supplierName || null,
        category:      r.category || "Other",
        retail_price:  r.unit_cost,
        trade_price:   r.unit_cost,
        supplier_name: supplierName || r.manufacturer || null,
        updated_at:    new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("materials_catalog")
        .upsert(upsertRows, { onConflict: "part_number", ignoreDuplicates: false });

      if (error) throw error;

      toast.success(`${selected.length} items saved to price list`);
      setStep("done");
      onSuccess?.();
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = rows.filter(r => r.selected).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Supplier Price List</DialogTitle>
          <DialogDescription>
            Upload a selectable PDF or paste price-list text. Large imports are split into smaller sections automatically.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Supplier name (optional)</Label>
              <Input
                placeholder="e.g. ADI Global, Black & White Fire, Huvo…"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="max-w-sm"
                disabled={loading}
              />
            </div>

            <div className="inline-flex rounded-sm border border-border bg-muted p-1">
              <Button
                type="button"
                size="sm"
                variant={mode === "pdf" ? "default" : "ghost"}
                onClick={() => setMode("pdf")}
                disabled={loading}
                className="rounded-sm"
              >
                <FileText className="mr-2 h-4 w-4" /> PDF upload
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "text" ? "default" : "ghost"}
                onClick={() => setMode("text")}
                disabled={loading}
                className="rounded-sm"
              >
                <ClipboardList className="mr-2 h-4 w-4" /> Paste text
              </Button>
            </div>

            {loading && (
              <div className="space-y-2 rounded-sm border border-border bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-foreground">{progressText || "Processing…"}</span>
                  <span className="text-muted-foreground">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                {fileName && <p className="text-xs text-muted-foreground truncate">{fileName}</p>}
              </div>
            )}

            {mode === "pdf" ? (
              <div
                onClick={() => !loading && fileRef.current?.click()}
                className={cn(
                  "border-2 border-dashed border-border rounded-sm p-10 text-center transition-colors",
                  loading ? "cursor-not-allowed bg-muted/30" : "cursor-pointer hover:border-primary hover:bg-muted/40"
                )}
              >
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium text-foreground">Importing price list…</p>
                    <p className="text-xs text-muted-foreground">
                      The PDF is read locally, then sent in small sections to avoid rate limits.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Drop PDF here or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-1">Best with selectable text · Scanned PDFs may need paste text · Max 20 MB</p>
                    </div>
                    <Button variant="outline" size="sm" type="button">
                      <Upload className="mr-2 h-4 w-4" /> Choose PDF
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <Textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste copied text from the supplier PDF, invoice, quote or price list…"
                  className="min-h-[260px] font-mono text-xs"
                  disabled={loading}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {pastedText.trim().length.toLocaleString()} characters pasted. Long text is processed section by section.
                  </p>
                  <Button type="button" onClick={handlePasteImport} disabled={loading || pastedText.trim().length < 20}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-2 h-4 w-4" />}
                    Extract Prices
                  </Button>
                </div>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFile}
              disabled={loading}
            />
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col flex-1 min-h-0 gap-3">
            <div className="flex items-center justify-between flex-shrink-0 gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{rows.length} extracted</Badge>
                <Badge variant="secondary">{selectedCount} selected</Badge>
                {supplierName && <Badge variant="secondary">{supplierName}</Badge>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset}>
                  Start Over
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || selectedCount === 0}
                >
                  {saving
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                    : <><CheckCircle2 className="mr-2 h-4 w-4" /> Save {selectedCount} items</>}
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground flex-shrink-0">
              Review extracted items. Edit any values, deselect rows to skip, then save to update the price list.
            </p>

            <div className="flex-1 overflow-auto border border-border rounded-sm min-h-0">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-muted text-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left w-8">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && rows.every(r => r.selected)}
                        onChange={toggleAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-2 text-left w-28">Part No.</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-left w-24">Manufacturer</th>
                    <th className="px-3 py-2 text-left w-24">Category</th>
                    <th className="px-3 py-2 text-right w-20">Unit Cost</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={`${row.part_number}-${i}`}
                      className={cn(
                        "border-b border-border hover:bg-muted/40",
                        !row.selected && "opacity-40",
                        i % 2 === 0 ? "bg-background" : "bg-muted/20"
                      )}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={() => toggleRow(i)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.part_number}
                          onChange={(e) => editRow(i, "part_number", e.target.value)}
                          className="h-7 text-xs font-mono p-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.description}
                          onChange={(e) => editRow(i, "description", e.target.value)}
                          className="h-7 text-xs p-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={row.manufacturer}
                          onChange={(e) => editRow(i, "manufacturer", e.target.value)}
                          className="h-7 text-xs p-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.category}
                          onChange={(e) => editRow(i, "category", e.target.value)}
                          className="h-7 text-xs border border-input rounded-sm px-1 w-full bg-background text-foreground"
                        >
                          {CATEGORIES.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number" min={0} step={0.01}
                          value={row.unit_cost}
                          onChange={(e) => editRow(i, "unit_cost", parseFloat(e.target.value) || 0)}
                          className="h-7 text-xs p-1 text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => deleteRow(i)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <div className="text-center">
              <p className="font-semibold text-foreground">Price list imported</p>
              <p className="text-sm text-muted-foreground mt-1">
                Items have been added to your materials catalog. They will appear in device price lookups.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Import Another</Button>
              <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

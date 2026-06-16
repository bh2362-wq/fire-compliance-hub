import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Upload, FileText, Trash2, Loader2, Sparkles, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  BidDocument, BidDocType, DOC_TYPE_LABELS,
  listBidDocuments, uploadBidDocument, updateBidDocument, deleteBidDocument,
} from "@/services/bidDocumentService";
import { analysePack } from "@/services/bidService";

interface BidPackPanelProps {
  bidId: string;
  onAnalysed: () => void;
}

const statusBadge: Record<BidDocument["status"], { label: string; className: string; icon: typeof CheckCircle2 }> = {
  uploaded: { label: "Uploaded", className: "bg-muted text-muted-foreground", icon: FileText },
  extracted: { label: "Text ready", className: "bg-success/10 text-success border-success/20", icon: CheckCircle2 },
  scanned: { label: "Scanned — no text", className: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: AlertTriangle },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
};

export function BidPackPanel({ bidId, onAnalysed }: BidPackPanelProps) {
  const [docs, setDocs] = useState<BidDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    try { setDocs(await listBidDocuments(bidId)); }
    catch (e: any) { toast.error(e.message || "Failed to load documents"); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, [bidId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    let ok = 0, scanned = 0;
    try {
      for (const file of Array.from(files)) {
        try {
          const doc = await uploadBidDocument(bidId, file);
          if (doc.status === "scanned") scanned++; else ok++;
        } catch (e: any) {
          toast.error(`${file.name}: ${e.message || "upload failed"}`);
        }
      }
      await refresh();
      if (ok) toast.success(`${ok} document${ok === 1 ? "" : "s"} added`);
      if (scanned) toast.warning(`${scanned} scanned PDF(s) had no extractable text`);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const handleAnalyse = async () => {
    const withText = docs.filter((d) => d.status === "extracted");
    if (!withText.length) { toast.error("Upload at least one text-based PDF first"); return; }
    setAnalysing(true);
    try {
      const res = await analysePack(bidId);
      toast.success(
        res.questions_inserted > 0
          ? `Pack analysed — ${res.questions_inserted} questions extracted`
          : "Pack analysed",
      );
      onAnalysed();
    } catch (e: any) {
      console.error("Analyse pack failed:", e);
      toast.error(e.message || "Analysis failed");
    } finally {
      setAnalysing(false);
    }
  };

  const readyCount = docs.filter((d) => d.status === "extracted").length;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">Tender pack</h3>
          <p className="text-sm text-muted-foreground">Upload the ITT, spec, contract and questionnaires. Text is read in your browser.</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInput} type="file" multiple accept=".pdf,.txt,.md,.csv" className="hidden"
            onChange={(e) => handleFiles(e.target.files)} />
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Upload files
          </Button>
          <Button onClick={handleAnalyse} disabled={analysing || readyCount === 0}>
            {analysing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {analysing ? "Analysing…" : "Analyse pack"}
          </Button>
        </div>
      </div>

      {analysing && (
        <p className="text-xs text-muted-foreground">
          Claude is reading the pack — this can take 30–90 seconds for a large tender.
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : docs.length === 0 ? (
        <label
          className="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/40 transition"
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm">Drop the tender pack here, or click Upload files</p>
          <p className="text-xs text-muted-foreground mt-1">PDF works best (text is extracted automatically)</p>
        </label>
      ) : (
        <div className="divide-y rounded-lg border">
          {docs.map((doc) => {
            const s = statusBadge[doc.status];
            const Icon = s.icon;
            return (
              <div key={doc.id} className="flex items-center gap-3 p-3">
                <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{doc.file_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className={`text-[10px] gap-1 ${s.className}`}>
                      <Icon className="w-3 h-3" />{s.label}
                    </Badge>
                    {doc.page_count != null && <span className="text-[10px] text-muted-foreground">{doc.page_count}p</span>}
                    {doc.char_count != null && <span className="text-[10px] text-muted-foreground">{(doc.char_count / 1000).toFixed(0)}k chars</span>}
                  </div>
                </div>
                <Select value={doc.doc_type} onValueChange={async (v) => {
                  await updateBidDocument(doc.id, { doc_type: v as BidDocType });
                  setDocs((ds) => ds.map((d) => d.id === doc.id ? { ...d, doc_type: v as BidDocType } : d));
                }}>
                  <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DOC_TYPE_LABELS) as BidDocType[]).map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">{DOC_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                  onClick={async () => {
                    if (!window.confirm(`Delete ${doc.file_name}?`)) return;
                    try { await deleteBidDocument(doc); setDocs((ds) => ds.filter((d) => d.id !== doc.id)); }
                    catch (e: any) { toast.error(e.message || "Delete failed"); }
                  }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

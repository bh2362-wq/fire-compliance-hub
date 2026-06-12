import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, FileType, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  useQuotationFull,
  useGenerateQuoteDocx,
  useConvertQuotePdf,
  downloadSignedUrl,
} from "@/features/quotes/useQuoteGeneration";
import { ScopeWriterDialog } from "./ScopeWriterDialog";
import { extractEdgeError } from "@/lib/edgeError";

export function QuoteActions({
  quotationId,
  onBeforeAction,
}: {
  quotationId: string;
  /** Called immediately before Export to Word / Generate PDF runs.
      Return false to abort the action (e.g. save failed). The dialog
      hosting QuoteActions uses this to flush unsaved edits to the DB
      before the export reads from it — otherwise useQuotationFull's
      cached pre-edit row is what gets rendered into the document. */
  onBeforeAction?: () => Promise<boolean>;
}) {
  const { data: q, refetch } = useQuotationFull(quotationId);
  const docx = useGenerateQuoteDocx();
  const pdf = useConvertQuotePdf();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Wraps onBeforeAction + a forced refetch so the data passed to the
  // mutation always reflects the latest DB state. Returns the fresh
  // quotation or null when the action should abort.
  const flushAndReload = async () => {
    if (onBeforeAction) {
      const ok = await onBeforeAction();
      if (!ok) return null;
    }
    const { data: fresh } = await refetch();
    return fresh ?? q ?? null;
  };

  const onExportDocx = async () => {
    const fresh = await flushAndReload();
    if (!fresh) return;
    try {
      const r = await docx.mutateAsync(fresh);
      await downloadSignedUrl(r.signed_url, `${fresh.quotation_number}.docx`);
      toast.success("Word document downloaded");
      refetch();
    } catch (e) {
      const detail = await extractEdgeError(e, "Word export failed");
      toast.error("Word generation failed", { description: detail, duration: 10000 });
    }
  };

  const onGeneratePdf = async () => {
    const fresh = await flushAndReload();
    if (!fresh) return;
    setPdfBusy(true);
    try {
      // Always regenerate the DOCX first. Reusing latest_docx_path
      // means a previously-broken render gets re-converted forever,
      // producing the same Office "cannotOpenFile" 406 every time.
      const d = await docx.mutateAsync(fresh);
      const docxPath = d.storage_path;
      const r = await pdf.mutateAsync({ docx_storage_path: docxPath, quotation_id: fresh.id });
      await downloadSignedUrl(r.signed_url, `${fresh.quotation_number}.pdf`);
      toast.success("PDF downloaded");
      refetch();
    } catch (e) {
      const detail = await extractEdgeError(e, "PDF generation failed");
      toast.error("PDF generation failed", { description: detail, duration: 10000 });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1" onClick={() => setScopeOpen(true)}>
          <Sparkles className="w-4 h-4" /> Generate scope with AI
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={onExportDocx} disabled={docx.isPending || !q}>
          {docx.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Export to Word
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={onGeneratePdf} disabled={pdfBusy || !q}>
          {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileType className="w-4 h-4" />} Generate PDF
        </Button>
      </div>
      <ScopeWriterDialog
        open={scopeOpen}
        onOpenChange={setScopeOpen}
        quotationId={quotationId}
        onAccepted={() => refetch()}
      />
    </>
  );
}

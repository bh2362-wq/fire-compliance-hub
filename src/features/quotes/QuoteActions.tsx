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

export function QuoteActions({ quotationId }: { quotationId: string }) {
  const { data: q, refetch } = useQuotationFull(quotationId);
  const docx = useGenerateQuoteDocx();
  const pdf = useConvertQuotePdf();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const onExportDocx = async () => {
    if (!q) return;
    try {
      const r = await docx.mutateAsync(q);
      await downloadSignedUrl(r.signed_url, `${q.quotation_number}.docx`);
      toast.success("Word document downloaded");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Word export failed");
    }
  };

  const onGeneratePdf = async () => {
    if (!q) return;
    setPdfBusy(true);
    try {
      let docxPath = q.latest_docx_path;
      if (!docxPath) {
        const d = await docx.mutateAsync(q);
        docxPath = d.storage_path;
      }
      const r = await pdf.mutateAsync({ docx_storage_path: docxPath, quotation_id: q.id });
      await downloadSignedUrl(r.signed_url, `${q.quotation_number}.pdf`);
      toast.success("PDF downloaded");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "PDF generation failed");
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

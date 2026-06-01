// Cause & Effect + Audibility test report — DOCX + PDF generation
// hooks. Mirrors src/features/quotes/useQuoteGeneration.ts so the two
// report pipelines look identical to a reader. Backed by the Supabase
// edge functions `generate-cause-effect-docx` + `convert-quote-pdf`
// (the latter generalised in PR #79 to accept a `bucket` param).
//
// Deploy marker: redeploy trigger 2026-06-01 (Azure SWA didn't pick up
// the PR #80 merge — pushing a no-op edit here to force a fresh build).

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  loadCauseEffectReportBundle,
  type CauseEffectReportBundle,
} from "@/services/causeEffectTestService";
import { generateCauseEffectReportPDF } from "@/lib/causeEffectReportPdfGenerator";

interface DocxResponse {
  storage_path: string;
  signed_url: string;
  expires_at: string;
  file_size_bytes: number;
  bucket: string;
}

interface PdfResponse {
  pdf_storage_path: string;
  signed_url: string;
  expires_at: string;
  file_size_bytes: number;
}

export function useGenerateCauseEffectDocx() {
  return useMutation({
    mutationFn: async (bundle: CauseEffectReportBundle): Promise<DocxResponse> => {
      const { data, error } = await supabase.functions.invoke(
        "generate-cause-effect-docx",
        { body: bundle },
      );
      if (error) throw error;
      return data as DocxResponse;
    },
  });
}

export function useConvertCePdf() {
  return useMutation({
    mutationFn: async (payload: { docx_storage_path: string }): Promise<PdfResponse> => {
      const { data, error } = await supabase.functions.invoke("convert-quote-pdf", {
        body: { ...payload, bucket: "ce-outputs" },
      });
      if (error) throw error;
      return data as PdfResponse;
    },
  });
}

// One-shot helper: takes a report id, loads the bundle, generates the
// DOCX, converts to PDF, downloads the file. Used by the wizard
// sign-off step and the Reports list — exactly the same pattern the
// jsPDF generator used to be invoked with.
export async function downloadCauseEffectReportPdf(reportId: string): Promise<void> {
  const bundle = await loadCauseEffectReportBundle(reportId);

  try {
    const docxRes = await supabase.functions.invoke("generate-cause-effect-docx", { body: bundle });
    if (docxRes.error) throw new Error(`DOCX generation failed: ${docxRes.error.message}`);
    const docx = docxRes.data as DocxResponse | null;
    if (!docx?.storage_path) throw new Error("DOCX generator did not return a storage path");

    const pdfRes = await supabase.functions.invoke("convert-quote-pdf", {
      body: { docx_storage_path: docx.storage_path, bucket: "ce-outputs" },
    });
    if (pdfRes.error) throw new Error(`PDF conversion failed: ${pdfRes.error.message}`);
    const pdf = pdfRes.data as PdfResponse | null;
    if (!pdf?.signed_url) throw new Error("PDF converter did not return a signed URL");

    // Fetch + trigger a browser download. Filename mirrors the jsPDF
    // generator's convention: CE_Audibility_{jobNumber}_{date}.pdf.
    const jobRef = bundle.visit.job_number ?? bundle.report.id.slice(0, 8);
    const dateStr = bundle.visit.visit_date?.replace(/-/g, "") ?? "report";
    const filename = `CE_Audibility_${jobRef}_${dateStr}.pdf`;

    const res = await fetch(pdf.signed_url);
    if (!res.ok) throw new Error(`Failed to download generated PDF: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.warn("Cloud DOCX-to-PDF conversion unavailable; using local PDF generator", err);
    await generateCauseEffectReportPDF(bundle);
  }
}

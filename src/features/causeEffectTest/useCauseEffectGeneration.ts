// Cause & Effect + Audibility test report — DOCX + PDF generation
// hooks. Mirrors src/features/quotes/useQuoteGeneration.ts so the two
// report pipelines look identical to a reader. Backed by the Supabase
// edge functions `generate-cause-effect-docx` + `convert-quote-pdf`
// (the latter generalised in PR #79 to accept a `bucket` param).
//
// Deploy marker: redeploy trigger 2026-06-01 (Azure SWA didn't pick up
// the PR #80 merge — pushing a no-op edit here to force a fresh build).

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
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

// supabase.functions.invoke() returns a generic "Edge Function returned
// a non-2xx status code" error message that hides the actual body the
// function emitted. The real error string sits on error.context (a
// Response) — read it so callers can show the user what specifically
// went wrong (MS Graph credentials, bucket missing, etc) rather than
// the supabase wrapper's opaque message.
async function readFunctionError(err: unknown, fallback: string): Promise<string> {
  if (!err || typeof err !== "object") return fallback;
  const e = err as { message?: string; context?: unknown };
  // Try to read the Response body from context if it's there.
  try {
    const ctx = e.context;
    if (ctx && typeof ctx === "object" && "json" in ctx && typeof (ctx as { json: () => Promise<unknown> }).json === "function") {
      const body = await (ctx as { json: () => Promise<unknown> }).json();
      if (body && typeof body === "object" && "error" in body) {
        return String((body as { error: unknown }).error);
      }
    }
  } catch {
    // body wasn't JSON or already consumed — fall through
  }
  return e.message ?? fallback;
}

// One-shot helper: takes a report id, loads the bundle, generates the
// DOCX, converts to PDF, downloads the file. Used by the wizard
// sign-off step and the Reports list — exactly the same pattern the
// jsPDF generator used to be invoked with.
export async function downloadCauseEffectReportPdf(reportId: string): Promise<void> {
  const bundle = await loadCauseEffectReportBundle(reportId);

  try {
    const docxRes = await supabase.functions.invoke("generate-cause-effect-docx", { body: bundle });
    if (docxRes.error) {
      const msg = await readFunctionError(docxRes.error, "Unknown DOCX error");
      throw new Error(`DOCX generation failed: ${msg}`);
    }
    const docx = docxRes.data as DocxResponse | null;
    if (!docx?.storage_path) throw new Error("DOCX generator did not return a storage path");

    // Log signature embed diagnostics conspicuously so we can see why
    // signatures didn't land without needing Supabase function logs.
    const sigDiag = (docx as unknown as { signature_diagnostics?: Record<string, unknown> }).signature_diagnostics;
    if (sigDiag) {
      console.log("[C&E DOCX] Signature embed diagnostics:", sigDiag);
    }

    const pdfRes = await supabase.functions.invoke("convert-quote-pdf", {
      body: { docx_storage_path: docx.storage_path, bucket: "ce-outputs" },
    });
    if (pdfRes.error) {
      const msg = await readFunctionError(pdfRes.error, "Unknown PDF conversion error");
      throw new Error(`PDF conversion failed: ${msg}`);
    }
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
    // The cloud DOCX→PDF chain failed. We still hand the engineer A
    // PDF via the legacy in-browser jsPDF generator so they're never
    // stuck — but make it visible (toast warning + console error)
    // so a deploy/credentials/bucket regression doesn't silently
    // ship the old-style report indefinitely.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Cloud DOCX-to-PDF conversion failed; falling back to local PDF generator. Error:", err);
    toast.warning("Using legacy PDF format", {
      description: `Cloud generator unavailable: ${msg}. Investigating.`,
      duration: 10_000,
    });
    await generateCauseEffectReportPDF(bundle);
  }
}

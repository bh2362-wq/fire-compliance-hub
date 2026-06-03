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

function addDownloadParam(signedUrl: string, filename: string): string {
  try {
    const url = new URL(signedUrl);
    url.searchParams.set("download", filename);
    return url.toString();
  } catch {
    const sep = signedUrl.includes("?") ? "&" : "?";
    return `${signedUrl}${sep}download=${encodeURIComponent(filename)}`;
  }
}

function triggerBrowserDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = addDownloadParam(url, filename);
  a.download = filename;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
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
  // Sanity probe: prove this version of the client code is actually
  // running. If the user clicks Generate PDF and nothing turns up
  // in the console after this line, the Azure SWA bundle is still
  // pre-PR-104 — i.e. cache or deploy lag.
  console.log("[C&E PDF] downloadCauseEffectReportPdf invoked", {
    reportId,
    engineer_signature_set: !!(bundle.report as { engineer_signature?: unknown }).engineer_signature,
    engineer_signature_starts: ((bundle.report as { engineer_signature?: unknown }).engineer_signature as string | undefined)?.slice?.(0, 40),
    client_signature_set: !!(bundle.report as { client_signature?: unknown }).client_signature,
    client_signature_starts: ((bundle.report as { client_signature?: unknown }).client_signature as string | undefined)?.slice?.(0, 40),
    // Pre-flight counts so a "section X blank" report can be diagnosed
    // by comparing client-side bundle counts against the
    // section_diagnostics the edge function echoes back.
    bundle_counts: {
      outputs: bundle.outputs.length,
      readings: bundle.readings.length,
      issues: bundle.issues.length,
      remedials: bundle.remedials.length,
      deviceTests: bundle.deviceTests.length,
    },
  });

  try {
    const docxRes = await supabase.functions.invoke("generate-cause-effect-docx", { body: bundle });
    if (docxRes.error) {
      const msg = await readFunctionError(docxRes.error, "Unknown DOCX error");
      throw new Error(`DOCX generation failed: ${msg}`);
    }
    const docx = docxRes.data as DocxResponse | null;
    if (!docx?.storage_path) throw new Error("DOCX generator did not return a storage path");

    // Aggressive logging so we can spot deploy lag — log the WHOLE
    // response shape from generate-cause-effect-docx. Old function
    // versions return no signature_diagnostics field; new ones do.
    // Either way the engineer can pop DevTools and see exactly what
    // came back without needing Supabase function logs access.
    console.log("[C&E DOCX] generate-cause-effect-docx response:", docx);
    // Mobile-visible section diagnostics — flag any section where the
    // client sent data but the function rendered zero rows. Most
    // common cause of "§X is blank in the PDF" reports.
    const secDiag = (docx as unknown as { section_diagnostics?: {
      outputs_rendered: number;
      readings_received: number;
      readings_rendered: number;
      ce_issues_rendered: number;
      aud_issues_rendered: number;
      remedials_rendered: number;
    } }).section_diagnostics;
    if (secDiag) {
      console.log("[C&E DOCX] Section diagnostics:", secDiag);
      const sentReadings = bundle.readings.length;
      if (sentReadings === 0 && secDiag.readings_received === 0) {
        toast.info("No sound-level readings on this report", {
          description: "§4.2 will be empty. Add readings in the wizard's Audibility step before generating.",
          duration: 8_000,
        });
      } else if (sentReadings > 0 && secDiag.readings_rendered === 0) {
        toast.warning("§4.2 rendered empty", {
          description: `${sentReadings} reading row(s) sent but all were blank (no location or measurements). Open each row in the wizard and fill in location + dB.`,
          duration: 12_000,
        });
      }
    }
    const sigDiag = (docx as unknown as { signature_diagnostics?: {
      engineer_provided: boolean; engineer_is_data_url: boolean; engineer_embedded: boolean; engineer_reason?: string;
      client_provided: boolean; client_is_data_url: boolean; client_embedded: boolean; client_reason?: string;
    } }).signature_diagnostics;
    if (sigDiag) {
      console.log("[C&E DOCX] Signature embed diagnostics:", sigDiag);
      // Mobile-visible diagnostic: when a signature was provided but
      // didn't embed, surface the reason via toast. Means engineers
      // on mobile can see what went wrong without DevTools. Stays
      // quiet on the happy path (both signatures embedded, or none
      // provided).
      const issues: string[] = [];
      if (sigDiag.engineer_provided && !sigDiag.engineer_embedded) {
        issues.push(`Engineer: ${sigDiag.engineer_reason ?? "unknown reason"}`);
      }
      if (sigDiag.client_provided && !sigDiag.client_embedded) {
        issues.push(`Client: ${sigDiag.client_reason ?? "unknown reason"}`);
      }
      if (issues.length > 0) {
        toast.warning("Signatures didn't embed", {
          description: issues.join("  ·  "),
          duration: 15_000,
        });
      }
    } else {
      console.warn(
        "[C&E DOCX] No signature_diagnostics field — the edge function deployed on Supabase " +
        "is still the older version. Wait for Lovable to redeploy or manually retrigger the function.",
      );
      toast.info("New signature embedder hasn't deployed yet", {
        description: "PDF generated with the old pipeline. Signatures may not appear. Try again in a minute.",
        duration: 8_000,
      });
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
    // generator's convention: {jobNumber}.pdf.
    const jobRef = bundle.visit.job_number ?? bundle.report.id.slice(0, 8);
    const filename = `${jobRef}.pdf`;

    triggerBrowserDownload(pdf.signed_url, filename);
    toast.success("PDF ready", { description: "Download started in a new tab if your browser blocks direct downloads." });
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

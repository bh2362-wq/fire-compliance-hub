import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildCalloutReportInput } from "./calloutReportService";

// Frontend wrapper around the generate-callout-docx edge function +
// the cloud DOCX→PDF chain (convert-quote-pdf with bucket override).
// Mirrors the C&E pattern (useCauseEffectGeneration.ts).
//
// Two surfaces:
//   downloadCalloutReportDocx — DOCX only, in-line base64 path.
//   downloadCalloutReportPdfViaCloud — DOCX→PDF chain via MS Graph,
//                                       returns + downloads the PDF.

interface SignatureDiagnostics {
  engineer_provided?: boolean;
  engineer_is_data_url?: boolean;
  engineer_embedded?: boolean;
  engineer_reason?: string;
  client_provided?: boolean;
  client_is_data_url?: boolean;
  client_embedded?: boolean;
  client_reason?: string;
}

interface DocxResponse {
  storage_path?: string | null;
  signed_url?: string | null;
  bucket?: string;
  docx_base64?: string;
  diagnostics?: {
    template_bytes?: number;
    output_bytes?: number;
    fault_narrative_filled?: boolean;
    storage_upload_error?: string | null;
  };
  signature_diagnostics?: SignatureDiagnostics;
}

// Surface a toast warning when a signature was captured by the wizard
// but didn't make it into the file. Quiet on the happy path (both
// embedded, or neither provided) — only fires when there's something
// to investigate. Mirrors the C&E toast wording.
function reportSignatureDiagnostics(sigDiag?: SignatureDiagnostics): void {
  if (!sigDiag) return;
  console.log("[Callout DOCX] signature embed:", sigDiag);
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
}

interface PdfResponse {
  pdf_storage_path?: string;
  signed_url?: string;
  expires_at?: string;
  file_size_bytes?: number;
}

function base64ToBlob(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Defer revoke so the browser can complete the navigation. 0ms
  // queue-tick is enough; longer timeouts just hold the blob in
  // memory unnecessarily.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * One-shot: load the bundle, invoke the edge function, download the
 * resulting DOCX. Filename uses the callout ref (BHO-CO-<job-or-id>).
 */
export async function downloadCalloutReportDocx(visitId: string): Promise<void> {
  const bundle = await buildCalloutReportInput(visitId);

  const res = await supabase.functions.invoke("generate-callout-docx", {
    body: bundle,
  });
  if (res.error) {
    throw new Error(
      `Callout DOCX generation failed: ${res.error.message ?? "Unknown error"}`,
    );
  }
  const data = res.data as DocxResponse | null;
  if (!data?.docx_base64) {
    throw new Error("Callout DOCX generator returned no document");
  }
  // Diagnostics in console so deploy-lag investigations have a
  // breadcrumb without needing Supabase function logs access. Stays
  // quiet on the happy path beyond a single log line. Signature
  // diagnostics get their own toast when something was captured but
  // didn't embed.
  console.log("[Callout DOCX] generate-callout-docx response:", data.diagnostics);
  reportSignatureDiagnostics(data.signature_diagnostics);

  const blob = base64ToBlob(data.docx_base64);
  triggerDownload(blob, `${bundle.ref}.docx`);
}

/**
 * One-shot: load the bundle, invoke generate-callout-docx so the
 * DOCX lands in callout-outputs storage, then invoke convert-quote-pdf
 * (with bucket override) to render the PDF. Triggers a browser
 * download of the resulting PDF, named after the callout ref.
 *
 * Throws on any failure so callers can fall back to the legacy
 * in-browser jsPDF generator — the CalloutWizard does exactly that.
 */
export async function downloadCalloutReportPdfViaCloud(visitId: string): Promise<void> {
  const bundle = await buildCalloutReportInput(visitId);

  const docxRes = await supabase.functions.invoke("generate-callout-docx", {
    body: bundle,
  });
  if (docxRes.error) {
    throw new Error(
      `Callout DOCX generation failed: ${docxRes.error.message ?? "Unknown error"}`,
    );
  }
  const docx = docxRes.data as DocxResponse | null;
  if (!docx?.storage_path) {
    // Edge function ran but the storage upload failed — diagnostics
    // carries the reason. Surface it so the fallback toast on the
    // caller's side has something useful to print.
    const reason = docx?.diagnostics?.storage_upload_error ?? "unknown";
    throw new Error(`Callout DOCX upload to storage failed: ${reason}`);
  }
  console.log("[Callout PDF] generate-callout-docx diagnostics:", docx.diagnostics);
  reportSignatureDiagnostics(docx.signature_diagnostics);

  const pdfRes = await supabase.functions.invoke("convert-quote-pdf", {
    body: {
      docx_storage_path: docx.storage_path,
      bucket: docx.bucket ?? "callout-outputs",
    },
  });
  if (pdfRes.error) {
    throw new Error(
      `Callout PDF conversion failed: ${pdfRes.error.message ?? "Unknown error"}`,
    );
  }
  const pdf = pdfRes.data as PdfResponse | null;
  if (!pdf?.signed_url) {
    throw new Error("Callout PDF converter returned no signed URL");
  }

  // Fetch the PDF bytes via the signed URL then trigger a browser
  // download. Going via fetch (rather than navigating to the signed
  // URL) lets us name the file consistently and avoids the inline
  // PDF viewer hijack on some browsers.
  const resp = await fetch(pdf.signed_url);
  if (!resp.ok) throw new Error(`Couldn't fetch generated PDF (${resp.status})`);
  const blob = await resp.blob();
  triggerDownload(blob, `${bundle.ref}.pdf`);
}

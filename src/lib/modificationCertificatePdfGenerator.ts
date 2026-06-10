/**
 * BS 5839-1 Modification Certificate PDF Generator (FD/04).
 *
 * Cloud-rendered: invokes the generate-modification-cert-docx edge
 * function with the SmartForm payload, then routes the resulting
 * DOCX through convert-quote-pdf (MS Graph headless converter) for
 * the PDF byte stream. This puts the Modification cert on the same
 * DOCX → PDF chain as Installation / Commissioning / Acceptance /
 * Callout / Quotation, so the visual is consistent across the cert
 * family.
 *
 * Function signature preserved — { base64, fileName } — so existing
 * callers in SmartForms.tsx, completeWorkReport.ts, etc., need no
 * changes.
 *
 * Auto-download: when the generator runs from the SmartForm (i.e.
 * the user clicked Generate PDF), the existing UI flow saves the
 * base64 to the submission and triggers a download itself. This
 * function just returns the bytes — same contract as the old jsPDF
 * path.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ModificationPayload } from "@/services/newCertificateService";

interface DocxResponse {
  cert_type?: string;
  certificate_number?: string;
  storage_path?: string | null;
  signed_url?: string | null;
  bucket?: string;
  docx_base64?: string;
  diagnostics?: {
    template_bytes?: number;
    output_bytes?: number;
    storage_upload_error?: string | null;
  };
}

interface PdfResponse {
  pdf_storage_path?: string;
  signed_url?: string;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generateModificationCertificatePDF(
  payload: ModificationPayload,
  _options?: { autoSign?: boolean },
): Promise<{ base64: string; fileName: string }> {
  // 1. Render the Word doc from the template via the edge function.
  const docxRes = await supabase.functions.invoke("generate-modification-cert-docx", {
    body: { payload },
  });
  if (docxRes.error) {
    throw new Error(`Modification cert DOCX render failed: ${docxRes.error.message ?? "Unknown error"}`);
  }
  const docx = docxRes.data as DocxResponse | null;
  if (!docx?.storage_path) {
    const reason = docx?.diagnostics?.storage_upload_error ?? "no storage path returned";
    throw new Error(`Modification cert DOCX upload failed: ${reason}`);
  }

  // 2. Convert to PDF via the shared MS Graph chain — same converter as
  //    quotes, callouts, and the BS 5839-1 install/commission certs.
  const pdfRes = await supabase.functions.invoke("convert-quote-pdf", {
    body: {
      docx_storage_path: docx.storage_path,
      bucket: docx.bucket ?? "bs5839-cert-outputs",
    },
  });
  if (pdfRes.error) {
    throw new Error(`Modification cert PDF conversion failed: ${pdfRes.error.message ?? "Unknown"}`);
  }
  const pdf = pdfRes.data as PdfResponse | null;
  if (!pdf?.signed_url) {
    throw new Error("PDF converter returned no signed URL");
  }

  // 3. Fetch the PDF bytes and return base64 so the SmartForm flow can
  //    download / attach / email it. Filename mirrors the cert ref.
  const resp = await fetch(pdf.signed_url);
  if (!resp.ok) throw new Error(`Couldn't fetch generated PDF (${resp.status})`);
  const blob = await resp.blob();
  const base64 = await blobToBase64(blob);

  const fileName = `${docx.certificate_number ?? payload.certificate_reference ?? "Modification-Cert"}.pdf`;
  return { base64, fileName };
}

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Frontend wrapper around the generate-bs5839-cert-docx edge function.
// Mirrors the callout DOCX service — base64-in-body for direct
// download, storage path returned alongside for the cloud DOCX→PDF
// chain (convert-quote-pdf with bucket: "bs5839-cert-outputs").
//
// Input is just { cert_id } (+ optional panel_id for multi-panel
// battery calcs). The edge function loads everything from the DB
// using the service role.

interface DocxResponse {
  storage_path?: string | null;
  signed_url?: string | null;
  bucket?: string;
  docx_base64?: string;
  cert_type?: string;
  certificate_number?: string;
  diagnostics?: {
    template_bytes?: number;
    output_bytes?: number;
    storage_upload_error?: string | null;
  };
}

interface PdfResponse {
  pdf_storage_path?: string;
  signed_url?: string;
  expires_at?: string;
  file_size_bytes?: number;
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

interface DownloadOpts {
  /** Set for multi-panel battery calcs when picking a specific row. */
  panelId?: string;
}

/**
 * One-shot: invoke the edge function, base64-decode the DOCX,
 * trigger a browser download. Filename: <certificate_number>.docx.
 */
export async function downloadBs5839CertDocx(
  certId: string,
  opts: DownloadOpts = {},
): Promise<void> {
  const { data, error } = await supabase.functions.invoke("generate-bs5839-cert-docx", {
    body: { cert_id: certId, panel_id: opts.panelId ?? null },
  });
  if (error) {
    throw new Error(
      `BS 5839-1 cert DOCX generation failed: ${error.message ?? "Unknown error"}`,
    );
  }
  const res = data as DocxResponse | null;
  if (!res?.docx_base64) {
    throw new Error("Edge function returned no DOCX bytes");
  }
  console.log("[BS 5839-1 DOCX]", res.diagnostics);

  const blob = base64ToBlob(
    res.docx_base64,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  const filename = res.certificate_number
    ? `${res.certificate_number}.docx`
    : `${res.cert_type ?? "bs5839"}-${certId.slice(0, 8)}.docx`;
  triggerDownload(blob, filename);
}

/**
 * DOCX → PDF chain via convert-quote-pdf (MS Graph headless
 * converter). Returns once the PDF has downloaded. Throws on any
 * failure so callers can fall back to the DOCX path.
 */
export async function downloadBs5839CertPdfViaCloud(
  certId: string,
  opts: DownloadOpts = {},
): Promise<void> {
  const docxRes = await supabase.functions.invoke("generate-bs5839-cert-docx", {
    body: { cert_id: certId, panel_id: opts.panelId ?? null },
  });
  if (docxRes.error) {
    throw new Error(
      `BS 5839-1 cert DOCX generation failed: ${docxRes.error.message ?? "Unknown"}`,
    );
  }
  const docx = docxRes.data as DocxResponse | null;
  if (!docx?.storage_path) {
    const reason = docx?.diagnostics?.storage_upload_error ?? "unknown";
    throw new Error(`Storage upload failed: ${reason}`);
  }
  console.log("[BS 5839-1 PDF] DOCX diagnostics:", docx.diagnostics);

  const pdfRes = await supabase.functions.invoke("convert-quote-pdf", {
    body: {
      docx_storage_path: docx.storage_path,
      bucket: docx.bucket ?? "bs5839-cert-outputs",
    },
  });
  if (pdfRes.error) {
    throw new Error(
      `PDF conversion failed: ${pdfRes.error.message ?? "Unknown"}`,
    );
  }
  const pdf = pdfRes.data as PdfResponse | null;
  if (!pdf?.signed_url) {
    throw new Error("PDF converter returned no signed URL");
  }

  const resp = await fetch(pdf.signed_url);
  if (!resp.ok) throw new Error(`Couldn't fetch PDF (${resp.status})`);
  const blob = await resp.blob();
  const filename = docx.certificate_number
    ? `${docx.certificate_number}.pdf`
    : `${docx.cert_type ?? "bs5839"}-${certId.slice(0, 8)}.pdf`;
  triggerDownload(blob, filename);
}

/**
 * Convenience: try the cloud PDF path, fall back to DOCX direct
 * download on any failure (storage RLS, MS Graph hiccup, etc).
 * Same pattern as the callout wizard's PDF button — engineer
 * always walks away with a file even when the cloud chain is
 * unavailable.
 */
export async function downloadBs5839CertPdfWithFallback(
  certId: string,
  opts: DownloadOpts = {},
): Promise<void> {
  try {
    await downloadBs5839CertPdfViaCloud(certId, opts);
  } catch (cloudErr) {
    const msg = cloudErr instanceof Error ? cloudErr.message : String(cloudErr);
    console.error("[BS 5839-1 PDF] cloud path failed; falling back to DOCX:", cloudErr);
    toast.warning("Cloud PDF unavailable — downloading DOCX instead", {
      description: msg,
      duration: 10_000,
    });
    await downloadBs5839CertDocx(certId, opts);
  }
}

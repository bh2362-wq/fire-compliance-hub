import { supabase } from "@/integrations/supabase/client";
import { buildCalloutReportInput } from "./calloutReportService";

// Frontend wrapper around the generate-callout-docx edge function.
// Mirrors the C&E pattern (useCauseEffectGeneration.ts) but skips the
// storage + convert-quote-pdf chain — the callout function returns
// the DOCX base64 directly in its response body. Future PR can add
// the storage roundtrip if PDF rendering is needed.

interface DocxResponse {
  docx_base64?: string;
  diagnostics?: {
    template_bytes?: number;
    output_bytes?: number;
    fault_narrative_filled?: boolean;
  };
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
  // quiet on the happy path beyond a single log line.
  console.log("[Callout DOCX] generate-callout-docx response:", data.diagnostics);

  const blob = base64ToBlob(data.docx_base64);
  triggerDownload(blob, `${bundle.ref}.docx`);
}

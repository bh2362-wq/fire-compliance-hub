// Browser-side PDF text extraction for the Reference Library ingest pipeline.
// We extract here (in the browser) because the Edge Function CPU budget is
// too small for pdfjs to parse multi-hundred-page standards.
// Using the legacy build for broader compatibility (Safari, older browsers).
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// @ts-ignore - Vite ?url import returns a string at runtime
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc as string;

export interface ExtractedPdf {
  pages: string[];
  totalPages: number;
}

export async function extractPdfInBrowser(
  file: File | Blob,
  onProgress?: (pageNumber: number, total: number) => void,
): Promise<ExtractedPdf> {
  const arrayBuffer = await file.arrayBuffer();
  const fileSize = (file as File).size ?? arrayBuffer.byteLength;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const totalPages = pdf.numPages;
  const pages: string[] = [];
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = (content.items as Array<{ str?: string }>)
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(pageText);
    onProgress?.(i, totalPages);
  }
  const totalChars = pages.reduce((n, p) => n + p.length, 0);
  console.log(`[refLib] extracted ${pages.length} pages, ${totalChars} chars (file ${fileSize} bytes)`);

  // Hard-fail when extraction obviously failed (worker bootstrap broken,
  // scanned/image-only PDF, encrypted, etc.) instead of letting empty data
  // through to the embeddings pipeline.
  if (totalPages === 0) {
    throw new Error("PDF extraction returned 0 pages — worker likely failed to load");
  }
  if (fileSize > 100 * 1024 && totalChars < 500) {
    throw new Error(
      `PDF extraction yielded only ${totalChars} characters from a ${Math.round(fileSize / 1024)}KB file — ` +
        `likely a scanned/image-only PDF or worker failure. OCR is not supported in-browser.`,
    );
  }
  return { pages, totalPages };
}

export async function extractTxtInBrowser(file: File | Blob): Promise<ExtractedPdf> {
  const text = await file.text();
  return { pages: [text], totalPages: 1 };
}

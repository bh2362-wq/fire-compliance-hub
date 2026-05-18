// Browser-side PDF text extraction for the Reference Library ingest pipeline.
// We extract here (in the browser) because the Edge Function CPU budget is
// too small for pdfjs to parse multi-hundred-page standards.
import * as pdfjsLib from "pdfjs-dist";
// @ts-expect-error - worker URL import handled by Vite
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

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
  return { pages, totalPages };
}

export async function extractTxtInBrowser(file: File | Blob): Promise<ExtractedPdf> {
  const text = await file.text();
  return { pages: [text], totalPages: 1 };
}

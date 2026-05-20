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
  ocrUsed?: boolean;
}

export class ScannedPdfError extends Error {
  totalPages: number;
  totalChars: number;
  fileSize: number;

  constructor(totalPages: number, totalChars: number, fileSize: number) {
    super(
      `This PDF appears to be scanned (image-only) — we extracted ${totalChars} characters of text from ${totalPages} pages. ` +
        `Running OCR can recover the text, but it may take several minutes for large documents.`,
    );
    this.name = "ScannedPdfError";
    this.totalPages = totalPages;
    this.totalChars = totalChars;
    this.fileSize = fileSize;
  }
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
    await pdf.destroy();
    throw new Error("PDF extraction returned 0 pages — worker likely failed to load");
  }
  if (fileSize > 100 * 1024 && totalChars < 500) {
    await pdf.destroy();
    throw new ScannedPdfError(totalPages, totalChars, fileSize);
  }
  await pdf.destroy();
  return { pages, totalPages };
}

export async function ocrPdfInBrowser(
  file: File | Blob,
  ocrPageImage: (pageNumber: number, totalPages: number, imageDataUrl: string) => Promise<string>,
  onProgress?: (pageNumber: number, total: number) => void,
): Promise<ExtractedPdf> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const totalPages = pdf.numPages;
  const pages: string[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const maxDimension = Math.max(viewport.width, viewport.height);
    const scale = Math.min(2, Math.max(1.25, 1800 / maxDimension));
    const scaledViewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Unable to create OCR canvas");

    canvas.width = Math.ceil(scaledViewport.width);
    canvas.height = Math.ceil(scaledViewport.height);
    await page.render({ canvasContext: context, viewport: scaledViewport } as any).promise;
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.78);
    const text = await ocrPageImage(i, totalPages, imageDataUrl);
    pages.push((text || "").replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").trim());

    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
    onProgress?.(i, totalPages);
  }

  const totalChars = pages.reduce((n, p) => n + p.length, 0);
  if (totalPages === 0 || totalChars < 500) {
    await pdf.destroy();
    throw new Error(
      `OCR completed but only recovered ${totalChars} characters from ${totalPages} pages. ` +
        `Please run the PDF through a dedicated OCR tool and re-upload the OCR'd version.`,
    );
  }
  await pdf.destroy();
  return { pages, totalPages, ocrUsed: true };
}

export async function extractTxtInBrowser(file: File | Blob): Promise<ExtractedPdf> {
  const text = await file.text();
  return { pages: [text], totalPages: 1 };
}

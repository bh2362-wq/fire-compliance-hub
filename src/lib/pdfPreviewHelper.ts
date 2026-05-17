/**
 * Run any existing PDF generator that ends with `doc.save(...)` and intercept
 * the save call to return a Blob instead of triggering a download.
 * Allows us to embed a live preview without rewriting every generator.
 */
import jsPDF from "jspdf";

export async function generatePdfBlob(run: () => Promise<unknown> | unknown): Promise<Blob> {
  const proto = jsPDF.prototype as any;
  const originalSave = proto.save;
  let captured: Blob | null = null;
  proto.save = function () {
    try {
      captured = this.output("blob");
    } catch (e) {
      console.error("PDF preview: output(blob) failed", e);
    }
    return this;
  };
  try {
    await run();
  } finally {
    proto.save = originalSave;
  }
  if (!captured) throw new Error("PDF generator did not call save()");
  return captured;
}

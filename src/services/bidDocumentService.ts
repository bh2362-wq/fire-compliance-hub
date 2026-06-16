import { supabase } from "@/integrations/supabase/client";
import { extractPdfInBrowser, extractTxtInBrowser, ScannedPdfError } from "@/lib/refLibPdfExtract";

const sb = supabase as any;
const BUCKET = "bid-documents";

export type BidDocType =
  | "itt" | "specification" | "contract" | "pricing" | "sq"
  | "social_value" | "tor" | "drawing" | "other";

export type BidDocStatus = "uploaded" | "extracted" | "scanned" | "failed";

export interface BidDocument {
  id: string;
  bid_id: string;
  file_name: string;
  storage_path: string | null;
  doc_type: BidDocType;
  extracted_text: string | null;
  page_count: number | null;
  char_count: number | null;
  status: BidDocStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export const DOC_TYPE_LABELS: Record<BidDocType, string> = {
  itt: "ITT / Instructions",
  specification: "Specification",
  contract: "Contract / T&Cs",
  pricing: "Pricing schedule",
  sq: "Selection Questionnaire",
  social_value: "Social Value",
  tor: "Terms of Reference",
  drawing: "Drawing",
  other: "Other",
};

/** Best-effort guess of document type from the filename. */
export function guessDocType(name: string): BidDocType {
  const n = name.toLowerCase();
  if (/(itt|instruction|invitation)/.test(n)) return "itt";
  if (/(spec|scope|sow|requirement)/.test(n)) return "specification";
  if (/(contract|terms|t&c|conditions)/.test(n)) return "contract";
  if (/(pric|rate|cost|schedule of rates)/.test(n)) return "pricing";
  if (/(sq|pqq|selection|questionnaire)/.test(n)) return "sq";
  if (/(social\s*value|spv)/.test(n)) return "social_value";
  if (/(tor|terms of reference)/.test(n)) return "tor";
  if (/(drawing|dwg|plan|layout)/.test(n)) return "drawing";
  return "other";
}

export async function listBidDocuments(bidId: string): Promise<BidDocument[]> {
  const { data, error } = await sb
    .from("bid_documents")
    .select("*")
    .eq("bid_id", bidId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as BidDocument[];
}

/**
 * Upload a tender document: extract text in the browser (pdfjs), upload the
 * raw file to storage, and record a bid_documents row. Scanned/image-only
 * PDFs are stored with status 'scanned' (no text) so the user is warned.
 */
export async function uploadBidDocument(bidId: string, file: File): Promise<BidDocument> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isTxt = file.type.startsWith("text/") || /\.(txt|md|csv)$/i.test(file.name);

  let extractedText: string | null = null;
  let pageCount: number | null = null;
  let status: BidDocStatus = "uploaded";
  let error: string | null = null;

  try {
    if (isPdf) {
      const res = await extractPdfInBrowser(file);
      extractedText = res.pages.join("\n\n");
      pageCount = res.totalPages;
      status = "extracted";
    } else if (isTxt) {
      const res = await extractTxtInBrowser(file);
      extractedText = res.pages.join("\n\n");
      pageCount = res.totalPages;
      status = "extracted";
    } else {
      // .docx / .xlsx etc. — store the file; text extraction not supported here.
      status = "uploaded";
      error = "Text not extracted (unsupported type). Upload a PDF for AI analysis.";
    }
  } catch (e) {
    if (e instanceof ScannedPdfError) {
      status = "scanned";
      pageCount = e.totalPages;
      error = "Scanned/image-only PDF — no text extracted. Run OCR or upload a text-based PDF.";
    } else {
      status = "failed";
      error = e instanceof Error ? e.message : "Extraction failed";
    }
  }

  // Upload raw file to storage (best-effort; analysis only needs the text)
  let storagePath: string | null = null;
  try {
    const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
    const path = `${bidId}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (!upErr) storagePath = path;
    else console.warn("bid-documents upload failed (continuing):", upErr.message);
  } catch (e) {
    console.warn("bid-documents upload threw (continuing):", e);
  }

  const { data: userRes } = await supabase.auth.getUser();
  const { data, error: insErr } = await sb
    .from("bid_documents")
    .insert({
      bid_id: bidId,
      file_name: file.name,
      storage_path: storagePath,
      doc_type: guessDocType(file.name),
      extracted_text: extractedText,
      page_count: pageCount,
      char_count: extractedText ? extractedText.length : null,
      status,
      error,
      created_by: userRes?.user?.id ?? null,
    })
    .select()
    .single();
  if (insErr) throw insErr;
  return data as BidDocument;
}

export async function updateBidDocument(id: string, updates: Partial<BidDocument>): Promise<void> {
  const { error } = await sb.from("bid_documents").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteBidDocument(doc: BidDocument): Promise<void> {
  if (doc.storage_path) {
    try { await supabase.storage.from(BUCKET).remove([doc.storage_path]); }
    catch (e) { console.warn("Failed to remove storage object:", e); }
  }
  const { error } = await sb.from("bid_documents").delete().eq("id", doc.id);
  if (error) throw error;
}

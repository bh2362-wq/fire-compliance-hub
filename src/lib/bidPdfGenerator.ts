import jsPDF from "jspdf";
import { format } from "date-fns";
import { CompanySettings } from "@/services/companySettingsService";
import { Bid, BidQuestion, countWords } from "@/services/bidService";

interface BidPdfOptions {
  bid: Bid;
  questions: BidQuestion[];
  companySettings: CompanySettings | null;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Branded tender-response PDF. Header style matches statementPdfGenerator
 * (logo left, company details right, red accent bar) for visual consistency.
 */
export async function generateBidPDF({ bid, questions, companySettings }: BidPdfOptions): Promise<jsPDF> {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 18;

  let yPos = 20;

  // ── Header: logo + company details ──
  const logoUrl = companySettings?.report_logo_url || companySettings?.company_logo_url;
  if (logoUrl) {
    try {
      const logoImg = await loadImage(logoUrl);
      doc.addImage(logoImg, "PNG", margin, yPos - 2, 32, 28);
    } catch {
      /* skip logo */
    }
  }

  const rightX = pageWidth - margin;
  let contactY = yPos;
  doc.setTextColor(74, 85, 104);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(companySettings?.company_name || "Company", rightX, contactY, { align: "right" });
  contactY += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(113, 128, 150);
  if (companySettings?.address) { doc.text(companySettings.address, rightX, contactY, { align: "right" }); contactY += 4; }
  const cityPost = `${companySettings?.city || ""} ${companySettings?.postcode || ""}`.trim();
  if (cityPost) { doc.text(cityPost, rightX, contactY, { align: "right" }); contactY += 4; }
  if (companySettings?.phone) { doc.text(`T: ${companySettings.phone}`, rightX, contactY, { align: "right" }); contactY += 4; }
  if (companySettings?.email) { doc.text(`E: ${companySettings.email}`, rightX, contactY, { align: "right" }); }

  yPos = 50;

  // ── Title with accent bar ──
  doc.setFillColor(185, 28, 28);
  doc.rect(margin, yPos, 4, 16, "F");
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(28, 28, 32);
  const titleLines = doc.splitTextToSize(bid.title || "Tender Response", contentWidth - 8);
  doc.text(titleLines, margin + 8, yPos + 6);
  yPos += 6 + titleLines.length * 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(113, 128, 150);
  const meta: string[] = [];
  if (bid.bid_reference) meta.push(bid.bid_reference);
  if (bid.buyer_name) meta.push(`Buyer: ${bid.buyer_name}`);
  if (bid.submission_deadline) meta.push(`Deadline: ${format(new Date(bid.submission_deadline), "d MMM yyyy")}`);
  if (meta.length) { doc.text(meta.join("   ·   "), margin + 8, yPos + 2); yPos += 6; }
  yPos += 6;

  const ensureSpace = (needed: number) => {
    if (yPos + needed > bottomLimit) { doc.addPage(); yPos = 20; }
  };

  // ── Questions & answers ──
  let lastSection: string | null = null;
  questions.forEach((q, idx) => {
    if (q.section && q.section !== lastSection) {
      lastSection = q.section;
      ensureSpace(12);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(185, 28, 28);
      doc.text(q.section, margin, yPos);
      yPos += 7;
    }

    // Question heading
    ensureSpace(14);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(28, 28, 32);
    const qPrefix = q.question_ref ? `${q.question_ref}  ` : `Q${idx + 1}.  `;
    const qLines = doc.splitTextToSize(qPrefix + q.question_text, contentWidth);
    qLines.forEach((line: string) => {
      ensureSpace(6);
      doc.text(line, margin, yPos);
      yPos += 5.5;
    });

    // Limit / word-count note
    if (q.word_limit || q.char_limit) {
      const used = q.word_limit ? `${countWords(q.answer)} / ${q.word_limit} words`
        : `${(q.answer || "").length} / ${q.char_limit} characters`;
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(113, 128, 150);
      ensureSpace(5);
      doc.text(used, margin, yPos);
      yPos += 5;
    }

    // Answer
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(45, 55, 72);
    const answer = (q.answer || "").trim() || "[ No answer yet ]";
    answer.split(/\n+/).forEach((para) => {
      const lines = doc.splitTextToSize(para, contentWidth);
      lines.forEach((line: string) => {
        ensureSpace(6);
        doc.text(line, margin, yPos);
        yPos += 5;
      });
      yPos += 2;
    });
    yPos += 6;
  });

  // ── Footer page numbers ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 174, 192);
    doc.text(`${companySettings?.company_name || ""}`, margin, pageHeight - 10);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: "right" });
  }

  return doc;
}

export function bidFileBaseName(bid: Bid): string {
  const ref = bid.bid_reference || "bid";
  const safeTitle = (bid.title || "tender-response").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
  return `${ref}-${safeTitle}`.slice(0, 80);
}

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
} from "docx";
import { CompanySettings } from "@/services/companySettingsService";
import { Bid, BidQuestion, countWords } from "@/services/bidService";
import { format } from "date-fns";

interface BidDocxOptions {
  bid: Bid;
  questions: BidQuestion[];
  companySettings: CompanySettings | null;
}

const ACCENT = "B91C1C";
const INK = "1C1C20";
const MUTED = "718096";

/**
 * Editable Word (.docx) export of a tender response — produced client-side
 * with the `docx` library. Returns a Blob ready to download or attach.
 */
export async function generateBidDocx({ bid, questions, companySettings }: BidDocxOptions): Promise<Blob> {
  const children: Paragraph[] = [];

  // ── Header block ──
  if (companySettings?.company_name) {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: companySettings.company_name, bold: true, color: MUTED, size: 20 })],
    }));
  }

  children.push(new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text: bid.title || "Tender Response", bold: true, size: 40, color: INK })],
  }));

  const meta: string[] = [];
  if (bid.bid_reference) meta.push(bid.bid_reference);
  if (bid.buyer_name) meta.push(`Buyer: ${bid.buyer_name}`);
  if (bid.submission_deadline) meta.push(`Deadline: ${format(new Date(bid.submission_deadline), "d MMM yyyy")}`);
  if (meta.length) {
    children.push(new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: meta.join("   ·   "), color: MUTED, size: 18 })],
    }));
  }

  // ── Questions & answers ──
  let lastSection: string | null = null;
  questions.forEach((q, idx) => {
    if (q.section && q.section !== lastSection) {
      lastSection = q.section;
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 120 },
        children: [new TextRun({ text: q.section, bold: true, color: ACCENT, size: 26 })],
      }));
    }

    const qPrefix = q.question_ref ? `${q.question_ref}  ` : `Q${idx + 1}.  `;
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 60 },
      children: [new TextRun({ text: qPrefix + q.question_text, bold: true, color: INK, size: 24 })],
    }));

    if (q.word_limit || q.char_limit) {
      const used = q.word_limit
        ? `${countWords(q.answer)} / ${q.word_limit} words`
        : `${(q.answer || "").length} / ${q.char_limit} characters`;
      children.push(new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: used, italics: true, color: MUTED, size: 16 })],
      }));
    }

    const answer = (q.answer || "").trim() || "[ No answer yet ]";
    answer.split(/\n+/).forEach((para) => {
      children.push(new Paragraph({
        spacing: { after: 120, line: 276 },
        children: [new TextRun({ text: para, size: 22, color: "2D3748" })],
      }));
    });
  });

  const doc = new Document({
    creator: companySettings?.company_name || "Bid Writer",
    title: bid.title || "Tender Response",
    sections: [{ properties: {}, children }],
  });

  return Packer.toBlob(doc);
}

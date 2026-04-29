import jsPDF from "jspdf";
import { format } from "date-fns";
import { QMSDocument } from "@/services/qmsService";
import { getCompanySettings, CompanySettings } from "@/services/companySettingsService";

// Premium Corporate Color Palette — matches quotationPdfGenerator / purchaseOrderPdfGenerator
const COLORS = {
  primary: [28, 28, 32] as [number, number, number],
  accent: [185, 28, 28] as [number, number, number],
  accentLight: [220, 38, 38] as [number, number, number],

  textPrimary: [17, 24, 39] as [number, number, number],
  textSecondary: [55, 65, 81] as [number, number, number],
  textMuted: [107, 114, 128] as [number, number, number],
  textLight: [156, 163, 175] as [number, number, number],

  bgLight: [249, 250, 251] as [number, number, number],
  bgSubtle: [243, 244, 246] as [number, number, number],
  border: [229, 231, 235] as [number, number, number],
  borderDark: [209, 213, 219] as [number, number, number],

  white: [255, 255, 255] as [number, number, number],
  black: [0, 0, 0] as [number, number, number],
};

function sanitize(text: string): string {
  return (text || "")
    .replace(/\\n/g, "\n")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/\u2026/g, "...");
}

// Header — mirrors quotationPdfGenerator addHeader exactly
function addHeader(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  logoImg: HTMLImageElement | null,
  settings: CompanySettings | null
): number {
  let yPos = 20;

  // Logo — left
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", margin, yPos - 2, 32, 28);
    } catch {
      doc.setTextColor(...COLORS.primary);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(settings?.company_name || "Company", margin, yPos + 10);
    }
  } else {
    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(settings?.company_name || "Company", margin, yPos + 10);
  }

  // Contact details — right
  const rightX = pageWidth - margin;
  let contactY = yPos;

  doc.setTextColor(...COLORS.textSecondary);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  if (settings?.company_name) {
    doc.text(settings.company_name, rightX, contactY, { align: "right" });
    contactY += 5;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.textMuted);

  if (settings?.address) {
    doc.text(settings.address, rightX, contactY, { align: "right" });
    contactY += 4;
  }
  const cityPostLine = `${settings?.city || ""} ${settings?.postcode || ""}`.trim();
  if (cityPostLine) {
    doc.text(cityPostLine, rightX, contactY, { align: "right" });
    contactY += 4;
  }
  if (settings?.phone) {
    doc.text(`T: ${settings.phone}`, rightX, contactY, { align: "right" });
    contactY += 4;
  }
  if (settings?.email) {
    doc.text(`E: ${settings.email}`, rightX, contactY, { align: "right" });
  }

  yPos = 48;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, yPos, pageWidth - margin, yPos);

  return yPos + 8;
}

function addFooter(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  settings: CompanySettings | null
) {
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 18;

    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY, pageWidth - margin, footerY);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textMuted);

    const footerParts = [
      settings?.company_name,
      settings?.registration_number ? `Reg. ${settings.registration_number}` : null,
    ].filter(Boolean) as string[];
    if (footerParts.length) {
      doc.text(footerParts.join("  |  "), margin, footerY + 5);
    }

    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, footerY + 5, { align: "right" });
  }
}

function drawSectionTitle(doc: jsPDF, title: string, y: number, margin: number, pageWidth: number): number {
  doc.setFillColor(...COLORS.primary);
  doc.rect(margin, y, pageWidth - 2 * margin, 8, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin + 4, y + 5.5);
  return y + 12;
}

function drawInfoRow(
  doc: jsPDF,
  label: string,
  value: string,
  y: number,
  margin: number,
  pageWidth: number,
  zebra: boolean
): number {
  const contentWidth = pageWidth - 2 * margin;
  const labelWidth = 50;

  if (zebra) {
    doc.setFillColor(...COLORS.bgLight);
    doc.rect(margin, y - 3, contentWidth, 7, "F");
  }

  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(label, margin + 3, y + 1);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(sanitize(value), margin + labelWidth, y + 1);

  return y + 8;
}

function ensureSpace(
  doc: jsPDF,
  yPos: number,
  needed: number,
  maxY: number,
  pageWidth: number,
  margin: number,
  logoImg: HTMLImageElement | null,
  settings: CompanySettings | null
): number {
  if (yPos + needed > maxY) {
    doc.addPage();
    return addHeader(doc, pageWidth, margin, logoImg, settings);
  }
  return yPos;
}

export function getQMSDocumentFileName(document: QMSDocument): string {
  return `${document.document_number}-${document.title.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;
}

async function buildQMSDocumentPDF(document: QMSDocument): Promise<jsPDF> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - 2 * margin;
  const maxY = pageHeight - 25;

  const company = await getCompanySettings();

  // Load logo
  const logoImg = new Image();
  const logoUrl = company?.report_logo_url || company?.company_logo_url || "/bho-fire-logo.png";
  logoImg.crossOrigin = "anonymous";
  logoImg.src = logoUrl;
  await new Promise<void>((resolve) => {
    logoImg.onload = () => resolve();
    logoImg.onerror = () => resolve();
    setTimeout(() => resolve(), 2000);
  });

  let yPos = addHeader(doc, pageWidth, margin, logoImg, company);

  // ===== TITLE SECTION (mirrors quotation title style) =====
  // Determine doc type label from document_number prefix (POL, PROC, FORM, etc.)
  const prefix = (document.document_number.split("-")[0] || "DOCUMENT").toUpperCase();
  const typeLabel =
    prefix === "POL" ? "POLICY" :
    prefix === "PROC" ? "PROCEDURE" :
    prefix === "FORM" ? "FORM" :
    prefix === "WI" ? "WORK INSTRUCTION" :
    prefix === "MAN" ? "MANUAL" :
    "DOCUMENT";

  doc.setTextColor(...COLORS.accent);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text(typeLabel, margin, yPos + 8);

  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(document.document_number, pageWidth - margin, yPos + 4, { align: "right" });

  yPos += 18;

  // Document title as subtitle
  doc.setTextColor(...COLORS.textSecondary);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const titleLines = doc.splitTextToSize(sanitize(document.title), contentWidth);
  doc.text(titleLines, margin, yPos);
  yPos += titleLines.length * 5 + 6;

  // ===== DOCUMENT INFORMATION =====
  yPos = drawSectionTitle(doc, "DOCUMENT INFORMATION", yPos, margin, pageWidth);

  const statusLabel = document.status === "approved" ? "Approved" :
    document.status === "pending_approval" ? "Pending Approval" :
    document.status === "draft" ? "Draft" : document.status;

  let zebra = true;
  yPos = drawInfoRow(doc, "Document Number", document.document_number, yPos, margin, pageWidth, zebra); zebra = !zebra;
  yPos = drawInfoRow(doc, "Status", statusLabel, yPos, margin, pageWidth, zebra); zebra = !zebra;
  yPos = drawInfoRow(doc, "Version", `${document.current_version}`, yPos, margin, pageWidth, zebra); zebra = !zebra;
  yPos = drawInfoRow(doc, "Date Issued", format(new Date(document.created_at), "dd MMMM yyyy"), yPos, margin, pageWidth, zebra); zebra = !zebra;
  yPos = drawInfoRow(doc, "Last Updated", format(new Date(document.updated_at), "dd MMMM yyyy"), yPos, margin, pageWidth, zebra); zebra = !zebra;

  if (document.review_frequency_months) {
    yPos = drawInfoRow(doc, "Review Frequency", `Every ${document.review_frequency_months} months`, yPos, margin, pageWidth, zebra); zebra = !zebra;
  }
  if (document.next_review_date) {
    yPos = drawInfoRow(doc, "Next Review Date", format(new Date(document.next_review_date), "dd MMMM yyyy"), yPos, margin, pageWidth, zebra); zebra = !zebra;
  }
  if (document.category?.name) {
    yPos = drawInfoRow(doc, "Category", document.category.name, yPos, margin, pageWidth, zebra); zebra = !zebra;
  }

  yPos += 6;

  // ===== DOCUMENT CONTENT =====
  if (document.description) {
    yPos = ensureSpace(doc, yPos, 16, maxY, pageWidth, margin, logoImg, company);
    yPos = drawSectionTitle(doc, "POLICY CONTENT", yPos, margin, pageWidth);
    yPos += 2;

    doc.setTextColor(...COLORS.textPrimary);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const descText = sanitize(document.description);
    const paragraphs = descText.split("\n");

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) {
        yPos += 3;
        continue;
      }

      const isHeader = /^[A-Z0-9\s\-&/()]+$/.test(trimmed) && trimmed.length > 3 && trimmed.length < 80;
      const isNumberedHeader = /^\d+\.\s/.test(trimmed) && trimmed.length < 80;

      if (isHeader || isNumberedHeader) {
        yPos = ensureSpace(doc, yPos, 12, maxY, pageWidth, margin, logoImg, company);
        yPos += 3;
        doc.setTextColor(...COLORS.primary);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        const headerLines = doc.splitTextToSize(trimmed, contentWidth - 4);
        doc.text(headerLines, margin + 2, yPos);
        yPos += headerLines.length * 5 + 2;

        doc.setDrawColor(...COLORS.accent);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos - 1, margin + 40, yPos - 1);
        yPos += 2;

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...COLORS.textPrimary);
      } else {
        const isBullet = trimmed.startsWith("-") || trimmed.startsWith("*");
        const lineText = isBullet ? trimmed.substring(1).trim() : trimmed;
        const indent = isBullet ? 6 : 0;

        const wrappedLines = doc.splitTextToSize(lineText, contentWidth - 8 - indent);
        yPos = ensureSpace(doc, yPos, wrappedLines.length * 4.5 + 2, maxY, pageWidth, margin, logoImg, company);

        if (isBullet) {
          doc.setFillColor(...COLORS.accent);
          doc.circle(margin + 4, yPos - 1, 1, "F");
        }

        doc.setTextColor(...COLORS.textPrimary);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(wrappedLines, margin + 4 + indent, yPos);
        yPos += wrappedLines.length * 4.5 + 1.5;
      }
    }
  }

  // ===== AUTHORISATION =====
  yPos += 8;
  yPos = ensureSpace(doc, yPos, 50, maxY, pageWidth, margin, logoImg, company);
  yPos = drawSectionTitle(doc, "AUTHORISATION", yPos, margin, pageWidth);
  yPos += 4;

  const sigWidth = (contentWidth - 10) / 2;

  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  const sigLine = (label: string) => {
    doc.text(label, margin + 4, yPos);
    doc.setDrawColor(...COLORS.borderDark);
    doc.setLineWidth(0.3);
    doc.line(margin + 25, yPos + 1, margin + sigWidth, yPos + 1);
    yPos += 8;
  };

  sigLine("Signed:");
  sigLine("Name:");
  sigLine("Position:");
  sigLine("Date:");

  // Footer (page numbers + company line)
  addFooter(doc, pageWidth, margin, company);

  const fileName = `${document.document_number}-${document.title.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;
  doc.save(fileName);
}

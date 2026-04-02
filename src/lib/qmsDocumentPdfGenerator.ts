import jsPDF from "jspdf";
import { format } from "date-fns";
import { QMSDocument } from "@/services/qmsService";
import { getCompanySettings, CompanySettings } from "@/services/companySettingsService";

// Brand Color Palette (matches BHO Fire branding)
const COLORS = {
  charcoal: [45, 45, 48] as [number, number, number],
  red: [200, 30, 30] as [number, number, number],
  darkGrey: [80, 80, 85] as [number, number, number],
  mediumGrey: [140, 140, 145] as [number, number, number],
  lightGrey: [245, 245, 247] as [number, number, number],
  borderGrey: [220, 220, 225] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  black: [0, 0, 0] as [number, number, number],
};

function sanitize(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/\u2026/g, "...");
}

function addBrandedHeader(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  logoImg: HTMLImageElement | null,
  company: CompanySettings | null,
  pageNumber: number,
  totalPages: number
) {
  let yPos = 14;

  // Logo — left side
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", margin, yPos - 2, 32, 28);
    } catch {
      doc.setTextColor(...COLORS.charcoal);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(company?.company_name || "Company", margin, yPos + 10);
    }
  }

  // Page number — top right
  const rightX = pageWidth - margin;
  doc.setTextColor(...COLORS.mediumGrey);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Page ${pageNumber} of ${totalPages}`, rightX, yPos, { align: "right" });

  // Company details — right-aligned below page number
  let contactY = yPos + 6;
  if (company) {
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.darkGrey);

    const addressLine1 = company.address || "";
    const addressLine2 = [company.city, company.postcode].filter(Boolean).join(", ");
    if (addressLine1) {
      doc.text(addressLine1, rightX, contactY, { align: "right" });
      contactY += 3.5;
    }
    if (addressLine2) {
      doc.text(addressLine2, rightX, contactY, { align: "right" });
      contactY += 3.5;
    }
    if (company.phone) {
      doc.text(`T: ${company.phone}`, rightX, contactY, { align: "right" });
      contactY += 3.5;
    }
    if (company.email) {
      doc.text(`E: ${company.email}`, rightX, contactY, { align: "right" });
    }
  }

  // Separator line
  yPos = 44;
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.line(margin, yPos, pageWidth - margin, yPos);

  return yPos + 4;
}

function addBrandedFooter(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  company: CompanySettings | null
) {
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 18;

    doc.setDrawColor(...COLORS.borderGrey);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY, pageWidth - margin, footerY);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.mediumGrey);

    const footerParts = [
      company?.company_name,
      company?.registration_number ? `Reg. ${company.registration_number}` : null,
    ].filter(Boolean);
    doc.text(footerParts.join("  |  "), margin, footerY + 5);

    doc.text(
      `Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
      pageWidth - margin,
      footerY + 5,
      { align: "right" }
    );
  }
}

function addNewPage(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  logoImg: HTMLImageElement | null,
  company: CompanySettings | null,
  pageNum: number
): number {
  doc.addPage();
  return addBrandedHeader(doc, pageWidth, margin, logoImg, company, pageNum, pageNum);
}

function drawSectionTitle(doc: jsPDF, title: string, y: number, margin: number, pageWidth: number): number {
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, y, pageWidth - 2 * margin, 8, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin + 4, y + 5.5);
  return y + 12;
}

function drawInfoRow(doc: jsPDF, label: string, value: string, y: number, margin: number, pageWidth: number): number {
  const contentWidth = pageWidth - 2 * margin;
  const labelWidth = 50;

  // Alternating row background
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin, y - 3, contentWidth, 7, "F");

  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(label, margin + 3, y + 1);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.black);
  doc.text(sanitize(value), margin + labelWidth, y + 1);

  return y + 8;
}

export async function generateQMSDocumentPDF(document: QMSDocument): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - 2 * margin;
  const maxY = pageHeight - 25;

  // Fetch company settings
  const company = await getCompanySettings();

  // Load logo
  const logoImg = new Image();
  const logoUrl = company?.report_logo_url || company?.company_logo_url || "/bho-fire-logo.png";
  logoImg.crossOrigin = "anonymous";
  logoImg.src = logoUrl;

  // Wait for logo to load
  await new Promise<void>((resolve) => {
    logoImg.onload = () => resolve();
    logoImg.onerror = () => resolve();
    setTimeout(() => resolve(), 2000);
  });

  let yPos = addBrandedHeader(doc, pageWidth, margin, logoImg, company, 1, 1);

  // ===== DOCUMENT TITLE BLOCK =====
  // Red accent bar
  doc.setFillColor(...COLORS.red);
  doc.rect(margin, yPos, contentWidth, 2, "F");
  yPos += 6;

  // Document title
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(sanitize(document.title), contentWidth);
  doc.text(titleLines, margin, yPos + 6);
  yPos += titleLines.length * 8 + 6;

  // Document number badge
  doc.setFillColor(...COLORS.charcoal);
  const badgeText = document.document_number;
  const badgeWidth = doc.getTextWidth(badgeText) * 1.3 + 10;
  doc.roundedRect(margin, yPos, badgeWidth, 7, 1, 1, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(badgeText, margin + 5, yPos + 5);
  yPos += 14;

  // ===== DOCUMENT INFORMATION TABLE =====
  yPos = drawSectionTitle(doc, "DOCUMENT INFORMATION", yPos, margin, pageWidth);

  const statusLabel = document.status === "approved" ? "Approved" :
    document.status === "pending_approval" ? "Pending Approval" :
    document.status === "draft" ? "Draft" : document.status;

  yPos = drawInfoRow(doc, "Document Number", document.document_number, yPos, margin, pageWidth);
  yPos = drawInfoRow(doc, "Status", statusLabel, yPos, margin, pageWidth);
  yPos = drawInfoRow(doc, "Version", `${document.current_version}`, yPos, margin, pageWidth);
  yPos = drawInfoRow(doc, "Date Issued", format(new Date(document.created_at), "dd MMMM yyyy"), yPos, margin, pageWidth);
  yPos = drawInfoRow(doc, "Last Updated", format(new Date(document.updated_at), "dd MMMM yyyy"), yPos, margin, pageWidth);

  if (document.review_frequency_months) {
    yPos = drawInfoRow(doc, "Review Frequency", `Every ${document.review_frequency_months} months`, yPos, margin, pageWidth);
  }
  if (document.next_review_date) {
    yPos = drawInfoRow(doc, "Next Review Date", format(new Date(document.next_review_date), "dd MMMM yyyy"), yPos, margin, pageWidth);
  }
  if (document.category?.name) {
    yPos = drawInfoRow(doc, "Category", document.category.name, yPos, margin, pageWidth);
  }

  yPos += 6;

  // ===== DOCUMENT CONTENT =====
  if (document.description) {
    yPos = drawSectionTitle(doc, "POLICY CONTENT", yPos, margin, pageWidth);
    yPos += 2;

    doc.setTextColor(...COLORS.black);
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

      // Detect section headers (lines that are all caps or end with ':')
      const isHeader = /^[A-Z0-9\s\-&/()]+$/.test(trimmed) && trimmed.length > 3 && trimmed.length < 80;
      const isNumberedHeader = /^\d+\.\s/.test(trimmed) && trimmed.length < 80;

      if (isHeader || isNumberedHeader) {
        if (yPos > maxY - 15) {
          const currentPage = doc.getNumberOfPages() + 1;
          yPos = addNewPage(doc, pageWidth, margin, logoImg, company, currentPage);
        }
        yPos += 3;
        doc.setTextColor(...COLORS.charcoal);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        const headerLines = doc.splitTextToSize(trimmed, contentWidth - 4);
        doc.text(headerLines, margin + 2, yPos);
        yPos += headerLines.length * 5 + 2;

        // Red underline for headers
        doc.setDrawColor(...COLORS.red);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos - 1, margin + 40, yPos - 1);
        yPos += 2;

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...COLORS.black);
      } else {
        // Bullet point handling
        const isBullet = trimmed.startsWith("-") || trimmed.startsWith("*");
        const lineText = isBullet ? trimmed.substring(1).trim() : trimmed;
        const indent = isBullet ? 6 : 0;

        const wrappedLines = doc.splitTextToSize(lineText, contentWidth - 8 - indent);

        if (yPos + wrappedLines.length * 4.5 > maxY) {
          const currentPage = doc.getNumberOfPages() + 1;
          yPos = addNewPage(doc, pageWidth, margin, logoImg, company, currentPage);
        }

        if (isBullet) {
          doc.setFillColor(...COLORS.red);
          doc.circle(margin + 4, yPos - 1, 1, "F");
        }

        doc.text(wrappedLines, margin + 4 + indent, yPos);
        yPos += wrappedLines.length * 4.5 + 1.5;
      }
    }
  }

  // ===== SIGNATURE BLOCK =====
  yPos += 8;
  if (yPos > maxY - 40) {
    const currentPage = doc.getNumberOfPages() + 1;
    yPos = addNewPage(doc, pageWidth, margin, logoImg, company, currentPage);
  }

  yPos = drawSectionTitle(doc, "AUTHORISATION", yPos, margin, pageWidth);
  yPos += 4;

  // Signature lines
  const sigWidth = (contentWidth - 10) / 2;

  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  // Left: Signed by
  doc.text("Signed:", margin + 4, yPos);
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.line(margin + 25, yPos + 1, margin + sigWidth, yPos + 1);
  yPos += 8;

  doc.text("Name:", margin + 4, yPos);
  doc.line(margin + 25, yPos + 1, margin + sigWidth, yPos + 1);
  yPos += 8;

  doc.text("Position:", margin + 4, yPos);
  doc.line(margin + 25, yPos + 1, margin + sigWidth, yPos + 1);
  yPos += 8;

  doc.text("Date:", margin + 4, yPos);
  doc.line(margin + 25, yPos + 1, margin + sigWidth, yPos + 1);

  // Add footer
  addBrandedFooter(doc, pageWidth, margin, company);

  // Fix page numbers in headers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Re-stamp page number
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    // White-out old page number area
    doc.setFillColor(...COLORS.white);
    doc.rect(pageWidth - margin - 40, 10, 42, 6, "F");
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, 14, { align: "right" });
  }

  // Save
  const fileName = `${document.document_number}-${document.title.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;
  doc.save(fileName);
}

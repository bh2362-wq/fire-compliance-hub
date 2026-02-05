import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

// Company Branding Constants
const COMPANY = {
  name: "BHO FIRE LTD",
  address: "St Georges Business Park, Castle Rd, Sittingbourne ME10 3TB",
  phone: "0330 043 8659",
  email: "admin@bhofire.com",
  website: "www.bhofire.com",
  registration: "Company Registration No. 12235152",
  country: "Registered in England & Wales",
};

// Premium Corporate Color Palette
const COLORS = {
  // Primary brand colors
  primary: [28, 28, 32] as [number, number, number],        // Deep charcoal
  accent: [185, 28, 28] as [number, number, number],        // Corporate red
  accentLight: [220, 38, 38] as [number, number, number],   // Lighter red for accents
  
  // Text hierarchy
  textPrimary: [17, 24, 39] as [number, number, number],    // Near black for headings
  textSecondary: [55, 65, 81] as [number, number, number],  // Dark grey for body
  textMuted: [107, 114, 128] as [number, number, number],   // Medium grey for labels
  textLight: [156, 163, 175] as [number, number, number],   // Light grey for hints
  
  // Backgrounds and borders
  bgLight: [249, 250, 251] as [number, number, number],     // Very light grey
  bgSubtle: [243, 244, 246] as [number, number, number],    // Subtle grey
  border: [229, 231, 235] as [number, number, number],      // Light border
  borderDark: [209, 213, 219] as [number, number, number],  // Darker border
  
  white: [255, 255, 255] as [number, number, number],
};

export interface PDFColumnOptions {
  showItemNumber: boolean;
  showDescription: boolean;
  showRegulationRef: boolean;
  showPriority: boolean;
  showItem: boolean;
  showQuantity: boolean;
  showUnitPrice: boolean;
  showTotal: boolean;
}

export interface QuotationLineItem {
  description: string;
  regulation_reference?: string | null;
  priority: string;
  item_name?: string | null;
  parent_id?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface QuotationData {
  quotation_number: string;
  title?: string | null;
  summary?: string | null;
  total_amount: number;
  valid_until?: string | null;
  notes?: string | null;
  terms?: string | null;
  created_at: string;
  site: {
    name: string;
    address?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  customer?: {
    name: string;
    contact_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    address?: string | null;
    city?: string | null;
    postcode?: string | null;
  } | null;
  line_items: QuotationLineItem[];
  prepared_by?: string | null;
  vat_rate?: number;
}

interface CompanySettings {
  company_name?: string;
  report_logo_url?: string | null;
  company_logo_url?: string | null;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  phone?: string | null;
  email?: string | null;
  vat_number?: string | null;
  bank_name?: string | null;
  bank_sort_code?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
}

// Load company logo
async function loadLogo(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Premium header with elegant branding
function addHeader(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  logoImg: HTMLImageElement | null,
  settings?: CompanySettings,
  quotationNumber?: string
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Elegant top accent line
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, 0, pageWidth, 4, "F");
  
  // Subtle gradient effect (simulated with rectangles)
  doc.setFillColor(200, 28, 28);
  doc.rect(0, 4, pageWidth, 1, "F");
  
  let yPos = 14;

  // Logo section - left aligned
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", margin, yPos - 2, 32, 28);
    } catch {
      // Fallback to text
      doc.setTextColor(...COLORS.primary);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text(settings?.company_name || COMPANY.name, margin, yPos + 10);
    }
  } else {
    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(settings?.company_name || COMPANY.name, margin, yPos + 10);
  }

  // Company contact details - right aligned with refined typography
  const rightX = pageWidth - margin;
  let contactY = yPos;
  
  doc.setTextColor(...COLORS.textSecondary);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(settings?.company_name || COMPANY.name, rightX, contactY, { align: "right" });
  contactY += 5;
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.textMuted);
  doc.text(settings?.address || COMPANY.address, rightX, contactY, { align: "right" });
  contactY += 4;
  
  if (settings?.city || settings?.postcode) {
    doc.text(`${settings?.city || ""} ${settings?.postcode || ""}`.trim(), rightX, contactY, { align: "right" });
    contactY += 4;
  }
  
  doc.text(`T: ${settings?.phone || COMPANY.phone}`, rightX, contactY, { align: "right" });
  contactY += 4;
  doc.text(`E: ${settings?.email || COMPANY.email}`, rightX, contactY, { align: "right" });

  // Elegant separator
  yPos = 48;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);

  return yPos + 8;
}

// Premium document title section
function addTitleSection(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  yPos: number,
  quotationNumber: string,
  data: QuotationData
): number {
  const contentWidth = pageWidth - margin * 2;
  
  // Large "QUOTATION" title with accent
  doc.setTextColor(...COLORS.accent);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("QUOTATION", margin, yPos + 8);
  
  // Quotation number - clean text style
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(quotationNumber, pageWidth - margin, yPos + 4, { align: "right" });
  
  yPos += 18;
  
  // Subtitle with title if exists
  if (data.title) {
    doc.setTextColor(...COLORS.textSecondary);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(data.title, margin, yPos);
    yPos += 8;
  }
  
  return yPos;
}

// Elegant info cards
function addInfoCards(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  yPos: number,
  data: QuotationData
): number {
  const contentWidth = pageWidth - margin * 2;
  const cardWidth = (contentWidth - 8) / 2;
  const cardHeight = 50;
  const leftX = margin;
  const rightX = margin + cardWidth + 8;
  
  // Left card - Quote Details
  doc.setFillColor(...COLORS.bgLight);
  doc.roundedRect(leftX, yPos, cardWidth, cardHeight, 3, 3, "F");
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, yPos, cardWidth, cardHeight, 3, 3, "S");
  
  // Card header
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(leftX, yPos, cardWidth, 8, 3, 3, "F");
  doc.rect(leftX, yPos + 5, cardWidth, 3, "F"); // Square off bottom corners
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("QUOTE DETAILS", leftX + 6, yPos + 5.5);
  
  // Left card content
  let cardY = yPos + 14;
  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("DATE ISSUED", leftX + 6, cardY);
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(format(new Date(data.created_at), "dd MMMM yyyy"), leftX + 6, cardY + 5);
  
  cardY += 14;
  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("VALID UNTIL", leftX + 6, cardY);
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(
    data.valid_until ? format(new Date(data.valid_until), "dd MMMM yyyy") : "30 days from issue",
    leftX + 6,
    cardY + 5
  );
  
  // Right card - Quote For
  doc.setFillColor(...COLORS.bgLight);
  doc.roundedRect(rightX, yPos, cardWidth, cardHeight, 3, 3, "F");
  doc.setDrawColor(...COLORS.border);
  doc.roundedRect(rightX, yPos, cardWidth, cardHeight, 3, 3, "S");
  
  // Card header
  doc.setFillColor(...COLORS.accent);
  doc.roundedRect(rightX, yPos, cardWidth, 8, 3, 3, "F");
  doc.rect(rightX, yPos + 5, cardWidth, 3, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("QUOTE FOR", rightX + 6, yPos + 5.5);
  
  // Right card content
  cardY = yPos + 14;
  if (data.customer) {
    doc.setTextColor(...COLORS.textPrimary);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(data.customer.name, rightX + 6, cardY);
    cardY += 5;
    
    doc.setTextColor(...COLORS.textSecondary);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    
    if (data.customer.contact_name) {
      doc.text(`FAO: ${data.customer.contact_name}`, rightX + 6, cardY);
      cardY += 4;
    }
    if (data.customer.address) {
      doc.text(data.customer.address, rightX + 6, cardY);
      cardY += 4;
    }
    if (data.customer.city || data.customer.postcode) {
      doc.text(`${data.customer.city || ""} ${data.customer.postcode || ""}`.trim(), rightX + 6, cardY);
      cardY += 4;
    }
    if (data.customer.contact_email) {
      doc.text(data.customer.contact_email, rightX + 6, cardY);
    }
  } else {
    doc.setTextColor(...COLORS.textMuted);
    doc.setFontSize(8);
    doc.text("No customer specified", rightX + 6, cardY);
  }
  
  return yPos + cardHeight + 8;
}

// Site information bar
function addSiteBar(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  yPos: number,
  data: QuotationData
): number {
  const contentWidth = pageWidth - margin * 2;
  
  doc.setFillColor(...COLORS.bgSubtle);
  doc.roundedRect(margin, yPos, contentWidth, 16, 2, 2, "F");
  
  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("SITE LOCATION", margin + 6, yPos + 5);
  
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(data.site.name, margin + 6, yPos + 11);
  
  // Site address on right
  if (data.site.address) {
    const siteAddr = [data.site.address, data.site.city, data.site.postcode].filter(Boolean).join(", ");
    doc.setTextColor(...COLORS.textSecondary);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(siteAddr, pageWidth - margin - 6, yPos + 10, { align: "right" });
  }
  
  return yPos + 22;
}

// Summary section
function addSummary(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  yPos: number,
  summary: string
): number {
  if (!summary) return yPos;
  
  doc.setTextColor(...COLORS.textSecondary);
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  const summaryLines = doc.splitTextToSize(summary, pageWidth - margin * 2);
  doc.text(summaryLines, margin, yPos);
  
  return yPos + summaryLines.length * 4.5 + 4;
}

// Section header with accent
function addSectionHeader(
  doc: jsPDF,
  title: string,
  yPos: number,
  margin: number,
  pageWidth: number
): number {
  const contentWidth = pageWidth - margin * 2;
  
  // Accent bar
  doc.setFillColor(...COLORS.accent);
  doc.rect(margin, yPos, 3, 7, "F");
  
  // Header background
  doc.setFillColor(...COLORS.primary);
  doc.rect(margin + 3, yPos, contentWidth - 3, 7, "F");
  
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin + 8, yPos + 5);
  
  return yPos + 10;
}

// Premium footer
function addFooter(doc: jsPDF, pageWidth: number, margin: number) {
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer separator
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);
    
    // Accent line
    doc.setDrawColor(...COLORS.accent);
    doc.setLineWidth(1);
    doc.line(margin, pageHeight - 13.5, margin + 25, pageHeight - 13.5);

    doc.setFontSize(7);
    doc.setTextColor(...COLORS.textLight);
    doc.setFont("helvetica", "normal");
    doc.text(`${COMPANY.country} | ${COMPANY.registration}`, margin, pageHeight - 8);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 8, { align: "center" });
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }
}

const defaultColumnOptions: PDFColumnOptions = {
  showItemNumber: true,
  showDescription: true,
  showRegulationRef: true,
  showPriority: false,
  showItem: true,
  showQuantity: true,
  showUnitPrice: true,
  showTotal: true,
};

export async function generateQuotationPDF(
  data: QuotationData,
  companySettings?: CompanySettings,
  returnBase64: boolean = false,
  columnOptions: PDFColumnOptions = defaultColumnOptions
): Promise<string | void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  // Reserve space so tables/totals never collide with the footer
  const footerReserve = 18;

  // Load logo
  const logoUrl = companySettings?.report_logo_url || companySettings?.company_logo_url;
  const logoImg = await loadLogo(logoUrl);

  // Header
  let yPos = addHeader(doc, pageWidth, margin, logoImg, companySettings, data.quotation_number);

  // Title section
  yPos = addTitleSection(doc, pageWidth, margin, yPos, data.quotation_number, data);

  // Info cards
  yPos = addInfoCards(doc, pageWidth, margin, yPos, data);

  // Site bar
  yPos = addSiteBar(doc, pageWidth, margin, yPos, data);

  // Summary
  yPos = addSummary(doc, pageWidth, margin, yPos, data.summary || "");

  // Build dynamic table columns
  const headers: string[] = [];
  const colStyles: Record<number, any> = {};
  let colIndex = 0;

  if (columnOptions.showItemNumber) {
    headers.push("#");
    colStyles[colIndex] = { cellWidth: 8, halign: "center", fontStyle: "bold" };
    colIndex++;
  }
  if (columnOptions.showDescription) {
    headers.push("Description");
    colStyles[colIndex] = { cellWidth: 50 }; // Adjusted width with Item column
    colIndex++;
  }
  if (columnOptions.showRegulationRef) {
    headers.push("Ref");
    colStyles[colIndex] = { cellWidth: 28, fontSize: 7 };
    colIndex++;
  }
  if (columnOptions.showPriority) {
    headers.push("Priority");
    colStyles[colIndex] = { cellWidth: 18, halign: "center", fontSize: 7 };
    colIndex++;
  }
  if (columnOptions.showItem) {
    headers.push("Item");
    colStyles[colIndex] = { cellWidth: 30, fontSize: 7 };
    colIndex++;
  }
  if (columnOptions.showQuantity) {
    headers.push("Qty");
    colStyles[colIndex] = { cellWidth: 12, halign: "center" };
    colIndex++;
  }
  if (columnOptions.showUnitPrice) {
    headers.push("Unit");
    colStyles[colIndex] = { cellWidth: 20, halign: "right" };
    colIndex++;
  }
  if (columnOptions.showTotal) {
    headers.push("Amount");
    colStyles[colIndex] = { cellWidth: 22, halign: "right", fontStyle: "bold" };
    colIndex++;
  }

  // Build table data (only parent items, sub-items shown beneath)
  const parentItems = data.line_items.filter(item => !item.parent_id);
  const tableData = parentItems.map((item, index) => {
    const row: string[] = [];
    if (columnOptions.showItemNumber) row.push((index + 1).toString());
    if (columnOptions.showDescription) row.push(item.description);
    if (columnOptions.showRegulationRef) row.push(item.regulation_reference || "-");
    if (columnOptions.showPriority) row.push(item.priority.charAt(0).toUpperCase() + item.priority.slice(1));
    if (columnOptions.showItem) row.push(item.item_name || "-");
    if (columnOptions.showQuantity) row.push(item.quantity.toString());
    if (columnOptions.showUnitPrice) row.push(`£${item.unit_price.toFixed(2)}`);
    if (columnOptions.showTotal) row.push(`£${item.total_price.toFixed(2)}`);
    return row;
  });

  // Line items section
  yPos = addSectionHeader(doc, "SCOPE OF WORKS", yPos, margin, pageWidth);

  autoTable(doc, {
    startY: yPos,
    head: [headers],
    body: tableData,
    margin: { left: margin, right: margin, bottom: footerReserve + 6 },
    tableWidth: pageWidth - margin * 2,
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: COLORS.textSecondary,
      lineColor: COLORS.border,
      lineWidth: 0.1,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 7,
      cellPadding: 3,
      halign: "center",
    },
    columnStyles: colStyles,
    alternateRowStyles: {
      fillColor: COLORS.bgLight,
    },
    bodyStyles: {
      minCellHeight: 8,
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 6;

  // Premium totals section
  const totalsWidth = 80;
  const totalsX = pageWidth - margin - totalsWidth;
  const totalsHeight = 32;

  // If there isn't enough room above the footer for totals, move totals to a new page
  if (yPos + totalsHeight + footerReserve > pageHeight) {
    doc.addPage();
    yPos = 20;
  }
  
  // Totals box
  doc.setFillColor(...COLORS.bgLight);
  doc.roundedRect(totalsX, yPos, totalsWidth, totalsHeight, 2, 2, "F");
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(totalsX, yPos, totalsWidth, totalsHeight, 2, 2, "S");
  
  const vatRate = data.vat_rate ?? 20;
  const subtotal = data.total_amount;
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;
  
  let totalsY = yPos + 7;
  
  // Subtotal
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textMuted);
  doc.text("Subtotal", totalsX + 6, totalsY);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text(`£${subtotal.toFixed(2)}`, totalsX + totalsWidth - 6, totalsY, { align: "right" });
  totalsY += 6;
  
  // VAT
  doc.setTextColor(...COLORS.textMuted);
  doc.text(`VAT (${vatRate}%)`, totalsX + 6, totalsY);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text(`£${vatAmount.toFixed(2)}`, totalsX + totalsWidth - 6, totalsY, { align: "right" });
  totalsY += 3;
  
  // Separator
  doc.setDrawColor(...COLORS.borderDark);
  doc.setLineWidth(0.3);
  doc.line(totalsX + 6, totalsY, totalsX + totalsWidth - 6, totalsY);
  totalsY += 6;
  
  // Grand total
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(totalsX + 3, totalsY - 4, totalsWidth - 6, 10, 1, 1, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", totalsX + 8, totalsY + 2);
  doc.setFontSize(11);
  doc.text(`£${grandTotal.toFixed(2)}`, totalsX + totalsWidth - 8, totalsY + 2, { align: "right" });
  
  yPos += 40;

  // Terms and conditions
  if (data.terms) {
    if (yPos > pageHeight - 70) {
      doc.addPage();
      yPos = 20;
    }

    yPos = addSectionHeader(doc, "TERMS & CONDITIONS", yPos, margin, pageWidth);
    
    doc.setTextColor(...COLORS.textSecondary);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    const termsLines = doc.splitTextToSize(data.terms, pageWidth - margin * 2 - 4);
    doc.text(termsLines, margin + 2, yPos);
    yPos += termsLines.length * 3.2 + 6;
  }

  // Notes
  if (data.notes) {
    if (yPos > pageHeight - 45) {
      doc.addPage();
      yPos = 20;
    }

    yPos = addSectionHeader(doc, "ADDITIONAL NOTES", yPos, margin, pageWidth);
    
    doc.setTextColor(...COLORS.textSecondary);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const notesLines = doc.splitTextToSize(data.notes, pageWidth - margin * 2 - 4);
    doc.text(notesLines, margin + 2, yPos);
    yPos += notesLines.length * 3.5 + 6;
  }

  // Bank details
  if (companySettings?.bank_name || companySettings?.bank_account_number) {
    if (yPos > pageHeight - 40) {
      doc.addPage();
      yPos = 20;
    }

    yPos = addSectionHeader(doc, "PAYMENT DETAILS", yPos, margin, pageWidth);
    
    const bankInfo = [
      companySettings.bank_name ? `Bank: ${companySettings.bank_name}` : null,
      companySettings.bank_account_name ? `Account Name: ${companySettings.bank_account_name}` : null,
      companySettings.bank_sort_code ? `Sort Code: ${companySettings.bank_sort_code}` : null,
      companySettings.bank_account_number ? `Account Number: ${companySettings.bank_account_number}` : null,
    ].filter(Boolean).join("   |   ");
    
    doc.setTextColor(...COLORS.textSecondary);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(bankInfo, margin + 2, yPos);
    yPos += 10;
  }

  // Premium acceptance section
  if (yPos > pageHeight - 55) {
    doc.addPage();
    yPos = 20;
  }

  yPos += 4;
  
  // Acceptance box
  const acceptanceHeight = 42;
  doc.setFillColor(...COLORS.bgLight);
  doc.roundedRect(margin, yPos, pageWidth - margin * 2, acceptanceHeight, 3, 3, "F");
  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(1);
  doc.roundedRect(margin, yPos, pageWidth - margin * 2, acceptanceHeight, 3, 3, "S");
  
  // Acceptance header
  doc.setFillColor(...COLORS.accent);
  doc.roundedRect(margin, yPos, pageWidth - margin * 2, 9, 3, 3, "F");
  doc.rect(margin, yPos + 6, pageWidth - margin * 2, 3, "F");
  
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("ACCEPTANCE & AUTHORISATION", margin + 6, yPos + 6);
  
  yPos += 14;
  
  doc.setTextColor(...COLORS.textSecondary);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("I accept this quotation and authorise BHO Fire Ltd to proceed with the works as detailed above.", margin + 6, yPos);
  
  yPos += 10;
  
  // Signature fields
  const fieldWidth = (pageWidth - margin * 2 - 20) / 3;
  const fields = [
    { label: "Signature", x: margin + 6 },
    { label: "Print Name", x: margin + 6 + fieldWidth + 6 },
    { label: "Date", x: margin + 6 + (fieldWidth + 6) * 2 },
  ];
  
  fields.forEach((field) => {
    doc.setDrawColor(...COLORS.borderDark);
    doc.setLineWidth(0.5);
    doc.line(field.x, yPos + 8, field.x + fieldWidth - 4, yPos + 8);
    
    doc.setTextColor(...COLORS.textMuted);
    doc.setFontSize(7);
    doc.text(field.label, field.x, yPos + 12);
  });

  // Footer
  addFooter(doc, pageWidth, margin);

  // Output
  if (returnBase64) {
    return doc.output("datauristring").split(",")[1];
  }

  doc.save(`${data.quotation_number}.pdf`);
}

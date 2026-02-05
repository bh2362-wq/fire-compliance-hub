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

// Clean Charcoal + Red Color Palette
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

export interface PDFColumnOptions {
  showItemNumber: boolean;
  showDescription: boolean;
  showRegulationRef: boolean;
  showPriority: boolean;
  showQuantity: boolean;
  showUnitPrice: boolean;
  showTotal: boolean;
}

export interface QuotationLineItem {
  description: string;
  regulation_reference?: string | null;
  priority: string;
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

// Professional header with branding
function addHeader(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  logoImg: HTMLImageElement | null,
  settings?: CompanySettings
): number {
  // Red accent bar at top
  doc.setFillColor(...COLORS.red);
  doc.rect(0, 0, pageWidth, 3, "F");

  let yPos = 10;

  // Logo or company name
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", margin, yPos, 28, 25);
    } catch {
      doc.setTextColor(...COLORS.charcoal);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(settings?.company_name || COMPANY.name, margin, yPos + 12);
    }
  } else {
    doc.setTextColor(...COLORS.charcoal);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(settings?.company_name || COMPANY.name, margin, yPos + 12);
  }

  // Company details on right
  const rightX = pageWidth - margin;
  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  
  doc.text(settings?.company_name || COMPANY.name, rightX, yPos + 4, { align: "right" });
  doc.text(settings?.address || COMPANY.address, rightX, yPos + 9, { align: "right" });
  if (settings?.city || settings?.postcode) {
    doc.text(`${settings?.city || ""} ${settings?.postcode || ""}`.trim(), rightX, yPos + 14, { align: "right" });
  }
  doc.text(`Tel: ${settings?.phone || COMPANY.phone}`, rightX, yPos + 19, { align: "right" });
  doc.text(`Email: ${settings?.email || COMPANY.email}`, rightX, yPos + 24, { align: "right" });

  // Separator line
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.5);
  doc.line(margin, 38, pageWidth - margin, 38);

  return 44;
}

// Footer with page numbers and generation date
function addFooter(doc: jsPDF, pageWidth: number, margin: number) {
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Separator line
    doc.setDrawColor(...COLORS.borderGrey);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFontSize(7);
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text(`${COMPANY.country} | ${COMPANY.registration}`, margin, pageHeight - 7);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 7, { align: "center" });
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth - margin, pageHeight - 7, { align: "right" });
  }
}

// Section header styling
function addSectionHeader(doc: jsPDF, title: string, yPos: number, margin: number, pageWidth: number): number {
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, pageWidth - margin * 2, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin + 3, yPos + 4);
  return yPos + 9;
}

// Info grid row
function addInfoRow(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  labelWidth: number = 30
): number {
  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(`${label}:`, x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.charcoal);
  doc.text(value || "-", x + labelWidth, y);
  return y + 4;
}

const defaultColumnOptions: PDFColumnOptions = {
  showItemNumber: true,
  showDescription: true,
  showRegulationRef: true,
  showPriority: true,
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
  const margin = 15;

  // Load logo
  const logoUrl = companySettings?.report_logo_url || companySettings?.company_logo_url;
  const logoImg = await loadLogo(logoUrl);

  // Header
  let yPos = addHeader(doc, pageWidth, margin, logoImg, companySettings);

  // QUOTATION title with number
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin, yPos, pageWidth - margin * 2, 10, "F");
  doc.setTextColor(...COLORS.red);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("QUOTATION", margin + 3, yPos + 7);
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(11);
  doc.text(data.quotation_number, pageWidth - margin - 3, yPos + 7, { align: "right" });
  yPos += 14;

  // Two-column layout for quote info and customer
  const colWidth = (pageWidth - margin * 2 - 10) / 2;
  const leftCol = margin;
  const rightCol = margin + colWidth + 10;

  // Left column - Quote details
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Quote Details", leftCol, yPos);
  yPos += 5;

  doc.setFontSize(8);
  yPos = addInfoRow(doc, "Date", format(new Date(data.created_at), "dd MMM yyyy"), leftCol, yPos);
  if (data.valid_until) {
    yPos = addInfoRow(doc, "Valid Until", format(new Date(data.valid_until), "dd MMM yyyy"), leftCol, yPos);
  }

  // Site info
  yPos += 2;
  doc.setFont("helvetica", "bold");
  doc.text("Site:", leftCol, yPos);
  doc.setFont("helvetica", "normal");
  doc.text(data.site.name, leftCol + 30, yPos);
  yPos += 4;
  if (data.site.address) {
    const siteAddr = [data.site.address, data.site.city, data.site.postcode].filter(Boolean).join(", ");
    const siteLines = doc.splitTextToSize(siteAddr, colWidth - 5);
    doc.text(siteLines, leftCol, yPos);
    yPos += siteLines.length * 3.5;
  }

  // Right column - Customer info
  let rightY = yPos - (data.valid_until ? 13 : 9) - (data.site.address ? 4 : 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Quote For", rightCol, rightY);
  rightY += 5;

  if (data.customer) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.charcoal);
    doc.text(data.customer.name, rightCol, rightY);
    rightY += 4;
    if (data.customer.contact_name) {
      doc.text(`FAO: ${data.customer.contact_name}`, rightCol, rightY);
      rightY += 4;
    }
    if (data.customer.address) {
      doc.text(data.customer.address, rightCol, rightY);
      rightY += 4;
    }
    if (data.customer.city || data.customer.postcode) {
      doc.text(`${data.customer.city || ""} ${data.customer.postcode || ""}`.trim(), rightCol, rightY);
      rightY += 4;
    }
    if (data.customer.contact_email) {
      doc.text(data.customer.contact_email, rightCol, rightY);
      rightY += 4;
    }
    if (data.customer.contact_phone) {
      doc.text(`Tel: ${data.customer.contact_phone}`, rightCol, rightY);
      rightY += 4;
    }
  }

  yPos = Math.max(yPos, rightY) + 4;

  // Summary
  if (data.summary) {
    doc.setTextColor(...COLORS.darkGrey);
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    const summaryLines = doc.splitTextToSize(data.summary, pageWidth - margin * 2);
    doc.text(summaryLines, margin, yPos);
    yPos += summaryLines.length * 3.5 + 3;
  }

  // Build dynamic table columns
  const headers: string[] = [];
  const colStyles: Record<number, any> = {};
  let colIndex = 0;

  if (columnOptions.showItemNumber) {
    headers.push("#");
    colStyles[colIndex] = { cellWidth: 8, halign: "center" };
    colIndex++;
  }
  if (columnOptions.showDescription) {
    headers.push("Description");
    colStyles[colIndex] = { cellWidth: "auto" };
    colIndex++;
  }
  if (columnOptions.showRegulationRef) {
    headers.push("Ref");
    colStyles[colIndex] = { cellWidth: 22 };
    colIndex++;
  }
  if (columnOptions.showPriority) {
    headers.push("Priority");
    colStyles[colIndex] = { cellWidth: 16, halign: "center" };
    colIndex++;
  }
  if (columnOptions.showQuantity) {
    headers.push("Qty");
    colStyles[colIndex] = { cellWidth: 12, halign: "center" };
    colIndex++;
  }
  if (columnOptions.showUnitPrice) {
    headers.push("Unit");
    colStyles[colIndex] = { cellWidth: 18, halign: "right" };
    colIndex++;
  }
  if (columnOptions.showTotal) {
    headers.push("Total");
    colStyles[colIndex] = { cellWidth: 20, halign: "right" };
    colIndex++;
  }

  // Build table data
  const tableData = data.line_items.map((item, index) => {
    const row: string[] = [];
    if (columnOptions.showItemNumber) row.push((index + 1).toString());
    if (columnOptions.showDescription) row.push(item.description);
    if (columnOptions.showRegulationRef) row.push(item.regulation_reference || "-");
    if (columnOptions.showPriority) row.push(item.priority.charAt(0).toUpperCase() + item.priority.slice(1));
    if (columnOptions.showQuantity) row.push(item.quantity.toString());
    if (columnOptions.showUnitPrice) row.push(`£${item.unit_price.toFixed(2)}`);
    if (columnOptions.showTotal) row.push(`£${item.total_price.toFixed(2)}`);
    return row;
  });

  // Line items table
  yPos = addSectionHeader(doc, "QUOTATION ITEMS", yPos, margin, pageWidth);

  autoTable(doc, {
    startY: yPos,
    head: [headers],
    body: tableData,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: COLORS.charcoal,
      lineColor: COLORS.borderGrey,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: COLORS.charcoal,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: colStyles,
    alternateRowStyles: {
      fillColor: COLORS.lightGrey,
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 4;

  // Totals section
  const totalsX = pageWidth - margin - 55;
  const vatRate = data.vat_rate ?? 20;
  const subtotal = data.total_amount;
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;

  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.2);
  doc.line(totalsX - 5, yPos, pageWidth - margin, yPos);
  yPos += 4;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.darkGrey);
  doc.text("Subtotal:", totalsX, yPos);
  doc.text(`£${subtotal.toFixed(2)}`, pageWidth - margin, yPos, { align: "right" });
  yPos += 4;

  doc.text(`VAT (${vatRate}%):`, totalsX, yPos);
  doc.text(`£${vatAmount.toFixed(2)}`, pageWidth - margin, yPos, { align: "right" });
  yPos += 4;

  doc.setFillColor(...COLORS.charcoal);
  doc.rect(totalsX - 5, yPos - 2, pageWidth - margin - totalsX + 10, 7, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTAL:", totalsX, yPos + 2);
  doc.text(`£${grandTotal.toFixed(2)}`, pageWidth - margin - 2, yPos + 2, { align: "right" });
  yPos += 10;

  // Terms and conditions
  if (data.terms) {
    if (yPos > doc.internal.pageSize.getHeight() - 55) {
      doc.addPage();
      yPos = 20;
    }

    yPos = addSectionHeader(doc, "TERMS & CONDITIONS", yPos, margin, pageWidth);
    doc.setTextColor(...COLORS.darkGrey);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const termsLines = doc.splitTextToSize(data.terms, pageWidth - margin * 2);
    doc.text(termsLines, margin, yPos);
    yPos += termsLines.length * 3 + 4;
  }

  // Notes
  if (data.notes) {
    if (yPos > doc.internal.pageSize.getHeight() - 35) {
      doc.addPage();
      yPos = 20;
    }

    yPos = addSectionHeader(doc, "ADDITIONAL NOTES", yPos, margin, pageWidth);
    doc.setTextColor(...COLORS.darkGrey);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const notesLines = doc.splitTextToSize(data.notes, pageWidth - margin * 2);
    doc.text(notesLines, margin, yPos);
    yPos += notesLines.length * 3 + 4;
  }

  // Bank details
  if (companySettings?.bank_name || companySettings?.bank_account_number) {
    if (yPos > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      yPos = 20;
    }

    yPos = addSectionHeader(doc, "PAYMENT DETAILS", yPos, margin, pageWidth);
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.charcoal);
    
    if (companySettings.bank_name) {
      yPos = addInfoRow(doc, "Bank", companySettings.bank_name, margin, yPos);
    }
    if (companySettings.bank_account_name) {
      yPos = addInfoRow(doc, "Account Name", companySettings.bank_account_name, margin, yPos);
    }
    if (companySettings.bank_sort_code) {
      yPos = addInfoRow(doc, "Sort Code", companySettings.bank_sort_code, margin, yPos);
    }
    if (companySettings.bank_account_number) {
      yPos = addInfoRow(doc, "Account No", companySettings.bank_account_number, margin, yPos);
    }
  }

  // Acceptance section
  if (yPos > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    yPos = 20;
  }

  yPos += 3;
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.2);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 6;

  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("ACCEPTANCE", margin, yPos);
  yPos += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.darkGrey);
  doc.text("I accept this quotation and authorise the work to proceed:", margin, yPos);
  yPos += 8;

  // Signature lines
  doc.setDrawColor(...COLORS.charcoal);
  doc.setLineWidth(0.2);
  doc.line(margin, yPos + 6, margin + 60, yPos + 6);
  doc.line(margin + 80, yPos + 6, margin + 120, yPos + 6);

  doc.setFontSize(7);
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text("Signature", margin, yPos + 10);
  doc.text("Date", margin + 80, yPos + 10);

  yPos += 14;
  doc.line(margin, yPos, margin + 60, yPos);
  doc.text("Print Name", margin, yPos + 4);

  // Footer
  addFooter(doc, pageWidth, margin);

  // Output
  if (returnBase64) {
    return doc.output("datauristring").split(",")[1];
  }

  doc.save(`${data.quotation_number}.pdf`);
}

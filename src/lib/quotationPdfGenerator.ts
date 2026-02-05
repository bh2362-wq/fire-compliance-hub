import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, addDays } from "date-fns";

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
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  
  doc.text(settings?.company_name || COMPANY.name, rightX, yPos + 4, { align: "right" });
  doc.text(settings?.address || COMPANY.address, rightX, yPos + 9, { align: "right" });
  if (settings?.city || settings?.postcode) {
    doc.text(`${settings?.city || ""} ${settings?.postcode || ""}`.trim(), rightX, yPos + 14, { align: "right" });
  }
  doc.text(`T: ${settings?.phone || COMPANY.phone}`, rightX, yPos + 19, { align: "right" });
  doc.text(`E: ${settings?.email || COMPANY.email}`, rightX, yPos + 24, { align: "right" });
  if (settings?.vat_number) {
    doc.text(`VAT: ${settings.vat_number}`, rightX, yPos + 29, { align: "right" });
  }

  // Separator line
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.5);
  doc.line(margin, 40, pageWidth - margin, 40);

  return 46;
}

// Footer with page numbers and generation date
function addFooter(doc: jsPDF, pageWidth: number, margin: number, settings?: CompanySettings) {
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
  doc.rect(margin, yPos, pageWidth - margin * 2, 7, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin + 3, yPos + 5);
  return yPos + 10;
}

// Info grid row
function addInfoRow(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  labelWidth: number = 35
): number {
  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`${label}:`, x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.charcoal);
  doc.text(value || "-", x + labelWidth, y);
  return y + 5;
}

export async function generateQuotationPDF(
  data: QuotationData,
  companySettings?: CompanySettings,
  returnBase64: boolean = false
): Promise<string | void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  // Load logo
  const logoUrl = companySettings?.report_logo_url || companySettings?.company_logo_url;
  const logoImg = await loadLogo(logoUrl);

  // Header
  let yPos = addHeader(doc, pageWidth, margin, logoImg, companySettings);

  // QUOTATION title
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin, yPos, pageWidth - margin * 2, 12, "F");
  doc.setTextColor(...COLORS.red);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("QUOTATION", pageWidth / 2, yPos + 8, { align: "center" });
  yPos += 16;

  // Quotation details grid
  const colWidth = (pageWidth - margin * 2) / 2;
  const leftCol = margin;
  const rightCol = margin + colWidth + 5;

  // Left column - Quotation info
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Quotation Details", leftCol, yPos);
  yPos += 6;

  yPos = addInfoRow(doc, "Quote No", data.quotation_number, leftCol, yPos);
  yPos = addInfoRow(doc, "Date", format(new Date(data.created_at), "dd MMMM yyyy"), leftCol, yPos);
  if (data.valid_until) {
    yPos = addInfoRow(doc, "Valid Until", format(new Date(data.valid_until), "dd MMMM yyyy"), leftCol, yPos);
  }

  // Right column - Customer/Site info
  let rightY = yPos - 16;
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Quote For", rightCol, rightY);
  rightY += 6;

  if (data.customer) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
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
  }

  yPos = Math.max(yPos, rightY) + 6;

  // Site details (if different from customer)
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin, yPos, pageWidth - margin * 2, 6, "F");
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Site: ${data.site.name}`, margin + 3, yPos + 4);
  if (data.site.address) {
    const siteAddr = [data.site.address, data.site.city, data.site.postcode].filter(Boolean).join(", ");
    doc.setFont("helvetica", "normal");
    doc.text(` - ${siteAddr}`, margin + 3 + doc.getTextWidth(`Site: ${data.site.name}`), yPos + 4);
  }
  yPos += 10;

  // Summary/Introduction
  if (data.summary) {
    doc.setTextColor(...COLORS.darkGrey);
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    const summaryLines = doc.splitTextToSize(data.summary, pageWidth - margin * 2);
    doc.text(summaryLines, margin, yPos);
    yPos += summaryLines.length * 4 + 4;
  }

  // Line items table
  yPos = addSectionHeader(doc, "QUOTATION ITEMS", yPos, margin, pageWidth);

  const tableData = data.line_items.map((item, index) => [
    (index + 1).toString(),
    item.description,
    item.regulation_reference || "-",
    item.priority.charAt(0).toUpperCase() + item.priority.slice(1),
    item.quantity.toString(),
    `£${item.unit_price.toFixed(2)}`,
    `£${item.total_price.toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [["#", "Description", "Ref", "Priority", "Qty", "Unit", "Total"]],
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
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 25 },
      3: { cellWidth: 18, halign: "center" },
      4: { cellWidth: 12, halign: "center" },
      5: { cellWidth: 18, halign: "right" },
      6: { cellWidth: 20, halign: "right" },
    },
    alternateRowStyles: {
      fillColor: COLORS.lightGrey,
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 5;

  // Totals section
  const totalsX = pageWidth - margin - 60;
  const vatRate = data.vat_rate ?? 20;
  const subtotal = data.total_amount;
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;

  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.line(totalsX - 5, yPos, pageWidth - margin, yPos);
  yPos += 5;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.darkGrey);
  doc.text("Subtotal:", totalsX, yPos);
  doc.text(`£${subtotal.toFixed(2)}`, pageWidth - margin, yPos, { align: "right" });
  yPos += 5;

  doc.text(`VAT (${vatRate}%):`, totalsX, yPos);
  doc.text(`£${vatAmount.toFixed(2)}`, pageWidth - margin, yPos, { align: "right" });
  yPos += 5;

  doc.setFillColor(...COLORS.charcoal);
  doc.rect(totalsX - 5, yPos - 3, pageWidth - margin - totalsX + 10, 8, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL:", totalsX, yPos + 2);
  doc.text(`£${grandTotal.toFixed(2)}`, pageWidth - margin - 2, yPos + 2, { align: "right" });
  yPos += 12;

  // Terms and conditions
  if (data.terms) {
    // Check if we need a new page
    if (yPos > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage();
      yPos = 20;
    }

    yPos = addSectionHeader(doc, "TERMS & CONDITIONS", yPos, margin, pageWidth);
    doc.setTextColor(...COLORS.darkGrey);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const termsLines = doc.splitTextToSize(data.terms, pageWidth - margin * 2);
    doc.text(termsLines, margin, yPos);
    yPos += termsLines.length * 3.5 + 6;
  }

  // Notes
  if (data.notes) {
    if (yPos > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      yPos = 20;
    }

    yPos = addSectionHeader(doc, "ADDITIONAL NOTES", yPos, margin, pageWidth);
    doc.setTextColor(...COLORS.darkGrey);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const notesLines = doc.splitTextToSize(data.notes, pageWidth - margin * 2);
    doc.text(notesLines, margin, yPos);
    yPos += notesLines.length * 3.5 + 6;
  }

  // Bank details (if available)
  if (companySettings?.bank_name || companySettings?.bank_account_number) {
    if (yPos > doc.internal.pageSize.getHeight() - 35) {
      doc.addPage();
      yPos = 20;
    }

    yPos = addSectionHeader(doc, "PAYMENT DETAILS", yPos, margin, pageWidth);
    doc.setFontSize(9);
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
  if (yPos > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage();
    yPos = 20;
  }

  yPos += 5;
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("ACCEPTANCE", margin, yPos);
  yPos += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.darkGrey);
  doc.text("I accept this quotation and authorise the work to proceed:", margin, yPos);
  yPos += 10;

  // Signature lines
  doc.setDrawColor(...COLORS.charcoal);
  doc.setLineWidth(0.2);
  doc.line(margin, yPos + 8, margin + 70, yPos + 8);
  doc.line(margin + 90, yPos + 8, margin + 130, yPos + 8);

  doc.setFontSize(8);
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text("Signature", margin, yPos + 12);
  doc.text("Date", margin + 90, yPos + 12);

  yPos += 18;
  doc.line(margin, yPos, margin + 70, yPos);
  doc.text("Print Name", margin, yPos + 4);

  // Footer
  addFooter(doc, pageWidth, margin, companySettings);

  // Output
  if (returnBase64) {
    return doc.output("datauristring").split(",")[1];
  }

  doc.save(`${data.quotation_number}.pdf`);
}

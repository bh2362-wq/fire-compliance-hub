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
  vat: "GB404667595",
  country: "Registered in England & Wales",
};

// Cert-style palette (matches BS5839 service report)
const COLORS = {
  primary: [26, 26, 26] as [number, number, number],         // #1a1a1a primary dark
  accent: [232, 92, 44] as [number, number, number],         // #e85c2c orange
  sectionBg: [60, 60, 60] as [number, number, number],       // #3c3c3c section header bg
  sectionText: [255, 255, 255] as [number, number, number],  // white section header text
  border: [224, 224, 224] as [number, number, number],       // #e0e0e0
  borderDark: [200, 200, 200] as [number, number, number],
  textPrimary: [26, 26, 26] as [number, number, number],
  textSecondary: [60, 64, 67] as [number, number, number],
  textMuted: [95, 99, 104] as [number, number, number],      // #5f6368
  textLight: [154, 160, 166] as [number, number, number],
  altRow: [250, 250, 250] as [number, number, number],       // #fafafa
  bgLight: [248, 249, 250] as [number, number, number],
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
  showLabour: boolean;
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
  markup_percent?: number;
  labour_cost?: number;
  labour_included?: boolean;
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

// ─── Helpers ───────────────────────────────────────────────────────

function sanitise(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/[\u2022\u2023\u25E6\u2043\u2219\u25CF\u25CB]/g, "-")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2026]/g, "...")
    .replace(/[^\x00-\x7F]/g, "");
}

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

// ─── Page header (logo left, address right, divider) ──────────────

function drawPageHeader(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  logoImg: HTMLImageElement | null,
  settings?: CompanySettings
): number {
  const yPos = 14;

  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", margin, yPos - 2, 32, 28);
    } catch {
      doc.setTextColor(...COLORS.primary);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(settings?.company_name || COMPANY.name, margin, yPos + 8);
    }
  } else {
    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(settings?.company_name || COMPANY.name, margin, yPos + 8);
  }

  const rightX = pageWidth - margin;
  let cy = yPos;
  doc.setTextColor(...COLORS.textSecondary);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(settings?.company_name || COMPANY.name, rightX, cy, { align: "right" });
  cy += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.textMuted);
  if (settings?.address || COMPANY.address) {
    doc.text(settings?.address || COMPANY.address, rightX, cy, { align: "right" });
    cy += 3.5;
  }
  const cityPost = `${settings?.city || ""} ${settings?.postcode || ""}`.trim();
  if (cityPost) {
    doc.text(cityPost, rightX, cy, { align: "right" });
    cy += 3.5;
  }
  if (settings?.phone || COMPANY.phone) {
    doc.text(`T: ${settings?.phone || COMPANY.phone}`, rightX, cy, { align: "right" });
    cy += 3.5;
  }
  if (settings?.email || COMPANY.email) {
    doc.text(`E: ${settings?.email || COMPANY.email}`, rightX, cy, { align: "right" });
  }

  const dividerY = 44;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  return dividerY + 7;
}

// ─── Title ────────────────────────────────────────────────────────

function drawTitle(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  yPos: number,
  data: QuotationData
): number {
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Quotation", margin, yPos + 6);

  const rightX = pageWidth - margin;
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(10);
  doc.setFont("courier", "bold");
  doc.text(data.quotation_number, rightX, yPos + 2, { align: "right" });
  doc.setFont("courier", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.textMuted);
  doc.text(format(new Date(data.created_at), "dd MMM yyyy"), rightX, yPos + 7, { align: "right" });

  return yPos + 14;
}

// ─── Section header bar (#3c3c3c full-width) ──────────────────────

function drawSectionHeader(
  doc: jsPDF,
  title: string,
  yPos: number,
  x: number,
  width: number,
  height = 6
): number {
  doc.setFillColor(...COLORS.sectionBg);
  doc.rect(x, yPos, width, height, "F");
  doc.setTextColor(...COLORS.sectionText);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(title.toUpperCase(), x + 3, yPos + height - 1.7);
  return yPos + height;
}

// ─── Side-by-side CLIENT / SITE+QUOTE DETAILS ─────────────────────

function drawInfoBlocks(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  yPos: number,
  data: QuotationData
): number {
  const contentWidth = pageWidth - margin * 2;
  const colGap = 4;
  const colWidth = (contentWidth - colGap) / 2;
  const leftX = margin;
  const rightX = margin + colWidth + colGap;

  // ─── Left: CLIENT
  let lY = drawSectionHeader(doc, "CLIENT", yPos, leftX, colWidth);
  lY += 3;
  if (data.customer) {
    doc.setTextColor(...COLORS.textPrimary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(sanitise(data.customer.name), leftX + 3, lY);
    lY += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textSecondary);
    if (data.customer.contact_name) {
      doc.text(`FAO: ${sanitise(data.customer.contact_name)}`, leftX + 3, lY);
      lY += 3.6;
    }
    if (data.customer.contact_email) {
      doc.text(sanitise(data.customer.contact_email), leftX + 3, lY);
      lY += 3.6;
    }
    if (data.customer.contact_phone) {
      doc.text(sanitise(data.customer.contact_phone), leftX + 3, lY);
      lY += 3.6;
    }
    if (data.customer.address) {
      doc.text(sanitise(data.customer.address), leftX + 3, lY);
      lY += 3.6;
    }
    const cp = [data.customer.city, data.customer.postcode].filter(Boolean).join(" ");
    if (cp) {
      doc.text(sanitise(cp), leftX + 3, lY);
      lY += 3.6;
    }
  } else {
    doc.setTextColor(...COLORS.textMuted);
    doc.setFontSize(8);
    doc.text("No customer specified", leftX + 3, lY);
    lY += 4;
  }
  lY += 2;

  // ─── Right: SITE
  let rY = drawSectionHeader(doc, "SITE", yPos, rightX, colWidth);
  rY += 3;
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(sanitise(data.site.name), rightX + 3, rY);
  rY += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.textSecondary);
  const siteAddr = [data.site.address, data.site.city, data.site.postcode].filter(Boolean).join(", ");
  if (siteAddr) {
    const lines = doc.splitTextToSize(sanitise(siteAddr), colWidth - 6);
    doc.text(lines, rightX + 3, rY);
    rY += lines.length * 3.6;
  }
  rY += 2;

  // QUOTE DETAILS sub-block on right column
  rY = drawSectionHeader(doc, "QUOTE DETAILS", rY, rightX, colWidth);
  rY += 3;
  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("DATE ISSUED", rightX + 3, rY);
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(format(new Date(data.created_at), "dd MMM yyyy"), rightX + 40, rY);
  rY += 4;
  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("VALID UNTIL", rightX + 3, rY);
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text(
    data.valid_until ? format(new Date(data.valid_until), "dd MMM yyyy") : "30 days from issue",
    rightX + 40,
    rY
  );
  rY += 4;

  return Math.max(lY, rY) + 3;
}

// ─── SCOPE summary ────────────────────────────────────────────────

function drawScope(
  doc: jsPDF,
  pageWidth: number,
  margin: number,
  yPos: number,
  data: QuotationData
): number {
  if (!data.title && !data.summary) return yPos;
  const contentWidth = pageWidth - margin * 2;
  yPos = drawSectionHeader(doc, "SCOPE OF WORKS", yPos, margin, contentWidth);
  yPos += 3;
  if (data.title) {
    doc.setTextColor(...COLORS.textPrimary);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    const t = doc.splitTextToSize(sanitise(data.title), contentWidth - 6);
    doc.text(t, margin + 3, yPos);
    yPos += t.length * 4 + 1;
  }
  if (data.summary) {
    doc.setTextColor(...COLORS.textSecondary);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const s = doc.splitTextToSize(sanitise(data.summary), contentWidth - 6);
    doc.text(s, margin + 3, yPos);
    yPos += s.length * 3.6;
  }
  return yPos + 4;
}

// ─── Footer ───────────────────────────────────────────────────────

function drawFooter(doc: jsPDF, pageWidth: number, margin: number, settings?: CompanySettings) {
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 14;
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY, pageWidth - margin, footerY);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textMuted);

    const parts = [
      settings?.company_name || COMPANY.name,
      COMPANY.registration,
      `VAT: ${settings?.vat_number || COMPANY.vat}`,
    ];
    doc.text(parts.join(" | "), margin, footerY + 4);
    doc.text(
      `Generated ${format(new Date(), "dd MMM yyyy")}`,
      pageWidth - margin,
      footerY + 4,
      { align: "right" }
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, footerY + 8.5, { align: "center" });
  }
}

const defaultColumnOptions: PDFColumnOptions = {
  showItemNumber: true,
  showDescription: true,
  showRegulationRef: false,
  showPriority: false,
  showItem: false,
  showQuantity: true,
  showUnitPrice: true,
  showLabour: false,
  showTotal: true,
};

// ─── Main entry ───────────────────────────────────────────────────

export async function generateQuotationPDF(
  data: QuotationData,
  companySettings?: CompanySettings,
  returnBase64: boolean = false,
  columnOptions: PDFColumnOptions = defaultColumnOptions
): Promise<string | void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const footerReserve = 18;
  const contentWidth = pageWidth - margin * 2;

  const logoUrl = companySettings?.report_logo_url || companySettings?.company_logo_url;
  const logoImg = await loadLogo(logoUrl);

  // Page chrome
  let yPos = drawPageHeader(doc, pageWidth, margin, logoImg, companySettings);

  // Title
  yPos = drawTitle(doc, pageWidth, margin, yPos, data);

  // Info blocks
  yPos = drawInfoBlocks(doc, pageWidth, margin, yPos, data);

  // Scope of works
  yPos = drawScope(doc, pageWidth, margin, yPos, data);

  // ─── LINE ITEMS table ──────────────────────────────────────────
  // Build dynamic columns
  const headers: string[] = [];
  const colStyles: Record<number, any> = {};
  let colIdx = 0;
  if (columnOptions.showItemNumber) {
    headers.push("#");
    colStyles[colIdx++] = { cellWidth: 8, halign: "center", fontStyle: "bold" };
  }
  if (columnOptions.showDescription) {
    headers.push("Description");
    colStyles[colIdx++] = { cellWidth: "auto" };
  }
  if (columnOptions.showRegulationRef) {
    headers.push("Ref");
    colStyles[colIdx++] = { cellWidth: 26, fontSize: 7 };
  }
  if (columnOptions.showPriority) {
    headers.push("Priority");
    colStyles[colIdx++] = { cellWidth: 18, halign: "center", fontSize: 7 };
  }
  if (columnOptions.showItem) {
    headers.push("Item");
    colStyles[colIdx++] = { cellWidth: 28, fontSize: 7 };
  }
  if (columnOptions.showQuantity) {
    headers.push("Qty");
    colStyles[colIdx++] = { cellWidth: 12, halign: "center" };
  }
  if (columnOptions.showUnitPrice) {
    headers.push("Unit £");
    colStyles[colIdx++] = { cellWidth: 18, halign: "right" };
  }
  if (columnOptions.showLabour) {
    headers.push("Labour £");
    colStyles[colIdx++] = { cellWidth: 18, halign: "right" };
  }
  if (columnOptions.showTotal) {
    headers.push("Total £");
    colStyles[colIdx++] = { cellWidth: 22, halign: "right", fontStyle: "bold" };
  }

  const parents = data.line_items.filter((i) => !i.parent_id);
  const tableData = parents.map((item, index) => {
    const labour = item.labour_cost || 0;
    const qty = item.quantity || 1;
    const sellPerUnit =
      qty > 0 ? (item.total_price - labour) / qty : item.unit_price * (1 + (item.markup_percent || 0) / 100);

    const descLines: string[] = [];
    descLines.push(sanitise(item.description));
    if (columnOptions.showRegulationRef === false && item.regulation_reference) {
      // Append ref under description in italic-ish style only if column not shown
    }
    // Description cell may include ref line as a marker we render in didDrawCell
    const descCell: any = {
      content: descLines.join("\n"),
      _regRef: item.regulation_reference || null,
    };

    const row: any[] = [];
    if (columnOptions.showItemNumber) row.push((index + 1).toString());
    if (columnOptions.showDescription) row.push(descCell);
    if (columnOptions.showRegulationRef) row.push(item.regulation_reference || "-");
    if (columnOptions.showPriority) row.push(item.priority.charAt(0).toUpperCase() + item.priority.slice(1));
    if (columnOptions.showItem) row.push(item.item_name || "-");
    if (columnOptions.showQuantity) row.push(item.quantity.toString());
    if (columnOptions.showUnitPrice) row.push(`£${sellPerUnit.toFixed(2)}`);
    if (columnOptions.showLabour)
      row.push(item.labour_included ? "Included" : labour > 0 ? `£${labour.toFixed(2)}` : "-");
    if (columnOptions.showTotal) row.push(`£${item.total_price.toFixed(2)}`);
    return row;
  });

  // Section header for line items
  if (yPos + 30 > pageHeight - footerReserve) {
    doc.addPage();
    yPos = 20;
  }
  yPos = drawSectionHeader(doc, "LINE ITEMS", yPos, margin, contentWidth);
  yPos += 1;

  const descColIdx = (columnOptions.showItemNumber ? 1 : 0);

  autoTable(doc, {
    startY: yPos,
    head: [headers],
    body: tableData,
    margin: { left: margin, right: margin, bottom: footerReserve + 6 },
    tableWidth: contentWidth,
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: COLORS.textPrimary,
      lineColor: COLORS.border,
      lineWidth: 0.1,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: COLORS.sectionBg,
      textColor: COLORS.sectionText,
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: 2.5,
      halign: "center",
    },
    columnStyles: colStyles,
    alternateRowStyles: { fillColor: COLORS.altRow },
    bodyStyles: { minCellHeight: 7 },
    didParseCell: (hookData) => {
      if (
        hookData.section === "body" &&
        hookData.column.index === descColIdx &&
        columnOptions.showDescription &&
        !columnOptions.showRegulationRef
      ) {
        const raw = hookData.cell.raw as any;
        if (raw && typeof raw === "object" && raw._regRef) {
          // Reserve extra height for regulation ref line
          hookData.cell.styles.minCellHeight = (hookData.cell.styles.minCellHeight || 7) + 4;
        }
      }
    },
    didDrawCell: (hookData) => {
      if (
        hookData.section === "body" &&
        hookData.column.index === descColIdx &&
        columnOptions.showDescription &&
        !columnOptions.showRegulationRef
      ) {
        const raw = hookData.cell.raw as any;
        if (raw && typeof raw === "object" && raw._regRef) {
          const refText = sanitise(raw._regRef);
          doc.setFont("helvetica", "italic");
          doc.setFontSize(7);
          doc.setTextColor(...COLORS.accent);
          const x = hookData.cell.x + 2.5;
          const y = hookData.cell.y + hookData.cell.height - 2;
          doc.text(refText, x, y);
        }
      }
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 4;

  // ─── TOTALS (right-aligned, no box) ───────────────────────────
  const vatRate = data.vat_rate ?? 20;
  const subtotal = data.total_amount;
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;

  if (yPos + 24 > pageHeight - footerReserve) {
    doc.addPage();
    yPos = 20;
  }

  const totalsRight = pageWidth - margin;
  const totalsLabelX = pageWidth - margin - 60;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textMuted);
  doc.text("Subtotal", totalsLabelX, yPos);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(`£${subtotal.toFixed(2)}`, totalsRight, yPos, { align: "right" });
  yPos += 5;

  doc.setTextColor(...COLORS.textMuted);
  doc.text(`VAT (${vatRate}%)`, totalsLabelX, yPos);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(`£${vatAmount.toFixed(2)}`, totalsRight, yPos, { align: "right" });
  yPos += 2;

  doc.setDrawColor(...COLORS.borderDark);
  doc.setLineWidth(0.4);
  doc.line(totalsLabelX, yPos, totalsRight, yPos);
  yPos += 4.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.primary);
  doc.text("Total (inc. VAT)", totalsLabelX, yPos);
  doc.text(`£${grandTotal.toFixed(2)}`, totalsRight, yPos, { align: "right" });
  yPos += 8;

  // ─── TERMS & CONDITIONS ───────────────────────────────────────
  if (data.terms) {
    if (yPos + 30 > pageHeight - footerReserve) {
      doc.addPage();
      yPos = 20;
    }
    yPos = drawSectionHeader(doc, "TERMS & CONDITIONS", yPos, margin, contentWidth);
    yPos += 3;
    doc.setTextColor(...COLORS.textSecondary);
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(sanitise(data.terms), contentWidth - 4);
    doc.text(lines, margin + 2, yPos);
    yPos += lines.length * 3.4 + 4;
  }

  // ─── NOTES (optional) ─────────────────────────────────────────
  if (data.notes) {
    if (yPos + 20 > pageHeight - footerReserve) {
      doc.addPage();
      yPos = 20;
    }
    yPos = drawSectionHeader(doc, "ADDITIONAL NOTES", yPos, margin, contentWidth);
    yPos += 3;
    doc.setTextColor(...COLORS.textSecondary);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(sanitise(data.notes), contentWidth - 4);
    doc.text(lines, margin + 2, yPos);
    yPos += lines.length * 3.6 + 4;
  }

  // ─── BANK DETAILS (optional) ──────────────────────────────────
  if (companySettings?.bank_name || companySettings?.bank_account_number) {
    if (yPos + 20 > pageHeight - footerReserve) {
      doc.addPage();
      yPos = 20;
    }
    yPos = drawSectionHeader(doc, "PAYMENT DETAILS", yPos, margin, contentWidth);
    yPos += 3;
    const bankInfo = [
      companySettings.bank_name ? `Bank: ${companySettings.bank_name}` : null,
      companySettings.bank_account_name ? `Account Name: ${companySettings.bank_account_name}` : null,
      companySettings.bank_sort_code ? `Sort Code: ${companySettings.bank_sort_code}` : null,
      companySettings.bank_account_number ? `Account Number: ${companySettings.bank_account_number}` : null,
    ]
      .filter(Boolean)
      .join("   |   ");
    doc.setTextColor(...COLORS.textSecondary);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(bankInfo, margin + 2, yPos);
    yPos += 6;
  }

  // ─── ACCEPTANCE & AUTHORISATION ───────────────────────────────
  if (yPos + 32 > pageHeight - footerReserve) {
    doc.addPage();
    yPos = 20;
  }
  yPos = drawSectionHeader(doc, "ACCEPTANCE & AUTHORISATION", yPos, margin, contentWidth);
  yPos += 5;
  doc.setTextColor(...COLORS.textSecondary);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    "I accept this quotation and authorise BHO Fire Ltd to proceed with the works as detailed above.",
    margin + 2,
    yPos
  );
  yPos += 8;

  const fieldGap = 6;
  const fieldWidth = (contentWidth - fieldGap * 2) / 3;
  const fields = [
    { label: "Signature", x: margin },
    { label: "Print Name", x: margin + fieldWidth + fieldGap },
    { label: "Date", x: margin + (fieldWidth + fieldGap) * 2 },
  ];
  fields.forEach((f) => {
    doc.setDrawColor(...COLORS.borderDark);
    doc.setLineWidth(0.4);
    doc.line(f.x, yPos + 8, f.x + fieldWidth, yPos + 8);
    doc.setTextColor(...COLORS.textMuted);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(f.label, f.x, yPos + 12);
  });

  // Footer on every page
  drawFooter(doc, pageWidth, margin, companySettings);

  if (returnBase64) {
    return doc.output("datauristring").split(",")[1];
  }
  doc.save(`${data.quotation_number}.pdf`);
}

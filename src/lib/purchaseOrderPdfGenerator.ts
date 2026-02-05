import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { PurchaseOrder } from "@/services/purchaseOrderService";

interface CompanySettings {
  company_name: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  phone?: string | null;
  email?: string | null;
  company_logo_url?: string | null;
  vat_number?: string | null;
  registration_number?: string | null;
}

type LoadedImage = {
  dataUrl: string;
  width: number;
  height: number;
};

// Professional color palette
const COLORS = {
  charcoal: [28, 28, 32] as [number, number, number],
  darkSlate: [45, 55, 72] as [number, number, number],
  mediumSlate: [74, 85, 104] as [number, number, number],
  lightSlate: [113, 128, 150] as [number, number, number],
  accent: [185, 28, 28] as [number, number, number], // BHO red
  tableHeader: [248, 250, 252] as [number, number, number],
  tableStripe: [252, 252, 253] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

export async function generatePurchaseOrderPDF(
  purchaseOrder: PurchaseOrder,
  companySettings: CompanySettings | null
): Promise<jsPDF> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  let yPos = 20;

  // ═══════════════════════════════════════════════════════════════
  // HEADER SECTION
  // ═══════════════════════════════════════════════════════════════

  // Company Logo (left side, preserve aspect ratio)
  let logoEndX = margin;
  if (companySettings?.company_logo_url) {
    try {
      const img = await loadImage(companySettings.company_logo_url);
      const logoHeight = 22;
      const ratio = img.width > 0 && img.height > 0 ? img.width / img.height : 2;
      const logoWidth = Math.min(75, Math.max(35, logoHeight * ratio));
      doc.addImage(img.dataUrl, "PNG", margin, yPos, logoWidth, logoHeight);
      logoEndX = margin + logoWidth + 10;
    } catch (e) {
      console.warn("Could not load company logo");
    }
  }

  // Company details (right-aligned, professional typography)
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.mediumSlate);

  const companyLines: string[] = [];
  
  // Build address lines
  const addressLines = sanitizeAddressLines(
    companySettings?.address ?? null,
    companySettings?.company_name ?? null
  );
  companyLines.push(...addressLines);

  const cityPostLine = `${companySettings?.city || ""} ${companySettings?.postcode || ""}`.trim();
  if (cityPostLine && !addressLines.some((l) => includesIgnoreCase(l, cityPostLine))) {
    companyLines.push(cityPostLine);
  }

  if (companySettings?.phone) {
    companyLines.push(`Tel: ${companySettings.phone}`);
  }
  if (companySettings?.email) {
    companyLines.push(companySettings.email);
  }

  let companyInfoY = yPos + 2;
  for (const line of companyLines) {
    doc.text(line, pageWidth - margin, companyInfoY, { align: "right" });
    companyInfoY += 4;
  }

  yPos = 52;

  // ═══════════════════════════════════════════════════════════════
  // DOCUMENT TITLE WITH ACCENT BAR
  // ═══════════════════════════════════════════════════════════════

  // Accent bar
  doc.setFillColor(...COLORS.accent);
  doc.rect(margin, yPos, 4, 16, "F");

  // Title
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.charcoal);
  doc.text("PURCHASE ORDER", margin + 10, yPos + 7);

  // PO Number
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.mediumSlate);
  doc.text(purchaseOrder.po_number, margin + 10, yPos + 14);

  yPos += 28;

  // ═══════════════════════════════════════════════════════════════
  // TWO-COLUMN INFO SECTION
  // ═══════════════════════════════════════════════════════════════

  // Left column: Supplier details with shaded background
  const leftColWidth = (contentWidth - 10) / 2;
  const rightColX = margin + leftColWidth + 10;
  const infoBoxHeight = 48;

  // Supplier box background
  doc.setFillColor(...COLORS.tableHeader);
  doc.roundedRect(margin, yPos, leftColWidth, infoBoxHeight, 2, 2, "F");

  // Supplier header
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.lightSlate);
  doc.text("SUPPLIER", margin + 8, yPos + 8);

  // Supplier name
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.charcoal);
  doc.text(purchaseOrder.supplier?.name || "Unknown Supplier", margin + 8, yPos + 16);

  // Supplier details
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.mediumSlate);

  let supplierY = yPos + 23;
  if (purchaseOrder.supplier?.address) {
    doc.text(purchaseOrder.supplier.address, margin + 8, supplierY);
    supplierY += 5;
  }
  if (purchaseOrder.supplier?.city || purchaseOrder.supplier?.postcode) {
    doc.text(`${purchaseOrder.supplier?.city || ""} ${purchaseOrder.supplier?.postcode || ""}`.trim(), margin + 8, supplierY);
    supplierY += 5;
  }
  if (purchaseOrder.supplier?.email) {
    doc.text(purchaseOrder.supplier.email, margin + 8, supplierY);
    supplierY += 5;
  }
  if (purchaseOrder.supplier?.phone) {
    doc.text(`Tel: ${purchaseOrder.supplier.phone}`, margin + 8, supplierY);
  }

  // Right column: Order details grid
  const detailRows = [
    { label: "Order Date", value: format(new Date(purchaseOrder.order_date), "dd MMM yyyy") },
    { label: "Expected Delivery", value: purchaseOrder.expected_delivery_date ? format(new Date(purchaseOrder.expected_delivery_date), "dd MMM yyyy") : "TBC" },
    { label: "Reference", value: purchaseOrder.reference || "-" },
    { label: "Status", value: purchaseOrder.status.toUpperCase() },
  ];

  let detailY = yPos;
  const rowHeight = 12;

  detailRows.forEach((detail, index) => {
    // Alternate row shading
    if (index % 2 === 0) {
      doc.setFillColor(...COLORS.tableStripe);
      doc.rect(rightColX, detailY, leftColWidth, rowHeight, "F");
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.lightSlate);
    doc.text(detail.label, rightColX + 6, detailY + 8);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.charcoal);
    doc.text(detail.value, rightColX + leftColWidth - 6, detailY + 8, { align: "right" });

    detailY += rowHeight;
  });

  yPos += infoBoxHeight + 12;

  // ═══════════════════════════════════════════════════════════════
  // LINE ITEMS TABLE
  // ═══════════════════════════════════════════════════════════════

  const tableData = (purchaseOrder.line_items || []).map((item, index) => [
    (index + 1).toString(),
    item.description,
    item.quantity.toString(),
    `£${item.unit_price.toFixed(2)}`,
    `£${item.total_price.toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [["#", "Description", "Qty", "Unit Price", "Total"]],
    body: tableData,
    theme: "plain",
    styles: {
      fontSize: 9,
      cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
    },
    headStyles: {
      fillColor: COLORS.charcoal,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: {
      textColor: COLORS.darkSlate,
    },
    alternateRowStyles: {
      fillColor: COLORS.tableStripe,
    },
    columnStyles: {
      0: { cellWidth: 14, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 18, halign: "center" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
    },
    margin: { left: margin, right: margin },
    tableLineColor: COLORS.border,
    tableLineWidth: 0.1,
  });

  // ═══════════════════════════════════════════════════════════════
  // TOTALS SECTION
  // ═══════════════════════════════════════════════════════════════

  yPos = (doc as any).lastAutoTable.finalY + 8;

  const totalsBoxWidth = 85;
  const totalsX = pageWidth - margin - totalsBoxWidth;

  // Totals background
  doc.setFillColor(...COLORS.tableHeader);
  doc.roundedRect(totalsX, yPos, totalsBoxWidth, 38, 2, 2, "F");

  let totalsY = yPos + 10;

  // Subtotal
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.mediumSlate);
  doc.text("Subtotal", totalsX + 8, totalsY);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(`£${purchaseOrder.subtotal?.toFixed(2) || "0.00"}`, totalsX + totalsBoxWidth - 8, totalsY, { align: "right" });

  totalsY += 8;

  // VAT
  doc.setTextColor(...COLORS.mediumSlate);
  doc.text(`VAT (${purchaseOrder.vat_rate || 20}%)`, totalsX + 8, totalsY);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(`£${purchaseOrder.vat_amount?.toFixed(2) || "0.00"}`, totalsX + totalsBoxWidth - 8, totalsY, { align: "right" });

  totalsY += 10;

  // Total row with accent
  doc.setFillColor(...COLORS.accent);
  doc.roundedRect(totalsX + 4, totalsY - 4, totalsBoxWidth - 8, 12, 1, 1, "F");

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.white);
  doc.text("TOTAL", totalsX + 10, totalsY + 4);
  doc.text(`£${purchaseOrder.total_amount?.toFixed(2) || "0.00"}`, totalsX + totalsBoxWidth - 10, totalsY + 4, { align: "right" });

  yPos = yPos + 50;

  // Footer reserve - ensure content doesn't overlap
  const footerReserve = 28;
  const maxContentY = pageHeight - footerReserve;

  // ═══════════════════════════════════════════════════════════════
  // NOTES SECTION
  // ═══════════════════════════════════════════════════════════════

  if (purchaseOrder.notes) {
    // Check if we need a new page
    if (yPos > maxContentY - 20) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.lightSlate);
    doc.text("NOTES", margin, yPos);

    yPos += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.darkSlate);

    const splitNotes = doc.splitTextToSize(purchaseOrder.notes, contentWidth);
    
    // Check if notes will overflow
    const notesHeight = splitNotes.length * 4;
    if (yPos + notesHeight > maxContentY) {
      doc.addPage();
      yPos = 20;
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.lightSlate);
      doc.text("NOTES (continued)", margin, yPos);
      yPos += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.darkSlate);
    }
    
    doc.text(splitNotes, margin, yPos);
    yPos += notesHeight + 10;
  }

  // ═══════════════════════════════════════════════════════════════
  // DELIVERY ADDRESS
  // ═══════════════════════════════════════════════════════════════

  if (purchaseOrder.delivery_address) {
    // Check if we need a new page
    if (yPos > maxContentY - 20) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.lightSlate);
    doc.text("DELIVERY ADDRESS", margin, yPos);

    yPos += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.darkSlate);

    const splitAddress = doc.splitTextToSize(purchaseOrder.delivery_address, contentWidth);
    
    // Check if address will overflow
    const addressHeight = splitAddress.length * 4;
    if (yPos + addressHeight > maxContentY) {
      doc.addPage();
      yPos = 20;
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.lightSlate);
      doc.text("DELIVERY ADDRESS", margin, yPos);
      yPos += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.darkSlate);
    }
    
    doc.text(splitAddress, margin, yPos);
  }

  // ═══════════════════════════════════════════════════════════════
  // PROFESSIONAL FOOTER (on all pages)
  // ═══════════════════════════════════════════════════════════════

  const totalPages = doc.getNumberOfPages();
  
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    
    const footerY = pageHeight - 18;

    // Footer separator line
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY, pageWidth - margin, footerY);

    // Left: Company registration info
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.lightSlate);

    const footerLeft: string[] = [];
    if (companySettings?.company_name) {
      footerLeft.push(companySettings.company_name);
    }
    if (companySettings?.registration_number) {
      footerLeft.push(`Reg: ${companySettings.registration_number}`);
    }
    if (companySettings?.vat_number) {
      footerLeft.push(`VAT: ${companySettings.vat_number}`);
    }

    if (footerLeft.length > 0) {
      doc.text(footerLeft.join("  |  "), margin, footerY + 5);
    }

    // Right: Generation timestamp
    doc.text(
      `Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
      pageWidth - margin,
      footerY + 5,
      { align: "right" }
    );

    // Page number (centered, below the line)
    doc.text(
      `Page ${page} of ${totalPages}`,
      pageWidth / 2,
      footerY + 10,
      { align: "center" }
    );
  }

  return doc;
}

async function loadImage(url: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);

      resolve({
        dataUrl: canvas.toDataURL("image/png"),
        width: img.width,
        height: img.height,
      });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function normalizeLine(input: string): string {
  return input.replace(/\s+/g, " ").trim().toLowerCase();
}

function includesIgnoreCase(haystack: string, needle: string): boolean {
  return normalizeLine(haystack).includes(normalizeLine(needle));
}

function sanitizeAddressLines(address: string | null, companyName: string | null): string[] {
  if (!address) return [];

  const company = companyName ? normalizeLine(companyName) : null;
  const lines = address
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => {
      if (!company) return true;
      return normalizeLine(l) !== company;
    });

  if (company) {
    return lines
      .map((l) => {
        const nl = normalizeLine(l);
        if (nl.startsWith(company + ",")) return l.slice(l.indexOf(",") + 1).trim();
        if (nl.startsWith(company + " -")) return l.slice(l.indexOf("-") + 1).trim();
        return l;
      })
      .filter(Boolean);
  }

  return lines;
}

export async function downloadPurchaseOrderPDF(
  purchaseOrder: PurchaseOrder,
  companySettings: CompanySettings | null
): Promise<void> {
  const doc = await generatePurchaseOrderPDF(purchaseOrder, companySettings);
  doc.save(`${purchaseOrder.po_number}.pdf`);
}

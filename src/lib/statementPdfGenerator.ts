import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, differenceInDays } from "date-fns";
import { CompanySettings } from "@/services/companySettingsService";
import { XeroOutstandingInvoice } from "@/services/xeroService";

interface StatementPdfOptions {
  customerName: string;
  invoices: XeroOutstandingInvoice[];
  companySettings: CompanySettings | null;
}

export async function generateStatementPDF({
  customerName,
  invoices,
  companySettings,
}: StatementPdfOptions): Promise<jsPDF> {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  // ═══════════════════════════════════════════════════════════════
  // HEADER — matches PO style
  // ═══════════════════════════════════════════════════════════════
  let yPos = 20;

  // Company logo — left side (32x28, matching PO)
  const logoUrl = companySettings?.report_logo_url || companySettings?.company_logo_url;
  if (logoUrl) {
    try {
      const logoImg = await loadImage(logoUrl);
      doc.addImage(logoImg, "PNG", margin, yPos - 2, 32, 28);
    } catch {
      // Skip logo
    }
  }

  // Company details — right-aligned (matching PO style)
  const rightX = pageWidth - margin;
  let contactY = yPos;

  const companyName2 = companySettings?.company_name || "Company";
  doc.setTextColor(74, 85, 104);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(companyName2, rightX, contactY, { align: "right" });
  contactY += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(113, 128, 150);

  if (companySettings?.address) {
    doc.text(companySettings.address, rightX, contactY, { align: "right" });
    contactY += 4;
  }
  const cityPostLine = `${companySettings?.city || ""} ${companySettings?.postcode || ""}`.trim();
  if (cityPostLine) {
    doc.text(cityPostLine, rightX, contactY, { align: "right" });
    contactY += 4;
  }
  if (companySettings?.phone) {
    doc.text(`T: ${companySettings.phone}`, rightX, contactY, { align: "right" });
    contactY += 4;
  }
  if (companySettings?.email) {
    doc.text(`E: ${companySettings.email}`, rightX, contactY, { align: "right" });
  }

  yPos = 48;

  // ═══════════════════════════════════════════════════════════════
  // DOCUMENT TITLE WITH ACCENT BAR — matches PO style
  // ═══════════════════════════════════════════════════════════════
  doc.setFillColor(185, 28, 28);
  doc.rect(margin, yPos, 4, 16, "F");

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(28, 28, 32);
  doc.text("STATEMENT OF ACCOUNT", margin + 10, yPos + 7);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(113, 128, 150);
  doc.text(format(new Date(), "dd MMMM yyyy"), margin + 10, yPos + 14);

  yPos += 28;

  // Customer name
  doc.setFontSize(12);
  doc.setTextColor(28, 28, 32);
  doc.setFont("helvetica", "bold");
  doc.text(customerName, margin, yPos);
  let y = yPos + 8;

  // Summary bar
  const totalDue = invoices.reduce((sum, inv) => sum + inv.amountDue, 0);
  const overdueInvoices = invoices.filter((inv) => inv.isOverdue);
  const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + inv.amountDue, 0);

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 14, 2, 2, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);

  const summaryCol = (pageWidth - margin * 2) / 4;
  doc.text(`Invoices: ${invoices.length}`, margin + 4, y + 6);
  doc.text(`Overdue: ${overdueInvoices.length}`, margin + summaryCol + 4, y + 6);
  doc.text(`Total Outstanding: ${formatCurrency(totalDue)}`, margin + summaryCol * 2 + 4, y + 6);

  doc.setFont("helvetica", "bold");
  if (totalOverdue > 0) {
    doc.setTextColor(200, 50, 50);
  }
  doc.text(`Total Overdue: ${formatCurrency(totalOverdue)}`, margin + summaryCol * 3 + 4, y + 6);
  y += 20;

  // Invoice table
  const tableBody = invoices.map((inv) => {
    const daysOverdue = inv.isOverdue
      ? differenceInDays(new Date(), new Date(inv.dueDate))
      : 0;
    return [
      inv.invoiceNumber,
      inv.reference || "-",
      formatDateShort(inv.date),
      formatDateShort(inv.dueDate),
      inv.isOverdue ? `${daysOverdue} days` : "Current",
      formatCurrency(inv.total),
      formatCurrency(inv.amountPaid),
      formatCurrency(inv.amountDue),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Invoice #", "Reference", "Date", "Due Date", "Status", "Total", "Paid", "Amount Due"]],
    body: tableBody,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [50, 50, 50],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 22 },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      // Highlight overdue rows
      if (data.section === "body" && data.row.index !== undefined) {
        const inv = invoices[data.row.index];
        if (inv?.isOverdue) {
          const daysOver = differenceInDays(new Date(), new Date(inv.dueDate));
          if (daysOver > 30) {
            data.cell.styles.textColor = [180, 40, 40];
          } else if (daysOver > 14) {
            data.cell.styles.textColor = [180, 100, 30];
          }
        }
      }
    },
    foot: [["", "", "", "", "", "", "Total Due:", formatCurrency(totalDue)]],
    footStyles: {
      fillColor: [240, 240, 240],
      textColor: [30, 30, 30],
      fontStyle: "bold",
      fontSize: 9,
    },
  });

  // Aging summary
  const finalY = (doc as any).lastAutoTable?.finalY || y + 60;
  let agingY = finalY + 10;

  if (agingY + 30 > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage();
    agingY = margin;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("Aging Summary", margin, agingY);
  agingY += 6;

  const buckets = computeAgingBuckets(invoices);
  autoTable(doc, {
    startY: agingY,
    head: [buckets.map((b) => b.label)],
    body: [buckets.map((b) => formatCurrency(b.amount))],
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 3, halign: "center" },
    headStyles: { fillColor: [80, 80, 80], textColor: 255 },
  });

  // Professional footer — matches PO style
  const totalPages = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    const footerY2 = pageHeight - 18;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY2, pageWidth - margin, footerY2);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(113, 128, 150);

    const footerParts: string[] = [];
    if (companySettings?.company_name) footerParts.push(companySettings.company_name);
    if (companySettings?.registration_number) footerParts.push(`Reg: ${companySettings.registration_number}`);
    if (companySettings?.vat_number) footerParts.push(`VAT: ${companySettings.vat_number}`);
    if (footerParts.length > 0) doc.text(footerParts.join("  |  "), margin, footerY2 + 5);

    doc.text(`Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth - margin, footerY2 + 5, { align: "right" });
    doc.text(`Page ${pg} of ${totalPages}`, pageWidth / 2, footerY2 + 10, { align: "center" });
  }

  return doc;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

function formatDateShort(dateStr: string): string {
  try {
    return format(new Date(dateStr), "dd/MM/yyyy");
  } catch {
    return "-";
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

interface AgingBucket {
  label: string;
  amount: number;
}

function computeAgingBuckets(invoices: XeroOutstandingInvoice[]): AgingBucket[] {
  const now = new Date();
  const buckets: AgingBucket[] = [
    { label: "Current", amount: 0 },
    { label: "1-14 Days", amount: 0 },
    { label: "15-30 Days", amount: 0 },
    { label: "31-60 Days", amount: 0 },
    { label: "60+ Days", amount: 0 },
  ];

  invoices.forEach((inv) => {
    if (!inv.isOverdue) {
      buckets[0].amount += inv.amountDue;
    } else {
      const days = differenceInDays(now, new Date(inv.dueDate));
      if (days <= 14) buckets[1].amount += inv.amountDue;
      else if (days <= 30) buckets[2].amount += inv.amountDue;
      else if (days <= 60) buckets[3].amount += inv.amountDue;
      else buckets[4].amount += inv.amountDue;
    }
  });

  return buckets;
}

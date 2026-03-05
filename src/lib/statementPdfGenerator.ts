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
  let y = margin;

  // Load company logo if available
  let logoImg: HTMLImageElement | null = null;
  const logoUrl = companySettings?.report_logo_url || companySettings?.company_logo_url;
  if (logoUrl) {
    try {
      logoImg = await loadImage(logoUrl);
    } catch {
      // Skip logo if it can't be loaded
    }
  }

  // Header with logo
  if (logoImg) {
    const maxLogoH = 18;
    const ratio = logoImg.width / logoImg.height;
    const logoH = maxLogoH;
    const logoW = logoH * ratio;
    doc.addImage(logoImg, "PNG", margin, y, Math.min(logoW, 50), logoH);
    y += logoH + 4;
  }

  // Company details
  const companyName = companySettings?.company_name || "Company";
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  const companyLines: string[] = [companyName];
  if (companySettings?.address) companyLines.push(companySettings.address);
  const cityPostcode = [companySettings?.city, companySettings?.postcode].filter(Boolean).join(", ");
  if (cityPostcode) companyLines.push(cityPostcode);
  if (companySettings?.phone) companyLines.push(`Tel: ${companySettings.phone}`);
  if (companySettings?.email) companyLines.push(companySettings.email);

  companyLines.forEach((line) => {
    doc.text(line, margin, y);
    y += 4.5;
  });

  y += 6;

  // Statement title
  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.text("STATEMENT OF ACCOUNT", margin, y);

  // Date on right
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Date: ${format(new Date(), "dd MMMM yyyy")}`, pageWidth - margin, y, { align: "right" });
  y += 10;

  // Customer name
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.text(customerName, margin, y);
  y += 8;

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

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(140, 140, 140);
  const footerText = companySettings?.report_footer_text || `${companyName} - Statement generated ${format(new Date(), "dd/MM/yyyy")}`;
  doc.text(footerText, pageWidth / 2, footerY, { align: "center" });

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

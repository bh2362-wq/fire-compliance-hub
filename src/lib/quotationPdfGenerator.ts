/**
 * quotationPdfGenerator.ts — clean rewrite
 * Consistent 8–9pt type scale, dark section headers matching cert PDFs.
 * Fixes: mixed fonts, double scope header, UUID notes, orphaned totals.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

const C = {
  dark:   [60, 60, 60]    as [number,number,number],
  black:  [26, 26, 26]    as [number,number,number],
  body:   [55, 65, 81]    as [number,number,number],
  muted:  [95, 100, 108]  as [number,number,number],
  light:  [156, 163, 175] as [number,number,number],
  border: [224, 224, 224] as [number,number,number],
  altrow: [250, 250, 250] as [number,number,number],
  white:  [255, 255, 255] as [number,number,number],
};

const CO = {
  name:  "BHO FIRE",
  addr:  "St Georges Business Park, Castle Rd",
  city:  "Sittingbourne ME10 3TB",
  phone: "0330 043 8659",
  email: "admin@bhofire.com",
  reg:   "Company Registration No. 12235152",
  vat:   "GB404667595",
};

export interface PDFColumnOptions {
  showItemNumber: boolean; showDescription: boolean; showRegulationRef: boolean;
  showPriority: boolean; showItem: boolean; showQuantity: boolean;
  showUnitPrice: boolean; showLabour: boolean; showTotal: boolean;
}

export interface QuotationLineItem {
  description: string; regulation_reference?: string | null; priority: string;
  item_name?: string | null; parent_id?: string | null;
  quantity: number; unit_price: number; markup_percent?: number;
  labour_cost?: number; labour_included?: boolean; total_price: number;
}

export interface QuotationData {
  quotation_number: string; title?: string | null; summary?: string | null;
  total_amount: number; valid_until?: string | null; notes?: string | null;
  terms?: string | null; created_at: string;
  site: { name: string; address?: string | null; city?: string | null; postcode?: string | null };
  customer?: { name: string; contact_name?: string | null; contact_email?: string | null;
    contact_phone?: string | null; address?: string | null; city?: string | null; postcode?: string | null } | null;
  line_items: QuotationLineItem[]; prepared_by?: string | null; vat_rate?: number;
}

interface CompanySettings {
  company_name?: string; report_logo_url?: string | null; company_logo_url?: string | null;
  address?: string | null; city?: string | null; postcode?: string | null;
  phone?: string | null; email?: string | null; vat_number?: string | null;
  bank_name?: string | null; bank_sort_code?: string | null;
  bank_account_number?: string | null; bank_account_name?: string | null;
}

async function loadLogo(url?: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise(r => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => r(img); img.onerror = () => r(null); img.src = url;
  });
}

function san(s: string): string {
  return (s || "")
    .replace(/[\u2022\u2023\u25CF\u25CB\u2043\u2219]/g, "-")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\x7F]/g, "");
}

function gbp(n: number): string { return "\u00A3" + n.toFixed(2); }

function secHead(doc: jsPDF, label: string, y: number, left: number, right: number): number {
  doc.setFillColor(...C.dark);
  doc.rect(left, y, right - left, 7, "F");
  doc.setTextColor(...C.white);
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  doc.text(label, left + 4, y + 5);
  return y + 7;
}

function guard(doc: jsPDF, y: number, need: number): number {
  if (y + need > doc.internal.pageSize.getHeight() - 18) {
    doc.addPage(); return 15;
  }
  return y;
}

function drawHeader(doc: jsPDF, pw: number, m: number, logo: HTMLImageElement | null, s?: CompanySettings): number {
  if (logo) { try { doc.addImage(logo, "PNG", m, 16, 30, 26); } catch {} }
  const rx = pw - m; let ry = 18;
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.black);
  doc.text(s?.company_name || CO.name, rx, ry, { align: "right" }); ry += 4.5;
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.muted);
  doc.text(san(s?.address || CO.addr), rx, ry, { align: "right" }); ry += 4;
  const cl = s?.city ? `${s.city} ${s.postcode || ""}`.trim() : CO.city;
  doc.text(san(cl), rx, ry, { align: "right" }); ry += 4;
  doc.text(`T: ${s?.phone || CO.phone}`, rx, ry, { align: "right" }); ry += 4;
  doc.text(`E: ${s?.email || CO.email}`, rx, ry, { align: "right" });
  doc.setDrawColor(...C.border); doc.setLineWidth(0.3);
  doc.line(m, 46, pw - m, 46);
  return 54;
}

function drawTitle(doc: jsPDF, pw: number, m: number, y: number, data: QuotationData): number {
  doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.black);
  doc.text("Quotation", m, y + 6);
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.black);
  doc.text(data.quotation_number, pw - m, y, { align: "right" });
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.muted);
  doc.text(format(new Date(data.created_at), "dd MMM yyyy"), pw - m, y + 5, { align: "right" });
  y += 14;
  if (data.title) {
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.muted);
    const tl = doc.splitTextToSize(san(data.title), pw - m * 2);
    doc.text(tl, m, y); y += tl.length * 4.5 + 2;
  }
  return y + 4;
}

function drawInfoBlocks(doc: jsPDF, pw: number, m: number, y: number, data: QuotationData): number {
  const cw = pw - m * 2;
  const half = (cw - 4) / 2;
  const lx = m, rx = m + half + 4;

  let ly = secHead(doc, "CLIENT", y, lx, lx + half) + 3;
  if (data.customer) {
    const c = data.customer;
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.black);
    doc.text(san(c.name), lx + 4, ly); ly += 5;
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.body);
    if (c.contact_name) { doc.text(`FAO: ${san(c.contact_name)}`, lx + 4, ly); ly += 4.5; }
    if (c.contact_email){ doc.text(san(c.contact_email), lx + 4, ly); ly += 4.5; }
    if (c.contact_phone){ doc.text(san(c.contact_phone), lx + 4, ly); ly += 4.5; }
    if (c.address)      { doc.text(san(c.address), lx + 4, ly); ly += 4.5; }
    if (c.city || c.postcode) {
      doc.text(`${c.city || ""} ${c.postcode || ""}`.trim(), lx + 4, ly); ly += 4.5;
    }
  } else {
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.muted);
    doc.text("No customer specified", lx + 4, ly); ly += 5;
  }

  let ry2 = secHead(doc, "SITE", y, rx, rx + half) + 3;
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.black);
  doc.text(san(data.site.name), rx + 4, ry2); ry2 += 5;
  const siteAddr = [data.site.address, data.site.city, data.site.postcode].filter(Boolean).join(", ");
  if (siteAddr) {
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.body);
    const al = doc.splitTextToSize(san(siteAddr), half - 8);
    doc.text(al, rx + 4, ry2); ry2 += al.length * 4 + 3;
  }

  ry2 += 2;
  ry2 = secHead(doc, "QUOTE DETAILS", ry2, rx, rx + half) + 3;
  const qrows: [string,string][] = [
    ["Date issued", format(new Date(data.created_at), "dd MMMM yyyy")],
    ["Valid until", data.valid_until ? format(new Date(data.valid_until), "dd MMMM yyyy") : "30 days from issue"],
  ];
  qrows.forEach(([label, val]) => {
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.muted);
    doc.text(label, rx + 4, ry2);
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.black);
    doc.text(san(val), rx + 4, ry2 + 4.5); ry2 += 10;
  });

  return Math.max(ly, ry2) + 5;
}

function drawScope(doc: jsPDF, pw: number, m: number, y: number, data: QuotationData): number {
  if (!data.summary) return y;
  y = guard(doc, y, 20);
  y = secHead(doc, "SCOPE OF WORKS", y, m, pw - m) + 4;
  const sumLines = doc.splitTextToSize(san(data.summary), pw - m * 2 - 4);
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.body);
  sumLines.forEach((line: string) => {
    y = guard(doc, y, 5); doc.text(line, m + 2, y); y += 4.5;
  });
  return y + 3;
}

function drawLineItems(doc: jsPDF, pw: number, m: number, y: number, data: QuotationData, opts: PDFColumnOptions): number {
  y = guard(doc, y, 30);
  y = secHead(doc, "LINE ITEMS", y, m, pw - m);
  const heads: string[] = [], cols: Record<number, any> = {};
  let ci = 0;
  if (opts.showItemNumber)    { heads.push("#");             cols[ci++] = { cellWidth: 7,  halign: "center", fontStyle: "bold" }; }
  if (opts.showDescription)   { heads.push("Description");   cols[ci++] = { cellWidth: "auto" }; }
  if (opts.showRegulationRef) { heads.push("Ref");           cols[ci++] = { cellWidth: 24, fontSize: 7 }; }
  if (opts.showPriority)      { heads.push("Priority");      cols[ci++] = { cellWidth: 16, halign: "center", fontSize: 7 }; }
  if (opts.showItem)          { heads.push("Item");          cols[ci++] = { cellWidth: 28, fontSize: 7.5 }; }
  if (opts.showQuantity)      { heads.push("Qty");           cols[ci++] = { cellWidth: 10, halign: "center" }; }
  if (opts.showUnitPrice)     { heads.push("Unit \u00A3");   cols[ci++] = { cellWidth: 18, halign: "right" }; }
  if (opts.showLabour)        { heads.push("Labour \u00A3"); cols[ci++] = { cellWidth: 18, halign: "right" }; }
  if (opts.showTotal)         { heads.push("Total \u00A3");  cols[ci++] = { cellWidth: 20, halign: "right", fontStyle: "bold" }; }
  const totalColIdx = ci - 1;
  const rows = data.line_items.filter(i => !i.parent_id).map((item, idx) => {
    const labour = item.labour_cost || 0;
    const qty = item.quantity || 1;
    const unit = qty > 0 ? (item.total_price - labour) / qty : item.unit_price * (1 + (item.markup_percent || 0) / 100);
    const row: string[] = [];
    if (opts.showItemNumber)    row.push((idx + 1).toString());
    if (opts.showDescription)   row.push(san(item.description));
    if (opts.showRegulationRef) row.push(san(item.regulation_reference || ""));
    if (opts.showPriority)      row.push(item.priority ? item.priority[0].toUpperCase() + item.priority.slice(1) : "");
    if (opts.showItem)          row.push(san(item.item_name || ""));
    if (opts.showQuantity)      row.push(qty.toString());
    if (opts.showUnitPrice)     row.push(gbp(unit));
    if (opts.showLabour)        row.push(item.labour_included ? "Incl." : labour > 0 ? gbp(labour) : "");
    if (opts.showTotal)         row.push(gbp(item.total_price));
    return row;
  });
  autoTable(doc, {
    startY: y,
    head: [heads],
    body: rows,
    margin: { left: m, right: m, bottom: 22 },
    tableWidth: pw - m * 2,
    styles: { fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 }, textColor: C.body, lineColor: C.border, lineWidth: 0.15, overflow: "linebreak", font: "helvetica" },
    headStyles: { fillColor: C.dark, textColor: C.white, fontStyle: "bold", fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
    columnStyles: cols,
    alternateRowStyles: { fillColor: C.altrow },
    bodyStyles: { minCellHeight: 8 },
    didParseCell(h) {
      if (h.section === "body" && opts.showTotal && h.column.index === totalColIdx) {
        h.cell.styles.fontStyle = "bold";
        h.cell.styles.textColor = C.black as any;
      }
    },
  });
  return (doc as any).lastAutoTable.finalY;
}

function drawTotals(doc: jsPDF, pw: number, m: number, y: number, data: QuotationData): number {
  y = guard(doc, y, 28); y += 5;
  const vr = data.vat_rate ?? 20;
  const sub = data.total_amount, vat = sub * (vr / 100), tot = sub + vat;
  const tx = pw - m - 75;
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.muted);
  doc.text("Subtotal", tx, y);
  doc.setTextColor(...C.body); doc.text(gbp(sub), pw - m, y, { align: "right" }); y += 5.5;
  doc.setTextColor(...C.muted); doc.text(`VAT (${vr}%)`, tx, y);
  doc.setTextColor(...C.body); doc.text(gbp(vat), pw - m, y, { align: "right" }); y += 4;
  doc.setDrawColor(...C.border); doc.setLineWidth(0.4); doc.line(tx, y, pw - m, y); y += 5;
  doc.setFontSize(9.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.black);
  doc.text("Total (inc. VAT)", tx, y);
  doc.text(gbp(tot), pw - m, y, { align: "right" });
  return y + 9;
}

function drawTerms(doc: jsPDF, pw: number, m: number, y: number, terms: string): number {
  y = guard(doc, y, 40);
  y = secHead(doc, "TERMS & CONDITIONS", y, m, pw - m) + 4;
  const lines = doc.splitTextToSize(san(terms), pw - m * 2 - 4);
  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.body);
  lines.forEach((l: string) => { y = guard(doc, y, 5); doc.text(l, m + 2, y); y += 4; });
  return y + 4;
}

function drawAcceptance(doc: jsPDF, pw: number, m: number, y: number): number {
  y = guard(doc, y, 36);
  y = secHead(doc, "ACCEPTANCE & AUTHORISATION", y, m, pw - m) + 5;
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.body);
  doc.text("I accept this quotation and authorise BHO Fire Ltd to proceed with the works as detailed above.", m + 2, y);
  y += 10;
  const fw = (pw - m * 2 - 12) / 3;
  [{ label: "Signature", x: m + 2 }, { label: "Print Name", x: m + 2 + fw + 6 }, { label: "Date", x: m + 2 + (fw + 6) * 2 }]
    .forEach(f => {
      doc.setDrawColor(...C.muted); doc.setLineWidth(0.4);
      doc.line(f.x, y + 8, f.x + fw - 2, y + 8);
      doc.setFontSize(7.5); doc.setTextColor(...C.muted);
      doc.text(f.label, f.x, y + 13);
    });
  return y + 18;
}

function drawFooters(doc: jsPDF, pw: number, m: number, s?: CompanySettings) {
  const ph = doc.internal.pageSize.getHeight(), n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const fy = ph - 13;
    doc.setDrawColor(...C.border); doc.setLineWidth(0.3); doc.line(m, fy, pw - m, fy);
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.light);
    const left = [s?.company_name || CO.name, CO.reg, `VAT: ${s?.vat_number || CO.vat}`].join("  |  ");
    doc.text(left, m, fy + 4);
    doc.text(`Generated ${format(new Date(), "dd/MM/yyyy")}`, pw - m, fy + 4, { align: "right" });
    doc.text(`Page ${i} of ${n}`, pw / 2, fy + 9, { align: "center" });
  }
}

const DEF_COLS: PDFColumnOptions = {
  showItemNumber: true, showDescription: true, showRegulationRef: false,
  showPriority: false, showItem: false, showQuantity: true,
  showUnitPrice: true, showLabour: false, showTotal: true,
};

export async function generateQuotationPDF(
  data: QuotationData,
  settings?: CompanySettings,
  returnBase64 = false,
  columnOptions: PDFColumnOptions = DEF_COLS
): Promise<string | void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth(), m = 15;
  const logo = await loadLogo(settings?.report_logo_url || settings?.company_logo_url);
  let y = drawHeader(doc, pw, m, logo, settings);
  y     = drawTitle(doc, pw, m, y, data);
  y     = drawInfoBlocks(doc, pw, m, y, data);
  y     = drawScope(doc, pw, m, y + 2, data);
  const tableEnd = drawLineItems(doc, pw, m, y, data, columnOptions);
  y              = drawTotals(doc, pw, m, tableEnd, data);
  if (data.terms) y = drawTerms(doc, pw, m, y, data.terms);
  if (data.notes) {
    const cleaned = data.notes
      .replace(/Defect IDs?:[\s\S]*$/gi, "")
      .replace(/Remedial works quotation generated[^.]*\./gi, "")
      .trim();
    if (cleaned.length > 10) {
      y = guard(doc, y, 20);
      y = secHead(doc, "ADDITIONAL NOTES", y, m, pw - m) + 4;
      const nl = doc.splitTextToSize(san(cleaned), pw - m * 2 - 4);
      doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.body);
      nl.forEach((l: string) => { y = guard(doc, y, 5); doc.text(l, m + 2, y); y += 4; });
      y += 4;
    }
  }
  drawAcceptance(doc, pw, m, y);
  drawFooters(doc, pw, m, settings);
  if (returnBase64) return doc.output("datauristring").split(",")[1];
  doc.save(`${data.quotation_number}.pdf`);
}
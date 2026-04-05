import jsPDF from "jspdf";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getCompanySettings, CompanySettings } from "@/services/companySettingsService";

const COLORS = {
  charcoal: [45, 45, 48] as [number, number, number],
  red: [200, 30, 30] as [number, number, number],
  darkGrey: [80, 80, 85] as [number, number, number],
  mediumGrey: [140, 140, 145] as [number, number, number],
  lightGrey: [245, 245, 247] as [number, number, number],
  borderGrey: [220, 220, 225] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

function sanitize(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, "-")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2026/g, "...");
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function addFooter(doc: jsPDF, pageWidth: number, margin: number, company: CompanySettings | null, pageNum: number, totalPages: number) {
  const footerY = doc.internal.pageSize.getHeight() - 10;
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text(company?.company_name || "Company", margin, footerY);
  doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, footerY, { align: "right" });
  if (company?.report_footer_text) {
    doc.text(sanitize(company.report_footer_text), pageWidth / 2, footerY, { align: "center" });
  }
}

interface VisitInfo {
  id: string;
  visit_date: string;
  visit_type: string;
  status: string;
  notes: string | null;
  site?: { name: string; address?: string | null } | null;
  customer?: { name: string } | null;
  engineer?: { full_name: string | null } | null;
}

interface SubSheet {
  id: string;
  file_name: string;
  file_type: string;
  storage_path: string;
}

export async function generateSubcontractorReport(visit: VisitInfo) {
  const company = await getCompanySettings();
  
  // Fetch subcontractor sheets
  const { data: sheets } = await supabase
    .from("visit_subcontractor_sheets")
    .select("id, file_name, file_type, storage_path")
    .eq("visit_id", visit.id)
    .order("created_at");

  if (!sheets || sheets.length === 0) {
    throw new Error("No subcontractor sheets found for this visit");
  }

  // Load company logo
  let logoImg: HTMLImageElement | null = null;
  if (company?.company_logo_url) {
    logoImg = await loadImage(company.company_logo_url);
  }

  // Load all image sheets
  const sheetImages: { sheet: SubSheet; img: HTMLImageElement | null }[] = [];
  for (const sheet of sheets as SubSheet[]) {
    if (sheet.file_type.startsWith("image/")) {
      const { data } = supabase.storage.from("visit-attachments").getPublicUrl(sheet.storage_path);
      const img = data?.publicUrl ? await loadImage(data.publicUrl) : null;
      sheetImages.push({ sheet, img });
    } else {
      sheetImages.push({ sheet, img: null });
    }
  }

  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // ===== COVER PAGE =====
  let y = 14;

  // Header with logo
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", margin, y, 32, 28);
    } catch {
      doc.setTextColor(...COLORS.charcoal);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(company?.company_name || "Company", margin, y + 14);
    }
  }

  // Company info - right aligned
  const rightX = pageWidth - margin;
  let contactY = y + 4;
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.mediumGrey);
  doc.setFont("helvetica", "normal");
  if (company?.phone) { doc.text(company.phone, rightX, contactY, { align: "right" }); contactY += 4; }
  if (company?.email) { doc.text(company.email, rightX, contactY, { align: "right" }); contactY += 4; }
  if (company?.website) { doc.text(company.website, rightX, contactY, { align: "right" }); }

  // Title
  y = 55;
  doc.setFillColor(...COLORS.red);
  doc.rect(margin, y, contentWidth, 1, "F");
  y += 8;
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("SUBCONTRACTOR WORKS REPORT", margin, y);

  y += 12;
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.darkGrey);
  doc.setFont("helvetica", "normal");
  doc.text("This report contains documentation from subcontractor works carried out on behalf of the client.", margin, y, { maxWidth: contentWidth });

  // Info table
  y += 16;
  const rows: [string, string][] = [
    ["Client", visit.customer?.name || "N/A"],
    ["Site", visit.site?.name || "N/A"],
    ["Site Address", visit.site?.address || "N/A"],
    ["Visit Date", format(new Date(visit.visit_date), "dd MMMM yyyy")],
    ["Visit Type", visit.visit_type?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "N/A"],
    ["Status", visit.status?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "N/A"],
    ["Engineer", visit.engineer?.full_name || "N/A"],
    ["Documents Attached", `${sheets.length} subcontractor sheet(s)`],
  ];

  const labelW = 45;
  const valueW = contentWidth - labelW;
  const rowH = 8;

  for (let i = 0; i < rows.length; i++) {
    const ry = y + i * rowH;
    doc.setFillColor(i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
    doc.rect(margin, ry, contentWidth, rowH, "F");
    doc.setDrawColor(...COLORS.borderGrey);
    doc.rect(margin, ry, contentWidth, rowH, "S");

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.charcoal);
    doc.text(rows[i][0], margin + 3, ry + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.darkGrey);
    doc.text(sanitize(rows[i][1]), margin + labelW + 3, ry + 5.5, { maxWidth: valueW - 6 });
  }

  // Visit notes
  if (visit.notes) {
    let notesText = visit.notes;
    try {
      const parsed = JSON.parse(visit.notes);
      if (parsed?.user_notes) notesText = parsed.user_notes;
    } catch { /* plain text */ }

    if (notesText.trim()) {
      y += rows.length * rowH + 10;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.charcoal);
      doc.text("Visit Notes", margin, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.darkGrey);
      const lines = doc.splitTextToSize(sanitize(notesText), contentWidth);
      doc.text(lines, margin, y);
      y += lines.length * 4;
    }
  }

  // Document index
  y += 10;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.charcoal);
  doc.text("Attached Documents", margin, y);
  y += 6;

  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i] as SubSheet;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.darkGrey);
    const icon = s.file_type.startsWith("image/") ? "[IMAGE]" : "[PDF]";
    doc.text(`${i + 1}. ${icon} ${sanitize(s.file_name)}`, margin + 3, y);
    y += 5;
  }

  // ===== SUBCONTRACTOR SHEET PAGES =====
  for (const { sheet, img } of sheetImages) {
    doc.addPage();
    let py = 14;

    // Mini header
    if (logoImg) {
      try { doc.addImage(logoImg, "PNG", margin, py - 2, 20, 17); } catch { /* skip */ }
    }
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text(`${visit.site?.name || "Site"} - ${format(new Date(visit.visit_date), "dd/MM/yyyy")}`, pageWidth - margin, py + 4, { align: "right" });

    py = 38;
    doc.setFillColor(...COLORS.lightGrey);
    doc.rect(margin, py - 5, contentWidth, 8, "F");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.charcoal);
    doc.text(sanitize(sheet.file_name), margin + 3, py);
    py += 8;

    if (img) {
      // Fit image into available space
      const maxW = contentWidth;
      const maxH = pageHeight - py - 20;
      const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * ratio;
      const h = img.height * ratio;
      const x = margin + (contentWidth - w) / 2;
      try {
        doc.addImage(img, "JPEG", x, py, w, h);
      } catch {
        doc.setTextColor(...COLORS.mediumGrey);
        doc.text("Image could not be rendered in PDF", margin, py + 10);
      }
    } else {
      // PDF or non-renderable file — show reference
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.darkGrey);
      doc.setFont("helvetica", "normal");
      doc.text("This document is a PDF file attached to the visit.", margin, py + 5);
      doc.text("Please refer to the original file for full content.", margin, py + 11);
      doc.setTextColor(...COLORS.red);
      doc.setFont("helvetica", "bold");
      doc.text(sanitize(sheet.file_name), margin, py + 20);
    }
  }

  // Add footers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, pageWidth, margin, company, i, totalPages);
  }

  // Download
  const siteName = (visit.site?.name || "Site").replace(/[^a-zA-Z0-9]/g, "_");
  const dateStr = format(new Date(visit.visit_date), "yyyy-MM-dd");
  doc.save(`Subcontractor_Report_${siteName}_${dateStr}.pdf`);
}

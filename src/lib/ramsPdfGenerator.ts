import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { RamsDocument } from "@/services/ramsService";
import { supabase } from "@/integrations/supabase/client";

// ─── Uniform Color Palette (matches Quotations / POs / Service Reports) ────
const COLORS = {
  charcoal: [28, 28, 32] as [number, number, number],
  accent: [185, 28, 28] as [number, number, number],
  accentLight: [220, 38, 38] as [number, number, number],
  textPrimary: [17, 24, 39] as [number, number, number],
  textSecondary: [55, 65, 81] as [number, number, number],
  textMuted: [107, 114, 128] as [number, number, number],
  bgLight: [249, 250, 251] as [number, number, number],
  bgSubtle: [243, 244, 246] as [number, number, number],
  border: [229, 231, 235] as [number, number, number],
  borderDark: [209, 213, 219] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  riskLow: [22, 163, 74] as [number, number, number],
  riskMedium: [202, 138, 4] as [number, number, number],
  riskHigh: [234, 88, 12] as [number, number, number],
  riskVeryHigh: [220, 38, 38] as [number, number, number],
};

interface CompanySettings {
  company_name: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  company_logo_url?: string | null;
  report_logo_url?: string | null;
  vat_number?: string | null;
  registration_number?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadCompanySettings(): Promise<CompanySettings | null> {
  const { data } = await supabase
    .from("company_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  return data;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function sanitize(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\\n/g, "\n").trim();
}

function toBulletItems(text: string): string[] {
  return sanitize(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function riskColor(level: string): [number, number, number] {
  const l = level.toLowerCase();
  if (l === "low") return COLORS.riskLow;
  if (l === "medium") return COLORS.riskMedium;
  if (l === "high") return COLORS.riskHigh;
  return COLORS.riskVeryHigh;
}

// ─── Main Generator ──────────────────────────────────────────────────────────

export async function generateRamsPDF(document: RamsDocument): Promise<void> {
  const company = await loadCompanySettings();
  const logoUrl = company?.report_logo_url || company?.company_logo_url || null;
  const logoBase64 = logoUrl ? await loadImageAsBase64(logoUrl) : null;

  // Landscape A4
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth(); // ~297
  const ph = doc.internal.pageSize.getHeight(); // ~210
  const ml = 15;
  const mr = 15;
  const cw = pw - ml - mr;
  let y = 0;

  // ─── REUSABLE DRAWING HELPERS ──────────────────────────────

  function checkPage(need = 30) {
    if (y > ph - need) {
      doc.addPage();
      y = 20;
    }
  }

  function sectionHeader(label: string, isAlert = false) {
    checkPage(22);
    y += 3;

    // Highlight bar
    const fillColor = isAlert ? COLORS.accent : COLORS.charcoal;
    doc.setFillColor(...fillColor);
    doc.roundedRect(ml, y, cw, 8, 1, 1, "F");

    doc.setTextColor(...COLORS.white);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), ml + 5, y + 5.5);
    y += 12;
    doc.setTextColor(...COLORS.textPrimary);
  }

  function subHeader(label: string) {
    checkPage(14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.charcoal);
    doc.text(label, ml, y);
    y += 5;
  }

  function bodyText(text: string) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textSecondary);
    const lines = doc.splitTextToSize(sanitize(text), cw - 6);
    for (const line of lines) {
      checkPage(9);
      doc.text(line, ml + 4, y);
      y += 5.5;
    }
    y += 3;
  }

  function bulletList(text: string) {
    const items = toBulletItems(text);
    for (const item of items) {
      checkPage(10);
      // Black filled bullet disc
      doc.setFillColor(0, 0, 0);
      doc.circle(ml + 5, y - 1.5, 1, "F");
      // 12pt Arial text
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.textPrimary);
      const wrapped = doc.splitTextToSize(item, cw - 14);
      for (let i = 0; i < wrapped.length; i++) {
        if (i > 0) checkPage(9);
        doc.text(wrapped[i], ml + 10, y);
        y += 5.5;
      }
      // Spacing after each bullet point
      y += 3;
    }
    y += 2;
  }

  function keyValue(key: string, value: string | undefined | null, indent = ml + 2) {
    if (!value) return;
    checkPage(10);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.textMuted);
    doc.text(key, indent, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textPrimary);
    const valX = indent + 40;
    const lines = doc.splitTextToSize(sanitize(value), pw - mr - valX);
    doc.text(lines, valX, y);
    y += Math.max(lines.length * 4.2, 5) + 1;
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE 1: HEADER (matches quotation/PO style)
  // ═══════════════════════════════════════════════════════════════

  // Top accent stripe
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, 0, pw, 4, "F");
  doc.setFillColor(200, 28, 28);
  doc.rect(0, 4, pw, 1, "F");

  y = 14;

  // Logo (left) — same pattern as quotations
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", ml, y - 2, 32, 28, undefined, "FAST");
    } catch {
      doc.setTextColor(...COLORS.charcoal);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(company?.company_name || "Company", ml, y + 10);
    }
  } else {
    doc.setTextColor(...COLORS.charcoal);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(company?.company_name || "Company", ml, y + 10);
  }

  // Company details (right) — matches quotation style exactly
  const rightX = pw - mr;
  let contactY = y;

  if (company) {
    doc.setTextColor(...COLORS.textSecondary);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(company.company_name, rightX, contactY, { align: "right" });
    contactY += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.textMuted);
    if (company.address) {
      doc.text(company.address, rightX, contactY, { align: "right" });
      contactY += 4;
    }
    if (company.city || company.postcode) {
      doc.text(`${company.city || ""} ${company.postcode || ""}`.trim(), rightX, contactY, { align: "right" });
      contactY += 4;
    }
    if (company.phone) {
      doc.text(`T: ${company.phone}`, rightX, contactY, { align: "right" });
      contactY += 4;
    }
    if (company.email) {
      doc.text(`E: ${company.email}`, rightX, contactY, { align: "right" });
    }
  }

  // Separator line
  y = 48;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(ml, y, pw - mr, y);
  y += 6;

  // Document title
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("RISK ASSESSMENT & METHOD STATEMENT", ml, y + 2);

  doc.setTextColor(...COLORS.accent);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(document.rams_number, ml, y + 9);

  doc.setTextColor(...COLORS.textMuted);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Version ${document.version}`, ml + 50, y + 9);

  y += 16;

  // Title
  doc.setTextColor(...COLORS.textPrimary);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(document.title, cw);
  doc.text(titleLines, ml, y);
  y += titleLines.length * 5.5 + 4;

  // ═══════════════════════════════════════════════════════════════
  // DOCUMENT INFORMATION
  // ═══════════════════════════════════════════════════════════════

  sectionHeader("Document Information");

  const infoRows: string[][] = [];
  if (document.site) {
    infoRows.push(["Site:", document.site.name]);
    if (document.site.address) infoRows.push(["Address:", document.site.address]);
  }
  infoRows.push(["Status:", document.status.replace(/_/g, " ").toUpperCase()]);
  if (document.review_date) {
    infoRows.push(["Review Date:", format(new Date(document.review_date), "dd/MM/yyyy")]);
  }
  infoRows.push(["Created:", format(new Date(document.created_at), "dd/MM/yyyy")]);
  infoRows.push(["RAMS Ref:", document.rams_number]);

  autoTable(doc, {
    startY: y,
    body: infoRows,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 }, textColor: COLORS.textPrimary },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 35, textColor: COLORS.textMuted },
      1: { cellWidth: "auto" },
    },
    margin: { left: ml, right: mr },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ═══════════════════════════════════════════════════════════════
  // SITE-SPECIFIC HAZARDS
  // ═══════════════════════════════════════════════════════════════

  if (document.site_specific_hazards) {
    sectionHeader("Site-Specific Hazards", true);
    bulletList(document.site_specific_hazards);
  }

  // ═══════════════════════════════════════════════════════════════
  // SITE ACCESS NOTES
  // ═══════════════════════════════════════════════════════════════

  if (document.site_access_notes) {
    sectionHeader("Site Access Notes");
    bulletList(document.site_access_notes);
  }

  // ═══════════════════════════════════════════════════════════════
  // RISK ASSESSMENT TABLE
  // ═══════════════════════════════════════════════════════════════

  sectionHeader("Risk Assessment");

  const hazardHead = [
    ["#", "Hazard", "Who Affected", "Existing Controls", "L", "S", "Risk", "Additional Controls", "L", "S", "Residual"],
  ];
  const hazardRows = document.hazards.map((h, i) => [
    String(i + 1),
    sanitize(h.hazard),
    sanitize(h.who_affected).replace(/\n/g, ", "),
    sanitize(h.existing_controls).replace(/\n/g, "\n"),
    String(h.likelihood),
    String(h.severity),
    h.risk_level,
    sanitize(h.additional_controls).replace(/\n/g, "\n"),
    String(h.residual_likelihood),
    String(h.residual_severity),
    h.residual_risk,
  ]);

  autoTable(doc, {
    startY: y,
    head: hazardHead,
    body: hazardRows,
    theme: "grid",
    headStyles: {
      fillColor: COLORS.charcoal,
      textColor: COLORS.white,
      fontSize: 7.5,
      fontStyle: "bold",
      halign: "center",
      cellPadding: 2,
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: COLORS.textPrimary,
      lineColor: COLORS.borderDark,
      lineWidth: 0.2,
    },
    alternateRowStyles: { fillColor: COLORS.bgLight },
    columnStyles: {
      0: { cellWidth: 8, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 32 },
      2: { cellWidth: 24 },
      3: { cellWidth: 45 },
      4: { cellWidth: 8, halign: "center" },
      5: { cellWidth: 8, halign: "center" },
      6: { cellWidth: 16, halign: "center", fontStyle: "bold" },
      7: { cellWidth: 45 },
      8: { cellWidth: 8, halign: "center" },
      9: { cellWidth: 8, halign: "center" },
      10: { cellWidth: 16, halign: "center", fontStyle: "bold" },
    },
    margin: { left: ml, right: mr },
    didParseCell: (data) => {
      if ((data.column.index === 6 || data.column.index === 10) && data.section === "body") {
        const val = String(data.cell.raw);
        data.cell.styles.textColor = riskColor(val);
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ═══════════════════════════════════════════════════════════════
  // METHOD STATEMENT
  // ═══════════════════════════════════════════════════════════════

  sectionHeader("Method Statement");

  const methodHead = [["Step", "Description", "Responsible Person", "Equipment Required"]];
  const methodRows = document.method_statements.map((m, i) => [
    String(i + 1),
    sanitize(m.description),
    sanitize(m.responsible_person),
    sanitize(m.equipment_required),
  ]);

  autoTable(doc, {
    startY: y,
    head: methodHead,
    body: methodRows,
    theme: "grid",
    headStyles: {
      fillColor: COLORS.charcoal,
      textColor: COLORS.white,
      fontSize: 8.5,
      fontStyle: "bold",
      cellPadding: 2.5,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: COLORS.textPrimary,
      lineColor: COLORS.borderDark,
      lineWidth: 0.2,
    },
    alternateRowStyles: { fillColor: COLORS.bgLight },
    columnStyles: {
      0: { cellWidth: 14, halign: "center", fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 45 },
      3: { cellWidth: 50 },
    },
    margin: { left: ml, right: mr },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ═══════════════════════════════════════════════════════════════
  // PPE REQUIREMENTS
  // ═══════════════════════════════════════════════════════════════

  if (document.ppe_requirements.length > 0) {
    sectionHeader("Personal Protective Equipment (PPE)");

    const ppePerRow = 5; // landscape gives more width
    const ppeColW = cw / ppePerRow;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textPrimary);

    for (let i = 0; i < document.ppe_requirements.length; i++) {
      const col = i % ppePerRow;
      if (col === 0 && i > 0) y += 7;
      if (col === 0) checkPage(12);
      const x = ml + col * ppeColW;

      // Checkbox style
      doc.setDrawColor(...COLORS.borderDark);
      doc.setLineWidth(0.3);
      doc.rect(x, y - 3.5, 4, 4);
      doc.setFillColor(...COLORS.accent);
      // Tick mark
      doc.setDrawColor(...COLORS.accent);
      doc.setLineWidth(0.6);
      doc.line(x + 0.8, y - 1.5, x + 1.6, y - 0.5);
      doc.line(x + 1.6, y - 0.5, x + 3.2, y - 2.8);

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.textPrimary);
      doc.text(document.ppe_requirements[i], x + 6, y);
    }
    y += 10;
  }

  // ═══════════════════════════════════════════════════════════════
  // EMERGENCY PROCEDURES
  // ═══════════════════════════════════════════════════════════════

  if (document.emergency_procedures) {
    sectionHeader("Emergency Procedures", true);
    bodyText(document.emergency_procedures);
  }

  // ═══════════════════════════════════════════════════════════════
  // SIGNATURES
  // ═══════════════════════════════════════════════════════════════

  sectionHeader("Signatures & Approval");

  const sigW = (cw - 20) / 3;
  const sigH = 26;

  const sigLabels = [
    "Prepared By",
    "Reviewed By",
    document.client_name ? `Client (${document.client_name})` : "Client",
  ];
  const sigs = [document.preparer_signature, document.reviewer_signature, document.client_signature];
  const sigDates = [document.preparer_signed_at, document.reviewer_signed_at, document.client_signed_at];

  checkPage(sigH + 22);

  for (let i = 0; i < 3; i++) {
    const x = ml + i * (sigW + 10);

    // Label
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.textMuted);
    doc.text(sigLabels[i], x, y);

    // Box with subtle fill
    doc.setFillColor(...COLORS.bgLight);
    doc.setDrawColor(...COLORS.borderDark);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y + 2, sigW, sigH, 1, 1, "FD");

    // Signature image
    if (sigs[i]) {
      try {
        doc.addImage(sigs[i]!, "PNG", x + 3, y + 4, sigW - 6, sigH - 10, undefined, "FAST");
      } catch {
        // skip
      }
    }

    // Date
    if (sigDates[i]) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.textMuted);
      doc.text(
        `Signed: ${format(new Date(sigDates[i]!), "dd/MM/yyyy HH:mm")}`,
        x,
        y + sigH + 6
      );
    }
  }

  y += sigH + 12;

  // ═══════════════════════════════════════════════════════════════
  // FOOTER ON ALL PAGES (uniform with quotations/POs)
  // ═══════════════════════════════════════════════════════════════

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Bottom accent stripe
    doc.setFillColor(...COLORS.accent);
    doc.rect(0, ph - 12, pw, 1.5, "F");

    // Footer separator
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.2);
    doc.line(ml, ph - 14, pw - mr, ph - 14);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textMuted);

    // Left: registration
    const regLine = [company?.registration_number ? `Reg: ${company.registration_number}` : null, company?.vat_number ? `VAT: ${company.vat_number}` : null]
      .filter(Boolean)
      .join("  |  ");
    if (regLine) {
      doc.text(regLine, ml, ph - 7);
    }

    // Centre: doc ref
    const centreLine = `${document.rams_number}  |  Version ${document.version}  |  Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`;
    doc.text(centreLine, pw / 2, ph - 7, { align: "center" });

    // Right: page number
    doc.text(`Page ${i} of ${totalPages}`, pw - mr, ph - 7, { align: "right" });
  }

  // ─── SAVE ──────────────────────────────────────────────────────
  doc.save(`${document.rams_number}.pdf`);
}

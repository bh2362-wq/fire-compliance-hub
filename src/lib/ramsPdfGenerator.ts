import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { RamsDocument } from "@/services/ramsService";
import { supabase } from "@/integrations/supabase/client";

const CHARCOAL = "#1C1C20";
const RED_ACCENT = "#B91C1C";
const LIGHT_GRAY = "#F5F5F5";
const MID_GRAY = "#6B7280";
const BORDER_GRAY = "#D1D5DB";

async function loadCompanySettings() {
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

/** Strip literal backslash-n sequences that may have leaked from DB/LLM output */
function sanitize(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\\n/g, "\n").trim();
}

/** Convert newline-separated text into bullet-pointed lines */
function toBulletLines(text: string): string[] {
  return sanitize(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `  -  ${l}`);
}

export async function generateRamsPDF(document: RamsDocument): Promise<void> {
  const [company, logoBase64] = await Promise.all([
    loadCompanySettings(),
    loadCompanySettings().then(async (c) => {
      if (c?.report_logo_url) return loadImageAsBase64(c.report_logo_url);
      if (c?.company_logo_url) return loadImageAsBase64(c.company_logo_url);
      return null;
    }),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ml = 15;
  const mr = 15;
  const cw = pw - ml - mr; // content width
  let y = 0;

  // ── HELPERS ──────────────────────────────────────────────────
  function checkPage(need = 40) {
    if (y > ph - need) {
      doc.addPage();
      y = 20;
    }
  }

  function sectionHeader(label: string, fillColor = CHARCOAL) {
    checkPage(25);
    doc.setFillColor(fillColor);
    doc.rect(ml, y, cw, 9, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), ml + 4, y + 6.5);
    y += 13;
    doc.setTextColor(CHARCOAL);
  }

  function keyValue(key: string, value: string, indent = ml) {
    checkPage(12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(key, indent, y);
    doc.setFont("helvetica", "normal");
    const valX = indent + 45;
    const lines = doc.splitTextToSize(sanitize(value), pw - mr - valX);
    doc.text(lines, valX, y);
    y += Math.max(lines.length * 4.5, 5) + 1.5;
  }

  function bodyText(text: string) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(CHARCOAL);
    const lines = doc.splitTextToSize(sanitize(text), cw);
    for (const line of lines) {
      checkPage(8);
      doc.text(line, ml, y);
      y += 4.5;
    }
    y += 3;
  }

  function bulletList(text: string) {
    const items = toBulletLines(text);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(CHARCOAL);
    for (const item of items) {
      const wrapped = doc.splitTextToSize(item, cw - 4);
      for (const wl of wrapped) {
        checkPage(8);
        doc.text(wl, ml + 2, y);
        y += 4.5;
      }
    }
    y += 3;
  }

  function thinLine() {
    doc.setDrawColor(BORDER_GRAY);
    doc.setLineWidth(0.3);
    doc.line(ml, y, pw - mr, y);
    y += 4;
  }

  // ── PAGE 1: COVER / HEADER ──────────────────────────────────
  // Top red accent stripe
  doc.setFillColor(RED_ACCENT);
  doc.rect(0, 0, pw, 4, "F");

  // Header bar
  doc.setFillColor(CHARCOAL);
  doc.rect(0, 4, pw, 38, "F");

  // Logo or company name
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", ml, 8, 30, 30, undefined, "FAST");
    } catch {
      // fallback to text
    }
  }

  const titleX = logoBase64 ? ml + 35 : ml;
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("RISK ASSESSMENT &", titleX, 17);
  doc.text("METHOD STATEMENT", titleX, 25);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(document.rams_number, titleX, 33);
  doc.text(`Version ${document.version}`, pw - mr, 33, { align: "right" });

  // Bottom red accent stripe under header
  doc.setFillColor(RED_ACCENT);
  doc.rect(0, 42, pw, 2, "F");

  y = 50;

  // Document title
  doc.setTextColor(CHARCOAL);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(document.title, cw);
  doc.text(titleLines, ml, y);
  y += titleLines.length * 6 + 4;

  // ── DOCUMENT INFORMATION TABLE ──────────────────────────────
  sectionHeader("Document Information");

  const infoRows: string[][] = [];
  if (document.site) {
    infoRows.push(["Site:", document.site.name]);
    if (document.site.address) infoRows.push(["Address:", document.site.address]);
  }
  const statusLabel = document.status.replace(/_/g, " ").toUpperCase();
  infoRows.push(["Status:", statusLabel]);
  if (document.review_date) {
    infoRows.push(["Review Date:", format(new Date(document.review_date), "dd/MM/yyyy")]);
  }
  infoRows.push(["Created:", format(new Date(document.created_at), "dd/MM/yyyy")]);
  infoRows.push(["RAMS Ref:", document.rams_number]);

  autoTable(doc, {
    startY: y,
    body: infoRows,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, textColor: [28, 28, 32] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 35, textColor: [28, 28, 32] },
      1: { cellWidth: "auto" },
    },
    margin: { left: ml, right: mr },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── SITE-SPECIFIC HAZARDS ───────────────────────────────────
  if (document.site_specific_hazards) {
    sectionHeader("Site-Specific Hazards", RED_ACCENT);
    bulletList(document.site_specific_hazards);
  }

  // ── SITE ACCESS NOTES ───────────────────────────────────────
  if (document.site_access_notes) {
    sectionHeader("Site Access Notes");
    bulletList(document.site_access_notes);
  }

  // ── RISK ASSESSMENT ─────────────────────────────────────────
  sectionHeader("Risk Assessment");

  const hazardHead = [
    ["#", "Hazard", "Who Affected", "Existing Controls", "L", "S", "Risk", "Additional Controls", "L", "S", "Residual"],
  ];
  const hazardRows = document.hazards.map((h, i) => [
    String(i + 1),
    sanitize(h.hazard),
    sanitize(h.who_affected).replace(/\n/g, ", "),
    sanitize(h.existing_controls).replace(/\n/g, "; "),
    String(h.likelihood),
    String(h.severity),
    h.risk_level,
    sanitize(h.additional_controls).replace(/\n/g, "; "),
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
      fillColor: [28, 28, 32],
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: "bold",
      halign: "center",
      cellPadding: 1.5,
    },
    styles: { fontSize: 7, cellPadding: 1.5, textColor: [28, 28, 32], lineColor: [209, 213, 219], lineWidth: 0.2 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 7, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 22 },
      2: { cellWidth: 18 },
      3: { cellWidth: 30 },
      4: { cellWidth: 7, halign: "center" },
      5: { cellWidth: 7, halign: "center" },
      6: { cellWidth: 14, halign: "center", fontStyle: "bold" },
      7: { cellWidth: 30 },
      8: { cellWidth: 7, halign: "center" },
      9: { cellWidth: 7, halign: "center" },
      10: { cellWidth: 14, halign: "center", fontStyle: "bold" },
    },
    margin: { left: ml, right: mr },
    didParseCell: (data) => {
      if ((data.column.index === 6 || data.column.index === 10) && data.section === "body") {
        const val = String(data.cell.raw);
        if (val === "Low") data.cell.styles.textColor = [22, 163, 74];
        else if (val === "Medium") data.cell.styles.textColor = [202, 138, 4];
        else if (val === "High") data.cell.styles.textColor = [234, 88, 12];
        else if (val === "Very High") data.cell.styles.textColor = [220, 38, 38];
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── METHOD STATEMENT ────────────────────────────────────────
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
      fillColor: [28, 28, 32],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      cellPadding: 2,
    },
    styles: { fontSize: 8, cellPadding: 2, textColor: [28, 28, 32], lineColor: [209, 213, 219], lineWidth: 0.2 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 12, halign: "center", fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 32 },
      3: { cellWidth: 35 },
    },
    margin: { left: ml, right: mr },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── PPE REQUIREMENTS ────────────────────────────────────────
  if (document.ppe_requirements.length > 0) {
    sectionHeader("Personal Protective Equipment (PPE)");

    // Render as a neat grid
    const ppePerRow = 4;
    const ppeColW = cw / ppePerRow;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(CHARCOAL);
    for (let i = 0; i < document.ppe_requirements.length; i++) {
      const col = i % ppePerRow;
      const row = Math.floor(i / ppePerRow);
      if (col === 0 && i > 0) y += 6;
      if (col === 0) checkPage(12);
      const x = ml + col * ppeColW;
      doc.text(`[x]  ${document.ppe_requirements[i]}`, x, y);
    }
    y += 10;
  }

  // ── EMERGENCY PROCEDURES ────────────────────────────────────
  if (document.emergency_procedures) {
    sectionHeader("Emergency Procedures", RED_ACCENT);
    bodyText(document.emergency_procedures);
  }

  // ── SIGNATURES ──────────────────────────────────────────────
  sectionHeader("Signatures & Approval");

  const sigW = (cw - 10) / 3;
  const sigH = 28;

  const sigLabels = ["Prepared By", "Reviewed By", document.client_name ? `Client (${document.client_name})` : "Client"];
  const sigs = [document.preparer_signature, document.reviewer_signature, document.client_signature];
  const sigDates = [document.preparer_signed_at, document.reviewer_signed_at, document.client_signed_at];

  checkPage(sigH + 20);

  for (let i = 0; i < 3; i++) {
    const x = ml + i * (sigW + 5);

    // Label
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(CHARCOAL);
    doc.text(sigLabels[i], x, y);

    // Box
    doc.setDrawColor(BORDER_GRAY);
    doc.setLineWidth(0.3);
    doc.rect(x, y + 2, sigW, sigH);

    // Signature image
    if (sigs[i]) {
      try {
        doc.addImage(sigs[i]!, "PNG", x + 2, y + 4, sigW - 4, sigH - 10, undefined, "FAST");
      } catch {
        // skip
      }
    }

    // Date
    if (sigDates[i]) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(MID_GRAY);
      doc.text(
        `Signed: ${format(new Date(sigDates[i]!), "dd/MM/yyyy HH:mm")}`,
        x,
        y + sigH + 6
      );
    }
  }

  y += sigH + 12;

  // ── FOOTER ON ALL PAGES ─────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Bottom red stripe
    doc.setFillColor(RED_ACCENT);
    doc.rect(0, ph - 14, pw, 2, "F");

    // Footer text
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(MID_GRAY);

    const footerLeft = `${document.rams_number}  |  Version ${document.version}  |  Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`;
    const footerRight = `Page ${i} of ${totalPages}`;

    doc.text(footerLeft, ml, ph - 6);
    doc.text(footerRight, pw - mr, ph - 6, { align: "right" });

    // Company details
    if (company) {
      const companyLine = [company.company_name, company.phone, company.email, company.website]
        .filter(Boolean)
        .join("  |  ");
      doc.text(companyLine, pw / 2, ph - 6, { align: "center" });
    }
  }

  // ── SAVE ────────────────────────────────────────────────────
  doc.save(`${document.rams_number}.pdf`);
}

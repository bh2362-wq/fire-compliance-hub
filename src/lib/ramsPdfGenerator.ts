import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { RamsDocument } from "@/services/ramsService";
import { supabase } from "@/integrations/supabase/client";

// ─── Color Palette ───────────────────────────────────────────────────────────
const C = {
  black: [0, 0, 0] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  headerBg: [51, 51, 51] as [number, number, number],
  headerText: [255, 255, 255] as [number, number, number],
  riskGreen: [146, 208, 80] as [number, number, number],
  riskYellow: [255, 255, 0] as [number, number, number],
  riskAmber: [255, 192, 0] as [number, number, number],
  riskOrange: [255, 153, 0] as [number, number, number],
  riskRed: [255, 0, 0] as [number, number, number],
  lightGrey: [242, 242, 242] as [number, number, number],
  borderGrey: [180, 180, 180] as [number, number, number],
  yellowBanner: [255, 255, 204] as [number, number, number],
  sectionBg: [217, 217, 217] as [number, number, number],
  textDark: [0, 0, 0] as [number, number, number],
  textGrey: [80, 80, 80] as [number, number, number],
  accentRed: [185, 28, 28] as [number, number, number],
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
  return text
    .replace(/\\\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013]/g, "-")
    .replace(/[\u2014]/g, "--")
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, "-")
    .replace(/[\u2026]/g, "...")
    .replace(/[\u00A0]/g, " ")
    .replace(/[^\x00-\x7F\xA3\xA9\xAE\xB0\xB1\xB2\xB3\xB5\xBC\xBD\xBE\xC0-\xFF]/g, "")
    .trim();
}

/** Get risk score color based on numerical risk value */
function riskScoreColor(score: number): [number, number, number] {
  if (score <= 4) return C.riskGreen;
  if (score <= 8) return C.riskYellow;
  if (score <= 12) return C.riskAmber;
  if (score <= 15) return C.riskOrange;
  return C.riskRed;
}

/** Get risk level text color */
function riskLevelColor(level: string): [number, number, number] {
  const l = level.toLowerCase();
  if (l === "low") return [0, 128, 0];
  if (l === "medium") return [180, 130, 0];
  if (l === "high") return [220, 100, 0];
  return [200, 0, 0];
}

/** PPE items with EN standards */
const PPE_STANDARDS: Record<string, { standard: string; condition: string }> = {
  "Hard Hat": { standard: "EN397", condition: "Yes if working at height or risk of items falling from above" },
  "Safety Glasses": { standard: "EN166", condition: "Yes if risk of getting anything in the eye (dust, debris, splashes)" },
  "Ear Protection": { standard: "EN352", condition: "Yes when drilling or site conditions generate >80dB" },
  "Hi-Vis Vest": { standard: "ISO20471", condition: "At all times - replace regularly" },
  "Safety Boots": { standard: "EN ISO 20345 S1P", condition: "At all times" },
  "Gloves": { standard: "EN388", condition: "Personal choice" },
  "Dust Mask": { standard: "EN149 FFP3", condition: "Yes if required to reduce dust inhalation when drilling" },
  "Face Shield": { standard: "EN166", condition: "Yes when risk of flying particles or splashes" },
  "Fall Protection Harness": { standard: "EN361", condition: "Yes when working at height above 2m without edge protection" },
  "Knee Pads": { standard: "EN14404", condition: "Yes when kneeling for extended periods" },
};

// ─── Main Generator ──────────────────────────────────────────────────────────

export async function generateRamsPDF(document: RamsDocument): Promise<void> {
  const company = await loadCompanySettings();
  const logoUrl = company?.report_logo_url || company?.company_logo_url || null;
  const logoBase64 = logoUrl ? await loadImageAsBase64(logoUrl) : null;

  const safeHazards = Array.isArray(document.hazards) ? document.hazards : [];
  const safeMethods = Array.isArray(document.method_statements) ? document.method_statements : [];
  const safePpe = Array.isArray(document.ppe_requirements) ? document.ppe_requirements : [];

  const companyName = sanitize(company?.company_name) || "Company";
  const docTitle = `${document.rams_number} ${sanitize(document.site?.name || document.title)} RAMS`;

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 1: RISK ASSESSMENT (Landscape)
  // ═══════════════════════════════════════════════════════════════════════════

  const raDoc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const raPw = raDoc.internal.pageSize.getWidth();
  const raPh = raDoc.internal.pageSize.getHeight();
  const raML = 10;
  const raMR = 10;
  const raCW = raPw - raML - raMR;
  let raPage = 1;
  let raY = 0;

  // ── Repeating header drawing function ──
  function drawRAHeader(doc: jsPDF, pageNum: number) {
    let yPos = 8;

    // Company logo — left side (32x28 matching standard docs)
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, "PNG", raML, yPos - 2, 32, 28, undefined, "FAST");
      } catch {
        doc.setTextColor(...C.textDark);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(companyName, raML, yPos + 10);
      }
    } else {
      doc.setTextColor(...C.textDark);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(companyName, raML, yPos + 10);
    }

    // Company details — right-aligned (matching standard docs)
    const rightX = raPw - raMR;
    let contactY = yPos + 2;

    doc.setTextColor(...C.textDark);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(companyName, rightX, contactY, { align: "right" });
    contactY += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textGrey);
    const compAddr = sanitize(company?.address || "");
    const compCity = sanitize(company?.city || "");
    const compPostcode = sanitize(company?.postcode || "");
    const fullAddr = [compAddr, compCity, compPostcode].filter(Boolean).join(", ");
    if (fullAddr) {
      doc.text(fullAddr, rightX, contactY, { align: "right" });
      contactY += 4;
    }
    if (company?.phone) {
      doc.text(`T: ${company.phone}`, rightX, contactY, { align: "right" });
      contactY += 4;
    }
    if (company?.email) {
      doc.text(`E: ${company.email}`, rightX, contactY, { align: "right" });
    }

    // Separator line
    const sepY = 38;
    doc.setDrawColor(...C.borderGrey);
    doc.setLineWidth(0.3);
    doc.line(raML, sepY, raPw - raMR, sepY);
  }

  function raCheckPage(need = 30): boolean {
    if (raY + need > raPh - 12) {
      raDoc.addPage();
      raPage++;
      drawRAHeader(raDoc, raPage);
      raY = 42;
      return true;
    }
    return false;
  }

  // ── Page 1 header ──
  drawRAHeader(raDoc, 1);
  raY = 42;

  // ── "Risk Assessment" title ──
  raDoc.setFillColor(...C.sectionBg);
  raDoc.rect(raML, raY, raCW, 8, "F");
  raDoc.setDrawColor(...C.borderGrey);
  raDoc.rect(raML, raY, raCW, 8, "S");
  raDoc.setFontSize(12);
  raDoc.setFont("helvetica", "bold");
  raDoc.setTextColor(...C.textDark);
  raDoc.text("Risk Assessment", raML + 3, raY + 5.5);
  raY += 12;

  // ── Project Info Table ──
  const siteName = sanitize(document.site?.name || "");
  const activityTitle = sanitize(document.title);
  const personsAffected = "Installers and others in the same area including members of the public, other contractors, the client and tenants";
  const equipmentInvolved = "Tool box and Steps/ Ladders";
  const reviewDate = document.review_date ? format(new Date(document.review_date), "dd/MM/yy") : format(new Date(), "dd/MM/yy");

  autoTable(raDoc, {
    startY: raY,
    body: [
      [{ content: "Project:", styles: { fontStyle: "bold" } }, siteName, { content: "Contract No:", styles: { fontStyle: "bold" } }, document.rams_number],
      [{ content: "Activity:", styles: { fontStyle: "bold" } }, { content: activityTitle, styles: { fontStyle: "italic" } }, { content: "Rev:", styles: { fontStyle: "bold" } }, String(document.version)],
      [{ content: "Persons Affected:", styles: { fontStyle: "bold" } }, { content: personsAffected, colSpan: 1 }, { content: "RA Date:", styles: { fontStyle: "bold" } }, reviewDate],
      [{ content: "Equipment Involved:", styles: { fontStyle: "bold" } }, { content: equipmentInvolved, colSpan: 3 }],
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: raCW * 0.45 - 30 },
      2: { cellWidth: 25 },
      3: { cellWidth: raCW * 0.55 - 25 },
    },
    margin: { left: raML, right: raMR },
  });
  raY = (raDoc as any).lastAutoTable.finalY + 1;

  // ── Yellow safety banner ──
  autoTable(raDoc, {
    startY: raY,
    body: [[{ content: "This document is to be read in conjunction with the corresponding Method Statement", styles: { halign: "center", fontStyle: "bold", fontSize: 8 } }]],
    theme: "grid",
    styles: { fillColor: C.yellowBanner, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2, cellPadding: 2 },
    margin: { left: raML, right: raMR },
  });
  raY = (raDoc as any).lastAutoTable.finalY + 4;

  // ── 5x5 Risk Scale Matrix ──
  raCheckPage(50);
  raDoc.setFontSize(9);
  raDoc.setFont("helvetica", "bold");
  raDoc.setTextColor(...C.textDark);

  // Draw the risk matrix
  const matrixX = raML;
  const matrixCellW = 16;
  const matrixCellH = 8;
  const matrixLabelW = 20;
  const matrixStartX = matrixX + matrixLabelW + 18;

  // "Risk Scale" label
  raDoc.setFillColor(...C.sectionBg);
  raDoc.rect(matrixX, raY, matrixLabelW + 14, matrixCellH * 5 + 8, "F");
  raDoc.setDrawColor(...C.borderGrey);
  raDoc.rect(matrixX, raY, matrixLabelW + 14, matrixCellH * 5 + 8, "S");

  // Vertical "Risk Scale" text
  raDoc.setFontSize(9);
  raDoc.setFont("helvetica", "bold");
  raDoc.text("Risk Scale", matrixX + 3, raY + 20);

  // Rotated "Likelihood (L)" label
  raDoc.setFontSize(7);
  raDoc.text("Likelihood", matrixX + 20, raY + 6);

  // Likelihood labels
  const likelihoods = ["Certain", "Possible", "Remote", "Improbable"];
  const likValues = [4, 3, 2, 1];

  for (let row = 0; row < 4; row++) {
    const cellY = raY + 8 + row * matrixCellH;
    // Label
    raDoc.setFontSize(7);
    raDoc.setFont("helvetica", "normal");
    raDoc.text(likelihoods[row], matrixX + 20, cellY + 5);

    // 5 risk value cells
    for (let col = 0; col < 5; col++) {
      const val = likValues[row] * (col + 1);
      const cellXPos = matrixStartX + col * matrixCellW;
      const color = riskScoreColor(val);
      raDoc.setFillColor(...color);
      raDoc.rect(cellXPos, cellY, matrixCellW, matrixCellH, "F");
      raDoc.setDrawColor(...C.borderGrey);
      raDoc.rect(cellXPos, cellY, matrixCellW, matrixCellH, "S");
      raDoc.setFontSize(8);
      raDoc.setFont("helvetica", "bold");
      raDoc.setTextColor(...C.textDark);
      raDoc.text(String(val), cellXPos + matrixCellW / 2, cellY + 5.5, { align: "center" });
    }
  }

  // Bottom harm labels
  const harmLabels = ["Negligible", "Minor", "Serious", "Severe", "Permanent"];
  for (let col = 0; col < 5; col++) {
    const cellXPos = matrixStartX + col * matrixCellW;
    raDoc.setFontSize(6.5);
    raDoc.setFont("helvetica", "normal");
    raDoc.setTextColor(...C.textDark);
    raDoc.text(harmLabels[col], cellXPos + matrixCellW / 2, raY + 8 + 4 * matrixCellH + 5, { align: "center" });
  }

  // "Harm Potential (H)" label below
  raDoc.setFontSize(7);
  raDoc.setFont("helvetica", "bold");
  raDoc.text("Harm Potential (H)", matrixStartX + 2.5 * matrixCellW, raY + 8 + 4 * matrixCellH + 10, { align: "center" });

  // Risk Factor legend (right side)
  const legendX = matrixStartX + 5 * matrixCellW + 15;
  raDoc.setFontSize(8);
  raDoc.setFont("helvetica", "bold");
  raDoc.text("Risk Factor (RF)", legendX, raY + 6);

  const legendItems: { label: string; color: [number, number, number] }[] = [
    { label: "High Risk", color: C.riskRed },
    { label: "Medium Risk", color: C.riskAmber },
    { label: "Low Risk", color: C.riskGreen },
  ];
  for (let i = 0; i < legendItems.length; i++) {
    const ly = raY + 10 + i * 8;
    raDoc.setFillColor(...legendItems[i].color);
    raDoc.rect(legendX, ly, 30, 6, "F");
    raDoc.setDrawColor(...C.borderGrey);
    raDoc.rect(legendX, ly, 30, 6, "S");
    raDoc.setFontSize(7.5);
    raDoc.setFont("helvetica", "bold");
    raDoc.setTextColor(...C.textDark);
    raDoc.text(legendItems[i].label, legendX + 15, ly + 4.2, { align: "center" });
  }

  raY += 8 + 4 * matrixCellH + 16;

  // ── Hazard Assessment Table ──
  if (safeHazards.length > 0) {
    raCheckPage(30);

    const hazardHead = [[
      { content: "Hazard", rowSpan: 2 },
      { content: "Risk Before Application of\nControls", colSpan: 3 },
      { content: "Control Measure(s)", rowSpan: 2 },
      { content: "Risk after Application of\nControls", colSpan: 3 },
      { content: "Risk\nAcceptable?", rowSpan: 2 },
    ], [
      "Harm", "Likelihood", "Risk",
      "Harm", "Likelihood", "Risk",
    ]];

    const hazardRows = safeHazards.map((h) => {
      const beforeRisk = (h.likelihood || 1) * (h.severity || 1);
      const afterRisk = (h.residual_likelihood || 1) * (h.residual_severity || 1);

      // Build control measures text - combine existing and additional
      const controls: string[] = [];
      if (h.existing_controls) {
        sanitize(h.existing_controls).split("\n").filter(Boolean).forEach(c => controls.push(c.replace(/^[-*]\s*/, "").trim()));
      }
      if (h.additional_controls) {
        sanitize(h.additional_controls).split("\n").filter(Boolean).forEach(c => controls.push(c.replace(/^[-*]\s*/, "").trim()));
      }
      const controlText = controls.join("\n");

      return [
        sanitize(h.hazard) + (h.who_affected ? `\n(${sanitize(h.who_affected)})` : ""),
        String(h.severity || ""),
        String(h.likelihood || ""),
        String(beforeRisk),
        controlText,
        String(h.residual_severity || ""),
        String(h.residual_likelihood || ""),
        String(afterRisk),
        afterRisk <= 8 ? "YES" : "NO",
      ];
    });

    autoTable(raDoc, {
      startY: raY,
      head: hazardHead,
      body: hazardRows,
      theme: "grid",
      headStyles: {
        fillColor: C.sectionBg,
        textColor: C.textDark,
        fontSize: 7.5,
        fontStyle: "bold",
        halign: "center",
        valign: "middle",
        cellPadding: 1.5,
        lineColor: C.borderGrey,
        lineWidth: 0.3,
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        textColor: C.textDark,
        lineColor: C.borderGrey,
        lineWidth: 0.3,
        valign: "middle",
      },
      columnStyles: {
        0: { cellWidth: 28, fontStyle: "bold", halign: "left" },
        1: { cellWidth: 12, halign: "center" },
        2: { cellWidth: 16, halign: "center" },
        3: { cellWidth: 12, halign: "center", fontStyle: "bold" },
        4: { cellWidth: "auto", halign: "center", fontSize: 7 },
        5: { cellWidth: 12, halign: "center" },
        6: { cellWidth: 16, halign: "center" },
        7: { cellWidth: 12, halign: "center", fontStyle: "bold" },
        8: { cellWidth: 16, halign: "center", fontStyle: "bold" },
      },
      margin: { top: 42, left: raML, right: raMR },
      didParseCell: (data) => {
        if (data.section === "body") {
          // Color-code the risk score cells
          if (data.column.index === 3) {
            const val = parseInt(String(data.cell.raw)) || 0;
            data.cell.styles.fillColor = riskScoreColor(val);
          }
          if (data.column.index === 7) {
            const val = parseInt(String(data.cell.raw)) || 0;
            data.cell.styles.fillColor = riskScoreColor(val);
          }
          // Green for YES, red for NO
          if (data.column.index === 8) {
            const val = String(data.cell.raw);
            if (val === "YES") {
              data.cell.styles.textColor = [0, 128, 0] as [number, number, number];
            } else {
              data.cell.styles.textColor = [200, 0, 0] as [number, number, number];
            }
          }
        }
      },
      didDrawPage: (data) => {
        // Draw header on every page (including continuation pages)
        if (data.pageNumber > 1) {
          drawRAHeader(raDoc, data.pageNumber);
        }
        raPage = raDoc.getNumberOfPages();
      },
    });
    raY = (raDoc as any).lastAutoTable.finalY + 6;
  }

  // ── Written By / Reviewed By / Review Due ──
  raCheckPage(20);

  autoTable(raDoc, {
    startY: raY,
    body: [
      [
        { content: `Risk Assessment Written By: ${sanitize(document.preparer_name) || "N/A"}`, styles: { fontStyle: "bold" } },
        { content: `Risk Assessment Review Due: ${document.review_date ? format(new Date(document.review_date), "dd/MM/yyyy") : "N/A"}`, styles: { fontStyle: "bold" } },
      ],
      [
        { content: `Reviewed By: ${sanitize(document.reviewer_name) || "N/A"}`, styles: { fontStyle: "bold" } },
        "",
      ],
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.3 },
    margin: { left: raML, right: raMR },
  });
  raY = (raDoc as any).lastAutoTable.finalY + 6;

  // ── Record of Receipt ──
  raCheckPage(50);

  raDoc.setFillColor(...C.sectionBg);
  raDoc.rect(raML, raY, raCW, 8, "F");
  raDoc.setDrawColor(...C.borderGrey);
  raDoc.rect(raML, raY, raCW, 8, "S");
  raDoc.setFontSize(11);
  raDoc.setFont("helvetica", "bold");
  raDoc.setTextColor(...C.textDark);
  raDoc.text("Record of Receipt", raML + 3, raY + 5.5);
  raY += 10;

  // Receipt declaration text
  autoTable(raDoc, {
    startY: raY,
    body: [
      [{ content: "I certify that I have received, read and understood all the contents of the Induction, Method Statement, Risk Assessment and any applicable COSHH Assessments.\nI will comply with the contents and use the control measures as stated.\nI will raise any issues or concerns relating to Health and Safety with my Manager.", styles: { halign: "center", fontStyle: "bold", fontSize: 8 } }],
    ],
    theme: "grid",
    styles: { cellPadding: 3, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.3 },
    margin: { top: 42, left: raML, right: raMR },
  });
  raY = (raDoc as any).lastAutoTable.finalY;

  // Sign-off table
  autoTable(raDoc, {
    startY: raY,
    head: [["Name", "Signature", "Date", "Comments"]],
    body: [["", "", "", ""], ["", "", "", ""], ["", "", "", ""], ["", "", "", ""], ["", "", "", ""]],
    theme: "grid",
    headStyles: {
      fillColor: C.sectionBg,
      textColor: C.textDark,
      fontSize: 9,
      fontStyle: "bold",
      halign: "center",
      lineColor: C.borderGrey,
      lineWidth: 0.3,
    },
    styles: {
      fontSize: 8,
      cellPadding: 5,
      textColor: C.textDark,
      lineColor: C.borderGrey,
      lineWidth: 0.3,
      minCellHeight: 10,
    },
    columnStyles: {
      0: { cellWidth: raCW * 0.2 },
      1: { cellWidth: raCW * 0.35 },
      2: { cellWidth: raCW * 0.15 },
      3: { cellWidth: raCW * 0.3 },
    },
    margin: { top: 42, left: raML, right: raMR },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawRAHeader(raDoc, raDoc.getNumberOfPages());
      }
    },
  });

  // ── Page numbers on all RA pages (top-right, above company details) ──
  const raTotalPages = raDoc.getNumberOfPages();
  for (let i = 1; i <= raTotalPages; i++) {
    raDoc.setPage(i);
    raDoc.setFontSize(8);
    raDoc.setFont("helvetica", "normal");
    raDoc.setTextColor(...C.textGrey);
    raDoc.text(`Page ${i} of ${raTotalPages}`, raPw - raMR, 8, { align: "right" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 2: METHOD STATEMENT (Portrait)
  // ═══════════════════════════════════════════════════════════════════════════

  const msDoc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const msPw = msDoc.internal.pageSize.getWidth();
  const msPh = msDoc.internal.pageSize.getHeight();
  const msML = 12;
  const msMR = 12;
  const msCW = msPw - msML - msMR;
  let msPage = 1;
  let msY = 0;

  function drawMSHeader(doc: jsPDF, pageNum: number) {
    let yPos = 8;

    // Company logo — left side (32x28 matching standard docs)
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, "PNG", msML, yPos - 2, 32, 28, undefined, "FAST");
      } catch {
        doc.setTextColor(...C.textDark);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(companyName, msML, yPos + 10);
      }
    } else {
      doc.setTextColor(...C.textDark);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(companyName, msML, yPos + 10);
    }

    // Company details — right-aligned (matching standard docs)
    const rightX = msPw - msMR;
    let contactY = yPos + 2;

    doc.setTextColor(...C.textDark);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(companyName, rightX, contactY, { align: "right" });
    contactY += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textGrey);
    const msAddr = sanitize(company?.address || "");
    const msCity = sanitize(company?.city || "");
    const msPostcode = sanitize(company?.postcode || "");
    const msFullAddr = [msAddr, msCity, msPostcode].filter(Boolean).join(", ");
    if (msFullAddr) {
      doc.text(msFullAddr, rightX, contactY, { align: "right" });
      contactY += 4;
    }
    if (company?.phone) {
      doc.text(`T: ${company.phone}`, rightX, contactY, { align: "right" });
      contactY += 4;
    }
    if (company?.email) {
      doc.text(`E: ${company.email}`, rightX, contactY, { align: "right" });
    }

    // Separator line
    const sepY = 38;
    doc.setDrawColor(...C.borderGrey);
    doc.setLineWidth(0.3);
    doc.line(msML, sepY, msPw - msMR, sepY);
  }

  function msCheckPage(need = 20): boolean {
    if (msY + need > msPh - 12) {
      msDoc.addPage();
      msPage++;
      drawMSHeader(msDoc, msPage);
      msY = 42;
      return true;
    }
    return false;
  }

  // ── Page 1 header ──
  drawMSHeader(msDoc, 1);
  msY = 42;

  // ── "METHOD STATEMENT" title ──
  msDoc.setFillColor(...C.sectionBg);
  msDoc.rect(msML, msY, msCW, 8, "F");
  msDoc.setDrawColor(...C.borderGrey);
  msDoc.rect(msML, msY, msCW, 8, "S");
  msDoc.setFontSize(12);
  msDoc.setFont("helvetica", "bold");
  msDoc.setTextColor(...C.textDark);
  msDoc.text("METHOD STATEMENT", msML + 3, msY + 5.5);
  msY += 12;

  // ── Project Info Table ──
  autoTable(msDoc, {
    startY: msY,
    body: [
      [{ content: "PROJECT:", styles: { fontStyle: "bold" } }, sanitize(document.site?.name || document.title), { content: "Contract No:", styles: { fontStyle: "bold" } }, document.rams_number],
      [{ content: "ACTIVITY:", styles: { fontStyle: "bold" } }, sanitize(document.title), { content: "DATE &\nDURATION OF\nWORKS:", styles: { fontStyle: "bold" } }, "as per schedule"],
      [{ content: "REV:", styles: { fontStyle: "bold" } }, { content: String(document.version), styles: { halign: "right" } }, { content: "DATE OF MS:", styles: { fontStyle: "bold" } }, document.review_date ? format(new Date(document.review_date), "dd-MMM-yy") : format(new Date(), "dd-MMM-yy")],
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.3 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: msCW * 0.42 - 22 },
      2: { cellWidth: 28 },
      3: { cellWidth: msCW * 0.58 - 28 },
    },
    margin: { left: msML, right: msMR },
  });
  msY = (msDoc as any).lastAutoTable.finalY;

  // ── Yellow safety banner ──
  autoTable(msDoc, {
    startY: msY,
    body: [[{
      content: "This Method Statement is written to keep YOU and OTHERS safe at work. If you feel you are working in an unsafe manner or environment, STOP work immediately and speak to your supervisor.",
      styles: { fontStyle: "bolditalic", halign: "center", fontSize: 7.5 },
    }]],
    theme: "grid",
    styles: { fillColor: C.yellowBanner, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.3, cellPadding: 2.5 },
    margin: { left: msML, right: msMR },
  });
  msY = (msDoc as any).lastAutoTable.finalY + 4;

  // ── Helper: Section with numbered label ──
  function msSectionTitle(num: number, title: string) {
    msCheckPage(18);
    msY += 3;
    msDoc.setFontSize(9);
    msDoc.setFont("helvetica", "bold");
    msDoc.setTextColor(...C.textDark);
    msDoc.text(`${num}`, msML + 4, msY);
    msDoc.text(title, msML + 12, msY);
    msDoc.setDrawColor(...C.textDark);
    msDoc.setLineWidth(0.2);
    const titleWidth = msDoc.getTextWidth(title);
    msDoc.line(msML + 12, msY + 0.5, msML + 12 + titleWidth, msY + 0.5);
    msY += 6;
  }

  // ── 1. Emergency arrangements ──
  msSectionTitle(1, "Emergency arrangements:");
  autoTable(msDoc, {
    startY: msY,
    body: [
      [{ content: "Special First Aid and Fire Requirements:", styles: { fontStyle: "bold" } }, "As per site emergency arrangements explained at induction"],
    ],
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 60 } },
    margin: { left: msML + 4, right: msMR },
  });
  msY = (msDoc as any).lastAutoTable.finalY + 5;

  // ── 2. Control measures ──
  msSectionTitle(2, "Control measures:");
  autoTable(msDoc, {
    startY: msY,
    body: [
      [{ content: "Permits:", styles: { fontStyle: "bold" } }, "As required by Site/ Client"],
      [{ content: "Security:", styles: { fontStyle: "bold" } }, "Sign in and out each visit"],
      [{ content: "Site Safety Induction:", styles: { fontStyle: "bold" } }, "Principal Contractor / Client"],
    ],
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 60 } },
    margin: { left: msML + 4, right: msMR },
  });
  msY = (msDoc as any).lastAutoTable.finalY + 5;

  // ── 3. Resources ──
  msSectionTitle(3, "Resources:");
  const resourceRows: string[][] = [
    ["Contractor:", `${companyName}: ${sanitize(company?.phone)} ${sanitize(company?.email)}`],
    ["Client:", sanitize(document.site?.name || "")],
  ];

  autoTable(msDoc, {
    startY: msY,
    body: resourceRows.map(r => [{ content: r[0], styles: { fontStyle: "bold" } }, r[1]]),
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 60 } },
    margin: { left: msML + 4, right: msMR },
  });
  msY = (msDoc as any).lastAutoTable.finalY + 5;

  // ── 4. PPE Requirements ──
  msSectionTitle(4, "Personal protective equipment requirements:");

  const ppeRows = safePpe.map((ppe) => {
    const std = PPE_STANDARDS[ppe];
    const label = std ? `${ppe} (${std.standard}):` : `${ppe}:`;
    const required = "Y";
    const condition = std?.condition || "As required";
    return [{ content: label, styles: {} }, { content: required, styles: { halign: "center" as const, fontStyle: "bold" as const } }, condition];
  });

  if (ppeRows.length > 0) {
    autoTable(msDoc, {
      startY: msY,
      body: ppeRows,
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
      columnStyles: {
        0: { cellWidth: 65 },
        1: { cellWidth: 8, halign: "center" },
        2: { cellWidth: "auto" },
      },
      margin: { left: msML + 4, right: msMR },
      didDrawPage: () => {
        const currentPage = msDoc.getNumberOfPages();
        if (currentPage > msPage) {
          msPage = currentPage;
          drawMSHeader(msDoc, msPage);
        }
      },
    });
    msY = (msDoc as any).lastAutoTable.finalY + 3;
  }

  // ── 5. Safety precautions ──
  msSectionTitle(5, "Safety precautions:");
  autoTable(msDoc, {
    startY: msY,
    body: [
      [{ content: "Protect Work Area:", styles: { fontStyle: "bold" } }, { content: "Y", styles: { halign: "center", fontStyle: "bold" } }, "If necessary to exclude others and protect access equipment"],
      [{ content: "Provide Warning Signs:", styles: { fontStyle: "bold" } }, { content: "Y", styles: { halign: "center", fontStyle: "bold" } }, "As necessary to warn others"],
    ],
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 8, halign: "center" } },
    margin: { left: msML + 4, right: msMR },
  });
  msY = (msDoc as any).lastAutoTable.finalY + 3;

  // ── 6. Description of the works ──
  msSectionTitle(6, "Description of the works:");

  // Site-specific hazards as part of description
  if (document.site_specific_hazards) {
    msCheckPage(15);
    msDoc.setFontSize(7.5);
    msDoc.setFont("helvetica", "normal");
    msDoc.setTextColor(...C.textGrey);
    const descLines = msDoc.splitTextToSize(sanitize(document.site_specific_hazards), msCW - 10);
    for (const line of descLines) {
      msCheckPage(5);
      msDoc.text(line, msML + 4, msY);
      msY += 4;
    }
    msY += 2;
  }

  // ── Method Statement Steps as Numbered Sections ──
  if (safeMethods.length > 0) {
    msCheckPage(15);

    // Group methods into logical sections or render as flat numbered list
    const methodRows = safeMethods.map((m, i) => [
      { content: String(i + 1), styles: { halign: "center" as const, fontStyle: "bold" as const } },
      sanitize(m.description) + (m.equipment_required ? `\nEquipment: ${sanitize(m.equipment_required)}` : ""),
    ]);

    autoTable(msDoc, {
      startY: msY,
      body: methodRows,
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 2.5, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: "auto" },
      },
      margin: { left: msML + 4, right: msMR },
      didDrawPage: () => {
        const currentPage = msDoc.getNumberOfPages();
        if (currentPage > msPage) {
          msPage = currentPage;
          drawMSHeader(msDoc, msPage);
        }
      },
    });
    msY = (msDoc as any).lastAutoTable.finalY + 4;
  }

  // ── Emergency Procedures ──
  if (document.emergency_procedures) {
    msCheckPage(15);
    msDoc.setFontSize(9);
    msDoc.setFont("helvetica", "bold");
    msDoc.setTextColor(...C.textDark);
    msDoc.text("Emergency Procedures:", msML + 4, msY);
    msY += 5;

    const epLines = sanitize(document.emergency_procedures).split("\n").filter(Boolean);
    const epRows = epLines.map((line, i) => [
      { content: String(i + 1), styles: { halign: "center" as const } },
      line.replace(/^[-*\d.]\s*/, "").trim(),
    ]);

    if (epRows.length > 0) {
      autoTable(msDoc, {
        startY: msY,
        body: epRows,
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
        columnStyles: { 0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: "auto" } },
        margin: { left: msML + 4, right: msMR },
        didDrawPage: () => {
          const currentPage = msDoc.getNumberOfPages();
          if (currentPage > msPage) {
            msPage = currentPage;
            drawMSHeader(msDoc, msPage);
          }
        },
      });
      msY = (msDoc as any).lastAutoTable.finalY + 4;
    }
  }

  // ── Site Access Notes ──
  if (document.site_access_notes) {
    msCheckPage(15);
    msDoc.setFontSize(9);
    msDoc.setFont("helvetica", "bold");
    msDoc.setTextColor(...C.textDark);
    msDoc.text("Site Access Notes:", msML + 4, msY);
    msY += 5;

    msDoc.setFontSize(7.5);
    msDoc.setFont("helvetica", "normal");
    const accessLines = msDoc.splitTextToSize(sanitize(document.site_access_notes), msCW - 10);
    for (const line of accessLines) {
      msCheckPage(5);
      msDoc.text(line, msML + 4, msY);
      msY += 4;
    }
    msY += 4;
  }

  // ── Additional Comments / Environmental ──
  msCheckPage(20);
  msDoc.setFontSize(9);
  msDoc.setFont("helvetica", "bold");
  msDoc.text("Additional Comments:", msML + 4, msY);
  msY += 5;

  autoTable(msDoc, {
    startY: msY,
    body: [
      [{ content: "1", styles: { halign: "center" } }, "Practice good personal hygiene and wash hands before eating, drinking, smoking or going to the toilet."],
      [{ content: "2", styles: { halign: "center" } }, "Operatives must not to use any hazardous substances without having read and understood the COSHH assessment issued."],
      [{ content: "3", styles: { halign: "center" } }, "If access equipment other than ladders is required, Using Access Equipment RAMS must be read, understood and agreed to."],
    ],
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: "auto" } },
    margin: { left: msML + 4, right: msMR },
  });
  msY = (msDoc as any).lastAutoTable.finalY + 3;

  // ── Yellow banner ──
  msCheckPage(12);
  autoTable(msDoc, {
    startY: msY,
    body: [[{ content: "THIS DOCUMENT SHOULD BE READ IN CONJUNCTION WITH THE CORRESPONDING RISK ASSESSMENT", styles: { halign: "center", fontStyle: "bold", fontSize: 8 } }]],
    theme: "grid",
    styles: { fillColor: C.yellowBanner, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.3, cellPadding: 3 },
    margin: { left: msML, right: msMR },
  });
  msY = (msDoc as any).lastAutoTable.finalY + 4;

  // ── Written By / Reviewed By ──
  msCheckPage(15);
  autoTable(msDoc, {
    startY: msY,
    body: [
      [`Method Statement Written By: ${sanitize(document.preparer_name) || "N/A"}`, `Review of Method Statement Due: ${document.review_date ? format(new Date(document.review_date), "dd/MM/yyyy") : "N/A"}`],
      [`Reviewed By: ${sanitize(document.reviewer_name) || "N/A"}`, ""],
    ],
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2, textColor: C.textDark, fontStyle: "bold" },
    margin: { left: msML, right: msMR },
  });
  msY = (msDoc as any).lastAutoTable.finalY + 4;

  // ── Signatures section ──
  msCheckPage(40);

  const sigLabels = [
    "Prepared By",
    "Reviewed By",
    document.client_name ? `Client (${sanitize(document.client_name)})` : "Client",
  ];
  const sigs = [document.preparer_signature, document.reviewer_signature, document.client_signature];
  const sigDates = [document.preparer_signed_at, document.reviewer_signed_at, document.client_signed_at];
  const sigNames = [document.preparer_name, document.reviewer_name, document.client_name];

  const sigW = (msCW - 10) / 3;
  for (let i = 0; i < 3; i++) {
    const x = msML + i * (sigW + 5);

    msDoc.setFontSize(7.5);
    msDoc.setFont("helvetica", "bold");
    msDoc.setTextColor(...C.textGrey);
    msDoc.text(sigLabels[i], x, msY);

    msDoc.setFillColor(...C.lightGrey);
    msDoc.setDrawColor(...C.borderGrey);
    msDoc.setLineWidth(0.3);
    msDoc.roundedRect(x, msY + 2, sigW, 20, 1, 1, "FD");

    if (sigs[i]) {
      try {
        msDoc.addImage(sigs[i]!, "PNG", x + 2, msY + 4, sigW - 4, 14, undefined, "FAST");
      } catch { /* skip */ }
    }

    if (sigNames[i]) {
      msDoc.setFontSize(7);
      msDoc.setFont("helvetica", "normal");
      msDoc.setTextColor(...C.textDark);
      msDoc.text(sanitize(sigNames[i]!), x, msY + 26);
    }

    if (sigDates[i]) {
      msDoc.setFontSize(6.5);
      msDoc.setTextColor(...C.textGrey);
      msDoc.text(format(new Date(sigDates[i]!), "dd/MM/yyyy HH:mm"), x, msY + 30);
    }
  }

  // ── Footer on all MS pages ──
  const msTotalPages = msDoc.getNumberOfPages();
  for (let i = 1; i <= msTotalPages; i++) {
    msDoc.setPage(i);
    msDoc.setFillColor(...C.white);
    msDoc.rect(msPw - msMR - 30, 8, 30, 6, "F");
    msDoc.setFontSize(8);
    msDoc.setFont("helvetica", "normal");
    msDoc.setTextColor(...C.textGrey);
    msDoc.text(`Page ${i} of ${msTotalPages}`, msPw - msMR, 12, { align: "right" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MERGE: Append MS pages to RA document
  // ═══════════════════════════════════════════════════════════════════════════

  // Unfortunately jsPDF can't merge two docs natively, so we save both
  // Save as two files: Risk Assessment + Method Statement
  raDoc.save(`${document.rams_number}_Risk_Assessment.pdf`);
  msDoc.save(`${document.rams_number}_Method_Statement.pdf`);
}

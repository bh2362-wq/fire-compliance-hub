import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, addMonths } from "date-fns";
import {
  ServiceReport,
  BS5839Checklist,
  CHECKLIST_LABELS,
  SECTION_LABELS,
  SYSTEM_TYPES,
} from "@/services/serviceReportService";
import type { PanelChecklistData } from "@/components/reports/MultiPanelChecklist";

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

// Clean Charcoal + Red Color Palette (matches BHO Fire logo)
const COLORS = {
  charcoal: [45, 45, 48] as [number, number, number],
  red: [200, 30, 30] as [number, number, number],
  darkGrey: [80, 80, 85] as [number, number, number],
  mediumGrey: [140, 140, 145] as [number, number, number],
  lightGrey: [245, 245, 247] as [number, number, number],
  borderGrey: [220, 220, 225] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  black: [0, 0, 0] as [number, number, number],
  yes: [34, 139, 34] as [number, number, number],
  no: [200, 30, 30] as [number, number, number],
  na: [140, 140, 145] as [number, number, number],
};

interface SiteInfo {
  name: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
}

interface VisitInfo {
  visit_type: string;
  visit_date: string;
}

// Draw box + label style status indicator
function drawStatusBox(
  doc: jsPDF,
  x: number,
  y: number,
  value: boolean | null,
  showLabel: boolean = true
): number {
  const boxSize = 5;
  let label = "";
  let color: [number, number, number];

  if (value === true) {
    color = COLORS.yes;
    label = "YES";
  } else if (value === false) {
    color = COLORS.no;
    label = "NO";
  } else {
    color = COLORS.na;
    label = "N/A";
  }

  doc.setFillColor(...color);
  doc.rect(x, y, boxSize, boxSize, "F");

  if (showLabel) {
    doc.setTextColor(...color);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(label, x + boxSize + 2, y + 3.8);
  }

  return x + boxSize + (showLabel ? 20 : 7);
}

// Compact branded header for Service Reports — matches PO style
function addCompactHeader(doc: jsPDF, pageWidth: number, margin: number, logoImg: HTMLImageElement | null) {
  let yPos = 14;

  // Company logo — left side (32x28 matching PO)
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", margin, yPos - 2, 32, 28);
    } catch {
      doc.setTextColor(...COLORS.charcoal);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(COMPANY.name, margin, yPos + 10);
    }
  }

  // Company details — right-aligned (matching PO style)
  const rightX = pageWidth - margin;
  let contactY = yPos;

  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY.name, rightX, contactY, { align: "right" });
  contactY += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text(COMPANY.address, rightX, contactY, { align: "right" });
  contactY += 4;

  doc.text(`T: ${COMPANY.phone}`, rightX, contactY, { align: "right" });
  contactY += 4;
  doc.text(`E: ${COMPANY.email}`, rightX, contactY, { align: "right" });

  // Separator line
  yPos = 44;
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.line(margin, yPos, pageWidth - margin, yPos);

  return yPos + 4;
}

// Professional footer — matches PO style
function addCompactFooter(doc: jsPDF, pageWidth: number, margin: number) {
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    const footerY = pageHeight - 18;

    doc.setDrawColor(...COLORS.borderGrey);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY, pageWidth - margin, footerY);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.mediumGrey);

    const footerParts = [COMPANY.name, COMPANY.registration].filter(Boolean);
    doc.text(footerParts.join("  |  "), margin, footerY + 5);

    doc.text(
      `Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
      pageWidth - margin,
      footerY + 5,
      { align: "right" }
    );

    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      footerY + 10,
      { align: "center" }
    );
  }
}

// ===================== SERVICE REPORT PDF (Multi-Panel Support) =====================
interface ServiceReportSignatures {
  engineerSignature?: string;
  engineerSignDate?: string;
  engineerSignTime?: string;
  customerNotPresent?: boolean;
  customerSignature?: string;
  customerSignDate?: string;
  customerSignTime?: string;
}

export function generateServiceReportPDF(
  report: ServiceReport,
  site: SiteInfo,
  visit: VisitInfo,
  panels?: PanelChecklistData[],
  signatures?: ServiceReportSignatures,
  returnBase64?: boolean
): string | void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - 2 * margin;

  const logoImg = new Image();
  logoImg.src = "/bho-fire-logo.png";

  let yPos = addCompactHeader(doc, pageWidth, margin, logoImg);

  // === Title Row ===
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Fire Alarm Service Report", margin, yPos + 4);

  doc.setTextColor(...COLORS.red);
  doc.setFontSize(10);
  doc.text("BS 5839-1:2025", margin, yPos + 10);

  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (report.report_number) {
    doc.text(`Ref: ${report.report_number}`, pageWidth - margin, yPos + 4, { align: "right" });
  }
  doc.text(format(new Date(report.report_date), "dd MMM yyyy"), pageWidth - margin, yPos + 10, { align: "right" });

  yPos += 16;

  // === Site & Service Details (Side by Side) ===
  const colWidth = (contentWidth - 6) / 2;
  const boxHeight = 38;

  // Left: Site Info
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.rect(margin, yPos, colWidth, boxHeight);

  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, colWidth, 7, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("SITE", margin + 3, yPos + 5);

  const siteAddr = [site.address, site.city, site.postcode].filter(Boolean).join(", ");
  const siteRows = [
    ["Site:", site.name],
    ["Address:", siteAddr || "-"],
    ["Contact:", site.contact_name || "-"],
    ["Phone:", site.contact_phone || "-"],
  ];

  doc.setFontSize(8);
  let rowY = yPos + 12;
  siteRows.forEach(([label, val]) => {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFont("helvetica", "bold");
    doc.text(label, margin + 3, rowY);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    const maxW = colWidth - 24;
    const txt = doc.splitTextToSize(val, maxW)[0] || "-";
    doc.text(txt, margin + 20, rowY);
    rowY += 6.5;
  });

  const rightX = margin + colWidth + 6;
  doc.rect(rightX, yPos, colWidth, boxHeight);

  doc.setFillColor(...COLORS.charcoal);
  doc.rect(rightX, yPos, colWidth, 7, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("SERVICE", rightX + 3, yPos + 5);

  const visitType = visit.visit_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const serviceRows = [
    ["Type:", visitType],
    ["Date:", format(new Date(visit.visit_date), "dd MMM yyyy")],
    ["Engineer:", report.engineer_name || "-"],
    ["Status:", report.status === "completed" ? "Completed" : "Draft"],
  ];

  doc.setFontSize(8);
  rowY = yPos + 12;
  serviceRows.forEach(([label, val]) => {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFont("helvetica", "bold");
    doc.text(label, rightX + 3, rowY);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    doc.text(val, rightX + 22, rowY);
    rowY += 6.5;
  });

  yPos += boxHeight + 4;

  // === System Info Row (for single panel or system-level info) ===
  if (!panels || panels.length <= 1) {
    doc.rect(margin, yPos, contentWidth, 20);
    doc.setFillColor(...COLORS.charcoal);
    doc.rect(margin, yPos, contentWidth, 7, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("SYSTEM", margin + 3, yPos + 5);

    const sysTypeLabel = SYSTEM_TYPES.find((t) => t.value === report.system_type)?.label || report.system_type || "-";
    const sysInfo = [
      [`Panel: ${report.panel_manufacturer || "-"} ${report.panel_model || ""}`.trim()],
      [`Location: ${report.panel_location || "-"}`],
      [`Category: ${sysTypeLabel}`],
      [`Zones: ${report.zones_count || "-"}`],
      [`Devices: ${report.devices_count || "-"}`],
    ];

    doc.setFontSize(8);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    const sysY = yPos + 12;
    const sysColW = contentWidth / 3;
    // Row 1: Panel, Location, Category
    doc.text(sysInfo[0][0], margin + 3, sysY);
    doc.text(sysInfo[1][0], margin + 3 + sysColW, sysY);
    doc.text(sysInfo[2][0], margin + 3 + sysColW * 2, sysY);
    // Row 2: Zones, Devices
    doc.text(sysInfo[3][0], margin + 3, sysY + 5);
    doc.text(sysInfo[4][0], margin + 3 + sysColW, sysY + 5);

    yPos += 24;
  } else {
    // Multi-panel: Show panel summary
    const panelBoxHeight = 7 + panels.length * 6 + 2;
    doc.rect(margin, yPos, contentWidth, panelBoxHeight);
    doc.setFillColor(...COLORS.charcoal);
    doc.rect(margin, yPos, contentWidth, 7, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`FIRE PANELS (${panels.length})`, margin + 3, yPos + 5);

    const sysTypeLabel = SYSTEM_TYPES.find((t) => t.value === report.system_type)?.label || report.system_type || "-";
    doc.text(`System Category: ${sysTypeLabel}`, pageWidth - margin - 3, yPos + 5, { align: "right" });

    doc.setFontSize(8);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    
    let panelY = yPos + 12;
    panels.forEach((panel, idx) => {
      const isMaster = idx === 0;
      const panelLabel = isMaster ? "[MASTER] " : `Panel ${idx + 1}: `;
      const panelInfo = [
        panelLabel + panel.assetName,
        panel.manufacturer ? `(${panel.manufacturer}${panel.model ? ` ${panel.model}` : ""})` : "",
        panel.location ? `@ ${panel.location}` : "",
      ].filter(Boolean).join("  ");
      
      if (isMaster) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.red);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...COLORS.charcoal);
      }
      doc.text(panelInfo, margin + 3, panelY);
      panelY += 6;
    });

    yPos += panelBoxHeight + 4;
  }

  // === INSPECTION & SERVICING CHECKLIST ===
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Fire Detection & Fire Alarm Inspection & Servicing Checklist", margin, yPos + 5);
  
  yPos += 10;
  
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.red);
  doc.text("As recommended in BAFE SP203-1 Clause 9.8 & BS5839-1:2025 Clause 45", margin, yPos);

  // Legend - positioned to the right of the subtitle
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.charcoal);
  let legendX = pageWidth - margin - 70;
  legendX = drawStatusBox(doc, legendX, yPos - 4, true);
  legendX = drawStatusBox(doc, legendX, yPos - 4, false);
  drawStatusBox(doc, legendX, yPos - 4, null);

  yPos += 6;

  // Helper to build checklist table body
  const buildChecklistTableBody = (
    checklist: BS5839Checklist,
    sectionsToInclude?: string[]
  ): (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] => {
    const sections = Object.keys(SECTION_LABELS) as Array<keyof BS5839Checklist>;
    const tableBody: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];
    
    sections.forEach((section) => {
      if (sectionsToInclude && !sectionsToInclude.includes(section)) return;
      
      const data = checklist[section] as Record<string, boolean | null | string | number> | undefined;
      const labels = CHECKLIST_LABELS[section];
      if (!data || !labels) return;
      
      // Section header row
      tableBody.push([
        { 
          content: SECTION_LABELS[section], 
          colSpan: 4,
          styles: { 
            fillColor: COLORS.charcoal, 
            textColor: COLORS.white, 
            fontStyle: "bold",
            fontSize: 9,
          } 
        },
      ]);
      
      // Items in this section
      Object.entries(data).forEach(([key, value]) => {
        if (!labels[key]) return;
        
        let yesVal = "";
        let noVal = "";
        let naVal = "";
        
        // Handle different value types
        if (value === true) {
          yesVal = "__PASS__";
        } else if (value === false) {
          noVal = "__FAIL__";
        } else if (value === null) {
          // Explicit null means N/A (grey box)
          naVal = "__NA__";
        } else if (typeof value === "string" || typeof value === "number") {
          // Numeric or text values go in YES column
          yesVal = String(value);
        }
        // Note: undefined values will leave all columns empty (no indicator shown)
        
        tableBody.push([labels[key], yesVal, noVal, naVal]);
      });
    });
    
    return tableBody;
  };

  // Draw checklist table
  const drawChecklistTable = (tableBody: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][], startY: number): number => {
    autoTable(doc, {
      startY,
      head: [["Requirement", "YES", "NO", "N/A"]],
      body: tableBody,
      theme: "grid",
      styles: {
        fontSize: 8,
        cellPadding: 1.5,
        lineColor: COLORS.borderGrey,
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: COLORS.charcoal,
        textColor: COLORS.white,
        fontStyle: "bold",
        fontSize: 9,
        halign: "center",
      },
      bodyStyles: {
        textColor: COLORS.charcoal,
      },
      alternateRowStyles: {
        fillColor: COLORS.lightGrey,
      },
      columnStyles: {
        0: { cellWidth: contentWidth - 48 },
        1: { cellWidth: 16, halign: "center", fontStyle: "bold" },
        2: { cellWidth: 16, halign: "center", fontStyle: "bold" },
        3: { cellWidth: 16, halign: "center", fontStyle: "bold" },
      },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === "body") {
          const raw = data.cell.raw;
          if (raw === "__PASS__" || raw === "__FAIL__" || raw === "__NA__") {
            data.cell.text = [""];
          }
        }
      },
      didDrawCell: (data) => {
        if (data.section !== "body") return;

        const raw = data.cell.raw;
        if (raw !== "__PASS__" && raw !== "__FAIL__" && raw !== "__NA__") return;

        const size = 6;
        const x = data.cell.x + data.cell.width / 2 - size / 2;
        const y = data.cell.y + data.cell.height / 2 - size / 2;

        const fill: [number, number, number] = raw === "__PASS__" ? COLORS.yes : raw === "__FAIL__" ? COLORS.no : COLORS.na;
        doc.setFillColor(...fill);
        doc.rect(x, y, size, size, "F");

        doc.setDrawColor(...COLORS.borderGrey);
        doc.setLineWidth(0.2);
        doc.rect(x, y, size, size);
      },
    });

    return (doc as any).lastAutoTable.finalY;
  };

  // Render checklists based on single vs multi-panel
  if (!panels || panels.length <= 1) {
    // Single panel: full checklist
    const tableBody = buildChecklistTableBody(report.checklist);
    yPos = drawChecklistTable(tableBody, yPos) + 4;
  } else {
    // Multi-panel: Master panel gets full checklist, others get sections 8, 9, 10
    const secondarySections = ["faultMonitoring", "standbyPowerSupplies", "controlEquipment"];
    
    panels.forEach((panel, idx) => {
      const isMaster = idx === 0;
      
      // Panel header
      doc.setFillColor(...(isMaster ? COLORS.red : COLORS.charcoal));
      doc.rect(margin, yPos, contentWidth, 8, "F");
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      const panelTitle = isMaster 
        ? `MASTER PANEL: ${panel.assetName}` 
        : `PANEL ${idx + 1}: ${panel.assetName}`;
      doc.text(panelTitle, margin + 3, yPos + 5.5);
      
      // Panel details on right
      const panelDetails = [
        panel.manufacturer,
        panel.model,
        panel.location || null,
      ].filter(Boolean).join(" | ");
      if (panelDetails) {
        doc.setFontSize(8);
        doc.text(panelDetails, pageWidth - margin - 3, yPos + 5.5, { align: "right" });
      }
      
      yPos += 10;
      
      // Checklist for this panel
      const sectionsToInclude = isMaster ? undefined : secondarySections;
      const tableBody = buildChecklistTableBody(panel.checklist, sectionsToInclude);
      yPos = drawChecklistTable(tableBody, yPos) + 2;
      
      // Secondary panel defects/recommendations
      if (!isMaster && (panel.defects || panel.recommendations)) {
        doc.setFontSize(8);
        if (panel.defects) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...COLORS.red);
          doc.text("Defects: ", margin, yPos + 4);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...COLORS.charcoal);
          const defectLines = doc.splitTextToSize(panel.defects, contentWidth - 22);
          doc.text(defectLines.slice(0, 2), margin + 18, yPos + 4);
          yPos += Math.min(defectLines.length, 2) * 4 + 2;
        }
        if (panel.recommendations) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...COLORS.red);
          doc.text("Recommendations: ", margin, yPos + 4);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...COLORS.charcoal);
          const recLines = doc.splitTextToSize(panel.recommendations, contentWidth - 35);
          doc.text(recLines.slice(0, 2), margin + 32, yPos + 4);
          yPos += Math.min(recLines.length, 2) * 4 + 2;
        }
      }
      
      yPos += 4;
    });
  }

  // === Condition & Next Service Row ===
  const conditionText = report.system_condition
    ? report.system_condition.replace(/_/g, " ").toUpperCase()
    : "NOT ASSESSED";

  let conditionColor: [number, number, number] = COLORS.mediumGrey;
  if (report.system_condition === "satisfactory") conditionColor = COLORS.yes;
  else if (report.system_condition === "requires_attention") conditionColor = [200, 150, 0] as [number, number, number];
  else if (report.system_condition === "unsatisfactory") conditionColor = COLORS.no;

  // Next service is always 3 months from the report date
  const nextService = addMonths(new Date(report.report_date), 3);

  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin, yPos, contentWidth, 14, "F");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.charcoal);
  doc.text("Condition:", margin + 3, yPos + 8);
  doc.setTextColor(...conditionColor);
  doc.text(conditionText, margin + 25, yPos + 8);

  doc.setTextColor(...COLORS.charcoal);
  doc.text("Next Service:", margin + 85, yPos + 8);
  doc.setTextColor(...COLORS.red);
  doc.text(format(nextService, "dd MMM yyyy"), margin + 115, yPos + 8);

  yPos += 18;

  // === Notes/Defects (if any, compact) ===
  const notesItems = [
    { label: "Defects", text: report.defects_found },
    { label: "Recommendations", text: report.recommendations },
    { label: "Work Done", text: report.work_carried_out },
  ].filter((n) => n.text && n.text.trim());

  if (notesItems.length > 0) {
    notesItems.forEach((note) => {
      if (yPos > pageHeight - 30) return;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.red);
      doc.text(note.label + ":", margin, yPos);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.charcoal);
      const lines = doc.splitTextToSize(note.text!, contentWidth - 2);
      doc.text(lines.slice(0, 2), margin, yPos + 5);
      yPos += Math.min(lines.length, 2) * 4 + 8;
    });
  }

  // === Signature Row ===
  // Check if we need a new page for signatures (need ~35mm)
  const signOffHeight = 35;
  if (yPos + signOffHeight > pageHeight - 15) {
    doc.addPage();
    yPos = 20;
  } else {
    yPos = Math.max(yPos, pageHeight - 35);
  }
  
  doc.setDrawColor(...COLORS.borderGrey);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 3;

  const sigWidth = (contentWidth - 10) / 2;
  const sigBoxHeight = 22;

  // Engineer signature box
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.rect(margin, yPos, sigWidth, sigBoxHeight);
  
  // Engineer header
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin, yPos, sigWidth, 6, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.charcoal);
  doc.text("ENGINEER", margin + 2, yPos + 4);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text(report.engineer_name || "—", margin + 22, yPos + 4);
  
  // Signature area
  const engSigY = yPos + 7;
  const sigAreaHeight = sigBoxHeight - 9;
  
  // Signature line
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.2);
  doc.line(margin + 3, engSigY + sigAreaHeight - 1, margin + sigWidth - 3, engSigY + sigAreaHeight - 1);
  
  // Draw engineer signature if available
  if (signatures?.engineerSignature) {
    try {
      doc.addImage(signatures.engineerSignature, "PNG", margin + 3, engSigY, sigWidth - 6, sigAreaHeight - 2);
    } catch {
      // Signature image failed
    }
  }
  
  // Signed date/time
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.mediumGrey);
  // engineerSignDate is already formatted as dd/MM/yyyy, so use it directly
  const engSignDateStr = signatures?.engineerSignDate || format(new Date(visit.visit_date), "dd/MM/yyyy");
  const engSignTimeStr = signatures?.engineerSignTime || "";
  doc.text(`Signed: ${engSignDateStr}${engSignTimeStr ? ` ${engSignTimeStr}` : ""}`, margin + 2, yPos + sigBoxHeight + 4);

  // Customer signature box
  const custX = margin + sigWidth + 10;
  doc.setDrawColor(...COLORS.borderGrey);
  doc.rect(custX, yPos, sigWidth, sigBoxHeight);
  
  // Customer header
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(custX, yPos, sigWidth, 6, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.charcoal);
  doc.text("CLIENT", custX + 2, yPos + 4);
  
  if (signatures?.customerNotPresent) {
    // Customer not present
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text("Not Present", custX + 18, yPos + 4);
    
    // Message area
    const custSigY = yPos + 7;
    doc.setFillColor(250, 245, 235);
    doc.rect(custX + 1, custSigY, sigWidth - 2, sigAreaHeight, "F");
    
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text("Customer was not available", custX + sigWidth / 2, custSigY + sigAreaHeight / 2 - 1, { align: "center" });
    doc.text("to sign off on this work.", custX + sigWidth / 2, custSigY + sigAreaHeight / 2 + 4, { align: "center" });
    
    doc.setFontSize(7);
    doc.text("Signed by engineer only", custX + 2, yPos + sigBoxHeight + 4);
  } else {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text(report.client_name || "—", custX + 18, yPos + 4);
    
    // Signature area
    const custSigY = yPos + 7;
    
    // Signature line
    doc.setDrawColor(...COLORS.borderGrey);
    doc.setLineWidth(0.2);
    doc.line(custX + 3, custSigY + sigAreaHeight - 1, custX + sigWidth - 3, custSigY + sigAreaHeight - 1);
    
    // Draw customer signature if available
    if (signatures?.customerSignature) {
      try {
        doc.addImage(signatures.customerSignature, "PNG", custX + 3, custSigY, sigWidth - 6, sigAreaHeight - 2);
      } catch {
        // Signature image failed
      }
    }
    
    // Signed date/time
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.mediumGrey);
    // customerSignDate is already formatted as dd/MM/yyyy, so use it directly
    const custSignDateStr = signatures?.customerSignDate || format(new Date(visit.visit_date), "dd/MM/yyyy");
    const custSignTimeStr = signatures?.customerSignTime || "";
    doc.text(`Signed: ${custSignDateStr}${custSignTimeStr ? ` ${custSignTimeStr}` : ""}`, custX + 2, yPos + sigBoxHeight + 4);
  }

  addCompactFooter(doc, pageWidth, margin);

  const fileName = `BHO_Service_Report_${site.name.replace(/\s+/g, "_")}_${format(new Date(report.report_date), "yyyy-MM-dd")}.pdf`;
  
  if (returnBase64) {
    // Return base64 string (without data URI prefix)
    return doc.output("datauristring").split(",")[1];
  }
  
  doc.save(fileName);
}

// ===================== WORK REPORT / JOB SHEET PDF =====================
// Clean corporate style matching the Service Report format
export interface WorkDayEntry {
  date: string;
  startTime: string;
  finishTime: string;
  duration: string;
}

export interface WorkReportData {
  certificateNo: string;
  jobNumber: string;
  jobType: string;
  appointmentDate?: string;
  systemStatusArrival: string;
  systemStatusDeparture: string;
  workCompleted: boolean;
  reportStatus?: string;
  returnRequired: boolean;
  surveyRequired: boolean;
  quotationRequired: boolean;
  ramsCompleted: boolean;
  logBookEntry: boolean;
  worksReport: string;
  furtherAction: string;
  numEngineers: number | "";
  workDays?: WorkDayEntry[];
  totalHours?: string;
  startTime: string;
  finishTime: string;
  travelTime: string;
  duration: string;
  materials: { name: string; qty: string; cost: string }[];
  photos?: { url: string; caption: string }[];
  reportFiles?: { url: string; name: string; size?: number }[];
  engineerName: string;
  engineerSignature?: string;
  engineerSignDate?: string;
  engineerSignTime?: string;
  customerNotPresent?: boolean;
  customerName: string;
  customerSignature?: string;
  customerSignDate?: string;
  customerSignTime?: string;
  customerPosition?: string;
  reportDate?: string;
  // Custom system info fields (only show if populated)
  panelInfo?: string;
  locationInfo?: string;
  typeInfo?: string;
  zonesInfo?: string;
  contactPhone?: string;
  contactPerson?: string;
  contactEmail?: string;
  // Legacy system info (deprecated - use custom fields above)
  systemType?: string;
  panelManufacturer?: string;
  panelModel?: string;
  panelLocation?: string;
  zonesCount?: number;
  devicesCount?: number;
}

interface WorkReportSiteInfo {
  name: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
}

export async function generateWorkReportPDF(
  data: WorkReportData,
  site: WorkReportSiteInfo,
  visitDate: string,
  visitType?: string,
  returnBase64?: boolean
): Promise<string | void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - 2 * margin;

  const parseTimeToMinutes = (time: string): number | null => {
    if (!time) return null;
    const [h, m] = time.split(":").map((n) => Number(n));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const formatMinutesToTime = (mins: number): string => {
    const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const deriveFinishTime = (start: string, durationHours: string): string => {
    const startMins = parseTimeToMinutes(start);
    const dur = Number(durationHours);
    if (startMins === null || !Number.isFinite(dur) || dur <= 0) return "";
    const durMins = Math.round(dur * 60);
    return formatMinutesToTime(startMins + durMins);
  };

  // Load logo
  const logoImg = new Image();
  logoImg.src = "/bho-fire-logo.png";

  let yPos = addCompactHeader(doc, pageWidth, margin, logoImg);

  // === Title Row ===
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Job Sheet", margin, yPos + 4);

  doc.setTextColor(...COLORS.red);
  doc.setFontSize(10);
  doc.text("Fire & Life Safety Service Report", margin, yPos + 10);

  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (data.certificateNo) {
    doc.text(`Ref: ${data.certificateNo}`, pageWidth - margin, yPos + 4, { align: "right" });
  }
  doc.text(format(new Date(visitDate), "dd MMM yyyy"), pageWidth - margin, yPos + 10, { align: "right" });

  yPos += 16;

  // === Site & Service Details (Side by Side) ===
  const colWidth = (contentWidth - 6) / 2;

  // Left: Site Info - only include populated rows
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);

  const siteAddr = [site.address, site.city, site.postcode].filter(Boolean).join(", ");
  const siteRows: [string, string][] = [];
  siteRows.push(["Site:", site.name]);
  if (siteAddr) siteRows.push(["Address:", siteAddr]);
  if (data.contactPerson || site.contact_name) siteRows.push(["Contact:", data.contactPerson || site.contact_name || ""]);
  if (data.contactPhone || site.contact_phone) siteRows.push(["Phone:", data.contactPhone || site.contact_phone || ""]);
  if (data.contactEmail) siteRows.push(["Email:", data.contactEmail]);

  const boxHeight = Math.max(40, 8 + siteRows.length * 7 + 4);

  doc.rect(margin, yPos, colWidth, boxHeight);

  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, colWidth, 8, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("SITE", margin + 3, yPos + 5.5);

  doc.setFontSize(9);
  let rowY = yPos + 14;
  siteRows.forEach(([label, val]) => {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFont("helvetica", "bold");
    doc.text(label, margin + 3, rowY);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    const maxW = colWidth - 26;
    const txt = doc.splitTextToSize(val, maxW)[0] || "-";
    doc.text(txt, margin + 22, rowY);
    rowY += 7;
  });

  const rightX = margin + colWidth + 6;
  doc.rect(rightX, yPos, colWidth, boxHeight);

  doc.setFillColor(...COLORS.charcoal);
  doc.rect(rightX, yPos, colWidth, 8, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("SERVICE", rightX + 3, yPos + 5.5);

  const typeLabel = visitType ? visitType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : 
    (data.jobType ? JOB_TYPES_PDF.find(j => j.value === data.jobType)?.label || data.jobType : "Work Report");
  const statusLabel = data.workCompleted ? "Completed" : "In Progress";
  const serviceRows = [
    ["Type:", typeLabel],
    ["Date:", format(new Date(visitDate), "dd MMM yyyy")],
    ["Engineer:", data.engineerName || "-"],
    ["Status:", statusLabel],
  ];

  doc.setFontSize(9);
  rowY = yPos + 14;
  serviceRows.forEach(([label, val]) => {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFont("helvetica", "bold");
    doc.text(label, rightX + 3, rowY);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    doc.text(val, rightX + 24, rowY);
    rowY += 7;
  });

  yPos += boxHeight + 5;

  // === System Info Row (only show if any custom fields are populated) ===
  const hasCustomSystemFields = data.panelInfo || data.locationInfo || data.typeInfo || data.zonesInfo;
  
  if (hasCustomSystemFields) {
    const systemFields: string[] = [];
    if (data.panelInfo) systemFields.push(`Panel: ${data.panelInfo}`);
    if (data.locationInfo) systemFields.push(`Location: ${data.locationInfo}`);
    if (data.typeInfo) systemFields.push(`Type: ${data.typeInfo}`);
    if (data.zonesInfo) systemFields.push(`Zones: ${data.zonesInfo}`);

    const boxHeight = 8 + Math.ceil(systemFields.length / 3) * 7 + 4;
    doc.rect(margin, yPos, contentWidth, boxHeight);
    doc.setFillColor(...COLORS.charcoal);
    doc.rect(margin, yPos, contentWidth, 8, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("SYSTEM", margin + 3, yPos + 5.5);

    doc.setFontSize(9);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    const sysColW = contentWidth / 3;
    
    // Render fields in rows of 3
    systemFields.forEach((field, idx) => {
      const row = Math.floor(idx / 3);
      const col = idx % 3;
      const fieldY = yPos + 14 + row * 7;
      doc.text(field, margin + 3 + sysColW * col, fieldY);
    });

    yPos += boxHeight + 4;
  }

  // === WORKS CARRIED OUT (Dynamic height using autoTable) ===
  autoTable(doc, {
    startY: yPos,
    head: [["WORKS CARRIED OUT"]],
    body: [[data.worksReport || "-"]],
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: COLORS.borderGrey,
      lineWidth: 0.3,
      textColor: COLORS.charcoal,
    },
    headStyles: {
      fillColor: COLORS.charcoal,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: contentWidth },
    },
  });
  yPos = (doc as any).lastAutoTable.finalY + 4;

  // === RECOMMENDATIONS (Dynamic height using autoTable) ===
  autoTable(doc, {
    startY: yPos,
    head: [["RECOMMENDATIONS / FURTHER WORK"]],
    body: [[data.furtherAction || "-"]],
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: COLORS.borderGrey,
      lineWidth: 0.3,
      textColor: COLORS.charcoal,
    },
    headStyles: {
      fillColor: COLORS.charcoal,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: contentWidth },
    },
  });
  yPos = (doc as any).lastAutoTable.finalY + 5;

  // === PHOTOS SECTION (only if photos exist) ===
  if (data.photos && data.photos.length > 0) {
    // 2-column grid, ~66mm per photo (250px equivalent at 96dpi)
    const photosPerRow = 2;
    const photoGap = 8;
    const photoSize = 66; // ~250px - medium size, not overpowering
    const captionHeight = 10;
    const rowHeight = photoSize + captionHeight + 5;
    const estimatedPhotoHeight = 8 + Math.ceil(data.photos.length / photosPerRow) * rowHeight;
    
    if (yPos + Math.min(estimatedPhotoHeight, 80) > pageHeight - 15) {
      doc.addPage();
      yPos = addCompactHeader(doc, pageWidth, margin, logoImg);
    }

    // Photos header bar
    doc.setFillColor(...COLORS.charcoal);
    doc.rect(margin, yPos, contentWidth, 8, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("SITE PHOTOS", margin + 3, yPos + 5.5);
    
    yPos += 12;

    // Center the 2-column grid within content width
    const gridWidth = (photoSize * photosPerRow) + (photoGap * (photosPerRow - 1));
    const gridStartX = margin + (contentWidth - gridWidth) / 2;

    // Render photos in a 2-column grid
    let photoX = gridStartX;
    let photoY = yPos;
    
    for (let i = 0; i < data.photos.length; i++) {
      const photo = data.photos[i];
      const colIndex = i % photosPerRow;
      
      // Start new row after every 2 photos
      if (i > 0 && colIndex === 0) {
        photoX = gridStartX;
        photoY += rowHeight;
      } else if (i > 0) {
        photoX = gridStartX + colIndex * (photoSize + photoGap);
      }
      
      // Check if we need a new page
      if (photoY + photoSize + captionHeight > pageHeight - 15) {
        doc.addPage();
        photoY = addCompactHeader(doc, pageWidth, margin, logoImg);
        photoX = gridStartX + colIndex * (photoSize + photoGap);
      }

      // Draw photo border
      doc.setDrawColor(...COLORS.borderGrey);
      doc.setLineWidth(0.3);
      doc.rect(photoX, photoY, photoSize, photoSize);
      
      // Try to add the image - use fetch+blob to avoid CORS issues
      try {
        let imgDataUrl: string;
        try {
          const response = await fetch(photo.url);
          const blob = await response.blob();
          imgDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch {
          // Fallback: try Image element with canvas
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Failed to load image"));
            image.src = photo.url;
          });
          const canvas = document.createElement("canvas");
          canvas.width = 250;
          canvas.height = 250;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, 250, 250);
          imgDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        }
        doc.addImage(imgDataUrl, "JPEG", photoX + 1, photoY + 1, photoSize - 2, photoSize - 2);
      } catch (photoErr) {
        console.error("Failed to load photo for PDF:", photoErr);
        doc.setFillColor(...COLORS.lightGrey);
        doc.rect(photoX + 1, photoY + 1, photoSize - 2, photoSize - 2, "F");
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.mediumGrey);
        doc.text("Photo", photoX + photoSize / 2, photoY + photoSize / 2, { align: "center" });
      }
      
      // Add caption if present
      if (photo.caption) {
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.charcoal);
        doc.setFont("helvetica", "normal");
        const captionLines = doc.splitTextToSize(photo.caption, photoSize - 2);
        doc.text(captionLines.slice(0, 2), photoX + 1, photoY + photoSize + 4);
      }
    }
    
    // Calculate final Y position after photos
    yPos = photoY + rowHeight;
  }

  // === SIGN-OFF SECTION ===
  // Check if we need a new page for signatures (need ~50mm)
  const signOffHeight = 50;
  if (yPos + signOffHeight > pageHeight - 15) {
    doc.addPage();
    yPos = 20;
  }
  
  // Sign-off header bar
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, contentWidth, 8, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("SIGN-OFF & COMPLETION", margin + 3, yPos + 5.5);
  
  // Completion status badge
  const isWorkCompleted =
    data.workCompleted || data.reportStatus === "completed" || data.reportStatus === "locked";
  const statusText = isWorkCompleted ? "WORKS COMPLETED" : "WORKS IN PROGRESS";
  const statusColor: [number, number, number] = isWorkCompleted ? COLORS.yes : [200, 150, 0];
  doc.setFillColor(...statusColor);
  doc.rect(pageWidth - margin - 42, yPos + 1.5, 40, 5, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(8);
  doc.text(statusText, pageWidth - margin - 40, yPos + 5);
  
  yPos += 10;
  
  // Work Days Table or Single Day Row
  const workDaysData = data.workDays && data.workDays.length > 0 ? data.workDays : [{
    date: visitDate,
    startTime: data.startTime,
    finishTime: data.finishTime,
    duration: data.duration
  }];

  const derivedArrival = workDaysData.find((d) => !!d.startTime)?.startTime || data.startTime || "";
  const lastDayWithTimes = [...workDaysData]
    .reverse()
    .find((d) => !!d.finishTime || (!!d.startTime && !!d.duration));
  const derivedDeparture =
    lastDayWithTimes?.finishTime ||
    (lastDayWithTimes?.startTime && lastDayWithTimes?.duration
      ? deriveFinishTime(lastDayWithTimes.startTime, lastDayWithTimes.duration)
      : data.finishTime || "");
  
  if (workDaysData.length > 1) {
    // Multi-day table
    const tableData = workDaysData.map(day => [
      day.date ? format(new Date(day.date), "dd/MM/yyyy") : "—",
      day.startTime || "—",
      day.finishTime || (day.startTime && day.duration ? deriveFinishTime(day.startTime, day.duration) : "—"),
      day.duration ? `${day.duration}` : "—"
    ]);
    
    // Add total row
    tableData.push([
      "TOTAL",
      "",
      "",
      data.totalHours ? `${data.totalHours} hrs` : "—"
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [["Date", "Start", "Finish", "Hours"]],
      body: tableData,
      margin: { left: margin, right: margin },
      theme: "plain",
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: COLORS.borderGrey,
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: COLORS.lightGrey,
        textColor: COLORS.charcoal,
        fontStyle: "bold",
      },
      bodyStyles: {
        textColor: COLORS.charcoal,
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 30 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30, fontStyle: "bold" },
      },
      didParseCell: function(hookData) {
        // Style the total row
        if (hookData.row.index === tableData.length - 1 && hookData.section === 'body') {
          hookData.cell.styles.fillColor = COLORS.lightGrey;
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 4;
  } else {
    // Single day row (legacy behavior)
    doc.setFillColor(...COLORS.lightGrey);
    doc.rect(margin, yPos, contentWidth, 12, "F");
    doc.setDrawColor(...COLORS.borderGrey);
    doc.rect(margin, yPos, contentWidth, 12);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.charcoal);
    
    const timeY = yPos + 7.5;
    const colW = contentWidth / 4;
    
    doc.text("Date:", margin + 3, timeY);
    doc.setFont("helvetica", "normal");
    doc.text(format(new Date(visitDate), "dd/MM/yyyy"), margin + 16, timeY);
    
    doc.setFont("helvetica", "bold");
    doc.text("Arrival:", margin + colW + 3, timeY);
    doc.setFont("helvetica", "normal");
    doc.text(derivedArrival || "—", margin + colW + 20, timeY);
    
    doc.setFont("helvetica", "bold");
    doc.text("Departure:", margin + colW * 2 + 3, timeY);
    doc.setFont("helvetica", "normal");
    doc.text(derivedDeparture || "—", margin + colW * 2 + 28, timeY);
    
    doc.setFont("helvetica", "bold");
    doc.text("Duration:", margin + colW * 3 + 3, timeY);
    doc.setFont("helvetica", "normal");
    doc.text(data.duration ? `${data.duration} hrs` : "—", margin + colW * 3 + 24, timeY);
    
    yPos += 14;
  }
  
  const sigWidth = (contentWidth - 10) / 2;
  const sigBoxHeight = 26;

  // Engineer signature box
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.rect(margin, yPos, sigWidth, sigBoxHeight);
  
  // Engineer header bar inside box
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin, yPos, sigWidth, 7, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.charcoal);
  doc.text("ENGINEER", margin + 3, yPos + 5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text(data.engineerName || "—", margin + 28, yPos + 5);
  
  // Signature canvas area
  const engSigY = yPos + 8;
  const sigAreaHeight = sigBoxHeight - 9;
  doc.setFillColor(...COLORS.white);
  doc.rect(margin + 2, engSigY, sigWidth - 4, sigAreaHeight, "F");
  
  // Draw signature line
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.2);
  doc.line(margin + 4, engSigY + sigAreaHeight - 2, margin + sigWidth - 4, engSigY + sigAreaHeight - 2);
  
  if (data.engineerSignature) {
    try {
      // Position signature above the line
      doc.addImage(data.engineerSignature, "PNG", margin + 4, engSigY + 1, sigWidth - 8, sigAreaHeight - 4);
    } catch {
      // Signature image failed
    }
  }
  
  // Signed date/time - positioned clearly below signature box
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.mediumGrey);
  const engSignDateStr = data.engineerSignDate 
    ? format(new Date(data.engineerSignDate), "dd/MM/yyyy")
    : format(new Date(visitDate), "dd/MM/yyyy");
  const engSignTimeStr = data.engineerSignTime || derivedDeparture || "";
  doc.text(`Signed: ${engSignDateStr}${engSignTimeStr ? ` ${engSignTimeStr}` : ""}`, margin + 3, yPos + sigBoxHeight + 5);

  // Customer signature box
  const custX = margin + sigWidth + 10;
  doc.setDrawColor(...COLORS.borderGrey);
  doc.rect(custX, yPos, sigWidth, sigBoxHeight);
  
  // Customer header bar inside box
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(custX, yPos, sigWidth, 7, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.charcoal);
  doc.text("CUSTOMER", custX + 3, yPos + 5);
  
  if (data.customerNotPresent) {
    // Customer not present indicator
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text("Not Present", custX + 30, yPos + 5);
    
    // Message area with amber/grey background
    const custSigY = yPos + 8;
    doc.setFillColor(250, 245, 235);
    doc.rect(custX + 2, custSigY, sigWidth - 4, sigAreaHeight, "F");
    
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text("Customer was not available", custX + sigWidth / 2, custSigY + sigAreaHeight / 2 - 1, { align: "center" });
    doc.text("to sign off on this work.", custX + sigWidth / 2, custSigY + sigAreaHeight / 2 + 5, { align: "center" });
    
    doc.setFontSize(8);
    doc.text("Signed by engineer only", custX + 3, yPos + sigBoxHeight + 5);
  } else {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text(data.customerName || "—", custX + 30, yPos + 5);
    
    // Signature canvas area
    const custSigY = yPos + 8;
    doc.setFillColor(...COLORS.white);
    doc.rect(custX + 2, custSigY, sigWidth - 4, sigAreaHeight, "F");
    
    // Draw signature line
    doc.setDrawColor(...COLORS.borderGrey);
    doc.setLineWidth(0.2);
    doc.line(custX + 4, custSigY + sigAreaHeight - 2, custX + sigWidth - 4, custSigY + sigAreaHeight - 2);
    
    if (data.customerSignature) {
      try {
        doc.addImage(data.customerSignature, "PNG", custX + 4, custSigY + 1, sigWidth - 8, sigAreaHeight - 4);
      } catch {
        // Signature image failed
      }
    }
    
    // Signed date/time
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.mediumGrey);
    const custSignDateStr = data.customerSignDate 
      ? format(new Date(data.customerSignDate), "dd/MM/yyyy")
      : format(new Date(visitDate), "dd/MM/yyyy");
    const custSignTimeStr = data.customerSignTime || data.finishTime || "";
    doc.text(`Signed: ${custSignDateStr}${custSignTimeStr ? ` ${custSignTimeStr}` : ""}`, custX + 3, yPos + sigBoxHeight + 5);
  }

  addCompactFooter(doc, pageWidth, margin);

  const fileName = `BHO_Work_Report_${site.name.replace(/\s+/g, "_")}_${format(new Date(visitDate), "yyyy-MM-dd")}.pdf`;
  
  if (returnBase64) {
    // Return base64 string (without data URI prefix)
    return doc.output("datauristring").split(",")[1];
  }
  
  doc.save(fileName);
}

// Lookup arrays for PDF labels
const JOB_TYPES_PDF = [
  { value: "service", label: "Service" },
  { value: "repair", label: "Repair" },
  { value: "installation", label: "Installation" },
  { value: "inspection", label: "Inspection" },
  { value: "commissioning", label: "Commissioning" },
  { value: "remedial", label: "Remedial" },
  { value: "emergency", label: "Emergency" },
  { value: "supply_only", label: "Supply Only" },
];

// ===================== ASD SERVICE REPORT PDF =====================
import { ASDChecklist, ASD_CHECKLIST_LABELS, ASD_SECTION_LABELS } from "@/services/asdChecklistService";

interface ASDUnitData {
  assetId: string;
  assetName: string;
  manufacturer?: string;
  model?: string;
  location?: string;
  checklist: ASDChecklist;
  defects?: string;
  recommendations?: string;
  systemCondition?: string;
}

interface ASDReportData {
  reportNumber: string;
  reportDate: string;
  engineerName: string;
  clientName: string;
  units: ASDUnitData[];
  // Global Summary fields (from Summary tab)
  systemCondition?: string;
  defectsFound?: string;
  recommendations?: string;
  workCarriedOut?: string;
  partsUsed?: string;
  notes?: string;
  // Signatures
  engineerSignature?: string;
  engineerSignDate?: string;
  engineerSignTime?: string;
  customerNotPresent?: boolean;
  customerSignature?: string;
  customerSignDate?: string;
  customerSignTime?: string;
}

export function generateASDReportPDF(
  data: ASDReportData,
  site: SiteInfo,
  visitDate: string,
  visitType?: string,
  returnBase64?: boolean
): string | void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - 2 * margin;

  const logoImg = new Image();
  logoImg.src = "/bho-fire-logo.png";

  let yPos = addCompactHeader(doc, pageWidth, margin, logoImg);

  // === Title Row ===
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("ASD Service Report", margin, yPos + 4);

  doc.setTextColor(...COLORS.red);
  doc.setFontSize(10);
  doc.text("Aspirating Smoke Detection", margin, yPos + 10);

  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (data.reportNumber) {
    doc.text(`Ref: ${data.reportNumber}`, pageWidth - margin, yPos + 4, { align: "right" });
  }
  doc.text(format(new Date(data.reportDate), "dd MMM yyyy"), pageWidth - margin, yPos + 10, { align: "right" });

  yPos += 16;

  // === Site & Service Details (Side by Side) ===
  const colWidth = (contentWidth - 6) / 2;
  const boxHeight = 38;

  // Left: Site Info
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.rect(margin, yPos, colWidth, boxHeight);

  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, colWidth, 7, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("SITE", margin + 3, yPos + 5);

  const siteAddr = [site.address, site.city, site.postcode].filter(Boolean).join(", ");
  const siteRows = [
    ["Site:", site.name],
    ["Address:", siteAddr || "-"],
    ["Contact:", site.contact_name || "-"],
    ["Phone:", site.contact_phone || "-"],
  ];

  doc.setFontSize(9);
  let rowY = yPos + 13;
  siteRows.forEach(([label, val]) => {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFont("helvetica", "bold");
    doc.text(label, margin + 3, rowY);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    const maxW = colWidth - 26;
    const txt = doc.splitTextToSize(val, maxW)[0] || "-";
    doc.text(txt, margin + 22, rowY);
    rowY += 6.5;
  });

  // Right: Service Info
  const rightX = margin + colWidth + 6;
  doc.rect(rightX, yPos, colWidth, boxHeight);

  doc.setFillColor(...COLORS.charcoal);
  doc.rect(rightX, yPos, colWidth, 7, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("SERVICE", rightX + 3, yPos + 5);

  const typeLabel = visitType
    ? visitType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "ASD Service";
  const serviceRows = [
    ["Type:", typeLabel],
    ["Date:", format(new Date(visitDate), "dd MMM yyyy")],
    ["Engineer:", data.engineerName || "-"],
    ["Units:", `${data.units.length} ASD unit${data.units.length > 1 ? "s" : ""}`],
  ];

  doc.setFontSize(9);
  rowY = yPos + 13;
  serviceRows.forEach(([label, val]) => {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFont("helvetica", "bold");
    doc.text(label, rightX + 3, rowY);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    doc.text(val, rightX + 24, rowY);
    rowY += 6.5;
  });

  yPos += boxHeight + 5;

  // === Loop through each unit ===
  data.units.forEach((unit, unitIndex) => {
    // Check if we need a new page
    if (yPos > pageHeight - 80) {
      doc.addPage();
      yPos = addCompactHeader(doc, pageWidth, margin, logoImg);
    }

    // Unit header
    doc.setFillColor(...COLORS.red);
    doc.rect(margin, yPos, contentWidth, 8, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`UNIT ${unitIndex + 1}: ${unit.assetName}`, margin + 3, yPos + 5.5);

    // Unit info on same line if space
    if (unit.manufacturer || unit.location) {
      const infoText = [unit.manufacturer, unit.model, unit.location].filter(Boolean).join(" | ");
      doc.setFontSize(8);
      doc.text(infoText, pageWidth - margin - 3, yPos + 5.5, { align: "right" });
    }

    yPos += 11;

    // Checklist sections as compact table
    const checklist = unit.checklist;
    const checklistRows: (string | { content: string; styles?: Record<string, unknown> })[][] = [];

    // Pre-service actions
    Object.entries(ASD_CHECKLIST_LABELS.pre_service_actions).forEach(([key, label]) => {
      const val = checklist.pre_service_actions[key as keyof typeof checklist.pre_service_actions];
      checklistRows.push([
        label,
        val === true ? "YES" : val === false ? "NO" : "N/A",
      ]);
    });

    // Airflow readings
    checklistRows.push([
      { content: "Airflow Readings", styles: { fontStyle: "bold", fillColor: COLORS.lightGrey } },
      { content: "Before / After", styles: { fontStyle: "bold", fillColor: COLORS.lightGrey } },
    ]);
    Object.entries(checklist.airflow_readings).forEach(([key, reading]) => {
      const pipeNum = key.replace("pipe_", "Pipe ");
      checklistRows.push([
        pipeNum,
        `${reading.before || "-"} / ${reading.after || "-"}`,
      ]);
    });

    // Cleaning activities
    Object.entries(ASD_CHECKLIST_LABELS.cleaning_activities).forEach(([key, label]) => {
      const val = checklist.cleaning_activities[key as keyof typeof checklist.cleaning_activities];
      checklistRows.push([
        label,
        val === true ? "YES" : val === false ? "NO" : "N/A",
      ]);
    });

    // System checks
    Object.entries(ASD_CHECKLIST_LABELS.system_checks).forEach(([key, label]) => {
      const val = checklist.system_checks[key as keyof typeof checklist.system_checks];
      checklistRows.push([
        label,
        val === true ? "YES" : val === false ? "NO" : "N/A",
      ]);
    });

    autoTable(doc, {
      startY: yPos,
      head: [["Checklist Item", "Status"]],
      body: checklistRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: COLORS.charcoal, textColor: COLORS.white, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.75 },
        1: { cellWidth: contentWidth * 0.25, halign: "center" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          const val = String(data.cell.raw);
          if (val === "YES") {
            data.cell.styles.textColor = COLORS.yes;
            data.cell.styles.fontStyle = "bold";
          } else if (val === "NO") {
            data.cell.styles.textColor = COLORS.no;
            data.cell.styles.fontStyle = "bold";
          } else if (val === "N/A") {
            data.cell.styles.textColor = COLORS.mediumGrey;
          }
        }
      },
    });

    yPos = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || yPos + 50;
    yPos += 3;

    // Defects & Recommendations for this unit
    if (unit.defects || unit.recommendations || unit.systemCondition) {
      // Calculate dynamic box height based on content
      const defectLines = unit.defects 
        ? doc.splitTextToSize(unit.defects, contentWidth - 30) 
        : [];
      const recLines = unit.recommendations 
        ? doc.splitTextToSize(unit.recommendations, contentWidth - 45) 
        : [];
      
      const lineHeight = 5;
      const headerHeight = 6;
      const padding = 8;
      const defectRowHeight = unit.defects ? Math.max(1, defectLines.length) * lineHeight : 0;
      const recRowHeight = unit.recommendations ? Math.max(1, recLines.length) * lineHeight : 0;
      const conditionRowHeight = unit.systemCondition ? lineHeight : 0;
      const defectBoxHeight = headerHeight + padding + defectRowHeight + recRowHeight + conditionRowHeight + 4;

      if (yPos > pageHeight - defectBoxHeight - 10) {
        doc.addPage();
        yPos = addCompactHeader(doc, pageWidth, margin, logoImg);
      }

      doc.setDrawColor(...COLORS.borderGrey);
      doc.rect(margin, yPos, contentWidth, defectBoxHeight);

      doc.setFillColor(...COLORS.charcoal);
      doc.rect(margin, yPos, contentWidth, headerHeight, "F");
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Defects & Recommendations", margin + 3, yPos + 4);

      // System condition badge in header
      if (unit.systemCondition) {
        const condLabel = unit.systemCondition === "satisfactory" 
          ? "Satisfactory" 
          : unit.systemCondition === "requires_attention" 
          ? "Requires Attention" 
          : "Unsatisfactory";
        const condColor = unit.systemCondition === "satisfactory" 
          ? COLORS.yes 
          : unit.systemCondition === "requires_attention" 
          ? [255, 165, 0] as [number, number, number]
          : COLORS.no;
        doc.setTextColor(...condColor);
        doc.setFont("helvetica", "bold");
        doc.text(condLabel, pageWidth - margin - 3, yPos + 4, { align: "right" });
      }

      doc.setFontSize(8);
      doc.setTextColor(...COLORS.charcoal);
      doc.setFont("helvetica", "normal");

      let textY = yPos + headerHeight + 5;
      
      if (unit.defects) {
        doc.setFont("helvetica", "bold");
        doc.text("Defects:", margin + 3, textY);
        doc.setFont("helvetica", "normal");
        doc.text(defectLines, margin + 22, textY);
        textY += defectRowHeight + 2;
      }
      
      if (unit.recommendations) {
        doc.setFont("helvetica", "bold");
        doc.text("Recommendations:", margin + 3, textY);
        doc.setFont("helvetica", "normal");
        doc.text(recLines, margin + 35, textY);
        textY += recRowHeight + 2;
      }

      yPos += defectBoxHeight + 5;
    }

    yPos += 5;
  });

  // === OVERALL SUMMARY (Global - from Summary Tab) ===
  if (data.systemCondition || data.defectsFound || data.recommendations) {
    // Calculate dynamic box height
    const defectLinesGlobal = data.defectsFound 
      ? doc.splitTextToSize(data.defectsFound, contentWidth - 30) 
      : [];
    const recLinesGlobal = data.recommendations 
      ? doc.splitTextToSize(data.recommendations, contentWidth - 45) 
      : [];
    
    const lineHeightS = 5;
    const headerHeightS = 7;
    const paddingS = 6;
    const defectRowHeightS = data.defectsFound ? Math.max(1, defectLinesGlobal.length) * lineHeightS : 0;
    const recRowHeightS = data.recommendations ? Math.max(1, recLinesGlobal.length) * lineHeightS : 0;
    const conditionRowHeightS = data.systemCondition ? lineHeightS + 2 : 0;
    const summaryBoxHeight = headerHeightS + paddingS + conditionRowHeightS + defectRowHeightS + recRowHeightS + 6;

    if (yPos > pageHeight - summaryBoxHeight - 10) {
      doc.addPage();
      yPos = addCompactHeader(doc, pageWidth, margin, logoImg);
    }

    doc.setDrawColor(...COLORS.borderGrey);
    doc.setLineWidth(0.5);
    doc.rect(margin, yPos, contentWidth, summaryBoxHeight);

    // Header
    doc.setFillColor(...COLORS.charcoal);
    doc.rect(margin, yPos, contentWidth, headerHeightS, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("OVERALL SUMMARY", margin + 3, yPos + 5);

    doc.setFontSize(8);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");

    let textYS = yPos + headerHeightS + 5;

    // System Condition with badge
    if (data.systemCondition) {
      const condLabelS = data.systemCondition === "satisfactory" 
        ? "SATISFACTORY" 
        : data.systemCondition === "requires_attention" 
        ? "REQUIRES ATTENTION" 
        : "UNSATISFACTORY";
      const condColorS = data.systemCondition === "satisfactory" 
        ? COLORS.yes 
        : data.systemCondition === "requires_attention" 
        ? [255, 165, 0] as [number, number, number]
        : COLORS.no;
      
      doc.setFont("helvetica", "bold");
      doc.text("System Condition:", margin + 3, textYS);
      doc.setTextColor(...condColorS);
      doc.text(condLabelS, margin + 38, textYS);
      doc.setTextColor(...COLORS.charcoal);
      textYS += lineHeightS + 3;
    }

    if (data.defectsFound) {
      doc.setFont("helvetica", "bold");
      doc.text("Defects Found:", margin + 3, textYS);
      doc.setFont("helvetica", "normal");
      doc.text(defectLinesGlobal, margin + 35, textYS);
      textYS += defectRowHeightS + 2;
    }

    if (data.recommendations) {
      doc.setFont("helvetica", "bold");
      doc.text("Recommendations:", margin + 3, textYS);
      doc.setFont("helvetica", "normal");
      doc.text(recLinesGlobal, margin + 40, textYS);
      textYS += recRowHeightS + 2;
    }

    yPos += summaryBoxHeight + 5;
  }

  // === Work Carried Out / Notes ===
  if (data.workCarriedOut || data.partsUsed || data.notes) {
    // Calculate dynamic height
    const workLinesCalc = data.workCarriedOut ? doc.splitTextToSize(data.workCarriedOut, contentWidth - 6) : [];
    const partsLinesCalc = data.partsUsed ? doc.splitTextToSize(data.partsUsed, contentWidth - 6) : [];
    const notesLinesCalc = data.notes ? doc.splitTextToSize(data.notes, contentWidth - 6) : [];
    
    const lineH = 4;
    const headerH = 6;
    const workRowH = data.workCarriedOut ? Math.max(1, Math.min(workLinesCalc.length, 4)) * lineH : 0;
    const partsRowH = data.partsUsed ? Math.max(1, Math.min(partsLinesCalc.length, 2)) * lineH : 0;
    const notesRowH = data.notes ? Math.max(1, Math.min(notesLinesCalc.length, 3)) * lineH : 0;
    const notesBoxHeight = headerH + 8 + workRowH + partsRowH + notesRowH;

    if (yPos > pageHeight - notesBoxHeight - 10) {
      doc.addPage();
      yPos = addCompactHeader(doc, pageWidth, margin, logoImg);
    }

    doc.setDrawColor(...COLORS.borderGrey);
    doc.rect(margin, yPos, contentWidth, notesBoxHeight);

    doc.setFillColor(...COLORS.charcoal);
    doc.rect(margin, yPos, contentWidth, headerH, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Work Summary & Notes", margin + 3, yPos + 4);

    doc.setFontSize(8);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");

    let textYN = yPos + headerH + 5;
    if (data.workCarriedOut) {
      doc.setFont("helvetica", "bold");
      doc.text("Work Carried Out:", margin + 3, textYN);
      doc.setFont("helvetica", "normal");
      const workLines = workLinesCalc.slice(0, 4);
      doc.text(workLines, margin + 40, textYN);
      textYN += workRowH + 2;
    }
    if (data.partsUsed) {
      doc.setFont("helvetica", "bold");
      doc.text("Parts Used:", margin + 3, textYN);
      doc.setFont("helvetica", "normal");
      const partsLines = partsLinesCalc.slice(0, 2);
      doc.text(partsLines, margin + 28, textYN);
      textYN += partsRowH + 2;
    }
    if (data.notes) {
      doc.setFont("helvetica", "bold");
      doc.text("Notes:", margin + 3, textYN);
      doc.setFont("helvetica", "normal");
      const noteLines = notesLinesCalc.slice(0, 3);
      doc.text(noteLines, margin + 18, textYN);
    }

    yPos += notesBoxHeight + 5;
  }

  // === Signatures Section ===
  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = addCompactHeader(doc, pageWidth, margin, logoImg);
  }

  const sigWidth = (contentWidth - 6) / 2;
  const sigBoxHeight = 45;
  const sigAreaHeight = 25;

  // Engineer Signature
  doc.setDrawColor(...COLORS.borderGrey);
  doc.rect(margin, yPos, sigWidth, sigBoxHeight);
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, sigWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Engineer Signature", margin + 3, yPos + 4);

  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(data.engineerName || "-", margin + 3, yPos + 11);

  const engSigY = yPos + 14;
  doc.setFillColor(...COLORS.white);
  doc.rect(margin + 2, engSigY, sigWidth - 4, sigAreaHeight, "F");
  doc.setDrawColor(...COLORS.borderGrey);
  doc.line(margin + 4, engSigY + sigAreaHeight - 2, margin + sigWidth - 4, engSigY + sigAreaHeight - 2);

  if (data.engineerSignature) {
    try {
      doc.addImage(data.engineerSignature, "PNG", margin + 4, engSigY + 1, sigWidth - 8, sigAreaHeight - 4);
    } catch {
      // Signature failed
    }
  }

  const engSignDateStr = data.engineerSignDate
    ? format(new Date(data.engineerSignDate), "dd/MM/yyyy")
    : format(new Date(visitDate), "dd/MM/yyyy");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text(`Signed: ${engSignDateStr}${data.engineerSignTime ? ` ${data.engineerSignTime}` : ""}`, margin + 3, yPos + sigBoxHeight + 3);

  // Customer Signature
  const custX = margin + sigWidth + 6;
  doc.rect(custX, yPos, sigWidth, sigBoxHeight);
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(custX, yPos, sigWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Customer Signature", custX + 3, yPos + 4);

  if (data.customerNotPresent) {
    doc.setFillColor(...COLORS.lightGrey);
    doc.rect(custX + 2, yPos + 10, sigWidth - 4, sigAreaHeight, "F");
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text("Customer not present", custX + 3, yPos + 22);
    doc.setFontSize(7);
    doc.text("Signed by engineer only", custX + 3, yPos + sigBoxHeight + 3);
  } else {
    doc.setTextColor(...COLORS.charcoal);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(data.clientName || "-", custX + 3, yPos + 11);

    const custSigY = yPos + 14;
    doc.setFillColor(...COLORS.white);
    doc.rect(custX + 2, custSigY, sigWidth - 4, sigAreaHeight, "F");
    doc.setDrawColor(...COLORS.borderGrey);
    doc.line(custX + 4, custSigY + sigAreaHeight - 2, custX + sigWidth - 4, custSigY + sigAreaHeight - 2);

    if (data.customerSignature) {
      try {
        doc.addImage(data.customerSignature, "PNG", custX + 4, custSigY + 1, sigWidth - 8, sigAreaHeight - 4);
      } catch {
        // Signature failed
      }
    }

    const custSignDateStr = data.customerSignDate
      ? format(new Date(data.customerSignDate), "dd/MM/yyyy")
      : format(new Date(visitDate), "dd/MM/yyyy");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text(`Signed: ${custSignDateStr}${data.customerSignTime ? ` ${data.customerSignTime}` : ""}`, custX + 3, yPos + sigBoxHeight + 3);
  }

  addCompactFooter(doc, pageWidth, margin);

  if (returnBase64) {
    return doc.output("datauristring").split(",")[1];
  }

  const fileName = `BHO_ASD_Report_${site.name.replace(/\s+/g, "_")}_${format(new Date(visitDate), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

// ===================== DISABLED REFUGE REPORT PDF =====================
import {
  DisabledRefugeChecklist,
  DISABLED_REFUGE_CHECKLIST_LABELS,
  DISABLED_REFUGE_SECTION_LABELS,
} from "@/services/disabledRefugeChecklistService";

interface DisabledRefugeUnitData {
  assetId: string;
  assetName: string;
  manufacturer?: string;
  model?: string;
  location?: string;
  checklist: DisabledRefugeChecklist;
  defects?: string;
  recommendations?: string;
  systemCondition?: string;
}

interface DisabledRefugeReportData {
  reportNumber: string;
  reportDate: string;
  engineerName: string;
  clientName: string;
  units: DisabledRefugeUnitData[];
  systemCondition?: string;
  defectsFound?: string;
  recommendations?: string;
  workCarriedOut?: string;
  partsUsed?: string;
  notes?: string;
  engineerSignature?: string;
  engineerSignDate?: string;
  engineerSignTime?: string;
  customerNotPresent?: boolean;
  customerSignature?: string;
  customerSignDate?: string;
  customerSignTime?: string;
}

export async function generateDisabledRefugeReportPDF(
  data: DisabledRefugeReportData,
  site: SiteInfo,
  visitDate: string,
  visitType: string,
  returnBase64?: boolean
): Promise<string | void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - 2 * margin;

  // Load logo
  let logoImg: HTMLImageElement | null = null;
  try {
    logoImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = "/bho-fire-logo.png";
    });
  } catch {
    // Logo load failed
  }

  let yPos = addCompactHeader(doc, pageWidth, margin, logoImg);

  // Report title
  doc.setFillColor(...COLORS.red);
  doc.rect(margin, yPos, contentWidth, 10, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("DISABLED REFUGE / EVC SERVICE REPORT", margin + 3, yPos + 7);

  // Report number badge
  if (data.reportNumber) {
    doc.setFillColor(...COLORS.charcoal);
    const numWidth = doc.getTextWidth(data.reportNumber) + 8;
    doc.rect(pageWidth - margin - numWidth, yPos + 1, numWidth, 8, "F");
    doc.setFontSize(9);
    doc.text(data.reportNumber, pageWidth - margin - 4, yPos + 6.5, { align: "right" });
  }

  yPos += 14;

  // Site & Service Info Grid
  const boxHeight = 32;
  const leftWidth = contentWidth * 0.55;
  const rightWidth = contentWidth * 0.45 - 4;
  const leftX = margin;
  const rightX = margin + leftWidth + 4;

  // Site Info Box
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.rect(leftX, yPos, leftWidth, boxHeight);
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(leftX, yPos, leftWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Site Information", leftX + 3, yPos + 4);

  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(9);
  let rowY = yPos + 12;
  const siteRows = [
    ["Site:", site.name],
    ["Address:", [site.address, site.city, site.postcode].filter(Boolean).join(", ") || "-"],
    ["Contact:", site.contact_name || "-"],
  ];
  siteRows.forEach(([label, val]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text(label as string, leftX + 3, rowY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.charcoal);
    const valText = doc.splitTextToSize(val as string, leftWidth - 30);
    doc.text(valText[0] || "-", leftX + 22, rowY);
    rowY += 6.5;
  });

  // Service Info Box
  doc.rect(rightX, yPos, rightWidth, boxHeight);
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(rightX, yPos, rightWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Service Details", rightX + 3, yPos + 4);

  const serviceRows = [
    ["Date:", format(new Date(visitDate), "dd/MM/yyyy")],
    ["Type:", visitType || "EVC Service"],
    ["Engineer:", data.engineerName || "-"],
    ["Units:", `${data.units.length}`],
  ];
  doc.setFontSize(9);
  rowY = yPos + 12;
  serviceRows.forEach(([label, val]) => {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFont("helvetica", "bold");
    doc.text(label, rightX + 3, rowY);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    doc.text(val, rightX + 24, rowY);
    rowY += 6.5;
  });

  yPos += boxHeight + 5;

  // === Loop through each unit ===
  data.units.forEach((unit, unitIndex) => {
    // Check if we need a new page
    if (yPos > pageHeight - 80) {
      doc.addPage();
      yPos = addCompactHeader(doc, pageWidth, margin, logoImg);
    }

    // Unit header
    doc.setFillColor(...COLORS.red);
    doc.rect(margin, yPos, contentWidth, 8, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`UNIT ${unitIndex + 1}: ${unit.assetName}`, margin + 3, yPos + 5.5);

    // Unit info on same line if space
    if (unit.manufacturer || unit.location) {
      const infoText = [unit.manufacturer, unit.model, unit.location].filter(Boolean).join(" | ");
      doc.setFontSize(8);
      doc.text(infoText, pageWidth - margin - 3, yPos + 5.5, { align: "right" });
    }

    yPos += 11;

    // Checklist sections as compact table
    const checklist = unit.checklist;
    const checklistRows: (string | { content: string; styles?: Record<string, unknown> })[][] = [];

    // All checkable sections
    const sections = [
      "documentation_compliance",
      "control_equipment", 
      "power_supplies",
      "refuge_outstations",
      "communication_performance",
      "cabling_installation",
      "signage_identification",
      "testing_maintenance",
      "staff_awareness",
      "final_status",
    ] as const;

    sections.forEach((sectionKey) => {
      const labels = DISABLED_REFUGE_CHECKLIST_LABELS[sectionKey];
      const sectionData = checklist[sectionKey] as Record<string, boolean | null>;
      
      // Add section header row
      checklistRows.push([
        { content: DISABLED_REFUGE_SECTION_LABELS[sectionKey], styles: { fontStyle: "bold", fillColor: COLORS.lightGrey } },
        { content: "", styles: { fillColor: COLORS.lightGrey } },
      ]);
      
      Object.entries(labels).forEach(([key, label]) => {
        const val = sectionData[key];
        checklistRows.push([
          label,
          val === true ? "YES" : val === false ? "NO" : "N/A",
        ]);
      });
    });

    autoTable(doc, {
      startY: yPos,
      head: [["Checklist Item", "Status"]],
      body: checklistRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: COLORS.charcoal, textColor: COLORS.white, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.8 },
        1: { cellWidth: contentWidth * 0.2, halign: "center" },
      },
      didParseCell: (tableData) => {
        if (tableData.section === "body" && tableData.column.index === 1) {
          const val = String(tableData.cell.raw);
          if (val === "YES") {
            tableData.cell.styles.textColor = COLORS.yes;
            tableData.cell.styles.fontStyle = "bold";
          } else if (val === "NO") {
            tableData.cell.styles.textColor = COLORS.no;
            tableData.cell.styles.fontStyle = "bold";
          } else if (val === "N/A") {
            tableData.cell.styles.textColor = COLORS.mediumGrey;
          }
        }
      },
    });

    yPos = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || yPos + 50;
    yPos += 3;

    // Defects & Recommendations for this unit
    if (unit.defects || unit.recommendations || unit.systemCondition) {
      const defectLines = unit.defects 
        ? doc.splitTextToSize(unit.defects, contentWidth - 30) 
        : [];
      const recLines = unit.recommendations 
        ? doc.splitTextToSize(unit.recommendations, contentWidth - 45) 
        : [];
      
      const lineHeight = 5;
      const headerHeight = 6;
      const padding = 8;
      const defectRowHeight = unit.defects ? Math.max(1, defectLines.length) * lineHeight : 0;
      const recRowHeight = unit.recommendations ? Math.max(1, recLines.length) * lineHeight : 0;
      const conditionRowHeight = unit.systemCondition ? lineHeight : 0;
      const defectBoxHeight = headerHeight + padding + defectRowHeight + recRowHeight + conditionRowHeight + 4;

      if (yPos > pageHeight - defectBoxHeight - 10) {
        doc.addPage();
        yPos = addCompactHeader(doc, pageWidth, margin, logoImg);
      }

      doc.setDrawColor(...COLORS.borderGrey);
      doc.rect(margin, yPos, contentWidth, defectBoxHeight);

      doc.setFillColor(...COLORS.charcoal);
      doc.rect(margin, yPos, contentWidth, headerHeight, "F");
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Defects & Recommendations", margin + 3, yPos + 4);

      // System condition badge in header
      if (unit.systemCondition) {
        const condLabel = unit.systemCondition === "satisfactory" 
          ? "Satisfactory" 
          : unit.systemCondition === "requires_attention" 
          ? "Requires Attention" 
          : "Unsatisfactory";
        const condColor = unit.systemCondition === "satisfactory" 
          ? COLORS.yes 
          : unit.systemCondition === "requires_attention" 
          ? [255, 165, 0] as [number, number, number]
          : COLORS.no;
        doc.setTextColor(...condColor);
        doc.setFont("helvetica", "bold");
        doc.text(condLabel, pageWidth - margin - 3, yPos + 4, { align: "right" });
      }

      doc.setFontSize(8);
      doc.setTextColor(...COLORS.charcoal);
      doc.setFont("helvetica", "normal");

      let textY = yPos + headerHeight + 5;
      
      if (unit.defects) {
        doc.setFont("helvetica", "bold");
        doc.text("Defects:", margin + 3, textY);
        doc.setFont("helvetica", "normal");
        doc.text(defectLines, margin + 22, textY);
        textY += defectRowHeight + 2;
      }
      
      if (unit.recommendations) {
        doc.setFont("helvetica", "bold");
        doc.text("Recommendations:", margin + 3, textY);
        doc.setFont("helvetica", "normal");
        doc.text(recLines, margin + 35, textY);
        textY += recRowHeight + 2;
      }

      yPos += defectBoxHeight + 5;
    }

    yPos += 5;
  });

  // === OVERALL SUMMARY ===
  if (data.systemCondition || data.defectsFound || data.recommendations) {
    const defectLinesGlobal = data.defectsFound 
      ? doc.splitTextToSize(data.defectsFound, contentWidth - 30) 
      : [];
    const recLinesGlobal = data.recommendations 
      ? doc.splitTextToSize(data.recommendations, contentWidth - 45) 
      : [];
    
    const lineHeightS = 5;
    const headerHeightS = 7;
    const paddingS = 6;
    const defectRowHeightS = data.defectsFound ? Math.max(1, defectLinesGlobal.length) * lineHeightS : 0;
    const recRowHeightS = data.recommendations ? Math.max(1, recLinesGlobal.length) * lineHeightS : 0;
    const conditionRowHeightS = data.systemCondition ? lineHeightS + 2 : 0;
    const summaryBoxHeight = headerHeightS + paddingS + conditionRowHeightS + defectRowHeightS + recRowHeightS + 6;

    if (yPos > pageHeight - summaryBoxHeight - 10) {
      doc.addPage();
      yPos = addCompactHeader(doc, pageWidth, margin, logoImg);
    }

    doc.setDrawColor(...COLORS.borderGrey);
    doc.setLineWidth(0.5);
    doc.rect(margin, yPos, contentWidth, summaryBoxHeight);

    doc.setFillColor(...COLORS.charcoal);
    doc.rect(margin, yPos, contentWidth, headerHeightS, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("OVERALL SUMMARY", margin + 3, yPos + 5);

    doc.setFontSize(8);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");

    let textYS = yPos + headerHeightS + 5;

    if (data.systemCondition) {
      const condLabelS = data.systemCondition === "satisfactory" 
        ? "SATISFACTORY" 
        : data.systemCondition === "requires_attention" 
        ? "REQUIRES ATTENTION" 
        : "UNSATISFACTORY";
      const condColorS = data.systemCondition === "satisfactory" 
        ? COLORS.yes 
        : data.systemCondition === "requires_attention" 
        ? [255, 165, 0] as [number, number, number]
        : COLORS.no;
      
      doc.setFont("helvetica", "bold");
      doc.text("System Condition:", margin + 3, textYS);
      doc.setTextColor(...condColorS);
      doc.text(condLabelS, margin + 38, textYS);
      doc.setTextColor(...COLORS.charcoal);
      textYS += lineHeightS + 3;
    }

    if (data.defectsFound) {
      doc.setFont("helvetica", "bold");
      doc.text("Defects Found:", margin + 3, textYS);
      doc.setFont("helvetica", "normal");
      doc.text(defectLinesGlobal, margin + 35, textYS);
      textYS += defectRowHeightS + 2;
    }

    if (data.recommendations) {
      doc.setFont("helvetica", "bold");
      doc.text("Recommendations:", margin + 3, textYS);
      doc.setFont("helvetica", "normal");
      doc.text(recLinesGlobal, margin + 40, textYS);
    }

    yPos += summaryBoxHeight + 5;
  }

  // === Work Carried Out / Notes ===
  if (data.workCarriedOut || data.partsUsed || data.notes) {
    const workLinesCalc = data.workCarriedOut ? doc.splitTextToSize(data.workCarriedOut, contentWidth - 6) : [];
    const partsLinesCalc = data.partsUsed ? doc.splitTextToSize(data.partsUsed, contentWidth - 6) : [];
    const notesLinesCalc = data.notes ? doc.splitTextToSize(data.notes, contentWidth - 6) : [];
    
    const lineH = 4;
    const headerH = 6;
    const workRowH = data.workCarriedOut ? Math.max(1, Math.min(workLinesCalc.length, 4)) * lineH : 0;
    const partsRowH = data.partsUsed ? Math.max(1, Math.min(partsLinesCalc.length, 2)) * lineH : 0;
    const notesRowH = data.notes ? Math.max(1, Math.min(notesLinesCalc.length, 3)) * lineH : 0;
    const notesBoxHeight = headerH + 8 + workRowH + partsRowH + notesRowH;

    if (yPos > pageHeight - notesBoxHeight - 10) {
      doc.addPage();
      yPos = addCompactHeader(doc, pageWidth, margin, logoImg);
    }

    doc.setDrawColor(...COLORS.borderGrey);
    doc.rect(margin, yPos, contentWidth, notesBoxHeight);

    doc.setFillColor(...COLORS.charcoal);
    doc.rect(margin, yPos, contentWidth, headerH, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Work Summary & Notes", margin + 3, yPos + 4);

    doc.setFontSize(8);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");

    let textYN = yPos + headerH + 5;
    if (data.workCarriedOut) {
      doc.setFont("helvetica", "bold");
      doc.text("Work Carried Out:", margin + 3, textYN);
      doc.setFont("helvetica", "normal");
      const workLines = workLinesCalc.slice(0, 4);
      doc.text(workLines, margin + 40, textYN);
      textYN += workRowH + 2;
    }
    if (data.partsUsed) {
      doc.setFont("helvetica", "bold");
      doc.text("Parts Used:", margin + 3, textYN);
      doc.setFont("helvetica", "normal");
      const partsLines = partsLinesCalc.slice(0, 2);
      doc.text(partsLines, margin + 28, textYN);
      textYN += partsRowH + 2;
    }
    if (data.notes) {
      doc.setFont("helvetica", "bold");
      doc.text("Notes:", margin + 3, textYN);
      doc.setFont("helvetica", "normal");
      const noteLines = notesLinesCalc.slice(0, 3);
      doc.text(noteLines, margin + 18, textYN);
    }

    yPos += notesBoxHeight + 5;
  }

  // === Signatures Section ===
  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = addCompactHeader(doc, pageWidth, margin, logoImg);
  }

  const sigWidth = (contentWidth - 6) / 2;
  const sigBoxHeight = 45;
  const sigAreaHeight = 25;

  // Engineer Signature
  doc.setDrawColor(...COLORS.borderGrey);
  doc.rect(margin, yPos, sigWidth, sigBoxHeight);
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, sigWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Engineer Signature", margin + 3, yPos + 4);

  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(data.engineerName || "-", margin + 3, yPos + 11);

  const engSigY = yPos + 14;
  doc.setFillColor(...COLORS.white);
  doc.rect(margin + 2, engSigY, sigWidth - 4, sigAreaHeight, "F");
  doc.setDrawColor(...COLORS.borderGrey);
  doc.line(margin + 4, engSigY + sigAreaHeight - 2, margin + sigWidth - 4, engSigY + sigAreaHeight - 2);

  if (data.engineerSignature) {
    try {
      doc.addImage(data.engineerSignature, "PNG", margin + 4, engSigY + 1, sigWidth - 8, sigAreaHeight - 4);
    } catch {
      // Signature failed
    }
  }

  const engSignDateStr = data.engineerSignDate
    ? format(new Date(data.engineerSignDate), "dd/MM/yyyy")
    : format(new Date(visitDate), "dd/MM/yyyy");
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text(`Signed: ${engSignDateStr}${data.engineerSignTime ? ` ${data.engineerSignTime}` : ""}`, margin + 3, yPos + sigBoxHeight + 3);

  // Customer Signature
  const custX = margin + sigWidth + 6;
  doc.rect(custX, yPos, sigWidth, sigBoxHeight);
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(custX, yPos, sigWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Customer Signature", custX + 3, yPos + 4);

  if (data.customerNotPresent) {
    doc.setFillColor(...COLORS.lightGrey);
    doc.rect(custX + 2, yPos + 10, sigWidth - 4, sigAreaHeight, "F");
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text("Customer not present", custX + 3, yPos + 22);
    doc.setFontSize(7);
    doc.text("Signed by engineer only", custX + 3, yPos + sigBoxHeight + 3);
  } else {
    doc.setTextColor(...COLORS.charcoal);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(data.clientName || "-", custX + 3, yPos + 11);

    const custSigY = yPos + 14;
    doc.setFillColor(...COLORS.white);
    doc.rect(custX + 2, custSigY, sigWidth - 4, sigAreaHeight, "F");
    doc.setDrawColor(...COLORS.borderGrey);
    doc.line(custX + 4, custSigY + sigAreaHeight - 2, custX + sigWidth - 4, custSigY + sigAreaHeight - 2);

    if (data.customerSignature) {
      try {
        doc.addImage(data.customerSignature, "PNG", custX + 4, custSigY + 1, sigWidth - 8, sigAreaHeight - 4);
      } catch {
        // Signature failed
      }
    }

    const custSignDateStr = data.customerSignDate
      ? format(new Date(data.customerSignDate), "dd/MM/yyyy")
      : format(new Date(visitDate), "dd/MM/yyyy");
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text(`Signed: ${custSignDateStr}${data.customerSignTime ? ` ${data.customerSignTime}` : ""}`, custX + 3, yPos + sigBoxHeight + 3);
  }

  addCompactFooter(doc, pageWidth, margin);

  if (returnBase64) {
    return doc.output("datauristring").split(",")[1];
  }

  const fileName = `BHO_DisabledRefuge_Report_${site.name.replace(/\s+/g, "_")}_${format(new Date(visitDate), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

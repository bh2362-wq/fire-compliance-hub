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
  pass: [34, 139, 34] as [number, number, number],
  fail: [200, 30, 30] as [number, number, number],
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
  const boxSize = 4;
  let label = "";
  let color: [number, number, number];

  if (value === true) {
    color = COLORS.pass;
    label = "PASS";
  } else if (value === false) {
    color = COLORS.fail;
    label = "FAIL";
  } else {
    color = COLORS.na;
    label = "N/A";
  }

  doc.setFillColor(...color);
  doc.rect(x, y, boxSize, boxSize, "F");

  if (showLabel) {
    doc.setTextColor(...color);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(label, x + boxSize + 2, y + 3.2);
  }

  return x + boxSize + (showLabel ? 18 : 6);
}

// Compact branded header for Service Reports
function addCompactHeader(doc: jsPDF, pageWidth: number, margin: number, logoImg: HTMLImageElement | null) {
  doc.setFillColor(...COLORS.red);
  doc.rect(0, 0, pageWidth, 2, "F");

  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", margin, 4, 18, 16);
    } catch {
      doc.setTextColor(...COLORS.charcoal);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("BHO FIRE", margin, 14);
    }
  }

  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const rightX = pageWidth - margin;
  doc.text(`T: ${COMPANY.phone}  E: ${COMPANY.email}`, rightX, 8, { align: "right" });
  doc.text(COMPANY.address, rightX, 12, { align: "right" });
  doc.text(`${COMPANY.website}`, rightX, 16, { align: "right" });

  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.line(margin, 22, pageWidth - margin, 22);

  return 26;
}

// Compact footer
function addCompactFooter(doc: jsPDF, pageWidth: number, margin: number) {
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    doc.setDrawColor(...COLORS.borderGrey);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);

    doc.setFontSize(6);
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text(`${COMPANY.country} | ${COMPANY.registration}`, margin, pageHeight - 6);
    doc.text(`Page ${i}/${pageCount}`, pageWidth / 2, pageHeight - 6, { align: "center" });
    doc.text(`Generated: ${format(new Date(), "dd/MM/yy HH:mm")}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }
}

// ===================== SERVICE REPORT PDF (Single Page) =====================
export function generateServiceReportPDF(
  report: ServiceReport,
  site: SiteInfo,
  visit: VisitInfo
): void {
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
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Fire Alarm Service Report", margin, yPos + 4);

  doc.setTextColor(...COLORS.red);
  doc.setFontSize(8);
  doc.text("BS 5839-1:2025", margin, yPos + 9);

  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (report.report_number) {
    doc.text(`Ref: ${report.report_number}`, pageWidth - margin, yPos + 3, { align: "right" });
  }
  doc.text(format(new Date(report.report_date), "dd MMM yyyy"), pageWidth - margin, yPos + 8, { align: "right" });

  yPos += 14;

  // === Site & Service Details (Side by Side) ===
  const colWidth = (contentWidth - 6) / 2;
  const boxHeight = 32;

  // Left: Site Info
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.rect(margin, yPos, colWidth, boxHeight);

  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, colWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("SITE", margin + 2, yPos + 4.2);

  const siteAddr = [site.address, site.city, site.postcode].filter(Boolean).join(", ");
  const siteRows = [
    ["Site:", site.name],
    ["Address:", siteAddr || "-"],
    ["Contact:", site.contact_name || "-"],
    ["Phone:", site.contact_phone || "-"],
  ];

  doc.setFontSize(6.5);
  let rowY = yPos + 10;
  siteRows.forEach(([label, val]) => {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFont("helvetica", "bold");
    doc.text(label, margin + 2, rowY);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    const maxW = colWidth - 22;
    const txt = doc.splitTextToSize(val, maxW)[0] || "-";
    doc.text(txt, margin + 18, rowY);
    rowY += 5.5;
  });

  // Right: Service Info
  const rightX = margin + colWidth + 6;
  doc.rect(rightX, yPos, colWidth, boxHeight);

  doc.setFillColor(...COLORS.charcoal);
  doc.rect(rightX, yPos, colWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("SERVICE", rightX + 2, yPos + 4.2);

  const visitType = visit.visit_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const serviceRows = [
    ["Type:", visitType],
    ["Date:", format(new Date(visit.visit_date), "dd MMM yyyy")],
    ["Engineer:", report.engineer_name || "-"],
    ["Status:", report.status === "completed" ? "Completed" : "Draft"],
  ];

  rowY = yPos + 10;
  serviceRows.forEach(([label, val]) => {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFont("helvetica", "bold");
    doc.text(label, rightX + 2, rowY);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    doc.text(val, rightX + 20, rowY);
    rowY += 5.5;
  });

  yPos += boxHeight + 4;

  // === System Info Row ===
  doc.rect(margin, yPos, contentWidth, 18);
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, contentWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("SYSTEM", margin + 2, yPos + 4.2);

  const sysTypeLabel = SYSTEM_TYPES.find((t) => t.value === report.system_type)?.label || report.system_type || "-";
  const sysInfo = [
    [`Panel: ${report.panel_manufacturer || "-"} ${report.panel_model || ""}`.trim()],
    [`Location: ${report.panel_location || "-"}`],
    [`Category: ${sysTypeLabel}`],
    [`Zones: ${report.zones_count || "-"}`],
    [`Devices: ${report.devices_count || "-"}`],
  ];

  doc.setFontSize(6.5);
  doc.setTextColor(...COLORS.charcoal);
  doc.setFont("helvetica", "normal");
  const sysY = yPos + 11;
  const sysColW = contentWidth / 3;
  sysInfo.slice(0, 3).forEach((txt, i) => {
    doc.text(txt[0], margin + 2 + i * sysColW, sysY);
  });
  sysInfo.slice(3).forEach((txt, i) => {
    doc.text(txt[0], margin + 2 + i * sysColW, sysY + 5);
  });

  yPos += 22;

  // === INSPECTION & SERVICING CHECKLIST (Multi-page, grouped by section) ===
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Fire Detection & Fire Alarm Inspection & Servicing Checklist", margin, yPos + 3);
  
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.red);
  doc.text("As recommended in BAFE SP203-1 Clause 9.8 & BS5839-1:2025 Clause 45", margin, yPos + 8);

  // Legend
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.charcoal);
  let legendX = pageWidth - margin - 60;
  legendX = drawStatusBox(doc, legendX, yPos + 2, true);
  legendX = drawStatusBox(doc, legendX, yPos + 2, false);
  drawStatusBox(doc, legendX, yPos + 2, null);

  yPos += 12;

  // Collect all checklist items grouped by section
  const checklist = report.checklist;
  const sections = Object.keys(SECTION_LABELS) as Array<keyof BS5839Checklist>;
  
  // Build data for each section
  const sectionData: { section: string; items: { label: string; value: boolean | null | string | number }[] }[] = [];
  
  sections.forEach((section) => {
    const data = checklist[section] as Record<string, boolean | null | string | number>;
    const labels = CHECKLIST_LABELS[section];
    const items: { label: string; value: boolean | null | string | number }[] = [];
    
    Object.entries(data).forEach(([key, value]) => {
      if (labels && labels[key]) {
        items.push({
          label: labels[key],
          value,
        });
      }
    });
    
    if (items.length > 0) {
      sectionData.push({
        section: SECTION_LABELS[section],
        items,
      });
    }
  });

  // Create table with section grouping
  const tableBody: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];
  
  sectionData.forEach((section) => {
    // Section header row
    tableBody.push([
      { 
        content: section.section, 
        colSpan: 4,
        styles: { 
          fillColor: COLORS.charcoal, 
          textColor: COLORS.white, 
          fontStyle: "bold",
          fontSize: 7,
        } 
      },
    ]);
    
    // Items in this section
    section.items.forEach((item) => {
      let yesVal = "";
      let noVal = "";
      let naVal = "";
      
      if (typeof item.value === "boolean") {
        if (item.value === true) yesVal = "✓";
        else if (item.value === false) noVal = "✓";
      } else if (item.value === null) {
        naVal = "✓";
      } else if (typeof item.value === "string" || typeof item.value === "number") {
        // For text/number fields like chargeVoltage, detectorCount
        yesVal = String(item.value);
      }
      
      tableBody.push([item.label, yesVal, noVal, naVal]);
    });
  });

  autoTable(doc, {
    startY: yPos,
    head: [["Requirement", "YES", "NO", "N/A"]],
    body: tableBody,
    theme: "grid",
    styles: {
      fontSize: 6,
      cellPadding: 1.2,
      lineColor: COLORS.borderGrey,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: COLORS.charcoal,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 7,
      halign: "center",
    },
    bodyStyles: {
      textColor: COLORS.charcoal,
    },
    alternateRowStyles: {
      fillColor: COLORS.lightGrey,
    },
    columnStyles: {
      0: { cellWidth: contentWidth - 36 },
      1: { cellWidth: 12, halign: "center", fontStyle: "bold" },
      2: { cellWidth: 12, halign: "center", fontStyle: "bold" },
      3: { cellWidth: 12, halign: "center", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body") {
        // Color the check marks
        const text = data.cell.text[0];
        if (data.column.index === 1 && text === "✓") {
          data.cell.styles.textColor = COLORS.pass;
        } else if (data.column.index === 2 && text === "✓") {
          data.cell.styles.textColor = COLORS.fail;
        } else if (data.column.index === 3 && text === "✓") {
          data.cell.styles.textColor = COLORS.na;
        }
      }
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 4;

  // === Condition & Next Service Row ===
  const conditionText = report.system_condition
    ? report.system_condition.replace(/_/g, " ").toUpperCase()
    : "NOT ASSESSED";

  let conditionColor = COLORS.mediumGrey;
  if (report.system_condition === "satisfactory") conditionColor = COLORS.pass;
  else if (report.system_condition === "requires_attention") conditionColor = [200, 150, 0] as [number, number, number];
  else if (report.system_condition === "unsatisfactory") conditionColor = COLORS.fail;

  const nextService = report.next_service_due
    ? new Date(report.next_service_due)
    : addMonths(new Date(visit.visit_date), 6);

  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin, yPos, contentWidth, 12, "F");

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.charcoal);
  doc.text("Condition:", margin + 2, yPos + 7);
  doc.setTextColor(...conditionColor);
  doc.text(conditionText, margin + 22, yPos + 7);

  doc.setTextColor(...COLORS.charcoal);
  doc.text("Next Service:", margin + 80, yPos + 7);
  doc.setTextColor(...COLORS.red);
  doc.text(format(nextService, "dd MMM yyyy"), margin + 105, yPos + 7);

  yPos += 16;

  // === Notes/Defects (if any, compact) ===
  const notes = [
    { label: "Defects", text: report.defects_found },
    { label: "Recommendations", text: report.recommendations },
    { label: "Work Done", text: report.work_carried_out },
  ].filter((n) => n.text && n.text.trim());

  if (notes.length > 0) {
    notes.forEach((note) => {
      if (yPos > pageHeight - 30) return;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.red);
      doc.text(note.label + ":", margin, yPos);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.charcoal);
      const lines = doc.splitTextToSize(note.text!, contentWidth - 2);
      doc.text(lines.slice(0, 2), margin, yPos + 4);
      yPos += Math.min(lines.length, 2) * 3.5 + 6;
    });
  }

  // === Signature Row ===
  yPos = Math.max(yPos, pageHeight - 28);
  doc.setDrawColor(...COLORS.borderGrey);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 3;

  const sigWidth = (contentWidth - 10) / 2;

  doc.setFontSize(6);
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text("Engineer: " + (report.engineer_name || ""), margin, yPos + 4);
  doc.line(margin, yPos + 10, margin + sigWidth, yPos + 10);
  doc.text("Signature", margin, yPos + 14);

  doc.text("Client: " + (report.client_name || ""), margin + sigWidth + 10, yPos + 4);
  doc.line(margin + sigWidth + 10, yPos + 10, pageWidth - margin, yPos + 10);
  doc.text("Signature", margin + sigWidth + 10, yPos + 14);

  addCompactFooter(doc, pageWidth, margin);

  const fileName = `BHO_Service_Report_${site.name.replace(/\s+/g, "_")}_${format(new Date(report.report_date), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

// ===================== WORK REPORT / JOB SHEET PDF =====================
// Exact replica of the BHO Fire Job Sheet template
export interface WorkReportData {
  certificateNo: string;
  jobNumber: string;
  jobType: string;
  attendanceDay: string;
  systemStatusArrival: string;
  systemStatusDeparture: string;
  workCompleted: boolean;
  returnRequired: boolean;
  surveyRequired: boolean;
  quotationRequired: boolean;
  ramsCompleted: boolean;
  logBookEntry: boolean;
  worksReport: string;
  furtherAction: string;
  numEngineers: number | "";
  startTime: string;
  finishTime: string;
  travelTime: string;
  duration: string;
  materials: { name: string; qty: string; cost: string }[];
  engineerName: string;
  customerName: string;
  customerPosition?: string;
  // New fields matching the job sheet template
  scopeOfWorks?: string;
  commissioningTesting?: string;
  finalRemarks?: string;
  arrivalDateTime?: string;
  departureDateTime?: string;
}

interface WorkReportSiteInfo {
  name: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  contact_name?: string | null;
}

interface CustomerInfo {
  name: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
}

export function generateWorkReportPDF(
  data: WorkReportData,
  site: WorkReportSiteInfo,
  visitDate: string,
  customer?: CustomerInfo
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;

  // Load logo
  const logoImg = new Image();
  logoImg.src = "/bho-fire-logo.png";

  // === OUTER BORDER ===
  doc.setDrawColor(...COLORS.black);
  doc.setLineWidth(0.5);
  doc.rect(margin - 3, margin - 3, contentWidth + 6, pageHeight - 2 * margin + 6);

  let yPos = margin;

  // === HEADER: Job Sheet title + Job Number + Logo ===
  doc.setDrawColor(...COLORS.black);
  doc.setLineWidth(0.3);
  doc.rect(margin, yPos, contentWidth, 18);

  // "Job Sheet" title centered
  doc.setTextColor(...COLORS.black);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Job Sheet", pageWidth / 2, yPos + 7, { align: "center" });

  // Job Number row
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Job Number", pageWidth / 2 - 20, yPos + 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(data.jobNumber || "-", pageWidth / 2 - 5, yPos + 14);

  // Logo on right
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", pageWidth - margin - 25, yPos + 2, 22, 14);
    } catch {
      doc.setTextColor(...COLORS.red);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("BHO", pageWidth - margin - 22, yPos + 8);
      doc.text("FIRE", pageWidth - margin - 22, yPos + 14);
    }
  }

  yPos += 20;

  // === CUSTOMER & SITE DETAILS TABLE ===
  const labelWidth = 22;
  const valueWidth = contentWidth - labelWidth;
  const rowHeight = 7;

  // Helper to draw a label-value row
  const drawRow = (y: number, label: string, value: string, isBold: boolean = false) => {
    doc.setDrawColor(...COLORS.black);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, labelWidth, rowHeight);
    doc.rect(margin + labelWidth, y, valueWidth, rowHeight);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.black);
    doc.text(label, margin + 2, y + 5);

    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.text(value || "-", margin + labelWidth + 2, y + 5);
  };

  // Customer section
  const customerName = customer?.name || site.contact_name || "-";
  const customerAddr = customer ? [customer.address, customer.city].filter(Boolean).join(", ") : "-";
  const customerPostcode = customer?.postcode || "-";

  drawRow(yPos, "Customer", customerName);
  yPos += rowHeight;
  drawRow(yPos, "Address", customerAddr);
  yPos += rowHeight;
  drawRow(yPos, "Postcode", customerPostcode);
  yPos += rowHeight;

  // Site section
  drawRow(yPos, "Site", site.name);
  yPos += rowHeight;
  const siteAddr = [site.address, site.city].filter(Boolean).join(", ");
  drawRow(yPos, "Address", siteAddr);
  yPos += rowHeight;
  drawRow(yPos, "Postcode", site.postcode || "-");
  yPos += rowHeight + 2;

  // === SCOPE OF WORKS ===
  const textBoxHeight = 38;

  doc.setDrawColor(...COLORS.black);
  doc.setLineWidth(0.3);
  doc.rect(margin, yPos, contentWidth, textBoxHeight);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.black);
  doc.text("Scope of Works", margin + 2, yPos + 6);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const scopeText = data.scopeOfWorks || data.worksReport || "-";
  const scopeLines = doc.splitTextToSize(scopeText, contentWidth - 6);
  doc.text(scopeLines.slice(0, 4), margin + 2, yPos + 12);

  yPos += textBoxHeight + 2;

  // === COMMISSIONING & TESTING ===
  const testBoxHeight = 26;
  doc.rect(margin, yPos, contentWidth, testBoxHeight);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Commissioning & Testing", margin + 2, yPos + 6);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const testText = data.commissioningTesting || data.furtherAction || "-";
  const testLines = doc.splitTextToSize(testText, contentWidth - 6);
  doc.text(testLines.slice(0, 3), margin + 2, yPos + 12);

  yPos += testBoxHeight + 2;

  // === FINAL REMARKS ===
  const remarksBoxHeight = 24;
  doc.rect(margin, yPos, contentWidth, remarksBoxHeight);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Final Remarks", margin + 2, yPos + 6);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const remarksText = data.finalRemarks || "Works completed satisfactorily.";
  const remarksLines = doc.splitTextToSize(remarksText, contentWidth - 6);
  doc.text(remarksLines.slice(0, 2), margin + 2, yPos + 12);

  yPos += remarksBoxHeight + 2;

  // === ARRIVAL / DEPARTURE TIME ===
  const timeRowHeight = 16;
  const halfWidth = contentWidth / 2;

  doc.setDrawColor(...COLORS.black);
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin, yPos, halfWidth, timeRowHeight / 2, "FD");
  doc.rect(margin + halfWidth, yPos, halfWidth, timeRowHeight / 2, "FD");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.black);
  doc.text("Arrival Time / Date", margin + halfWidth / 2, yPos + 5, { align: "center" });
  doc.text("Departure Time /Date", margin + halfWidth + halfWidth / 2, yPos + 5, { align: "center" });

  // Time values
  doc.rect(margin, yPos + timeRowHeight / 2, halfWidth, timeRowHeight / 2);
  doc.rect(margin + halfWidth, yPos + timeRowHeight / 2, halfWidth, timeRowHeight / 2);

  doc.setFont("helvetica", "normal");
  const arrivalDT = data.arrivalDateTime || (data.startTime ? `${format(new Date(visitDate), "dd/MM/yyyy")} ${data.startTime}` : "-");
  const departureDT = data.departureDateTime || (data.finishTime ? `${format(new Date(visitDate), "dd/MM/yyyy")} ${data.finishTime}` : "-");
  doc.text(arrivalDT, margin + halfWidth / 2, yPos + 12, { align: "center" });
  doc.text(departureDT, margin + halfWidth + halfWidth / 2, yPos + 12, { align: "center" });

  yPos += timeRowHeight + 2;

  // === ENGINEER & SIGNATURE SECTION ===
  const signatureBoxHeight = 48;
  doc.rect(margin, yPos, contentWidth, signatureBoxHeight);

  // Engineer row (right side header)
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin + halfWidth, yPos, halfWidth, 8, "FD");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Engineer", margin + halfWidth + 4, yPos + 5.5);
  doc.setFont("helvetica", "normal");
  doc.text(data.engineerName || "-", margin + halfWidth + 35, yPos + 5.5);

  // BS5839 Certification statement (left side)
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.black);
  const certText1 = "I/we being the competent person(s) responsible for the servicing of the fire detection and fire alarm system, particulars of which are set out above, CERTIFY that the said work for which I/we have been responsible complies to the best of my/our knowledge and belief with the recommendations of Clause 45 of BS5839-1:2017";
  const cert1Lines = doc.splitTextToSize(certText1, halfWidth - 6);
  doc.text(cert1Lines, margin + 2, yPos + 12);

  // Engineer signature area (right side)
  doc.setDrawColor(...COLORS.borderGrey);
  doc.line(margin + halfWidth + 10, yPos + 28, margin + contentWidth - 10, yPos + 28);

  // Customer acceptance statement (left side, lower)
  const certText2 = "Accepted, for and behalf of the user, by the Responsible Person (RP). I understand that the system is operating as designed. I understand that if any items were shown to be defective, the fire alarm system may not comply with BS 5839 part 1";
  const cert2Lines = doc.splitTextToSize(certText2, halfWidth - 6);
  doc.text(cert2Lines, margin + 2, yPos + 30);

  // Customer name row
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin + halfWidth, yPos + 32, halfWidth, 8, "FD");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Customer", margin + halfWidth + 4, yPos + 37.5);
  doc.setFont("helvetica", "normal");
  doc.text(data.customerName || "-", margin + halfWidth + 35, yPos + 37.5);

  // Position row
  doc.rect(margin + halfWidth, yPos + 40, halfWidth, 8, "D");
  doc.setFont("helvetica", "bold");
  doc.text("Position", margin + halfWidth + 4, yPos + 45.5);
  doc.setFont("helvetica", "normal");
  doc.text(data.customerPosition || "-", margin + halfWidth + 35, yPos + 45.5);

  yPos += signatureBoxHeight + 4;

  // === FOOTER ===
  const footerY = pageHeight - margin - 12;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.black);
  doc.text(COMPANY.name, pageWidth / 2, footerY, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(COMPANY.address, pageWidth / 2, footerY + 4, { align: "center" });
  doc.text(`T: ${COMPANY.phone}   |   E: ${COMPANY.email}   |   W: ${COMPANY.website}`, pageWidth / 2, footerY + 8, { align: "center" });
  doc.text(`${COMPANY.country}   |   ${COMPANY.registration}`, pageWidth / 2, footerY + 12, { align: "center" });

  // Save
  const fileName = `BHO_Job_Sheet_${data.jobNumber || site.name.replace(/\s+/g, "_")}_${format(new Date(visitDate), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

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
    const data = checklist[section] as Record<string, boolean | null | string | number> | undefined;
    const labels = CHECKLIST_LABELS[section];
    if (!data || !labels) return;
    
    const items: { label: string; value: boolean | null | string | number }[] = [];
    
    Object.entries(data).forEach(([key, value]) => {
      if (labels[key]) {
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
        // Use markers so we can draw solid boxes (like the legend) in didDrawCell
        if (item.value === true) yesVal = "__PASS__";
        else if (item.value === false) noVal = "__FAIL__";
      } else if (item.value === null) {
        naVal = "__NA__";
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
      0: { cellWidth: contentWidth - 42 },
      1: { cellWidth: 14, halign: "center", fontStyle: "bold" },
      2: { cellWidth: 14, halign: "center", fontStyle: "bold" },
      3: { cellWidth: 14, halign: "center", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body") {
        const raw = data.cell.raw;
        // Remove marker text so we can render solid status boxes (more visible than ✓)
        if (raw === "__PASS__" || raw === "__FAIL__" || raw === "__NA__") {
          data.cell.text = [""];
        }
      }
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;

      const raw = data.cell.raw;
      if (raw !== "__PASS__" && raw !== "__FAIL__" && raw !== "__NA__") return;

      const size = 5; // match legend visibility
      const x = data.cell.x + data.cell.width / 2 - size / 2;
      const y = data.cell.y + data.cell.height / 2 - size / 2;

      const fill = raw === "__PASS__" ? COLORS.pass : raw === "__FAIL__" ? COLORS.fail : COLORS.na;
      doc.setFillColor(...fill);
      doc.rect(x, y, size, size, "F");

      // Subtle border so the box remains visible on light rows
      doc.setDrawColor(...COLORS.borderGrey);
      doc.setLineWidth(0.2);
      doc.rect(x, y, size, size);
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
// Exact replica of the BHO Fire "WORK REPORT CONTINUATION SHEET" template
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
  secondarySheetUsed?: boolean;
  sheetNumber?: string;
  workNumber?: string;
  // New fields for office use section
  reprintProcessedBy?: string;
  allFormsAttached?: boolean;
  actionRequired?: string;
  passedForProcessTo?: string;
  completedAction?: string;
  totalHours?: string;
  totalCost?: string;
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

// Helper to draw a Y/N box
function drawYNBox(doc: jsPDF, x: number, y: number, selected: "Y" | "N" | null): number {
  const boxSize = 4;
  doc.setDrawColor(...COLORS.black);
  doc.setLineWidth(0.2);
  doc.rect(x, y, boxSize, boxSize);
  
  if (selected) {
    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.black);
    doc.text(selected, x + 1, y + 3.2);
  }
  return x + boxSize + 1;
}

// Helper to draw a checkbox (tick if checked)
function drawCheckbox(doc: jsPDF, x: number, y: number, checked: boolean): number {
  const boxSize = 4;
  doc.setDrawColor(...COLORS.black);
  doc.setLineWidth(0.2);
  doc.rect(x, y, boxSize, boxSize);
  
  if (checked) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.black);
    doc.text("✓", x + 0.5, y + 3.4);
  }
  return x + boxSize + 2;
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
  const margin = 10;
  const contentWidth = pageWidth - 2 * margin;

  // Load logo
  const logoImg = new Image();
  logoImg.src = "/bho-fire-logo.png";

  let yPos = margin;

  // === OUTER BORDER ===
  doc.setDrawColor(...COLORS.black);
  doc.setLineWidth(0.5);
  doc.rect(margin - 2, margin - 2, contentWidth + 4, pageHeight - 2 * margin + 4);

  // === HEADER ROW: Title + Logo ===
  const headerHeight = 28;
  doc.setLineWidth(0.3);
  doc.rect(margin, yPos, contentWidth, headerHeight);

  // Title section (left 2/3)
  const titleWidth = contentWidth * 0.65;
  doc.setTextColor(...COLORS.black);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("WORK REPORT CONTINUATION SHEET/", margin + 2, yPos + 6);
  doc.setFontSize(10);
  doc.text("CERTIFICATE No: CR BHO", margin + 2, yPos + 11);
  
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Site name:", margin + 2, yPos + 16);
  doc.text(site.name || "-", margin + 22, yPos + 16);
  doc.text("Site address:", margin + 2, yPos + 20);
  const siteAddr = [site.address, site.city, site.postcode].filter(Boolean).join(", ");
  doc.text(doc.splitTextToSize(siteAddr || "-", titleWidth - 25)[0], margin + 25, yPos + 20);
  
  doc.text("Site contact name:", margin + 2, yPos + 26);
  doc.text(site.contact_name || "-", margin + 35, yPos + 26);

  // Logo section (right 1/3)
  doc.line(margin + titleWidth, yPos, margin + titleWidth, yPos + headerHeight);
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", margin + titleWidth + 15, yPos + 3, 35, 22);
    } catch {
      doc.setTextColor(...COLORS.red);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("BHO", margin + titleWidth + 25, yPos + 12);
      doc.text("FIRE", margin + titleWidth + 23, yPos + 22);
    }
  }

  yPos += headerHeight;

  // === JOB INFO ROW ===
  const infoRowHeight = 8;
  doc.rect(margin, yPos, contentWidth, infoRowHeight);
  
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.black);
  
  // Fire Services job no
  doc.text("Fire Services job no:", margin + 2, yPos + 5);
  doc.text(data.jobNumber || "-", margin + 35, yPos + 5);
  
  // Date of service
  doc.text("Date of service:", margin + contentWidth/2 - 20, yPos + 5);
  doc.text(format(new Date(visitDate), "dd/MM/yyyy"), margin + contentWidth/2 + 10, yPos + 5);
  
  yPos += infoRowHeight;

  // === SECONDARY SHEET ROW ===
  doc.rect(margin, yPos, contentWidth, infoRowHeight);
  doc.text("Secondary sheet used", margin + 2, yPos + 5);
  
  // Y / N for secondary sheet
  let xCursor = margin + 40;
  doc.text("Y / N", xCursor, yPos + 5);
  xCursor += 18;
  doc.text("Sheet number:", xCursor, yPos + 5);
  doc.text(data.sheetNumber || "_____", xCursor + 25, yPos + 5);

  yPos += infoRowHeight;

  // === STATUS ROW 1 ===
  const statusRowHeight = 9;
  doc.rect(margin, yPos, contentWidth, statusRowHeight);
  
  const col1 = margin + 2;
  const col2 = margin + contentWidth * 0.25;
  const col3 = margin + contentWidth * 0.52;
  const col4 = margin + contentWidth * 0.78;
  
  doc.setFontSize(6.5);
  doc.text("Work number:", col1, yPos + 4);
  doc.text(data.workNumber || "-", col1, yPos + 7.5);
  
  doc.text("Work completed: Y / N", col2, yPos + 5.5);
  doc.text("Survey required: Y / N", col3, yPos + 5.5);
  doc.text("RAMS completed", col4, yPos + 4);
  drawCheckbox(doc, col4 + 25, yPos + 1.5, data.ramsCompleted);

  yPos += statusRowHeight;

  // === STATUS ROW 2 ===
  doc.rect(margin, yPos, contentWidth, statusRowHeight);
  
  const jobTypeLabel = JOB_TYPES_PDF.find(j => j.value === data.jobType)?.label || data.jobType || "-";
  doc.text("Job type:", col1, yPos + 4);
  doc.text(jobTypeLabel, col1, yPos + 7.5);
  
  doc.text("Return required: Y / N", col2, yPos + 5.5);
  doc.text("Quotation required: Y / N", col3, yPos + 5.5);
  doc.text("Log book entry", col4, yPos + 4);
  drawCheckbox(doc, col4 + 22, yPos + 1.5, data.logBookEntry);

  yPos += statusRowHeight;

  // === STATUS ROW 3 ===
  doc.rect(margin, yPos, contentWidth, statusRowHeight);
  
  const arrivalLabel = SYSTEM_STATUS_PDF.find(s => s.value === data.systemStatusArrival)?.label || data.systemStatusArrival || "-";
  const departureLabel = SYSTEM_STATUS_PDF.find(s => s.value === data.systemStatusDeparture)?.label || data.systemStatusDeparture || "-";
  
  doc.text("System status on arrival:", col1, yPos + 4);
  doc.text(arrivalLabel, col1, yPos + 7.5);
  
  doc.text("System status on departure:", col2, yPos + 4);
  doc.text(departureLabel, col2, yPos + 7.5);
  
  doc.text("Attendance day: MON / TUES / WED / THURS / FRI / SAT / SUN", col3, yPos + 5.5);

  yPos += statusRowHeight + 1;

  // === WORKS REPORT SECTION ===
  const worksBoxHeight = 70;
  doc.rect(margin, yPos, contentWidth, worksBoxHeight);
  
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Works report:", margin + 2, yPos + 5);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const worksLines = doc.splitTextToSize(data.worksReport || "", contentWidth - 6);
  doc.text(worksLines.slice(0, 14), margin + 2, yPos + 11);

  yPos += worksBoxHeight;

  // === FURTHER ACTION SECTION ===
  const furtherBoxHeight = 40;
  doc.rect(margin, yPos, contentWidth, furtherBoxHeight);
  
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Further action / comment:", margin + 2, yPos + 5);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const furtherLines = doc.splitTextToSize(data.furtherAction || "", contentWidth - 6);
  doc.text(furtherLines.slice(0, 6), margin + 2, yPos + 11);

  yPos += furtherBoxHeight;

  // === TIME TRACKING ROW ===
  const timeRowHeight = 8;
  const timeColWidth = contentWidth / 3;
  
  doc.rect(margin, yPos, timeColWidth, timeRowHeight);
  doc.rect(margin + timeColWidth, yPos, timeColWidth, timeRowHeight);
  doc.rect(margin + timeColWidth * 2, yPos, timeColWidth, timeRowHeight);
  
  doc.setFontSize(7);
  doc.text("No of engineers:", margin + 2, yPos + 5);
  doc.text(String(data.numEngineers || "-"), margin + 28, yPos + 5);
  
  doc.text("Start time:", margin + timeColWidth + 2, yPos + 5);
  doc.text(data.startTime || "-", margin + timeColWidth + 22, yPos + 5);
  
  doc.text("Finish time:", margin + timeColWidth * 2 + 2, yPos + 5);
  doc.text(data.finishTime || "-", margin + timeColWidth * 2 + 22, yPos + 5);

  yPos += timeRowHeight;

  // Travel time / Duration row
  doc.rect(margin, yPos, timeColWidth, timeRowHeight);
  doc.rect(margin + timeColWidth, yPos, timeColWidth * 2, timeRowHeight);
  
  doc.text("Travel time (Hours):", margin + 2, yPos + 5);
  doc.text(data.travelTime || "-", margin + 35, yPos + 5);
  
  doc.text("Duration:", margin + timeColWidth + 2, yPos + 5);
  doc.text(data.duration || "-", margin + timeColWidth + 22, yPos + 5);

  yPos += timeRowHeight;

  // === MATERIALS TABLE ===
  const matHeaderHeight = 6;
  const matRowHeight = 6;
  const matColWidths = [contentWidth * 0.5, contentWidth * 0.15, contentWidth * 0.35];
  const officeColWidth = contentWidth * 0.5;
  
  // Materials header
  doc.rect(margin, yPos, matColWidths[0], matHeaderHeight);
  doc.rect(margin + matColWidths[0], yPos, matColWidths[1], matHeaderHeight);
  doc.rect(margin + matColWidths[0] + matColWidths[1], yPos, matColWidths[2] - officeColWidth, matHeaderHeight);
  
  // Office use header
  doc.rect(margin + contentWidth * 0.5, yPos, officeColWidth, matHeaderHeight);
  
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.text("Materials", margin + 2, yPos + 4);
  doc.text("Qty", margin + matColWidths[0] + 2, yPos + 4);
  doc.text("Costs", margin + matColWidths[0] + matColWidths[1] + 2, yPos + 4);
  
  doc.text("For office use only. Please insert name/s in boxes below.", margin + contentWidth * 0.52, yPos + 4);
  doc.text("Date:", margin + contentWidth * 0.88, yPos + 4);

  yPos += matHeaderHeight;

  // Materials rows (6 rows)
  const officeFields = [
    "Reprint processed by:",
    "All forms attached:",
    "Action required:",
  ];
  
  for (let i = 0; i < 3; i++) {
    doc.rect(margin, yPos, matColWidths[0], matRowHeight);
    doc.rect(margin + matColWidths[0], yPos, matColWidths[1], matRowHeight);
    doc.rect(margin + matColWidths[0] + matColWidths[1], yPos, matColWidths[2] - officeColWidth, matRowHeight);
    doc.rect(margin + contentWidth * 0.5, yPos, officeColWidth, matRowHeight);
    
    // Material data
    const mat = data.materials[i];
    if (mat) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(mat.name || "", margin + 2, yPos + 4);
      doc.text(mat.qty || "", margin + matColWidths[0] + 2, yPos + 4);
      doc.text(mat.cost || "", margin + matColWidths[0] + matColWidths[1] + 2, yPos + 4);
    }
    
    // Office field
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text(officeFields[i], margin + contentWidth * 0.52, yPos + 4);
    
    yPos += matRowHeight;
  }

  // Total hours row + office fields continued
  doc.rect(margin, yPos, matColWidths[0] + matColWidths[1], matRowHeight);
  doc.rect(margin + matColWidths[0] + matColWidths[1], yPos, matColWidths[2] - officeColWidth, matRowHeight);
  doc.rect(margin + contentWidth * 0.5, yPos, officeColWidth, matRowHeight);
  
  doc.setFont("helvetica", "bold");
  doc.text("Total hours", margin + 2, yPos + 4);
  doc.setFont("helvetica", "normal");
  doc.text(data.totalHours || "", margin + 25, yPos + 4);
  doc.text("Passed for process to:", margin + contentWidth * 0.52, yPos + 4);

  yPos += matRowHeight;

  // Total row
  doc.rect(margin, yPos, matColWidths[0] + matColWidths[1], matRowHeight);
  doc.rect(margin + matColWidths[0] + matColWidths[1], yPos, matColWidths[2] - officeColWidth, matRowHeight);
  doc.rect(margin + contentWidth * 0.5, yPos, officeColWidth, matRowHeight);
  
  doc.setFont("helvetica", "bold");
  doc.text("Total:", margin + 2, yPos + 4);
  doc.setFont("helvetica", "normal");
  doc.text(data.totalCost || "", margin + 25, yPos + 4);
  doc.text("Completed action:", margin + contentWidth * 0.52, yPos + 4);

  yPos += matRowHeight + 2;

  // === CERTIFICATION STATEMENT ===
  const certHeight = 8;
  doc.rect(margin, yPos, contentWidth, certHeight);
  doc.setFontSize(6);
  doc.setFont("helvetica", "italic");
  doc.text("I confirm that all works have been carried out to a satisfactory standard:", margin + contentWidth / 2, yPos + 5, { align: "center" });

  yPos += certHeight;

  // === SIGNATURE SECTION ===
  const sigRowHeight = 10;
  const sigHalfWidth = contentWidth / 2;
  
  // Engineer signature row
  doc.rect(margin, yPos, sigHalfWidth, sigRowHeight);
  doc.rect(margin + sigHalfWidth, yPos, sigHalfWidth, sigRowHeight);
  
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.text("Engineers(s) signature:", margin + 2, yPos + 6);
  doc.text("Customer signature:", margin + sigHalfWidth + 2, yPos + 6);

  yPos += sigRowHeight;

  // Print name row
  doc.rect(margin, yPos, sigHalfWidth, sigRowHeight);
  doc.rect(margin + sigHalfWidth, yPos, sigHalfWidth, sigRowHeight);
  
  doc.text("Print name:", margin + 2, yPos + 4);
  doc.text(data.engineerName || "", margin + 25, yPos + 4);
  doc.text("Print name:", margin + sigHalfWidth + 2, yPos + 4);
  doc.text(data.customerName || "", margin + sigHalfWidth + 25, yPos + 4);

  yPos += sigRowHeight;

  // Date row
  doc.rect(margin, yPos, sigHalfWidth, sigRowHeight);
  doc.rect(margin + sigHalfWidth, yPos, sigHalfWidth, sigRowHeight);
  
  doc.text("Date:", margin + 2, yPos + 6);
  doc.text(format(new Date(visitDate), "dd/MM/yyyy"), margin + 15, yPos + 6);
  doc.text("Date:", margin + sigHalfWidth + 2, yPos + 6);

  // Save
  const fileName = `BHO_Work_Report_${data.jobNumber || site.name.replace(/\s+/g, "_")}_${format(new Date(visitDate), "yyyy-MM-dd")}.pdf`;
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
];

const SYSTEM_STATUS_PDF = [
  { value: "operational", label: "Fully Operational" },
  { value: "fault", label: "Fault Present" },
  { value: "disabled", label: "Disabled" },
  { value: "silenced", label: "Silenced" },
  { value: "partial", label: "Partial Operation" },
];

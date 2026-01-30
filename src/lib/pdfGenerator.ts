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
// Clean corporate style matching the Service Report format
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
  engineerSignature?: string;
  engineerSignDate?: string;
  engineerSignTime?: string;
  customerName: string;
  customerSignature?: string;
  customerSignDate?: string;
  customerSignTime?: string;
  customerPosition?: string;
  // System info
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

export function generateWorkReportPDF(
  data: WorkReportData,
  site: WorkReportSiteInfo,
  visitDate: string,
  visitType?: string
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - 2 * margin;

  // Load logo
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
  doc.text("As recommended in BAFE SP203-1 Clause 9.8 & BS5839-1:2025 Clause 45", margin, yPos + 9);

  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (data.certificateNo) {
    doc.text(`Ref: ${data.certificateNo}`, pageWidth - margin, yPos + 3, { align: "right" });
  }
  doc.text(format(new Date(visitDate), "dd MMM yyyy"), pageWidth - margin, yPos + 8, { align: "right" });

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

  const typeLabel = visitType ? visitType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : 
    (data.jobType ? JOB_TYPES_PDF.find(j => j.value === data.jobType)?.label || data.jobType : "Work Report");
  const statusLabel = data.workCompleted ? "Completed" : "In Progress";
  const serviceRows = [
    ["Type:", typeLabel],
    ["Date:", format(new Date(visitDate), "dd MMM yyyy")],
    ["Engineer:", data.engineerName || "-"],
    ["Status:", statusLabel],
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

  doc.setFontSize(6.5);
  doc.setTextColor(...COLORS.charcoal);
  doc.setFont("helvetica", "normal");
  const sysY = yPos + 11;
  const sysColW = contentWidth / 3;

  const panelInfo = `Panel: ${data.panelManufacturer || "-"} ${data.panelModel || ""}`.trim();
  const locationInfo = `Location: ${data.panelLocation || "-"}`;
  const typeInfo = `Type: ${data.systemType || "-"}`;

  doc.text(panelInfo, margin + 2, sysY);
  doc.text(locationInfo, margin + 2 + sysColW, sysY);
  doc.text(typeInfo, margin + 2 + sysColW * 2, sysY);

  doc.text(`Zones: ${data.zonesCount || "-"}`, margin + 2, sysY + 5);
  doc.text(`Devices: ${data.devicesCount || "-"}`, margin + 2 + sysColW, sysY + 5);

  yPos += 22;

  // === WORKS CARRIED OUT ===
  const worksBoxHeight = 100;
  doc.rect(margin, yPos, contentWidth, worksBoxHeight);

  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, contentWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("WORKS CARRIED OUT", margin + 2, yPos + 4.2);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(7);
  const worksLines = doc.splitTextToSize(data.worksReport || "", contentWidth - 6);
  doc.text(worksLines.slice(0, 20), margin + 2, yPos + 12);

  yPos += worksBoxHeight + 2;

  // === RECOMMENDATIONS ===
  const recsBoxHeight = 35;
  doc.rect(margin, yPos, contentWidth, recsBoxHeight);

  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, contentWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("RECOMMENDATIONS", margin + 2, yPos + 4.2);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(7);
  const recsLines = doc.splitTextToSize(data.furtherAction || "", contentWidth - 6);
  doc.text(recsLines.slice(0, 6), margin + 2, yPos + 12);

  yPos += recsBoxHeight + 4;

  // === SIGN-OFF SECTION ===
  yPos = Math.max(yPos, pageHeight - 52);
  
  // Sign-off header bar
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, contentWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("SIGN-OFF & COMPLETION", margin + 2, yPos + 4.2);
  
  // Completion status badge
  const statusText = data.workCompleted ? "WORKS COMPLETED" : "WORKS IN PROGRESS";
  const statusColor = data.workCompleted ? COLORS.pass : [200, 150, 0] as [number, number, number];
  doc.setFillColor(...statusColor);
  doc.rect(pageWidth - margin - 35, yPos + 1, 33, 4, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(5.5);
  doc.text(statusText, pageWidth - margin - 33, yPos + 3.8);
  
  yPos += 8;
  
  // Time summary row
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin, yPos, contentWidth, 10, "F");
  doc.setDrawColor(...COLORS.borderGrey);
  doc.rect(margin, yPos, contentWidth, 10);
  
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.charcoal);
  
  const timeY = yPos + 6.5;
  const colW = contentWidth / 4;
  
  doc.text("Date:", margin + 2, timeY);
  doc.setFont("helvetica", "normal");
  doc.text(format(new Date(visitDate), "dd/MM/yyyy"), margin + 14, timeY);
  
  doc.setFont("helvetica", "bold");
  doc.text("Arrival:", margin + colW + 2, timeY);
  doc.setFont("helvetica", "normal");
  doc.text(data.startTime || "—", margin + colW + 16, timeY);
  
  doc.setFont("helvetica", "bold");
  doc.text("Departure:", margin + colW * 2 + 2, timeY);
  doc.setFont("helvetica", "normal");
  doc.text(data.finishTime || "—", margin + colW * 2 + 22, timeY);
  
  doc.setFont("helvetica", "bold");
  doc.text("Duration:", margin + colW * 3 + 2, timeY);
  doc.setFont("helvetica", "normal");
  doc.text(data.duration ? `${data.duration} hrs` : "—", margin + colW * 3 + 18, timeY);
  
  yPos += 12;
  
  const sigWidth = (contentWidth - 6) / 2;
  const sigBoxHeight = 22;

  // Engineer signature box
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.rect(margin, yPos, sigWidth, sigBoxHeight + 8);
  
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.charcoal);
  doc.text("ENGINEER", margin + 2, yPos + 4);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text(data.engineerName || "—", margin + 22, yPos + 4);
  
  // Signature area
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setFillColor(...COLORS.white);
  doc.rect(margin + 2, yPos + 6, sigWidth - 4, sigBoxHeight - 2, "FD");
  
  if (data.engineerSignature) {
    try {
      doc.addImage(data.engineerSignature, "PNG", margin + 3, yPos + 7, sigWidth - 6, sigBoxHeight - 4);
    } catch {
      // Signature image failed
    }
  }
  
  // Date/time under signature
  doc.setFontSize(5.5);
  doc.setTextColor(...COLORS.mediumGrey);
  const engSignDateStr = data.engineerSignDate 
    ? format(new Date(data.engineerSignDate), "dd/MM/yyyy")
    : format(new Date(visitDate), "dd/MM/yyyy");
  const engSignTimeStr = data.engineerSignTime || data.finishTime || "";
  doc.text(`Signed: ${engSignDateStr} ${engSignTimeStr}`, margin + 2, yPos + sigBoxHeight + 6);

  // Customer signature box
  const custX = margin + sigWidth + 6;
  doc.setDrawColor(...COLORS.borderGrey);
  doc.rect(custX, yPos, sigWidth, sigBoxHeight + 8);
  
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.charcoal);
  doc.text("CUSTOMER", custX + 2, yPos + 4);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text(data.customerName || "—", custX + 24, yPos + 4);
  
  // Signature area
  doc.setFillColor(...COLORS.white);
  doc.rect(custX + 2, yPos + 6, sigWidth - 4, sigBoxHeight - 2, "FD");
  
  if (data.customerSignature) {
    try {
      doc.addImage(data.customerSignature, "PNG", custX + 3, yPos + 7, sigWidth - 6, sigBoxHeight - 4);
    } catch {
      // Signature image failed
    }
  }
  
  // Date/time under signature
  doc.setFontSize(5.5);
  doc.setTextColor(...COLORS.mediumGrey);
  const custSignDateStr = data.customerSignDate 
    ? format(new Date(data.customerSignDate), "dd/MM/yyyy")
    : format(new Date(visitDate), "dd/MM/yyyy");
  const custSignTimeStr = data.customerSignTime || data.finishTime || "";
  doc.text(`Signed: ${custSignDateStr} ${custSignTimeStr}`, custX + 2, yPos + sigBoxHeight + 6);

  addCompactFooter(doc, pageWidth, margin);

  const fileName = `BHO_Work_Report_${site.name.replace(/\s+/g, "_")}_${format(new Date(visitDate), "yyyy-MM-dd")}.pdf`;
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

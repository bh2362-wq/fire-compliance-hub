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
  charcoal: [45, 45, 48] as [number, number, number],        // Primary text
  red: [200, 30, 30] as [number, number, number],            // BHO Red accent
  darkGrey: [80, 80, 85] as [number, number, number],        // Secondary text
  mediumGrey: [140, 140, 145] as [number, number, number],   // Muted text
  lightGrey: [245, 245, 247] as [number, number, number],    // Subtle backgrounds
  borderGrey: [220, 220, 225] as [number, number, number],   // Borders
  white: [255, 255, 255] as [number, number, number],
  pass: [34, 139, 34] as [number, number, number],           // Forest green
  fail: [200, 30, 30] as [number, number, number],           // Red (matches accent)
  na: [140, 140, 145] as [number, number, number],           // Grey
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

  // Draw filled box
  doc.setFillColor(...color);
  doc.rect(x, y, boxSize, boxSize, "F");

  // Draw label next to box
  if (showLabel) {
    doc.setTextColor(...color);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(label, x + boxSize + 2, y + 3.2);
  }

  return x + boxSize + (showLabel ? 18 : 6);
}

// Compact branded header
function addCompactHeader(doc: jsPDF, pageWidth: number, margin: number, logoImg: HTMLImageElement | null) {
  // Thin red accent line at very top
  doc.setFillColor(...COLORS.red);
  doc.rect(0, 0, pageWidth, 2, "F");

  // Logo on left
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

  // Company details on right (compact)
  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const rightX = pageWidth - margin;
  doc.text(`T: ${COMPANY.phone}  E: ${COMPANY.email}`, rightX, 8, { align: "right" });
  doc.text(COMPANY.address, rightX, 12, { align: "right" });
  doc.text(`${COMPANY.website}`, rightX, 16, { align: "right" });

  // Thin border line
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.line(margin, 22, pageWidth - margin, 22);

  return 26; // Return Y position after header
}

// Compact footer
function addCompactFooter(doc: jsPDF, pageWidth: number, margin: number) {
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Thin line
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

  // Report details on right
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

  // === Checklist Table (Compact) ===
  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Service Checklist", margin, yPos + 3);

  // Legend
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  let legendX = pageWidth - margin - 60;
  legendX = drawStatusBox(doc, legendX, yPos, true);
  legendX = drawStatusBox(doc, legendX, yPos, false);
  drawStatusBox(doc, legendX, yPos, null);

  yPos += 6;

  // Collect all checklist items into flat array
  const checklist = report.checklist;
  const sections = Object.keys(SECTION_LABELS) as Array<keyof BS5839Checklist>;
  const allItems: { section: string; item: string; value: boolean | null }[] = [];

  sections.forEach((section) => {
    const sectionData = checklist[section] as Record<string, boolean | null>;
    const labels = CHECKLIST_LABELS[section];
    Object.entries(sectionData).forEach(([key, value]) => {
      allItems.push({
        section: SECTION_LABELS[section],
        item: labels[key] || key,
        value,
      });
    });
  });

  // Create compact table with box+label status
  autoTable(doc, {
    startY: yPos,
    head: [["Check Item", "Result"]],
    body: allItems.map((row) => {
      let statusText = "N/A";
      if (row.value === true) statusText = "PASS";
      else if (row.value === false) statusText = "FAIL";
      return [row.item, statusText];
    }),
    theme: "plain",
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
    },
    headStyles: {
      fillColor: COLORS.charcoal,
      textColor: COLORS.white,
      fontStyle: "bold",
      fontSize: 7,
    },
    bodyStyles: {
      textColor: COLORS.charcoal,
      lineColor: COLORS.borderGrey,
      lineWidth: 0.1,
    },
    alternateRowStyles: {
      fillColor: COLORS.lightGrey,
    },
    columnStyles: {
      0: { cellWidth: contentWidth - 22 },
      1: { cellWidth: 20, halign: "center", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const text = data.cell.text[0];
        if (text === "PASS") {
          data.cell.styles.textColor = COLORS.pass;
        } else if (text === "FAIL") {
          data.cell.styles.textColor = COLORS.fail;
        } else {
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
      if (yPos > pageHeight - 30) return; // Stop if no space
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...COLORS.red);
      doc.text(note.label + ":", margin, yPos);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...COLORS.charcoal);
      const lines = doc.splitTextToSize(note.text!, contentWidth - 2);
      doc.text(lines.slice(0, 2), margin, yPos + 4); // Max 2 lines
      yPos += Math.min(lines.length, 2) * 3.5 + 6;
    });
  }

  // === Signature Row ===
  yPos = Math.max(yPos, pageHeight - 28);
  doc.setDrawColor(...COLORS.borderGrey);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 3;

  const sigWidth = (contentWidth - 10) / 2;

  // Engineer
  doc.setFontSize(6);
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text("Engineer: " + (report.engineer_name || ""), margin, yPos + 4);
  doc.line(margin, yPos + 10, margin + sigWidth, yPos + 10);
  doc.text("Signature", margin, yPos + 14);

  // Client
  doc.text("Client: " + (report.client_name || ""), margin + sigWidth + 10, yPos + 4);
  doc.line(margin + sigWidth + 10, yPos + 10, pageWidth - margin, yPos + 10);
  doc.text("Signature", margin + sigWidth + 10, yPos + 14);

  // Footer
  addCompactFooter(doc, pageWidth, margin);

  // Save
  const fileName = `BHO_Service_Report_${site.name.replace(/\s+/g, "_")}_${format(new Date(report.report_date), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

// ===================== WORK REPORT PDF (Single Page) =====================
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
}

interface WorkReportSiteInfo {
  name: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  contact_name?: string | null;
}

export function generateWorkReportPDF(
  data: WorkReportData,
  site: WorkReportSiteInfo,
  visitDate: string
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
  doc.text("Work Report", margin, yPos + 4);

  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (data.certificateNo) {
    doc.text(`Cert: ${data.certificateNo}`, pageWidth - margin, yPos + 3, { align: "right" });
  }
  doc.text(format(new Date(visitDate), "dd MMM yyyy"), pageWidth - margin, yPos + 8, { align: "right" });

  yPos += 12;

  // === Site & Job Details ===
  const colWidth = (contentWidth - 6) / 2;
  const boxHeight = 26;

  // Left: Site
  doc.setDrawColor(...COLORS.borderGrey);
  doc.rect(margin, yPos, colWidth, boxHeight);
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(margin, yPos, colWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("SITE", margin + 2, yPos + 4.2);

  const fullAddr = [site.address, site.city, site.postcode].filter(Boolean).join(", ");
  doc.setFontSize(6.5);
  let rowY = yPos + 10;
  [["Site:", site.name], ["Address:", fullAddr || "-"], ["Contact:", site.contact_name || "-"]].forEach(([l, v]) => {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFont("helvetica", "bold");
    doc.text(l, margin + 2, rowY);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(v, colWidth - 20)[0] || "-", margin + 18, rowY);
    rowY += 5;
  });

  // Right: Job
  const rightX = margin + colWidth + 6;
  doc.rect(rightX, yPos, colWidth, boxHeight);
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(rightX, yPos, colWidth, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("JOB DETAILS", rightX + 2, yPos + 4.2);

  const jobType = data.jobType ? data.jobType.charAt(0).toUpperCase() + data.jobType.slice(1) : "-";
  rowY = yPos + 10;
  [["Job No:", data.jobNumber || "-"], ["Type:", jobType], ["Day:", data.attendanceDay || "-"]].forEach(([l, v]) => {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFont("helvetica", "bold");
    doc.text(l, rightX + 2, rowY);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    doc.text(v, rightX + 20, rowY);
    rowY += 5;
  });

  yPos += boxHeight + 4;

  // === Status & Time Row ===
  doc.rect(margin, yPos, contentWidth, 14);
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin, yPos, contentWidth, 14, "F");

  const statusLabels: Record<string, string> = {
    operational: "Operational",
    fault: "Fault",
    disabled: "Disabled",
    silenced: "Silenced",
    partial: "Partial",
  };

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text("Arrival:", margin + 2, yPos + 5);
  doc.text("Departure:", margin + 2, yPos + 11);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(statusLabels[data.systemStatusArrival] || "-", margin + 20, yPos + 5);
  doc.text(statusLabels[data.systemStatusDeparture] || "-", margin + 20, yPos + 11);

  doc.setTextColor(...COLORS.mediumGrey);
  doc.text("Start:", margin + 55, yPos + 5);
  doc.text("Finish:", margin + 55, yPos + 11);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(data.startTime || "-", margin + 70, yPos + 5);
  doc.text(data.finishTime || "-", margin + 70, yPos + 11);

  doc.setTextColor(...COLORS.mediumGrey);
  doc.text("Travel:", margin + 100, yPos + 5);
  doc.text("Duration:", margin + 100, yPos + 11);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(data.travelTime ? `${data.travelTime}h` : "-", margin + 118, yPos + 5);
  doc.text(data.duration ? `${data.duration}h` : "-", margin + 118, yPos + 11);

  doc.setTextColor(...COLORS.mediumGrey);
  doc.text("Engineers:", margin + 145, yPos + 5);
  doc.setTextColor(...COLORS.charcoal);
  doc.text(data.numEngineers?.toString() || "1", margin + 168, yPos + 5);

  yPos += 18;

  // === Checkboxes Row (Box + Label Style) ===
  doc.setFillColor(...COLORS.lightGrey);
  doc.rect(margin, yPos, contentWidth, 16, "F");

  const checkboxes = [
    { label: "Work Completed", checked: data.workCompleted },
    { label: "Return Required", checked: data.returnRequired },
    { label: "Survey Required", checked: data.surveyRequired },
    { label: "Quotation Required", checked: data.quotationRequired },
    { label: "RAMS Completed", checked: data.ramsCompleted },
    { label: "Log Book Entry", checked: data.logBookEntry },
  ];

  const cbWidth = contentWidth / 3;
  checkboxes.forEach((cb, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cbX = margin + 4 + col * cbWidth;
    const cbY = yPos + 3 + row * 8;

    // Draw box
    const boxSize = 4;
    if (cb.checked) {
      doc.setFillColor(...COLORS.pass);
    } else {
      doc.setFillColor(...COLORS.borderGrey);
    }
    doc.rect(cbX, cbY, boxSize, boxSize, "F");

    // Label
    doc.setTextColor(...COLORS.charcoal);
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text(cb.label, cbX + 6, cbY + 3.2);
  });

  yPos += 20;

  // === Works Report ===
  doc.setTextColor(...COLORS.red);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Works Report", margin, yPos);
  yPos += 4;

  doc.setTextColor(...COLORS.charcoal);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  if (data.worksReport && data.worksReport.trim()) {
    const lines = doc.splitTextToSize(data.worksReport, contentWidth);
    doc.text(lines.slice(0, 6), margin, yPos + 3); // Max 6 lines
    yPos += Math.min(lines.length, 6) * 3.5 + 4;
  } else {
    doc.text("No work description provided.", margin, yPos + 3);
    yPos += 8;
  }

  // === Further Action ===
  if (data.furtherAction && data.furtherAction.trim()) {
    doc.setTextColor(...COLORS.red);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Further Action", margin, yPos);
    yPos += 4;

    doc.setTextColor(...COLORS.charcoal);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.furtherAction, contentWidth);
    doc.text(lines.slice(0, 4), margin, yPos + 3);
    yPos += Math.min(lines.length, 4) * 3.5 + 4;
  }

  // === Materials (if any) ===
  const materialsWithData = data.materials.filter((m) => m.name.trim());
  if (materialsWithData.length > 0 && yPos < pageHeight - 50) {
    doc.setTextColor(...COLORS.red);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Materials", margin, yPos);
    yPos += 4;

    autoTable(doc, {
      startY: yPos,
      head: [["Material", "Qty", "Cost"]],
      body: materialsWithData.map((m) => [m.name, m.qty || "-", m.cost ? `£${m.cost}` : "-"]),
      theme: "plain",
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: {
        fillColor: COLORS.charcoal,
        textColor: COLORS.white,
        fontStyle: "bold",
      },
      bodyStyles: {
        textColor: COLORS.charcoal,
        lineColor: COLORS.borderGrey,
        lineWidth: 0.1,
      },
      columnStyles: {
        0: { cellWidth: contentWidth - 40 },
        1: { cellWidth: 20, halign: "center" },
        2: { cellWidth: 20, halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 4;
  }

  // === Signature Row ===
  yPos = Math.max(yPos, pageHeight - 28);
  doc.setDrawColor(...COLORS.borderGrey);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 3;

  const sigWidth = (contentWidth - 10) / 2;

  doc.setFontSize(6);
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text("Engineer: " + (data.engineerName || ""), margin, yPos + 4);
  doc.line(margin, yPos + 10, margin + sigWidth, yPos + 10);
  doc.text("Signature", margin, yPos + 14);

  doc.text("Customer: " + (data.customerName || ""), margin + sigWidth + 10, yPos + 4);
  doc.line(margin + sigWidth + 10, yPos + 10, pageWidth - margin, yPos + 10);
  doc.text("Signature", margin + sigWidth + 10, yPos + 14);

  // Footer
  addCompactFooter(doc, pageWidth, margin);

  // Save
  const fileName = `BHO_Work_Report_${site.name.replace(/\s+/g, "_")}_${format(new Date(visitDate), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  ServiceReport,
  BS5839Checklist,
  CHECKLIST_LABELS,
  SECTION_LABELS,
  SYSTEM_TYPES,
} from "@/services/serviceReportService";

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

export function generateServiceReportPDF(
  report: ServiceReport,
  site: SiteInfo,
  visit: VisitInfo
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let yPos = margin;

  // Colors
  const primaryColor: [number, number, number] = [30, 58, 95]; // Deep navy
  const accentColor: [number, number, number] = [245, 158, 11]; // Amber

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Fire Alarm Service Report", margin, 18);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("BS 5839-1:2025 Compliant", margin, 26);
  doc.text(`Report Date: ${format(new Date(report.report_date), "dd MMMM yyyy")}`, margin, 33);

  if (report.report_number) {
    doc.text(`Report #: ${report.report_number}`, pageWidth - margin - 50, 33);
  }

  yPos = 50;

  // Site Information Section
  doc.setTextColor(...primaryColor);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Site Information", margin, yPos);
  yPos += 2;

  doc.setDrawColor(...accentColor);
  doc.setLineWidth(1);
  doc.line(margin, yPos, margin + 40, yPos);
  yPos += 8;

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const siteAddress = [site.address, site.city, site.postcode].filter(Boolean).join(", ");

  const siteInfo = [
    ["Site Name:", site.name],
    ["Address:", siteAddress || "Not specified"],
    ["Contact:", site.contact_name || "Not specified"],
    ["Phone:", site.contact_phone || "Not specified"],
    ["Email:", site.contact_email || "Not specified"],
  ];

  siteInfo.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 30, yPos);
    yPos += 6;
  });

  yPos += 5;

  // Visit & Engineer Details
  doc.setTextColor(...primaryColor);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Service Details", margin, yPos);
  yPos += 2;

  doc.setDrawColor(...accentColor);
  doc.line(margin, yPos, margin + 35, yPos);
  yPos += 8;

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(10);

  const visitType = visit.visit_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const systemTypeLabel = SYSTEM_TYPES.find((t) => t.value === report.system_type)?.label || report.system_type || "Not specified";

  const serviceDetails = [
    ["Visit Type:", visitType],
    ["Visit Date:", format(new Date(visit.visit_date), "dd MMMM yyyy")],
    ["Engineer:", report.engineer_name || "Not specified"],
    ["Client Rep:", report.client_name || "Not specified"],
  ];

  serviceDetails.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 30, yPos);
    yPos += 6;
  });

  yPos += 5;

  // System Information
  doc.setTextColor(...primaryColor);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("System Information", margin, yPos);
  yPos += 2;

  doc.setDrawColor(...accentColor);
  doc.line(margin, yPos, margin + 45, yPos);
  yPos += 8;

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(10);

  const systemInfo = [
    ["Panel Manufacturer:", report.panel_manufacturer || "Not specified"],
    ["Panel Model:", report.panel_model || "Not specified"],
    ["Panel Location:", report.panel_location || "Not specified"],
    ["System Category:", systemTypeLabel],
    ["Number of Zones:", report.zones_count?.toString() || "Not specified"],
    ["Number of Devices:", report.devices_count?.toString() || "Not specified"],
  ];

  const col1 = systemInfo.slice(0, 3);
  const col2 = systemInfo.slice(3);

  let tempY = yPos;
  col1.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, tempY);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 40, tempY);
    tempY += 6;
  });

  tempY = yPos;
  col2.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, pageWidth / 2, tempY);
    doc.setFont("helvetica", "normal");
    doc.text(value, pageWidth / 2 + 40, tempY);
    tempY += 6;
  });

  yPos = tempY + 10;

  // Checklist Section - New Page
  doc.addPage();
  yPos = margin;

  doc.setTextColor(...primaryColor);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("BS 5839-1:2025 Service Checklist", margin, yPos);
  yPos += 10;

  // Generate checklist tables
  const checklist = report.checklist;
  const sections = Object.keys(SECTION_LABELS) as Array<keyof BS5839Checklist>;

  sections.forEach((section) => {
    const sectionData = checklist[section] as Record<string, boolean | null>;
    const labels = CHECKLIST_LABELS[section];

    const tableData = Object.entries(sectionData).map(([key, value]) => {
      let status = "N/A";
      if (value === true) status = "✓ Pass";
      else if (value === false) status = "✗ Fail";

      return [labels[key] || key, status];
    });

    autoTable(doc, {
      startY: yPos,
      head: [[SECTION_LABELS[section], "Status"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [60, 60, 60],
      },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 30, halign: "center" },
      },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          const text = data.cell.text[0];
          if (text.includes("Pass")) {
            data.cell.styles.textColor = [34, 197, 94];
            data.cell.styles.fontStyle = "bold";
          } else if (text.includes("Fail")) {
            data.cell.styles.textColor = [239, 68, 68];
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;

    // Check if we need a new page
    if (yPos > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      yPos = margin;
    }
  });

  // Summary Page
  doc.addPage();
  yPos = margin;

  doc.setTextColor(...primaryColor);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Service Summary & Findings", margin, yPos);
  yPos += 10;

  // System Condition
  doc.setFontSize(11);
  doc.text("Overall System Condition", margin, yPos);
  yPos += 6;

  const conditionText = report.system_condition
    ? report.system_condition.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Not assessed";

  let conditionColor: [number, number, number] = [60, 60, 60];
  if (report.system_condition === "satisfactory") conditionColor = [34, 197, 94];
  else if (report.system_condition === "requires_attention") conditionColor = [245, 158, 11];
  else if (report.system_condition === "unsatisfactory") conditionColor = [239, 68, 68];

  doc.setFontSize(12);
  doc.setTextColor(...conditionColor);
  doc.setFont("helvetica", "bold");
  doc.text(conditionText, margin, yPos);
  yPos += 12;

  // Text sections
  const textSections = [
    { title: "Defects Found", content: report.defects_found },
    { title: "Recommendations", content: report.recommendations },
    { title: "Work Carried Out", content: report.work_carried_out },
    { title: "Parts Used", content: report.parts_used },
    { title: "Additional Notes", content: report.notes },
  ];

  textSections.forEach(({ title, content }) => {
    if (content && content.trim()) {
      doc.setTextColor(...primaryColor);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(title, margin, yPos);
      yPos += 6;

      doc.setTextColor(60, 60, 60);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      const lines = doc.splitTextToSize(content, pageWidth - 2 * margin);
      doc.text(lines, margin, yPos);
      yPos += lines.length * 5 + 8;

      if (yPos > doc.internal.pageSize.getHeight() - 30) {
        doc.addPage();
        yPos = margin;
      }
    }
  });

  // Signature Section
  yPos = Math.max(yPos + 10, doc.internal.pageSize.getHeight() - 60);

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  doc.setTextColor(...primaryColor);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");

  // Engineer signature
  doc.text("Engineer Signature:", margin, yPos);
  doc.line(margin + 40, yPos + 2, margin + 90, yPos + 2);
  doc.setFont("helvetica", "normal");
  doc.text(report.engineer_name || "", margin + 40, yPos);

  // Client signature
  doc.text("Client Signature:", pageWidth / 2, yPos);
  doc.line(pageWidth / 2 + 35, yPos + 2, pageWidth / 2 + 85, yPos + 2);
  doc.text(report.client_name || "", pageWidth / 2 + 35, yPos);

  yPos += 15;

  // Next service due
  if (report.next_service_due) {
    doc.setFont("helvetica", "bold");
    doc.text("Next Service Due:", margin, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(format(new Date(report.next_service_due), "dd MMMM yyyy"), margin + 40, yPos);
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
    doc.text(
      `Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 10,
      { align: "right" }
    );
  }

  // Save
  const fileName = `Service_Report_${site.name.replace(/\s+/g, "_")}_${format(new Date(report.report_date), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

// Work Report PDF Generator
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
  const margin = 15;
  let yPos = margin;

  // Colors
  const primaryColor: [number, number, number] = [30, 58, 95]; // Deep navy
  const accentColor: [number, number, number] = [245, 158, 11]; // Amber

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 35, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Work Report", margin, 16);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Continuation Sheet", margin, 24);

  if (data.certificateNo) {
    doc.text(`Certificate No: ${data.certificateNo}`, pageWidth - margin - 60, 16);
  }
  doc.text(`Date: ${format(new Date(visitDate), "dd MMMM yyyy")}`, pageWidth - margin - 60, 24);

  yPos = 45;

  // Site Information Box
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 35, 3, 3, "F");

  doc.setTextColor(...primaryColor);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Site Name:", margin + 5, yPos + 8);
  doc.text("Site Address:", margin + 5, yPos + 16);
  doc.text("Site Contact:", margin + 5, yPos + 24);
  doc.text("Job Number:", pageWidth / 2 + 10, yPos + 8);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(site.name || "", margin + 30, yPos + 8);
  const fullAddress = [site.address, site.city, site.postcode].filter(Boolean).join(", ");
  doc.text(fullAddress || "-", margin + 35, yPos + 16);
  doc.text(site.contact_name || "-", margin + 35, yPos + 24);
  doc.text(data.jobNumber || "-", pageWidth / 2 + 35, yPos + 8);

  yPos += 42;

  // Job Details Section
  doc.setTextColor(...primaryColor);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Job Details", margin, yPos);
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(1);
  doc.line(margin, yPos + 2, margin + 25, yPos + 2);
  yPos += 10;

  // Job details grid
  const jobTypeLabel = data.jobType ? data.jobType.charAt(0).toUpperCase() + data.jobType.slice(1) : "-";
  
  const statusLabels: Record<string, string> = {
    operational: "Fully Operational",
    fault: "Fault Present",
    disabled: "Disabled",
    silenced: "Silenced",
    partial: "Partial Operation",
  };

  const leftCol = [
    ["Job Type:", jobTypeLabel],
    ["System Status (Arrival):", statusLabels[data.systemStatusArrival] || "-"],
    ["System Status (Departure):", statusLabels[data.systemStatusDeparture] || "-"],
  ];

  const rightCol = [
    ["Attendance Day:", data.attendanceDay || "-"],
    ["No. of Engineers:", data.numEngineers?.toString() || "-"],
    ["Start Time:", data.startTime || "-"],
    ["Finish Time:", data.finishTime || "-"],
  ];

  doc.setFontSize(9);
  let tempY = yPos;
  leftCol.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text(label, margin, tempY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(value, margin + 50, tempY);
    tempY += 7;
  });

  tempY = yPos;
  rightCol.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text(label, pageWidth / 2 + 10, tempY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(value, pageWidth / 2 + 50, tempY);
    tempY += 7;
  });

  yPos = Math.max(yPos + leftCol.length * 7, tempY) + 5;

  // Checkboxes
  const checkboxes = [
    { label: "Work Completed", checked: data.workCompleted },
    { label: "Return Required", checked: data.returnRequired },
    { label: "Survey Required", checked: data.surveyRequired },
    { label: "Quotation Required", checked: data.quotationRequired },
    { label: "RAMS Completed", checked: data.ramsCompleted },
    { label: "Log Book Entry", checked: data.logBookEntry },
  ];

  doc.setFillColor(250, 250, 250);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 18, 2, 2, "F");

  let xOffset = margin + 5;
  const checkboxWidth = (pageWidth - 2 * margin - 10) / 3;

  checkboxes.forEach((cb, index) => {
    if (index === 3) {
      xOffset = margin + 5;
      yPos += 9;
    }

    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.rect(xOffset, yPos + 2, 4, 4);

    if (cb.checked) {
      doc.setTextColor(34, 197, 94);
      doc.setFont("helvetica", "bold");
      doc.text("✓", xOffset + 0.5, yPos + 5.5);
    }

    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(cb.label, xOffset + 6, yPos + 5.5);

    xOffset += checkboxWidth;
  });

  yPos += 18;

  // Time Details
  if (data.travelTime || data.duration) {
    doc.setFontSize(9);
    doc.setTextColor(...primaryColor);
    doc.setFont("helvetica", "bold");
    doc.text("Travel Time (hrs):", margin, yPos);
    doc.text("Duration (hrs):", pageWidth / 2 + 10, yPos);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(data.travelTime || "-", margin + 40, yPos);
    doc.text(data.duration || "-", pageWidth / 2 + 45, yPos);
    yPos += 10;
  }

  // Works Report Section
  yPos += 5;
  doc.setTextColor(...primaryColor);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Works Report", margin, yPos);
  doc.setDrawColor(...accentColor);
  doc.line(margin, yPos + 2, margin + 30, yPos + 2);
  yPos += 8;

  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "normal");

  if (data.worksReport && data.worksReport.trim()) {
    const worksLines = doc.splitTextToSize(data.worksReport, pageWidth - 2 * margin);
    doc.text(worksLines, margin, yPos);
    yPos += worksLines.length * 4.5 + 5;
  } else {
    doc.text("No work description provided.", margin, yPos);
    yPos += 10;
  }

  // Further Action
  if (data.furtherAction && data.furtherAction.trim()) {
    doc.setTextColor(...primaryColor);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Further Action / Comments", margin, yPos);
    doc.setDrawColor(...accentColor);
    doc.line(margin, yPos + 2, margin + 55, yPos + 2);
    yPos += 8;

    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "normal");
    const actionLines = doc.splitTextToSize(data.furtherAction, pageWidth - 2 * margin);
    doc.text(actionLines, margin, yPos);
    yPos += actionLines.length * 4.5 + 5;
  }

  // Materials Section
  const materialsWithData = data.materials.filter((m) => m.name.trim());
  if (materialsWithData.length > 0) {
    if (yPos > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      yPos = margin;
    }

    doc.setTextColor(...primaryColor);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Materials Used", margin, yPos);
    doc.setDrawColor(...accentColor);
    doc.line(margin, yPos + 2, margin + 35, yPos + 2);
    yPos += 5;

    const materialsData = materialsWithData.map((m) => [
      m.name,
      m.qty || "-",
      m.cost ? `£${m.cost}` : "-",
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [["Material / Part", "Qty", "Cost"]],
      body: materialsData,
      theme: "striped",
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [60, 60, 60],
      },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 30, halign: "center" },
        2: { cellWidth: 30, halign: "right" },
      },
      margin: { left: margin, right: margin },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Signature Section
  if (yPos > doc.internal.pageSize.getHeight() - 50) {
    doc.addPage();
    yPos = margin;
  }

  yPos = Math.max(yPos, doc.internal.pageSize.getHeight() - 55);

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text("I confirm that all works have been carried out to a satisfactory standard.", margin, yPos);
  yPos += 10;

  // Engineer signature
  doc.setTextColor(...primaryColor);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Engineer:", margin, yPos);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(data.engineerName || "", margin + 22, yPos);
  doc.setDrawColor(150, 150, 150);
  doc.line(margin + 22, yPos + 2, margin + 70, yPos + 2);

  doc.setTextColor(...primaryColor);
  doc.setFont("helvetica", "bold");
  doc.text("Date:", margin + 75, yPos);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(format(new Date(visitDate), "dd/MM/yyyy"), margin + 85, yPos);

  yPos += 12;

  // Customer signature
  doc.setTextColor(...primaryColor);
  doc.setFont("helvetica", "bold");
  doc.text("Customer:", margin, yPos);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(data.customerName || "", margin + 25, yPos);
  doc.line(margin + 25, yPos + 2, margin + 73, yPos + 2);

  doc.setTextColor(...primaryColor);
  doc.setFont("helvetica", "bold");
  doc.text("Date:", margin + 75, yPos);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(format(new Date(visitDate), "dd/MM/yyyy"), margin + 85, yPos);

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
    doc.text(
      `Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 10,
      { align: "right" }
    );
  }

  // Save
  const fileName = `Work_Report_${site.name.replace(/\s+/g, "_")}_${format(new Date(visitDate), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

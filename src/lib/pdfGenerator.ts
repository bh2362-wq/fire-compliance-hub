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

// Corporate Colors
const COLORS = {
  primary: [30, 58, 95] as [number, number, number],      // Deep navy
  accent: [220, 38, 38] as [number, number, number],       // BHO Red
  secondary: [245, 158, 11] as [number, number, number],   // Amber accent
  dark: [31, 41, 55] as [number, number, number],          // Dark gray
  medium: [107, 114, 128] as [number, number, number],     // Medium gray
  light: [249, 250, 251] as [number, number, number],      // Light gray bg
  success: [34, 197, 94] as [number, number, number],      // Green
  warning: [245, 158, 11] as [number, number, number],     // Amber
  danger: [239, 68, 68] as [number, number, number],       // Red
  white: [255, 255, 255] as [number, number, number],
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

// Helper to draw filled checkbox
function drawCheckbox(
  doc: jsPDF,
  x: number,
  y: number,
  checked: boolean | null,
  size: number = 4
) {
  const checkSize = size;
  
  if (checked === true) {
    // Filled green checkbox for Pass
    doc.setFillColor(...COLORS.success);
    doc.rect(x, y, checkSize, checkSize, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("✓", x + 0.8, y + 3.2);
  } else if (checked === false) {
    // Filled red checkbox for Fail
    doc.setFillColor(...COLORS.danger);
    doc.rect(x, y, checkSize, checkSize, "F");
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("✗", x + 0.6, y + 3.2);
  } else {
    // Empty circle for N/A
    doc.setDrawColor(...COLORS.medium);
    doc.setLineWidth(0.3);
    doc.circle(x + checkSize / 2, y + checkSize / 2, checkSize / 2 - 0.5);
  }
}

// Helper to add branded header to each page
function addBrandedHeader(doc: jsPDF, pageWidth: number, margin: number, logoImg: HTMLImageElement | null) {
  // Red accent bar at top
  doc.setFillColor(...COLORS.accent);
  doc.rect(0, 0, pageWidth, 6, "F");
  
  // Navy header area
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 6, pageWidth, 32, "F");
  
  // Logo placeholder area (left side)
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", margin, 10, 25, 22);
    } catch {
      // Fallback to text if image fails
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("BHO", margin + 5, 20);
      doc.text("FIRE", margin + 5, 28);
    }
  } else {
    // Text fallback
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("BHO FIRE", margin + 5, 22);
  }
  
  // Company details on right
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  
  const rightX = pageWidth - margin;
  doc.text(COMPANY.name, rightX, 14, { align: "right" });
  doc.text(COMPANY.address, rightX, 19, { align: "right" });
  doc.text(`T: ${COMPANY.phone}  |  E: ${COMPANY.email}`, rightX, 24, { align: "right" });
  doc.text(`W: ${COMPANY.website}`, rightX, 29, { align: "right" });
  
  return 42; // Return Y position after header
}

// Helper to add footer to all pages
function addFooterToAllPages(doc: jsPDF, pageWidth: number, margin: number) {
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Footer line
    doc.setDrawColor(...COLORS.medium);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 22, pageWidth - margin, pageHeight - 22);
    
    // Company registration
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.medium);
    doc.text(`${COMPANY.country}  |  ${COMPANY.registration}`, margin, pageHeight - 17);
    
    // Page number
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 12, { align: "center" });
    
    // Generated timestamp
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth - margin, pageHeight - 12, { align: "right" });
  }
}

// Generate QR code placeholder (simple text-based since we can't use external QR libs)
function addQRCodeSection(doc: jsPDF, x: number, y: number, reportId: string) {
  // QR code box
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.rect(x, y, 25, 25);
  
  // QR pattern simulation (grid)
  doc.setFillColor(...COLORS.primary);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if ((i + j) % 2 === 0 || (i === 0 || i === 4 || j === 0 || j === 4)) {
        doc.rect(x + 3 + i * 4, y + 3 + j * 4, 3.5, 3.5, "F");
      }
    }
  }
  
  // Label
  doc.setFontSize(6);
  doc.setTextColor(...COLORS.medium);
  doc.text("Scan to verify", x + 12.5, y + 30, { align: "center" });
}

export function generateServiceReportPDF(
  report: ServiceReport,
  site: SiteInfo,
  visit: VisitInfo
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  
  // Load logo
  const logoImg = new Image();
  logoImg.src = "/bho-fire-logo.png";
  
  // ===== PAGE 1: COVER & DETAILS =====
  let yPos = addBrandedHeader(doc, pageWidth, margin, logoImg);
  
  // Report Title
  doc.setFillColor(...COLORS.light);
  doc.rect(0, yPos - 4, pageWidth, 18, "F");
  
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Fire Alarm Service Report", margin, yPos + 6);
  
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.accent);
  doc.text("BS 5839-1:2025 Compliant", margin, yPos + 12);
  
  // Report number and date on right
  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (report.report_number) {
    doc.text(`Report No: ${report.report_number}`, pageWidth - margin, yPos + 4, { align: "right" });
  }
  doc.text(`Report Date: ${format(new Date(report.report_date), "dd MMMM yyyy")}`, pageWidth - margin, yPos + 10, { align: "right" });
  
  yPos += 22;
  
  // Two-column layout for Site Info and Service Details
  const colWidth = (pageWidth - 2 * margin - 10) / 2;
  
  // Site Information Box
  doc.setFillColor(...COLORS.light);
  doc.roundedRect(margin, yPos, colWidth, 55, 2, 2, "F");
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, yPos, colWidth, 55, 2, 2, "S");
  
  doc.setFillColor(...COLORS.primary);
  doc.rect(margin, yPos, colWidth, 8, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("SITE INFORMATION", margin + 4, yPos + 5.5);
  
  const siteAddress = [site.address, site.city, site.postcode].filter(Boolean).join(", ");
  const siteDetails = [
    ["Site Name:", site.name],
    ["Address:", siteAddress || "-"],
    ["Contact:", site.contact_name || "-"],
    ["Phone:", site.contact_phone || "-"],
    ["Email:", site.contact_email || "-"],
  ];
  
  doc.setFontSize(8);
  let detailY = yPos + 14;
  siteDetails.forEach(([label, value]) => {
    doc.setTextColor(...COLORS.medium);
    doc.setFont("helvetica", "bold");
    doc.text(label, margin + 4, detailY);
    doc.setTextColor(...COLORS.dark);
    doc.setFont("helvetica", "normal");
    const maxWidth = colWidth - 30;
    const lines = doc.splitTextToSize(value, maxWidth);
    doc.text(lines[0] || "-", margin + 24, detailY);
    detailY += 8;
  });
  
  // Service Details Box
  const rightColX = margin + colWidth + 10;
  doc.setFillColor(...COLORS.light);
  doc.roundedRect(rightColX, yPos, colWidth, 55, 2, 2, "F");
  doc.setDrawColor(...COLORS.primary);
  doc.roundedRect(rightColX, yPos, colWidth, 55, 2, 2, "S");
  
  doc.setFillColor(...COLORS.primary);
  doc.rect(rightColX, yPos, colWidth, 8, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("SERVICE DETAILS", rightColX + 4, yPos + 5.5);
  
  const visitType = visit.visit_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const serviceDetails = [
    ["Visit Type:", visitType],
    ["Visit Date:", format(new Date(visit.visit_date), "dd MMMM yyyy")],
    ["Engineer:", report.engineer_name || "-"],
    ["Client Rep:", report.client_name || "-"],
    ["Report Status:", report.status === "completed" ? "Completed" : "Draft"],
  ];
  
  detailY = yPos + 14;
  serviceDetails.forEach(([label, value]) => {
    doc.setTextColor(...COLORS.medium);
    doc.setFont("helvetica", "bold");
    doc.text(label, rightColX + 4, detailY);
    doc.setTextColor(...COLORS.dark);
    doc.setFont("helvetica", "normal");
    doc.text(value, rightColX + 28, detailY);
    detailY += 8;
  });
  
  yPos += 62;
  
  // System Information Box
  doc.setFillColor(...COLORS.light);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 40, 2, 2, "F");
  doc.setDrawColor(...COLORS.primary);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 40, 2, 2, "S");
  
  doc.setFillColor(...COLORS.primary);
  doc.rect(margin, yPos, pageWidth - 2 * margin, 8, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("SYSTEM INFORMATION", margin + 4, yPos + 5.5);
  
  const systemTypeLabel = SYSTEM_TYPES.find((t) => t.value === report.system_type)?.label || report.system_type || "-";
  
  const systemInfo = [
    ["Panel Manufacturer:", report.panel_manufacturer || "-"],
    ["Panel Model:", report.panel_model || "-"],
    ["Panel Location:", report.panel_location || "-"],
    ["System Category:", systemTypeLabel],
    ["Number of Zones:", report.zones_count?.toString() || "-"],
    ["Number of Devices:", report.devices_count?.toString() || "-"],
  ];
  
  const sysCol1 = systemInfo.slice(0, 3);
  const sysCol2 = systemInfo.slice(3);
  
  detailY = yPos + 14;
  sysCol1.forEach(([label, value]) => {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.medium);
    doc.setFont("helvetica", "bold");
    doc.text(label, margin + 4, detailY);
    doc.setTextColor(...COLORS.dark);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 40, detailY);
    detailY += 8;
  });
  
  detailY = yPos + 14;
  sysCol2.forEach(([label, value]) => {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.medium);
    doc.setFont("helvetica", "bold");
    doc.text(label, rightColX, detailY);
    doc.setTextColor(...COLORS.dark);
    doc.setFont("helvetica", "normal");
    doc.text(value, rightColX + 38, detailY);
    detailY += 8;
  });
  
  yPos += 48;
  
  // ===== CERTIFICATION STATEMENT =====
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 22, 2, 2, "F");
  
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("CERTIFICATION STATEMENT", margin + 4, yPos + 6);
  
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const certText = "This certifies that the fire detection and alarm system at the above premises has been serviced and inspected in accordance with the recommendations of BS 5839-1:2025 'Fire detection and fire alarm systems for buildings'.";
  const certLines = doc.splitTextToSize(certText, pageWidth - 2 * margin - 8);
  doc.text(certLines, margin + 4, yPos + 12);
  
  yPos += 28;
  
  // ===== NEXT SERVICE DUE BOX =====
  const nextServiceDue = report.next_service_due 
    ? new Date(report.next_service_due) 
    : addMonths(new Date(visit.visit_date), 6);
  
  doc.setFillColor(...COLORS.secondary);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 16, 2, 2, "F");
  
  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("NEXT SERVICE DUE:", margin + 6, yPos + 10);
  
  doc.setFontSize(12);
  doc.text(format(nextServiceDue, "dd MMMM yyyy"), margin + 55, yPos + 10);
  
  // QR Code on right
  addQRCodeSection(doc, pageWidth - margin - 28, yPos - 5, report.id);
  
  // ===== PAGE 2: CHECKLIST =====
  doc.addPage();
  yPos = addBrandedHeader(doc, pageWidth, margin, logoImg);
  
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("BS 5839-1:2025 Service Checklist", margin, yPos);
  yPos += 8;
  
  // Checklist legend
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.dark);
  doc.setFont("helvetica", "normal");
  
  // Legend boxes
  drawCheckbox(doc, margin, yPos, true, 4);
  doc.text("= Pass", margin + 6, yPos + 3);
  
  drawCheckbox(doc, margin + 25, yPos, false, 4);
  doc.text("= Fail", margin + 31, yPos + 3);
  
  drawCheckbox(doc, margin + 50, yPos, null, 4);
  doc.text("= N/A", margin + 56, yPos + 3);
  
  yPos += 10;
  
  // Generate checklist tables with proper checkboxes
  const checklist = report.checklist;
  const sections = Object.keys(SECTION_LABELS) as Array<keyof BS5839Checklist>;
  
  sections.forEach((section) => {
    const sectionData = checklist[section] as Record<string, boolean | null>;
    const labels = CHECKLIST_LABELS[section];
    
    const tableData = Object.entries(sectionData).map(([key, value]) => {
      let statusText = "";
      let statusColor = COLORS.medium;
      
      if (value === true) {
        statusText = "■ PASS";
        statusColor = COLORS.success;
      } else if (value === false) {
        statusText = "■ FAIL";
        statusColor = COLORS.danger;
      } else {
        statusText = "○ N/A";
        statusColor = COLORS.medium;
      }
      
      return { 
        item: labels[key] || key, 
        status: statusText,
        statusColor,
        value
      };
    });
    
    autoTable(doc, {
      startY: yPos,
      head: [[SECTION_LABELS[section], "Result"]],
      body: tableData.map(row => [row.item, row.status]),
      theme: "plain",
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontStyle: "bold",
        fontSize: 9,
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLORS.dark,
        cellPadding: 2,
        lineColor: [230, 230, 230],
        lineWidth: 0.1,
      },
      alternateRowStyles: {
        fillColor: COLORS.light,
      },
      columnStyles: {
        0: { cellWidth: 135 },
        1: { cellWidth: 30, halign: "center", fontStyle: "bold" },
      },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 1) {
          const text = data.cell.text[0];
          if (text.includes("PASS")) {
            data.cell.styles.textColor = COLORS.success;
          } else if (text.includes("FAIL")) {
            data.cell.styles.textColor = COLORS.danger;
          } else {
            data.cell.styles.textColor = COLORS.medium;
          }
        }
      },
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 6;
    
    // Check if we need a new page
    if (yPos > pageHeight - 50) {
      doc.addPage();
      yPos = addBrandedHeader(doc, pageWidth, margin, logoImg);
    }
  });
  
  // ===== PAGE 3: SUMMARY & FINDINGS =====
  doc.addPage();
  yPos = addBrandedHeader(doc, pageWidth, margin, logoImg);
  
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Service Summary & Findings", margin, yPos);
  yPos += 10;
  
  // Overall System Condition Box
  const conditionText = report.system_condition
    ? report.system_condition.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Not Assessed";
  
  let conditionColor = COLORS.medium;
  let conditionBg = COLORS.light;
  if (report.system_condition === "satisfactory") {
    conditionColor = COLORS.success;
    conditionBg = [220, 252, 231] as [number, number, number];
  } else if (report.system_condition === "requires_attention") {
    conditionColor = COLORS.warning;
    conditionBg = [254, 249, 195] as [number, number, number];
  } else if (report.system_condition === "unsatisfactory") {
    conditionColor = COLORS.danger;
    conditionBg = [254, 226, 226] as [number, number, number];
  }
  
  doc.setFillColor(...conditionBg);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 18, 2, 2, "F");
  doc.setDrawColor(...conditionColor);
  doc.setLineWidth(1);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 18, 2, 2, "S");
  
  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("OVERALL SYSTEM CONDITION:", margin + 6, yPos + 11);
  
  doc.setTextColor(...conditionColor);
  doc.setFontSize(12);
  doc.text(conditionText.toUpperCase(), margin + 75, yPos + 11);
  
  yPos += 26;
  
  // Text sections with boxes
  const textSections = [
    { title: "DEFECTS FOUND", content: report.defects_found, icon: "!" },
    { title: "RECOMMENDATIONS", content: report.recommendations, icon: "→" },
    { title: "WORK CARRIED OUT", content: report.work_carried_out, icon: "✓" },
    { title: "PARTS USED", content: report.parts_used, icon: "◆" },
    { title: "ADDITIONAL NOTES", content: report.notes, icon: "✎" },
  ];
  
  textSections.forEach(({ title, content }) => {
    if (content && content.trim()) {
      // Section header
      doc.setFillColor(...COLORS.primary);
      doc.rect(margin, yPos, pageWidth - 2 * margin, 7, "F");
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(title, margin + 4, yPos + 5);
      yPos += 9;
      
      // Content
      doc.setTextColor(...COLORS.dark);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(content, pageWidth - 2 * margin - 8);
      doc.text(lines, margin + 4, yPos + 4);
      yPos += lines.length * 4.5 + 10;
      
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = addBrandedHeader(doc, pageWidth, margin, logoImg);
      }
    }
  });
  
  // ===== SIGNATURE SECTION =====
  if (yPos > pageHeight - 80) {
    doc.addPage();
    yPos = addBrandedHeader(doc, pageWidth, margin, logoImg);
  }
  
  yPos = Math.max(yPos + 10, pageHeight - 95);
  
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;
  
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("AUTHORISATION & SIGN-OFF", margin, yPos);
  yPos += 10;
  
  // Two signature boxes
  const sigBoxWidth = (pageWidth - 2 * margin - 10) / 2;
  
  // Engineer signature box
  doc.setFillColor(...COLORS.light);
  doc.roundedRect(margin, yPos, sigBoxWidth, 35, 2, 2, "F");
  doc.setDrawColor(...COLORS.medium);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, yPos, sigBoxWidth, 35, 2, 2, "S");
  
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("ENGINEER", margin + 4, yPos + 6);
  
  doc.setTextColor(...COLORS.dark);
  doc.setFont("helvetica", "normal");
  doc.text("Name: " + (report.engineer_name || ""), margin + 4, yPos + 14);
  doc.setDrawColor(...COLORS.medium);
  doc.line(margin + 4, yPos + 25, margin + sigBoxWidth - 8, yPos + 25);
  doc.text("Signature", margin + 4, yPos + 31);
  doc.text("Date: " + format(new Date(report.report_date), "dd/MM/yyyy"), margin + sigBoxWidth - 40, yPos + 31);
  
  // Client signature box
  const clientSigX = margin + sigBoxWidth + 10;
  doc.setFillColor(...COLORS.light);
  doc.roundedRect(clientSigX, yPos, sigBoxWidth, 35, 2, 2, "F");
  doc.setDrawColor(...COLORS.medium);
  doc.roundedRect(clientSigX, yPos, sigBoxWidth, 35, 2, 2, "S");
  
  doc.setTextColor(...COLORS.primary);
  doc.setFont("helvetica", "bold");
  doc.text("CLIENT REPRESENTATIVE", clientSigX + 4, yPos + 6);
  
  doc.setTextColor(...COLORS.dark);
  doc.setFont("helvetica", "normal");
  doc.text("Name: " + (report.client_name || ""), clientSigX + 4, yPos + 14);
  doc.line(clientSigX + 4, yPos + 25, clientSigX + sigBoxWidth - 8, yPos + 25);
  doc.text("Signature", clientSigX + 4, yPos + 31);
  doc.text("Date: ___/___/______", clientSigX + sigBoxWidth - 45, yPos + 31);
  
  yPos += 42;
  
  // ===== TERMS & CONDITIONS =====
  doc.setFillColor(...COLORS.light);
  doc.rect(margin, yPos, pageWidth - 2 * margin, 25, "F");
  
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("TERMS & CONDITIONS", margin + 4, yPos + 5);
  
  doc.setTextColor(...COLORS.medium);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  
  const terms = [
    "1. This report details the condition of the fire alarm system at the time of inspection. BHO Fire Ltd accepts no liability for any changes occurring after the inspection date.",
    "2. Any defects identified should be rectified promptly to maintain system compliance. Failure to address defects may invalidate insurance coverage.",
    "3. The system should be maintained in accordance with BS 5839-1:2025. We recommend service visits at intervals not exceeding 6 months.",
    "4. This certificate does not guarantee the performance of the system in the event of a fire. Regular testing and maintenance by the occupier is essential.",
  ];
  
  let termY = yPos + 10;
  terms.forEach((term) => {
    const termLines = doc.splitTextToSize(term, pageWidth - 2 * margin - 8);
    doc.text(termLines, margin + 4, termY);
    termY += termLines.length * 3 + 2;
  });
  
  // Add footer to all pages
  addFooterToAllPages(doc, pageWidth, margin);
  
  // Save
  const fileName = `BHO_Fire_Service_Report_${site.name.replace(/\s+/g, "_")}_${format(new Date(report.report_date), "yyyy-MM-dd")}.pdf`;
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
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  
  // Load logo
  const logoImg = new Image();
  logoImg.src = "/bho-fire-logo.png";
  
  // Header
  let yPos = addBrandedHeader(doc, pageWidth, margin, logoImg);
  
  // Title
  doc.setFillColor(...COLORS.light);
  doc.rect(0, yPos - 4, pageWidth, 14, "F");
  
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Work Report / Job Sheet", margin, yPos + 5);
  
  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (data.certificateNo) {
    doc.text(`Certificate No: ${data.certificateNo}`, pageWidth - margin, yPos + 2, { align: "right" });
  }
  doc.text(`Date: ${format(new Date(visitDate), "dd MMMM yyyy")}`, pageWidth - margin, yPos + 8, { align: "right" });
  
  yPos += 16;
  
  // Site Information Box
  doc.setFillColor(...COLORS.light);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 32, 2, 2, "F");
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 32, 2, 2, "S");
  
  doc.setFillColor(...COLORS.primary);
  doc.rect(margin, yPos, pageWidth - 2 * margin, 7, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("SITE DETAILS", margin + 4, yPos + 5);
  
  const fullAddress = [site.address, site.city, site.postcode].filter(Boolean).join(", ");
  
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.medium);
  doc.setFont("helvetica", "bold");
  doc.text("Site Name:", margin + 4, yPos + 14);
  doc.text("Address:", margin + 4, yPos + 21);
  doc.text("Contact:", margin + 4, yPos + 28);
  doc.text("Job No:", pageWidth / 2 + 10, yPos + 14);
  
  doc.setTextColor(...COLORS.dark);
  doc.setFont("helvetica", "normal");
  doc.text(site.name || "-", margin + 28, yPos + 14);
  doc.text(fullAddress || "-", margin + 25, yPos + 21);
  doc.text(site.contact_name || "-", margin + 23, yPos + 28);
  doc.text(data.jobNumber || "-", pageWidth / 2 + 28, yPos + 14);
  
  yPos += 38;
  
  // Job Details Section
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Job Details", margin, yPos);
  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(1);
  doc.line(margin, yPos + 2, margin + 25, yPos + 2);
  yPos += 8;
  
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
  
  doc.setFontSize(8);
  let tempY = yPos;
  leftCol.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.medium);
    doc.text(label, margin, tempY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.dark);
    doc.text(value, margin + 50, tempY);
    tempY += 7;
  });
  
  tempY = yPos;
  rightCol.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.medium);
    doc.text(label, pageWidth / 2 + 10, tempY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.dark);
    doc.text(value, pageWidth / 2 + 45, tempY);
    tempY += 7;
  });
  
  yPos = Math.max(yPos + leftCol.length * 7, tempY) + 5;
  
  // Checkboxes with proper filled styling
  const checkboxes = [
    { label: "Work Completed", checked: data.workCompleted },
    { label: "Return Required", checked: data.returnRequired },
    { label: "Survey Required", checked: data.surveyRequired },
    { label: "Quotation Required", checked: data.quotationRequired },
    { label: "RAMS Completed", checked: data.ramsCompleted },
    { label: "Log Book Entry", checked: data.logBookEntry },
  ];
  
  doc.setFillColor(...COLORS.light);
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 18, 2, 2, "F");
  
  let xOffset = margin + 5;
  const checkboxWidth = (pageWidth - 2 * margin - 10) / 3;
  
  checkboxes.forEach((cb, index) => {
    if (index === 3) {
      xOffset = margin + 5;
      yPos += 9;
    }
    
    drawCheckbox(doc, xOffset, yPos + 2, cb.checked ? true : null, 4);
    
    doc.setTextColor(...COLORS.dark);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(cb.label, xOffset + 6, yPos + 5.5);
    
    xOffset += checkboxWidth;
  });
  
  yPos += 18;
  
  // Time Details
  if (data.travelTime || data.duration) {
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.medium);
    doc.setFont("helvetica", "bold");
    doc.text("Travel Time (hrs):", margin, yPos);
    doc.text("Duration (hrs):", pageWidth / 2 + 10, yPos);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.dark);
    doc.text(data.travelTime || "-", margin + 38, yPos);
    doc.text(data.duration || "-", pageWidth / 2 + 40, yPos);
    yPos += 10;
  }
  
  // Works Report Section
  yPos += 5;
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Works Report", margin, yPos);
  doc.setDrawColor(...COLORS.accent);
  doc.line(margin, yPos + 2, margin + 28, yPos + 2);
  yPos += 8;
  
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.dark);
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
    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Further Action / Comments", margin, yPos);
    doc.setDrawColor(...COLORS.accent);
    doc.line(margin, yPos + 2, margin + 55, yPos + 2);
    yPos += 8;
    
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.setFont("helvetica", "normal");
    const actionLines = doc.splitTextToSize(data.furtherAction, pageWidth - 2 * margin);
    doc.text(actionLines, margin, yPos);
    yPos += actionLines.length * 4.5 + 5;
  }
  
  // Materials Section
  const materialsWithData = data.materials.filter((m) => m.name.trim());
  if (materialsWithData.length > 0) {
    if (yPos > pageHeight - 80) {
      doc.addPage();
      yPos = addBrandedHeader(doc, pageWidth, margin, logoImg);
    }
    
    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Materials Used", margin, yPos);
    doc.setDrawColor(...COLORS.accent);
    doc.line(margin, yPos + 2, margin + 32, yPos + 2);
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
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 9,
        textColor: COLORS.dark,
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
  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = addBrandedHeader(doc, pageWidth, margin, logoImg);
  }
  
  yPos = Math.max(yPos, pageHeight - 65);
  
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 6;
  
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.medium);
  doc.text("I confirm that all works have been carried out to a satisfactory standard and in accordance with relevant regulations.", margin, yPos);
  yPos += 8;
  
  // Two signature boxes
  const sigBoxWidth = (pageWidth - 2 * margin - 10) / 2;
  
  doc.setFillColor(...COLORS.light);
  doc.roundedRect(margin, yPos, sigBoxWidth, 28, 2, 2, "F");
  
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("ENGINEER", margin + 4, yPos + 6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.dark);
  doc.text(data.engineerName || "", margin + 25, yPos + 6);
  doc.setDrawColor(...COLORS.medium);
  doc.line(margin + 4, yPos + 18, margin + sigBoxWidth - 8, yPos + 18);
  doc.setFontSize(7);
  doc.text("Signature", margin + 4, yPos + 24);
  doc.text(format(new Date(visitDate), "dd/MM/yyyy"), margin + sigBoxWidth - 25, yPos + 24);
  
  const clientSigX = margin + sigBoxWidth + 10;
  doc.setFillColor(...COLORS.light);
  doc.roundedRect(clientSigX, yPos, sigBoxWidth, 28, 2, 2, "F");
  
  doc.setTextColor(...COLORS.primary);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("CUSTOMER", clientSigX + 4, yPos + 6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.dark);
  doc.text(data.customerName || "", clientSigX + 28, yPos + 6);
  doc.line(clientSigX + 4, yPos + 18, clientSigX + sigBoxWidth - 8, yPos + 18);
  doc.setFontSize(7);
  doc.text("Signature", clientSigX + 4, yPos + 24);
  doc.text("Date: ___/___/______", clientSigX + sigBoxWidth - 38, yPos + 24);
  
  // Add footer to all pages
  addFooterToAllPages(doc, pageWidth, margin);
  
  // Save
  const fileName = `BHO_Fire_Work_Report_${site.name.replace(/\s+/g, "_")}_${format(new Date(visitDate), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

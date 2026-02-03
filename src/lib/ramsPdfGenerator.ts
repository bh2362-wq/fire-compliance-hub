import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { RamsDocument, RamsHazard, MethodStatement } from "@/services/ramsService";

const CHARCOAL = "#2D3748";
const RED_ACCENT = "#E53E3E";
const LIGHT_GRAY = "#F7FAFC";

export async function generateRamsPDF(document: RamsDocument): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  // Header
  doc.setFillColor(CHARCOAL);
  doc.rect(0, 0, pageWidth, 35, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("RISK ASSESSMENT & METHOD STATEMENT", margin, 15);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(document.rams_number, margin, 25);
  doc.text(`Version ${document.version}`, pageWidth - margin - 30, 25);

  y = 45;

  // Document title
  doc.setTextColor(CHARCOAL);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(document.title, margin, y);
  y += 10;

  // Status badge
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const statusText = `Status: ${document.status.replace("_", " ").toUpperCase()}`;
  doc.text(statusText, margin, y);
  y += 8;

  // Document info table
  const infoData = [];
  if (document.site) {
    infoData.push(["Site", document.site.name]);
    if (document.site.address) {
      infoData.push(["Address", document.site.address]);
    }
  }
  if (document.review_date) {
    infoData.push(["Review Date", format(new Date(document.review_date), "dd/MM/yyyy")]);
  }
  infoData.push(["Created", format(new Date(document.created_at), "dd/MM/yyyy")]);

  if (infoData.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [],
      body: infoData,
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 40 },
        1: { cellWidth: "auto" },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Site-specific hazards
  if (document.site_specific_hazards) {
    doc.setFillColor(RED_ACCENT);
    doc.rect(margin, y, pageWidth - 2 * margin, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("SITE-SPECIFIC HAZARDS", margin + 3, y + 5.5);
    y += 12;

    doc.setTextColor(CHARCOAL);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(document.site_specific_hazards, pageWidth - 2 * margin);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 8;
  }

  // Access notes
  if (document.site_access_notes) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Site Access Notes:", margin, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(document.site_access_notes, pageWidth - 2 * margin);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 10;
  }

  // Risk Assessment section
  checkPageBreak();
  doc.setFillColor(CHARCOAL);
  doc.rect(margin, y, pageWidth - 2 * margin, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("RISK ASSESSMENT", margin + 3, y + 5.5);
  y += 12;

  // Hazards table
  const hazardHeaders = [
    ["Hazard", "Who Affected", "Existing Controls", "L", "S", "Risk", "Additional Controls", "L", "S", "Residual"],
  ];
  const hazardData = document.hazards.map((h) => [
    h.hazard || "-",
    h.who_affected || "-",
    h.existing_controls || "-",
    String(h.likelihood),
    String(h.severity),
    h.risk_level,
    h.additional_controls || "-",
    String(h.residual_likelihood),
    String(h.residual_severity),
    h.residual_risk,
  ]);

  autoTable(doc, {
    startY: y,
    head: hazardHeaders,
    body: hazardData,
    theme: "striped",
    headStyles: { fillColor: [45, 55, 72], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 20 },
      2: { cellWidth: 30 },
      3: { cellWidth: 8, halign: "center" },
      4: { cellWidth: 8, halign: "center" },
      5: { cellWidth: 15, halign: "center" },
      6: { cellWidth: 30 },
      7: { cellWidth: 8, halign: "center" },
      8: { cellWidth: 8, halign: "center" },
      9: { cellWidth: 15, halign: "center" },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      // Color risk levels
      if ((data.column.index === 5 || data.column.index === 9) && data.section === "body") {
        const value = String(data.cell.raw);
        if (value === "Low") data.cell.styles.textColor = [22, 163, 74];
        else if (value === "Medium") data.cell.styles.textColor = [202, 138, 4];
        else if (value === "High") data.cell.styles.textColor = [234, 88, 12];
        else if (value === "Very High") data.cell.styles.textColor = [220, 38, 38];
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Method Statement section
  checkPageBreak();
  doc.setFillColor(CHARCOAL);
  doc.rect(margin, y, pageWidth - 2 * margin, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("METHOD STATEMENT", margin + 3, y + 5.5);
  y += 12;

  const methodHeaders = [["Step", "Description", "Responsible", "Equipment"]];
  const methodData = document.method_statements.map((m, i) => [
    String(i + 1),
    m.description || "-",
    m.responsible_person || "-",
    m.equipment_required || "-",
  ]);

  autoTable(doc, {
    startY: y,
    head: methodHeaders,
    body: methodData,
    theme: "striped",
    headStyles: { fillColor: [45, 55, 72], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 15, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 35 },
      3: { cellWidth: 35 },
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // PPE Requirements
  if (document.ppe_requirements.length > 0) {
    checkPageBreak();
    doc.setFillColor(CHARCOAL);
    doc.rect(margin, y, pageWidth - 2 * margin, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("PPE REQUIREMENTS", margin + 3, y + 5.5);
    y += 12;

    doc.setTextColor(CHARCOAL);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const ppeText = document.ppe_requirements.join(" | ");
    const ppeLines = doc.splitTextToSize(ppeText, pageWidth - 2 * margin);
    doc.text(ppeLines, margin, y);
    y += ppeLines.length * 5 + 10;
  }

  // Emergency Procedures
  if (document.emergency_procedures) {
    checkPageBreak();
    doc.setFillColor(RED_ACCENT);
    doc.rect(margin, y, pageWidth - 2 * margin, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("EMERGENCY PROCEDURES", margin + 3, y + 5.5);
    y += 12;

    doc.setTextColor(CHARCOAL);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(document.emergency_procedures, pageWidth - 2 * margin);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 10;
  }

  // Signatures section
  checkPageBreak();
  doc.setFillColor(CHARCOAL);
  doc.rect(margin, y, pageWidth - 2 * margin, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("SIGNATURES", margin + 3, y + 5.5);
  y += 15;

  const signatureWidth = (pageWidth - 2 * margin - 10) / 3;
  const signatureHeight = 30;

  // Preparer
  doc.setTextColor(CHARCOAL);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Preparer", margin, y);
  y += 5;
  doc.setDrawColor(200, 200, 200);
  doc.rect(margin, y, signatureWidth, signatureHeight);
  if (document.preparer_signature) {
    try {
      doc.addImage(document.preparer_signature, "PNG", margin + 2, y + 2, signatureWidth - 4, signatureHeight - 8);
    } catch (e) {}
  }
  if (document.preparer_signed_at) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(format(new Date(document.preparer_signed_at), "dd/MM/yyyy HH:mm"), margin, y + signatureHeight + 4);
  }

  // Reviewer
  const reviewerX = margin + signatureWidth + 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Reviewer", reviewerX, y - 5);
  doc.rect(reviewerX, y, signatureWidth, signatureHeight);
  if (document.reviewer_signature) {
    try {
      doc.addImage(document.reviewer_signature, "PNG", reviewerX + 2, y + 2, signatureWidth - 4, signatureHeight - 8);
    } catch (e) {}
  }
  if (document.reviewer_signed_at) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(format(new Date(document.reviewer_signed_at), "dd/MM/yyyy HH:mm"), reviewerX, y + signatureHeight + 4);
  }

  // Client
  const clientX = margin + (signatureWidth + 5) * 2;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const clientLabel = document.client_name ? `Client (${document.client_name})` : "Client";
  doc.text(clientLabel, clientX, y - 5);
  doc.rect(clientX, y, signatureWidth, signatureHeight);
  if (document.client_signature) {
    try {
      doc.addImage(document.client_signature, "PNG", clientX + 2, y + 2, signatureWidth - 4, signatureHeight - 8);
    } catch (e) {}
  }
  if (document.client_signed_at) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(format(new Date(document.client_signed_at), "dd/MM/yyyy HH:mm"), clientX, y + signatureHeight + 4);
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `${document.rams_number} | Page ${i} of ${totalPages} | Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  // Save
  doc.save(`${document.rams_number}.pdf`);

  function checkPageBreak() {
    if (y > pageHeight - 50) {
      doc.addPage();
      y = margin;
    }
  }
}

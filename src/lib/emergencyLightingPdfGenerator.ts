/**
 * Emergency Lighting Certificate PDF (BS 5266-1 / EPM6C)
 * Uses the shared master cert template to match the service report style.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ELPayload } from "@/services/emergencyLightingService";
import {
  loadLogoData, loadCompany, san,
  drawCertHeader, drawPage2Header, drawCertTitle,
  drawSectionHeader, drawStandardBar, drawMasterFooter,
  kvTable, checkPage, statusFill, statusText,
  COLORS, MARGIN,
} from "./certPdfMasterTemplate";

const STANDARD = "BS 5266-1:2016  ·  BS EN 1838:2013  ·  BAFE SP203-1";
const TITLE = "Emergency Lighting Certificate";

export async function generateELCertificatePDF(p: ELPayload): Promise<void> {
  const company = await loadCompany();
  const logo = await loadLogoData(company.report_logo_url || company.company_logo_url);
  const companyName = san(company.company_name) || "BHO Fire Ltd";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const certRef = san(p.cert_reference || "EL-CERT");
  const status = san(p.overall_status || "—");

  // ── Page 1 ──────────────────────────────────────────────────────────────
  let y = drawCertHeader(doc, pw, logo, company);
  y = drawCertTitle(doc, pw, y + 8, certRef, "CERTIFICATE",
    `${TITLE} — ${p.form_type.replace(/_/g, " ").toUpperCase()}`, STANDARD);

  // Status pill
  doc.setFillColor(...statusFill(status));
  doc.setDrawColor(...statusText(status)); doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN, y, pw - MARGIN * 2, 12, 2, 2, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.setTextColor(...statusText(status));
  doc.text(status.toUpperCase(), pw / 2, y + 8, { align: "center" });
  y += 18;

  // 01 Premises & system
  y = drawSectionHeader(doc, pw, y, "01   PREMISES & SYSTEM DETAILS");
  y = kvTable(doc, pw, y, [
    ["Premises",            p.premises_name || "—"],
    ["Address",             `${p.premises_address || ""} ${p.premises_postcode || ""}`.trim() || "—"],
    ["Responsible Person",  p.responsible_person || "—"],
    ["System Type",         p.system_type || "—"],
    ["System Mode",         p.system_mode || "—"],
    ["Duration Rating",     p.duration_rating || "—"],
    ["Total Luminaires",    String(p.total_luminaires ?? "—")],
    ["Total Exit Signs",    String(p.total_exit_signs ?? "—")],
    ["Cert Date",           p.cert_date || "—"],
    ["Next Inspection",     p.next_inspection_date || "—"],
    ["EICR Reference",      p.eicr_reference || "—"],
  ]);

  // 02 Deviations
  const deviations = (p.checklist || []).filter(c => c.result === "7");
  y = checkPage(doc, pw, y, 20, logo, certRef, TITLE, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `02   DEVIATIONS (EPM6C Annex M)  (${deviations.length})`);
  if (deviations.length === 0) {
    y = kvTable(doc, pw, y, [["", "No deviations identified."]]);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Clause", "Description", "Notes"]],
      body: deviations.map(d => [san(d.clause), san(d.description), san(d.notes || "—")]) as never,
      theme: "grid",
      margin: { left: MARGIN, right: MARGIN, top: 58, bottom: 26 },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.textSec, lineColor: COLORS.border, lineWidth: 0.15 },
      alternateRowStyles: { fillColor: COLORS.bgLight },
      columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: pw - MARGIN * 2 - 18 - 50 }, 2: { cellWidth: 50 } },
      didDrawPage: () => {
        if (doc.getCurrentPageInfo().pageNumber > 1)
          drawPage2Header(doc, pw, logo, certRef, TITLE, STANDARD, company);
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // 03 Defects
  const defects = p.defects || [];
  y = checkPage(doc, pw, y, 20, logo, certRef, TITLE, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `03   DEFECTS & RECOMMENDATIONS  (${defects.length})`);
  if (defects.length === 0) {
    y = kvTable(doc, pw, y, [["", "No defects recorded."]]);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Location", "Description", "Priority", "Remediated"]],
      body: defects.map(d => [
        san(d.location), san(d.description), san(d.priority),
        d.remediated ? `Yes — ${d.remediation_date || ""}` : "No",
      ]) as never,
      theme: "grid",
      margin: { left: MARGIN, right: MARGIN, top: 58, bottom: 26 },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.textSec, lineColor: COLORS.border, lineWidth: 0.15 },
      alternateRowStyles: { fillColor: COLORS.bgLight },
      didDrawPage: () => {
        if (doc.getCurrentPageInfo().pageNumber > 1)
          drawPage2Header(doc, pw, logo, certRef, TITLE, STANDARD, company);
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // 04 Declaration / signatures (text block)
  y = checkPage(doc, pw, y, 50, logo, certRef, TITLE, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "04   DECLARATION");
  y = drawStandardBar(doc, pw, y, STANDARD, san(p.engineer_company || companyName));
  y = kvTable(doc, pw, y, [
    ["Engineer",  san(p.engineer_name || "—")],
    ["Engineer Date", san(p.engineer_date || "—")],
    ["Engineer Signature", san(p.engineer_signature || "—")],
    ["Client",   san(p.client_name || "—")],
    ["Client Date", san(p.client_date || "—")],
    ["Client Signature", san(p.client_signature || "—")],
  ]);

  drawMasterFooter(doc, pw);
  doc.save(`${certRef}.pdf`);
}

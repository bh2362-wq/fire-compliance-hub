/**
 * BS 5839-1 Commissioning Certificate PDF Generator (FD/03)
 * Drop-in replacement — function signature preserved.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { CommissioningPayload } from "@/services/newCertificateService";
import {
  loadLogoData, loadCompany, san,
  drawCertHeader, drawPage2Header, drawCertTitle,
  drawInfoCards, drawSiteBar, drawSectionHeader,
  drawStandardBar, drawSignatureBox,
  drawMasterFooter, kvTable,
  statusFill, statusText, checkPage,
  COLORS, MARGIN,
} from "./certPdfMasterTemplate";

const STANDARD = "BS 5839-1:2017+A2:2019 Annex C  ·  BAFE SP203-1 FD/03";
const TITLE    = "Commissioning Certificate";

export async function generateCommissioningCertificatePDF(
  payload: CommissioningPayload,
  options?: { autoSign?: boolean }
): Promise<{ base64: string; fileName: string }> {

  const company = await loadCompany();
  const logo    = await loadLogoData(company.report_logo_url || company.company_logo_url);
  const companyName = san(company.company_name) || "BHO Fire Ltd";

  const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw   = doc.internal.pageSize.getWidth();
  const certRef = san(payload.certificate_reference || "COMM-CERT");
  const dateStr = payload.date_of_commissioning
    ? format(new Date(payload.date_of_commissioning), "dd MMMM yyyy") : "";
  const engName = san(payload.engineer_name || "");
  const status  = san(payload.system_operational || "—");

  // ── PAGE 1 — COVER ────────────────────────────────────────────────────────
  let y = drawCertHeader(doc, pw, logo, company);

  y = drawCertTitle(doc, pw, y + 8,
    certRef, "CERTIFICATE", `Fire Alarm System — ${TITLE}`, STANDARD);

  y = drawInfoCards(doc, pw, y, [
    { label: "CERTIFICATE REFERENCE",     value: certRef },
    { label: "DATE OF COMMISSIONING",     value: dateStr },
    { label: "JOB NUMBER",                value: san(payload.job_number || "—") },
    { label: "INSTALLATION CERT REF",     value: san(payload.installation_cert_ref || "—") },
  ], [
    { label: "SITE",           value: san(payload.premises_name || "") },
    { label: "SITE CONTACT",   value: san(payload.responsible_person_name || "") },
    { label: "", value: san(payload.responsible_person_telephone || ""), plain: true },
    { label: "", value: san(payload.responsible_person_email || ""),     plain: true },
  ]);

  y = drawSiteBar(doc, pw, y,
    [payload.premises_address, payload.premises_postcode].filter(Boolean).join(", "));

  // System status
  y = drawSectionHeader(doc, pw, y, "OPERATIONAL STATUS");
  doc.setFillColor(...statusFill(status));
  doc.setDrawColor(...statusText(status)); doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN, y, pw - MARGIN * 2, 12, 2, 2, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.setTextColor(...statusText(status));
  doc.text(status.toUpperCase(), pw / 2, y + 8, { align: "center" });
  y += 18;

  y = drawStandardBar(doc, pw, y, STANDARD, engName || companyName);

  // ── PAGE 2 — TECHNICAL DATA ───────────────────────────────────────────────
  doc.addPage();
  y = drawPage2Header(doc, pw, logo, certRef,
    `Fire Alarm — ${TITLE}`, STANDARD, company);

  // 01 System Details
  y = drawSectionHeader(doc, pw, y, "01   PREMISES & SYSTEM DETAILS");
  y = kvTable(doc, pw, y, [
    ["Premises",            payload.premises_name || "—"],
    ["Address",             [payload.premises_address, payload.premises_postcode].filter(Boolean).join(", ") || "—"],
    ["System Categories",   (payload.system_categories ?? []).join(", ") || "—"],
    ["System Type",         payload.system_type || "—"],
    ["Panel Manufacturer",  payload.panel_manufacturer || "—"],
    ["Panel Model",         payload.panel_model || "—"],
    ["Panel Serial No.",    payload.panel_serial_number || "—"],
    ["Total Devices",       String(payload.total_devices_on_system ?? "—")],
  ]);

  // 02 Commissioning Tests
  const tests = payload.commissioning_tests ?? [];
  y = checkPage(doc, pw, y, 20, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `02   COMMISSIONING TEST CHECKLIST  (${tests.length} items)`);

  if (tests.length > 0) {
    const cw = pw - MARGIN * 2;
    autoTable(doc, {
      startY: y,
      head:   [["TEST ITEM", "BS CLAUSE", "RESULT", "NOTES"]],
      body:   tests.map(t => [
        san(t.item),
        san(t.bs_clause || "—"),
        { content: san(t.result || "—"),
          styles:  { halign: "center", fontStyle: "bold", fontSize: 8,
                     fillColor: statusFill(t.result), textColor: statusText(t.result) } },
        san(t.comment || ""),
      ]) as never,
      theme:  "grid",
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: cw,
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.textSec, lineColor: COLORS.border, lineWidth: 0.15 },
      alternateRowStyles: { fillColor: COLORS.bgLight },
      columnStyles: { 0: { cellWidth: cw * 0.45 }, 1: { cellWidth: 22 }, 2: { cellWidth: 20, halign: "center" }, 3: { cellWidth: cw * 0.55 - 42 } },
      didDrawPage: () => {
        const pg = doc.getCurrentPageInfo().pageNumber;
        if (pg > 1) drawPage2Header(doc, pw, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // 03 Device Commissioning
  y = checkPage(doc, pw, y, 25, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "03   DEVICE COMMISSIONING");
  y = kvTable(doc, pw, y, [
    ["Devices Commissioned",     String(payload.devices_commissioned ?? "—")],
    ["Devices Not Commissioned", String(payload.devices_not_commissioned ?? "—")],
    ["% Commissioned",           payload.pct_commissioned ? `${payload.pct_commissioned}%` : "—"],
    ["Reason (if not 100%)",     payload.devices_not_commissioned_reason || "—"],
  ]);

  // 04 Outstanding Items
  const outstanding = payload.outstanding_items ?? [];
  y = checkPage(doc, pw, y, 20, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `04   OUTSTANDING ITEMS  (${outstanding.length})`);
  if (outstanding.length === 0) {
    y = kvTable(doc, pw, y, [["", "No outstanding items."]]);
  } else {
    const cw = pw - MARGIN * 2;
    autoTable(doc, {
      startY: y,
      head:   [["#", "ITEM", "RESPONSIBLE", "DUE DATE"]],
      body:   outstanding.map((o, i) => [String(i+1), san(o.description), san(o.responsibility || "—"), san(o.target_date || "—")]) as never,
      theme:  "grid",
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: cw,
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.textSec, lineColor: COLORS.border, lineWidth: 0.15 },
      alternateRowStyles: { fillColor: COLORS.bgLight },
      columnStyles: { 0: { cellWidth: 8, halign: "center" }, 1: { cellWidth: cw * 0.55 }, 2: { cellWidth: cw * 0.25 }, 3: { cellWidth: cw * 0.2 - 8 } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // 05 RP Handover
  y = checkPage(doc, pw, y, 25, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "05   RESPONSIBLE PERSON HANDOVER");
  y = kvTable(doc, pw, y, [
    ["RP Briefed on Operation",   payload.rp_briefed_on_operation || "—"],
    ["Log Book Received",         payload.rp_received_logbook || "—"],
    ["As-Installed Drawings",     payload.rp_received_drawings || "—"],
    ["O&M Manual Received",       payload.rp_received_manual || "—"],
    ["Commissioning Engineer",    `${engName} — ${san(payload.company_name || companyName)}`],
    ["FIA Member No.",            payload.fia_member_number || "—"],
  ]);

  // 06 Declaration
  y = checkPage(doc, pw, y, 30, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "06   DECLARATION");
  doc.setFillColor(...COLORS.ambBg); doc.setDrawColor(...COLORS.ambBd); doc.setLineWidth(0.5);
  const declText = `I certify that commissioning of this fire alarm system has been carried out in accordance with ${STANDARD}. The system is in the condition stated. Outstanding items have been recorded and are the responsibility of the parties noted above.`;
  const lines = doc.splitTextToSize(declText, pw - MARGIN * 2 - 12);
  const declH = lines.length * 5.5 + 8;
  doc.roundedRect(MARGIN, y, pw - MARGIN * 2, declH, 2, 2, "FD");
  doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.ambDark);
  lines.forEach((l: string, i: number) => doc.text(l, MARGIN + 6, y + 6 + i * 5.5));
  y += declH + 6;

  y = checkPage(doc, pw, y, 50, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  drawSignatureBox(doc, pw, y,
    { name: engName,
      date: payload.engineer_signed_date ? format(new Date(payload.engineer_signed_date), "dd/MM/yyyy") : dateStr,
      sig:  options?.autoSign && !payload.engineer_signature ? `typed:${engName}` : payload.engineer_signature },
    { name: san(payload.rp_name_signed || ""),
      date: payload.rp_signed_date ? format(new Date(payload.rp_signed_date), "dd/MM/yyyy") : "",
      sig:  payload.rp_signature });

  drawMasterFooter(doc, pw);
  const fileName = `${certRef}.pdf`;
  doc.save(fileName);
  return { base64: (doc.output("datauristring").split(",")[1]) ?? "", fileName };
}

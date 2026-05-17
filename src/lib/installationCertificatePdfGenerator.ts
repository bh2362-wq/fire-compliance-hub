/**
 * BS 5839-1 Installation Certificate PDF Generator (FD/02)
 * Drop-in replacement — function signature preserved.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { InstallationPayload } from "@/services/newCertificateService";
import {
  loadLogoData, loadCompany, san,
  drawCertHeader, drawPage2Header, drawCertTitle,
  drawInfoCards, drawSiteBar, drawSectionHeader,
  drawStandardBar, drawSignatureBox,
  drawMasterFooter, kvTable, checkPage,
  COLORS, MARGIN,
} from "./certPdfMasterTemplate";

const TITLE = "Installation Certificate";

export async function generateInstallationCertificatePDF(
  payload: InstallationPayload,
  options?: { autoSign?: boolean }
): Promise<{ base64: string; fileName: string }> {

  const company = await loadCompany();
  const logo    = await loadLogoData(company.report_logo_url || company.company_logo_url);
  const companyName = san(company.company_name) || "BHO Fire Ltd";

  const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw   = doc.internal.pageSize.getWidth();
  const certRef = san(payload.certificate_reference || "INST-CERT");
  const dateStr = payload.date_of_completion
    ? format(new Date(payload.date_of_completion), "dd MMMM yyyy") : "";
  const baseStandard = san(payload.standard_installed_to || "BS 5839-1:2017+A2:2019");
  const standard = `${baseStandard} Annex E  ·  BAFE SP203-1 FD/02`;
  const engName  = san(payload.engineer_name || "");

  // ── PAGE 1 ────────────────────────────────────────────────────────────────
  let y = drawCertHeader(doc, pw, logo, company);

  y = drawCertTitle(doc, pw, y + 8,
    certRef, "CERTIFICATE", `Fire Alarm System — ${TITLE}`, standard);

  y = drawInfoCards(doc, pw, y, [
    { label: "CERTIFICATE REFERENCE", value: certRef },
    { label: "DATE OF COMPLETION",    value: dateStr },
    { label: "JOB NUMBER",            value: san(payload.job_number || "—") },
    { label: "WORK TYPE",             value: san(payload.work_type || "—") },
  ], [
    { label: "SITE",           value: san(payload.premises_name || "") },
    { label: "SITE CONTACT",   value: san(payload.responsible_person_name || "") },
    { label: "", value: san(payload.responsible_person_telephone || ""), plain: true },
    { label: "", value: san(payload.responsible_person_email || ""),     plain: true },
  ]);

  y = drawSiteBar(doc, pw, y,
    [payload.premises_address, payload.premises_postcode].filter(Boolean).join(", "));

  y = drawStandardBar(doc, pw, y, standard, engName || companyName);

  // ── PAGE 2 ────────────────────────────────────────────────────────────────
  doc.addPage();
  y = drawPage2Header(doc, pw, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);

  // 01 Premises & Responsible Person
  y = drawSectionHeader(doc, pw, y, "01   PREMISES & RESPONSIBLE PERSON");
  y = kvTable(doc, pw, y, [
    ["Premises Name",     payload.premises_name || "—"],
    ["Address",           [payload.premises_address, payload.premises_postcode].filter(Boolean).join(", ") || "—"],
    ["Occupancy Type",    payload.occupancy_type || "—"],
    ["Responsible Person",payload.responsible_person_name || "—"],
    ["RP Position",       payload.responsible_person_position || "—"],
    ["RP Telephone",      payload.responsible_person_telephone || "—"],
    ["RP Email",          payload.responsible_person_email || "—"],
  ]);

  // 02 System Details
  y = checkPage(doc, pw, y, 30, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
  y = drawSectionHeader(doc, pw, y, "02   SYSTEM DETAILS");
  y = kvTable(doc, pw, y, [
    ["System Categories",         (payload.system_categories ?? []).join(", ") || "—"],
    ["System Type",                payload.system_type || "—"],
    ["Panel Manufacturer",         payload.panel_manufacturer || "—"],
    ["Panel Model",                payload.panel_model || "—"],
    ["Panel Software Version",     payload.panel_software_version || "—"],
    ["Panel Serial Number",        payload.panel_serial_number || "—"],
    ["Number of Zones",            String(payload.number_of_zones ?? "—")],
    ["Total Devices Installed",    String(payload.total_devices_installed ?? "—")],
    ["Areas Covered",              payload.areas_covered || "—"],
    ["Areas Excluded",             payload.areas_excluded || "—"],
  ]);

  // 03 Installation Details
  y = checkPage(doc, pw, y, 30, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
  y = drawSectionHeader(doc, pw, y, "03   INSTALLATION DETAILS");
  y = kvTable(doc, pw, y, [
    ["Standard Installed To",      standard],
    ["Cable Types Used",           payload.cable_types_used || "—"],
    ["Standby Power Type",         payload.standby_power_type || "—"],
    ["Battery Capacity",           payload.battery_capacity_ah || "—"],
    ["As-Installed Drawings",      payload.as_installed_drawings_provided || "—"],
    ["O&M Manual Provided",        payload.om_manual_provided || "—"],
    ["Log Book Provided",          payload.logbook_provided || "—"],
    ["Description of Works",       payload.description_of_works || "—"],
  ]);

  // 04 Variations
  const variations = payload.variations ?? [];
  y = checkPage(doc, pw, y, 20, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
  y = drawSectionHeader(doc, pw, y, `04   VARIATIONS FROM SPECIFICATION  (${variations.length})`);
  if (payload.variations_present !== "Yes" || variations.length === 0) {
    y = kvTable(doc, pw, y, [["", payload.variations_present === "No" ? "No variations from specification." : "Not declared."]]);
  } else {
    const cw = pw - MARGIN * 2;
    autoTable(doc, {
      startY: y,
      head:   [["#", "VARIATION", "JUSTIFICATION", "AGREED?"]],
      body:   variations.map((v, i) => [String(i+1), san(v.description), san(v.justification), san(v.agreed_with_rp || "—")]) as never,
      theme:  "grid",
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: cw,
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.textSec, lineColor: COLORS.border, lineWidth: 0.15 },
      alternateRowStyles: { fillColor: COLORS.bgLight },
      columnStyles: { 0: { cellWidth: 8, halign: "center" }, 1: { cellWidth: cw*0.38 }, 2: { cellWidth: cw*0.38 }, 3: { cellWidth: cw*0.24-8 } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // 05 Outstanding Works
  const outstanding = payload.outstanding_works ?? [];
  y = checkPage(doc, pw, y, 20, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
  y = drawSectionHeader(doc, pw, y, `05   OUTSTANDING WORKS  (${outstanding.length})`);
  if (outstanding.length === 0) {
    y = kvTable(doc, pw, y, [["", "No outstanding works."]]);
  } else {
    const cw = pw - MARGIN * 2;
    autoTable(doc, {
      startY: y,
      head:   [["#", "DESCRIPTION", "RESPONSIBLE", "DUE DATE"]],
      body:   outstanding.map((o, i) => [String(i+1), san(o.description), san(o.responsibility||"—"), san(o.target_date||"—")]) as never,
      theme:  "grid",
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: cw,
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.textSec, lineColor: COLORS.border, lineWidth: 0.15 },
      alternateRowStyles: { fillColor: COLORS.bgLight },
      columnStyles: { 0: { cellWidth: 8, halign: "center" }, 1: { cellWidth: cw*0.55 }, 2: { cellWidth: cw*0.25 }, 3: { cellWidth: cw*0.2-8 } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // 06 Installer Declaration
  y = checkPage(doc, pw, y, 30, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
  y = drawSectionHeader(doc, pw, y, "06   INSTALLER DECLARATION");
  y = kvTable(doc, pw, y, [
    ["Company",              payload.company_name || companyName],
    ["FIA Member No.",       payload.fia_member_number || "—"],
    ["BAFE Registration",    payload.bafe_registration || "—"],
    ["Engineer",             engName],
    ["Engineer Position",    payload.engineer_position || "—"],
    ["Competency Confirmed", payload.engineer_competency_confirmed ? "YES — competent person under BS 5839-1" : "NO"],
  ]);

  doc.setFillColor(...COLORS.ambBg); doc.setDrawColor(...COLORS.ambBd); doc.setLineWidth(0.5);
  const declText = `I certify that this fire alarm system has been installed in accordance with ${standard} and the design specification. The system is in the condition stated. This certificate should be retained by the responsible person.`;
  const lines = doc.splitTextToSize(declText, pw - MARGIN * 2 - 12);
  const declH = lines.length * 5.5 + 8;
  doc.roundedRect(MARGIN, y, pw - MARGIN * 2, declH, 2, 2, "FD");
  doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.ambDark);
  lines.forEach((l: string, i: number) => doc.text(l, MARGIN + 6, y + 6 + i * 5.5));
  y += declH + 6;

  y = checkPage(doc, pw, y, 50, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
  drawSignatureBox(doc, pw, y,
    { name: engName,
      date: payload.engineer_signed_date ? format(new Date(payload.engineer_signed_date), "dd/MM/yyyy") : dateStr,
      sig:  options?.autoSign && !payload.engineer_signature ? `typed:${engName}` : payload.engineer_signature },
    { name: san(payload.rp_name_signed || ""),
      date: payload.rp_signed_date ? format(new Date(payload.rp_signed_date), "dd/MM/yyyy") : "",
      sig:  payload.rp_signature },
    "ACKNOWLEDGEMENT & SIGNATURES");

  drawMasterFooter(doc, pw);
  const fileName = `${certRef}.pdf`;
  doc.save(fileName);
  return { base64: (doc.output("datauristring").split(",")[1]) ?? "", fileName };
}

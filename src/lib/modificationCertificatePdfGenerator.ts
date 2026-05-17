/**
 * BS 5839-1 Modification Certificate PDF Generator (FD/04)
 * Drop-in replacement — function signature preserved.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ModificationPayload } from "@/services/newCertificateService";
import {
  loadLogoData, loadCompany, san,
  drawCertHeader, drawPage2Header, drawCertTitle,
  drawInfoCards, drawSiteBar, drawSectionHeader,
  drawStandardBar, drawSignatureBox,
  drawMasterFooter, kvTable, checkPage,
  statusFill, statusText, COLORS, MARGIN,
} from "./certPdfMasterTemplate";

const TITLE = "Modification Certificate";

export async function generateModificationCertificatePDF(
  payload: ModificationPayload,
  options?: { autoSign?: boolean }
): Promise<{ base64: string; fileName: string }> {

  const company = await loadCompany();
  const logo    = await loadLogoData(company.report_logo_url || company.company_logo_url);
  const companyName = san(company.company_name) || "BHO Fire Ltd";

  const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw   = doc.internal.pageSize.getWidth();
  const certRef = san(payload.certificate_reference || "MOD-CERT");
  const dateStr = payload.date_of_modification
    ? format(new Date(payload.date_of_modification), "dd MMMM yyyy") : "";
  const baseStandard = san(payload.standard_modified_to || "BS 5839-1:2017+A2:2019");
  const standard = `${baseStandard}  ·  BAFE SP203-1 FD/05`;
  const engName  = san(payload.engineer_name || "");
  const status   = san(payload.system_status || "—");

  // ── PAGE 1 ────────────────────────────────────────────────────────────────
  let y = drawCertHeader(doc, pw, logo, company);

  y = drawCertTitle(doc, pw, y + 8,
    certRef, "CERTIFICATE", `Fire Alarm System — ${TITLE}`, standard);

  y = drawInfoCards(doc, pw, y, [
    { label: "CERTIFICATE REFERENCE", value: certRef },
    { label: "DATE OF MODIFICATION",  value: dateStr },
    { label: "JOB NUMBER",            value: san(payload.job_number || "—") },
    { label: "SYSTEM STATUS",         value: status },
  ], [
    { label: "SITE",           value: san(payload.premises_name || "") },
    { label: "SITE CONTACT",   value: san(payload.responsible_person_name || "") },
    { label: "", value: san(payload.responsible_person_telephone || ""), plain: true },
    { label: "", value: san(payload.responsible_person_email || ""),     plain: true },
  ]);

  y = drawSiteBar(doc, pw, y,
    [payload.premises_address, payload.premises_postcode].filter(Boolean).join(", "));

  // Post-modification system status
  y = drawSectionHeader(doc, pw, y, "POST-MODIFICATION SYSTEM STATUS");
  doc.setFillColor(...statusFill(status));
  doc.setDrawColor(...statusText(status)); doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN, y, pw - MARGIN * 2, 12, 2, 2, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.setTextColor(...statusText(status));
  doc.text(status.toUpperCase(), pw / 2, y + 8, { align: "center" });
  y += 18;

  y = drawStandardBar(doc, pw, y, standard, engName || companyName);

  // ── PAGE 2 ────────────────────────────────────────────────────────────────
  doc.addPage();
  y = drawPage2Header(doc, pw, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);

  // 01 Premises & Existing System
  y = drawSectionHeader(doc, pw, y, "01   PREMISES & EXISTING SYSTEM REFERENCES");
  y = kvTable(doc, pw, y, [
    ["Premises",                   payload.premises_name || "—"],
    ["Address",                    [payload.premises_address, payload.premises_postcode].filter(Boolean).join(", ") || "—"],
    ["Original Installation Cert", payload.original_installation_cert_ref || "—"],
    ["Original Commissioning Cert",payload.original_commissioning_cert_ref || "—"],
    ["Previous Modification Cert", payload.previous_modification_cert_ref || "—"],
    ["Existing System Category",   (payload.existing_system_category ?? []).join(", ") || "—"],
    ["Existing Panel",             [payload.existing_panel_manufacturer, payload.existing_panel_model].filter(Boolean).join(" ") || "—"],
  ]);

  // 02 Modification Details
  y = checkPage(doc, pw, y, 35, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
  y = drawSectionHeader(doc, pw, y, "02   MODIFICATION DETAILS");
  const reasonStr = payload.reason_for_modification === "Other"
    ? `Other: ${san(payload.reason_other || "")}` : san(payload.reason_for_modification || "—");
  y = kvTable(doc, pw, y, [
    ["Reason for Modification",  reasonStr],
    ["Description",              payload.description_of_modifications || "—"],
    ["Devices Added",            payload.devices_added === "Yes" ? `Yes — ${payload.devices_added_count ?? "?"}` : "No"],
    ["Devices Removed",          payload.devices_removed === "Yes" ? `Yes — ${payload.devices_removed_count ?? "?"}` : "No"],
    ["Zones Added",              payload.zones_added === "Yes" ? `Yes — ${payload.zones_added_count ?? "?"}` : "No"],
    ["Zones Removed",            payload.zones_removed === "Yes" ? `Yes — ${payload.zones_removed_count ?? "?"}` : "No"],
    ["Panel Changes",            payload.panel_changes === "Yes" ? `Yes — ${san(payload.panel_changes_description || "")}` : "No"],
    ["Cable Additions",          payload.cable_additions === "Yes" ? `Yes — ${san(payload.cable_additions_description || "")}` : "No"],
    ["Ancillary Changes",        payload.ancillary_changes === "Yes" ? `Yes — ${san(payload.ancillary_description || "")}` : "No"],
  ].filter(([,v]) => v && v !== "No" || true) as [string, string][]);

  // 03 System After Modification
  y = checkPage(doc, pw, y, 25, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
  y = drawSectionHeader(doc, pw, y, "03   SYSTEM AFTER MODIFICATION");
  y = kvTable(doc, pw, y, [
    ["System Category Changed",   payload.system_category_changed || "—"],
    ["New System Category",       (payload.new_system_category ?? []).join(", ") || "—"],
    ["Areas Affected",            payload.areas_affected || "—"],
    ["Standard Modified To",      standard],
    ["Cable Types Used",          payload.cable_types_used || "—"],
  ]);

  // 04 Post-Modification Tests
  const tests = payload.post_mod_tests ?? [];
  y = checkPage(doc, pw, y, 20, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
  y = drawSectionHeader(doc, pw, y, `04   POST-MODIFICATION COMMISSIONING TESTS  (${tests.length})`);
  if (tests.length > 0) {
    const cw = pw - MARGIN * 2;
    autoTable(doc, {
      startY: y,
      head:   [["TEST ITEM", "BS CLAUSE", "RESULT", "NOTES"]],
      body:   tests.map(t => [
        san(t.item), san(t.bs_clause || "—"),
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
      columnStyles: { 0: { cellWidth: cw*0.45 }, 1: { cellWidth: 22 }, 2: { cellWidth: 20, halign: "center" }, 3: { cellWidth: cw*0.55-42 } },
      didDrawPage: () => {
        const pg = doc.getCurrentPageInfo().pageNumber;
        if (pg > 1) drawPage2Header(doc, pw, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    y = kvTable(doc, pw, y, [
      ["New Devices Tested",      String(payload.new_devices_tested ?? "—")],
      ["Modified Devices Tested", String(payload.modified_devices_tested ?? "—")],
    ]);
  }

  // 05 Variations
  const variations = payload.variations ?? [];
  y = checkPage(doc, pw, y, 20, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
  y = drawSectionHeader(doc, pw, y, `05   VARIATIONS  (${variations.length})`);
  if (variations.length === 0) {
    y = kvTable(doc, pw, y, [["", "No variations."]]);
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

  // 06 Outstanding Works
  const outstanding = payload.outstanding_works ?? [];
  y = checkPage(doc, pw, y, 20, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
  y = drawSectionHeader(doc, pw, y, `06   OUTSTANDING WORKS  (${outstanding.length})`);
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

  // 07 Modifier Declaration
  y = checkPage(doc, pw, y, 30, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
  y = drawSectionHeader(doc, pw, y, "07   MODIFIER DECLARATION");
  y = kvTable(doc, pw, y, [
    ["Company",              payload.company_name || companyName],
    ["FIA Member No.",       payload.fia_member_number || "—"],
    ["Engineer",             engName],
    ["Engineer Position",    payload.engineer_position || "—"],
    ["Competency Confirmed", payload.engineer_competency_confirmed ? "YES — competent person under BS 5839-1" : "NO"],
  ]);

  doc.setFillColor(...COLORS.ambBg); doc.setDrawColor(...COLORS.ambBd); doc.setLineWidth(0.5);
  const declText = `I certify that this modification to the fire alarm system has been carried out in accordance with ${standard}. The system is in the condition stated. The responsible person has been informed of all modifications carried out.`;
  const lines = doc.splitTextToSize(declText, pw - MARGIN * 2 - 12);
  const declH = lines.length * 5.5 + 8;
  doc.roundedRect(MARGIN, y, pw - MARGIN * 2, declH, 2, 2, "FD");
  doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.ambDark);
  lines.forEach((l: string, i: number) => doc.text(l, MARGIN + 6, y + 6 + i * 5.5));
  y += declH + 6;

  y = checkPage(doc, pw, y, 70, logo, certRef, `Fire Alarm — ${TITLE}`, standard, company);
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

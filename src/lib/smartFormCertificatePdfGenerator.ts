/**
 * BS 5839-1:2025 Inspection & Servicing Certificate PDF Generator
 * ================================================================
 * Drop-in replacement for the existing smartFormCertificatePdfGenerator.ts
 * All 13 form sections preserved. Design updated to match quotation style.
 *
 * Function signature unchanged — no other files need editing.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { BS5839Payload, percentageTested } from "@/services/smartFormService";
import {
  loadLogoData, loadCompany, san,
  drawCertHeader, drawPage2Header, drawCertTitle,
  drawInfoCards, drawSiteBar, drawSectionHeader,
  drawStatusSection, drawStandardBar, drawSignatureBox,
  drawMasterFooter, masterTable, kvTable,
  statusFill, statusText, checkPage,
  COLORS, MARGIN, FOOTER_RES,
} from "./certPdfMasterTemplate";

const STANDARD = "BS 5839-1:2025";
const TITLE    = "Inspection & Servicing Certificate";

export async function generateBS5839CertificatePDF(
  payload: BS5839Payload,
  options?: { autoSign?: boolean; engineerFallbackName?: string }
): Promise<{ base64: string; fileName: string }> {

  const company = await loadCompany();
  const logoUrl = company.report_logo_url || company.company_logo_url;
  const logo    = await loadLogoData(logoUrl);
  const companyName = san(company.company_name) || "BHO Fire Ltd";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw  = doc.internal.pageSize.getWidth();

  const certRef = san(payload.certificate_reference || "BS5839-CERT");
  const svcDate = payload.date_of_service
    ? format(new Date(payload.date_of_service), "dd MMMM yyyy") : "";
  const overall = san(payload.overall_status || "Pending");
  const engName = san(payload.engineer_declaration_name || payload.engineer_name || options?.engineerFallbackName || "");

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 1 — COVER
  // ══════════════════════════════════════════════════════════════════════════
  let y = drawCertHeader(doc, pw, logo, company);

  y = drawCertTitle(doc, pw, y + 8,
    certRef, "CERTIFICATE", `Fire Alarm System — ${TITLE}`, STANDARD);

  y = drawInfoCards(doc, pw, y, [
    { label: "CERTIFICATE REFERENCE", value: certRef },
    { label: "DATE OF SERVICE",       value: svcDate },
    { label: "JOB NUMBER",            value: san(payload.job_number || "—") },
    { label: "NEXT SERVICE DUE",      value: "As per service contract" },
  ], [
    { label: "SITE",           value: san(payload.premises_name || "") },
    { label: "SITE CONTACT",   value: san(payload.responsible_person_name || "") },
    { label: "", value: san(payload.responsible_person_contact || ""), plain: true },
    { label: "", value: san(payload.site_contact || ""), plain: true },
  ]);

  y = drawSiteBar(doc, pw, y, san(payload.premises_address || ""));

  const isOk = ["satisfactory", "satisfactory with observations"]
    .includes(overall.toLowerCase());
  y = drawStatusSection(doc, pw, y, overall, overall.toLowerCase() === "satisfactory");

  y = drawStandardBar(doc, pw, y, STANDARD, engName || companyName);

  drawSignatureBox(doc, pw, y,
    { name: engName,
      date: payload.engineer_signed_date ? format(new Date(payload.engineer_signed_date), "dd/MM/yyyy") : svcDate,
      sig:  options?.autoSign && !payload.engineer_signature ? `typed:${engName}` : payload.engineer_signature },
    { name: san(payload.client_name || ""),
      date: payload.client_signed_date ? format(new Date(payload.client_signed_date), "dd/MM/yyyy") : "",
      sig:  payload.client_signature });

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 2+ — TECHNICAL DATA
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = drawPage2Header(doc, pw, logo, certRef,
    `Fire Alarm — ${TITLE}`, STANDARD, company);

  // ── 1. Premises ────────────────────────────────────────────────────────────
  y = drawSectionHeader(doc, pw, y, "01   PREMISES DETAILS");
  y = kvTable(doc, pw, y, [
    ["Premises Name",        payload.premises_name || "—"],
    ["Premises Address",     payload.premises_address || "—"],
    ["Responsible Person",   payload.responsible_person_name || "—"],
    ["RP Contact",           payload.responsible_person_contact || "—"],
    ["Site Contact",         payload.site_contact || "—"],
  ]);

  // ── 2. System ──────────────────────────────────────────────────────────────
  y = checkPage(doc, pw, y, 40, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "02   SYSTEM DETAILS");
  y = kvTable(doc, pw, y, [
    ["System Categories",     (payload.system_categories ?? []).join(", ") || "—"],
    ["System Type",           payload.system_type || "—"],
    ["Panel Manufacturer",    payload.panel_manufacturer || "—"],
    ["Panel Model",           payload.panel_model || "—"],
    ["Number of Panels",      String(payload.number_of_panels ?? "—")],
    ["Approx. Devices",       String(payload.approx_number_of_devices ?? "—")],
    ["Areas Covered",         payload.areas_covered || "—"],
    ["Limitations/Exclusions",payload.system_limitations || "—"],
  ]);

  // ── 3. Service Organisation ────────────────────────────────────────────────
  y = checkPage(doc, pw, y, 30, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "03   SERVICE ORGANISATION");
  y = kvTable(doc, pw, y, [
    ["Company",           payload.company_name || companyName],
    ["Company Address",   payload.company_address || [company.address, company.city, company.postcode].filter(Boolean).join(", ") || "—"],
    ["Engineer Name",     payload.engineer_name || "—"],
    ["Competency",        payload.engineer_competency_confirmed ? "Confirmed — competent person under BS 5839-1" : "Not confirmed"],
  ]);

  // ── 4. Inspection Checklist ────────────────────────────────────────────────
  const checklist = payload.checklist ?? [];
  y = checkPage(doc, pw, y, 20, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `04   INSPECTION & SERVICING CHECKLIST  (${checklist.length} items)`);

  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...COLORS.textSec);
  doc.text("As recommended in BAFE SP203-1 Clause 9.8 & BS 5839-1:2025 Clause 45", MARGIN, y + 3);
  y += 8;

  if (checklist.length > 0) {
    const cw = pw - MARGIN * 2;
    const colW = { req: cw - 18 - 18 - 18, yes: 18, no: 18, na: 18 };

    type GroupedSection = { name: string; items: typeof checklist };
    const grouped = checklist.reduce<GroupedSection[]>((acc, item) => {
      const sName = (item as any).section || "General";
      const existing = acc.find(s => s.name === sName);
      if (existing) { existing.items.push(item); }
      else { acc.push({ name: sName, items: [item] }); }
      return acc;
    }, []);

    type BodyRow = (string | { content: string; styles: object })[];
    const body: BodyRow[] = [];
    const sectionFill = (COLORS as any).charcoalDark ?? [45, 45, 48];
    for (const section of grouped) {
      body.push([
        { content: section.name.toUpperCase(), styles: { fontStyle: "bold" as const, fontSize: 7.5, fillColor: sectionFill, textColor: [255, 255, 255] as [number, number, number] } },
        { content: "", styles: { fillColor: sectionFill } },
        { content: "", styles: { fillColor: sectionFill } },
        { content: "", styles: { fillColor: sectionFill } },
      ]);
      for (const c of section.items) {
        const isYes = c.status === "Pass" || c.status === "YES";
        const isNo  = c.status === "Fail" || c.status === "NO";
        const isNA  = c.status === "N/A";
        body.push([
          san(c.label),
          { content: isYes ? "✓" : "", styles: { halign: "center" as const, fontStyle: "bold" as const, fontSize: 9, fillColor: isYes ? [220, 252, 231] as [number,number,number] : [255,255,255] as [number,number,number], textColor: isYes ? [22, 163, 74] as [number,number,number] : [200,200,200] as [number,number,number] } },
          { content: isNo  ? "✗" : "", styles: { halign: "center" as const, fontStyle: "bold" as const, fontSize: 9, fillColor: isNo  ? [254, 226, 226] as [number,number,number] : [255,255,255] as [number,number,number], textColor: isNo  ? [185, 28, 28]  as [number,number,number] : [200,200,200] as [number,number,number] } },
          { content: isNA  ? "—" : "", styles: { halign: "center" as const, fontStyle: "normal" as const, fontSize: 8, fillColor: isNA  ? [241, 245, 249] as [number,number,number] : [255,255,255] as [number,number,number], textColor: isNA  ? [100, 116, 139] as [number,number,number] : [200,200,200] as [number,number,number] } },
        ]);
        if (isNo && c.comment) {
          body.push([
            { content: `  ↳ ${san(c.comment)}`, styles: { fontStyle: "italic" as const, fontSize: 7, textColor: [185, 28, 28] as [number,number,number], fillColor: [254, 242, 242] as [number,number,number] } },
            { content: "", styles: { fillColor: [254, 242, 242] as [number,number,number] } },
            { content: "", styles: { fillColor: [254, 242, 242] as [number,number,number] } },
            { content: "", styles: { fillColor: [254, 242, 242] as [number,number,number] } },
          ]);
        }
      }
    }

    autoTable(doc, {
      startY: y,
      head: [[
        { content: "Requirement", styles: { halign: "left" } },
        { content: "YES", styles: { halign: "center" } },
        { content: "NO",  styles: { halign: "center" } },
        { content: "N/A", styles: { halign: "center" } },
      ]],
      body: body as never,
      theme: "grid",
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: cw,
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "center",
      },
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        textColor: COLORS.textSec,
        lineColor: COLORS.border,
        lineWidth: 0.15,
        overflow: "linebreak",
      },
      columnStyles: {
        0: { cellWidth: colW.req },
        1: { cellWidth: colW.yes, halign: "center" },
        2: { cellWidth: colW.no,  halign: "center" },
        3: { cellWidth: colW.na,  halign: "center" },
      },
      didDrawPage: () => {
        const pg = doc.getCurrentPageInfo().pageNumber;
        if (pg > 1) drawPage2Header(doc, pw, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── 5. Device Testing ──────────────────────────────────────────────────────
  y = checkPage(doc, pw, y, 30, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "05   DEVICE TESTING");
  const pct  = percentageTested(payload);
  const meth = payload.testing_method === "Other"
    ? `Other: ${san(payload.testing_method_other || "")}` : san(payload.testing_method || "—");
  y = kvTable(doc, pw, y, [
    ["Total Devices on System",   String(payload.total_devices ?? "—")],
    ["Devices Tested This Visit", String(payload.devices_tested ?? "—")],
    ["Percentage Tested",         `${pct}%`],
    ["Testing Method",            meth],
    ["Devices Not Tested",        payload.devices_not_tested || "—"],
    ["Reason Not Tested",         payload.reason_not_tested || "—"],
  ]);

  // ── 6. Standby Power ──────────────────────────────────────────────────────
  y = checkPage(doc, pw, y, 30, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "06   STANDBY POWER CHECK");
  y = kvTable(doc, pw, y, [
    ["Battery Type",           payload.battery_type || "—"],
    ["Battery Age (years)",    String(payload.battery_age_years ?? "—")],
    ["Battery Voltage",        payload.battery_voltage || "—"],
    ["Charger Voltage",        payload.charger_voltage || "—"],
    ["Charger Operational",    payload.charger_operational || "—"],
    ["Capacity Adequate",      payload.battery_capacity_adequate || "—"],
    ["Test Method",            payload.test_method || "—"],
    ["Test Device",            `${san(payload.test_device || "ACT Chrome")} (S/N: ${san(payload.test_device_serial || "813AK1203058")})`],
  ]);

  // ── 7. False Alarm Record ──────────────────────────────────────────────────
  y = checkPage(doc, pw, y, 25, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "07   FALSE ALARM RECORD");
  y = kvTable(doc, pw, y, [
    ["False Alarms Since Last Visit", String(payload.false_alarm_count ?? "0")],
    ["Known Causes",                  payload.false_alarm_causes || "—"],
    ["Actions Taken",                 payload.false_alarm_actions || "—"],
    ["Recommendations",               payload.false_alarm_recommendations || "—"],
  ]);

  // ── 8. Defects ────────────────────────────────────────────────────────────
  const defects = payload.defects ?? [];
  y = checkPage(doc, pw, y, 20, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `08   DEFECTS / NON-COMPLIANCES  (${defects.length})`);

  if (defects.length === 0) {
    y = kvTable(doc, pw, y, [["", "No defects recorded at this visit."]]);
  } else {
    const cw = pw - MARGIN * 2;
    autoTable(doc, {
      startY: y,
      head:   [["#", "LOCATION", "DESCRIPTION", "SEVERITY", "BS REF", "RECOMMENDED ACTION", "STATUS"]],
      body:   defects.map((d, i) => [
        String(i + 1),
        san(d.location),
        san(d.description),
        { content: san(d.severity || "—"),
          styles:  { halign: "center", fontStyle: "bold", fontSize: 7.5,
                     fillColor: statusFill(d.severity), textColor: statusText(d.severity) } },
        san(d.bs_reference || "—"),
        san(d.recommended_action),
        san(d.status || "Open"),
      ]) as never,
      theme:  "grid",
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: cw,
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 }, textColor: COLORS.textSec, lineColor: COLORS.border, lineWidth: 0.15 },
      alternateRowStyles: { fillColor: COLORS.bgLight },
      columnStyles: {
        0: { cellWidth: 7,  halign: "center" },
        1: { cellWidth: 25 },
        2: { cellWidth: cw * 0.27 },
        3: { cellWidth: 18, halign: "center" },
        4: { cellWidth: 16 },
        5: { cellWidth: cw - 7 - 25 - cw*0.27 - 18 - 16 - 20 },
        6: { cellWidth: 20, halign: "center" },
      },
      didDrawPage: () => {
        const pg = doc.getCurrentPageInfo().pageNumber;
        if (pg > 1) drawPage2Header(doc, pw, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── 9. Variations ─────────────────────────────────────────────────────────
  const variations = payload.variations ?? [];
  y = checkPage(doc, pw, y, 20, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "09   VARIATIONS FROM BS 5839-1");
  if (payload.variations_present !== "Yes" || variations.length === 0) {
    y = kvTable(doc, pw, y, [["", payload.variations_present === "No" ? "No variations from BS 5839-1." : "Not declared."]]);
  } else {
    const cw = pw - MARGIN * 2;
    autoTable(doc, {
      startY: y,
      head:   [["#", "VARIATION", "JUSTIFICATION", "AGREED?"]],
      body:   variations.map((v, i) => [
        String(i + 1), san(v.description), san(v.justification),
        { content: v.agreed_with_responsible_person || "—",
          styles:  { halign: "center", fontStyle: "bold" } },
      ]) as never,
      theme:  "grid",
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: cw,
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 7.5 },
      styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.textSec, lineColor: COLORS.border, lineWidth: 0.15 },
      alternateRowStyles: { fillColor: COLORS.bgLight },
      columnStyles: { 0: { cellWidth: 8, halign: "center" }, 1: { cellWidth: cw * 0.42 }, 2: { cellWidth: cw * 0.42 - 8 }, 3: { cellWidth: cw * 0.16 } },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── 10. System Status Summary ─────────────────────────────────────────────
  y = checkPage(doc, pw, y, 25, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "10   SYSTEM STATUS");
  const statusBg = statusFill(overall);
  const statusTc = statusText(overall);
  autoTable(doc, {
    startY: y,
    body: [[{
      content: overall.toUpperCase(),
      styles: { halign: "center", fontStyle: "bold", fontSize: 12,
                fillColor: statusBg, textColor: statusTc, cellPadding: 5 },
    }]],
    theme: "grid",
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: pw - MARGIN * 2,
    styles: { lineColor: COLORS.border, lineWidth: 0.15 },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // Work carried out, parts used, final remarks, next service
  const statusRows: [string, string][] = [];
  if (payload.work_carried_out?.trim())
    statusRows.push(["Work Carried Out", payload.work_carried_out]);
  if (payload.parts_used?.trim())
    statusRows.push(["Parts Used / Replaced", payload.parts_used]);
  statusRows.push(["Final Remarks", payload.final_remarks || "—"]);
  if (payload.next_service_date)
    statusRows.push(["Next Service Due", format(new Date(payload.next_service_date), "dd MMM yyyy")]);

  y = kvTable(doc, pw, y, statusRows);

  // ── 11. Engineer Declaration ───────────────────────────────────────────────
  y = checkPage(doc, pw, y, 30, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "11   ENGINEER DECLARATION");

  doc.setFillColor(...COLORS.ambBg);
  doc.setDrawColor(...COLORS.ambBd); doc.setLineWidth(0.5);
  const declText = "I certify that the inspection and servicing of the fire detection and fire alarm system has been carried out in accordance with BS 5839-1:2025 and that the system status is as stated above.";
  const declLines = doc.splitTextToSize(declText, pw - MARGIN * 2 - 12);
  const declH = declLines.length * 5.5 + 8;
  doc.roundedRect(MARGIN, y, pw - MARGIN * 2, declH, 2, 2, "FD");
  doc.setFont("helvetica", "italic"); doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.ambDark);
  declLines.forEach((l: string, i: number) => doc.text(l, MARGIN + 6, y + 6 + i * 5.5));
  y += declH + 6;

  // ── 12. Signatures ────────────────────────────────────────────────────────
  y = checkPage(doc, pw, y, 50, logo, certRef, `Fire Alarm — ${TITLE}`, STANDARD, company);
  drawSignatureBox(doc, pw, y,
    { name: engName,
      date: payload.engineer_signed_date ? format(new Date(payload.engineer_signed_date), "dd/MM/yyyy") : svcDate,
      sig:  options?.autoSign && !payload.engineer_signature ? `typed:${engName}` : payload.engineer_signature },
    { name: san(payload.client_name || ""),
      date: payload.client_signed_date ? format(new Date(payload.client_signed_date), "dd/MM/yyyy") : "",
      sig:  payload.client_signature });

  // ── Footer & output ───────────────────────────────────────────────────────
  drawMasterFooter(doc, pw);
  const fileName = `${certRef}.pdf`;
  doc.save(fileName);
  const base64 = (doc.output("datauristring").split(",")[1]) ?? "";
  return { base64, fileName };
}

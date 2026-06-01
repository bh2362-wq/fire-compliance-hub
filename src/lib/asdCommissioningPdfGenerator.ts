/**
 * ASD Commissioning / Annual Service Certificate PDF (BS EN 54-20)
 * Uses the shared master cert template to match the service report style.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ASDPayload } from "@/services/asdCommissioningService";
import {
  loadLogoData, loadCompany, san,
  drawCertHeader, drawPage2Header, drawCertTitle,
  drawSectionHeader, drawStandardBar, drawMasterFooter,
  kvTable, checkPage, statusFill, statusText,
  COLORS, MARGIN,
} from "./certPdfMasterTemplate";

const STANDARD = "BS EN 54-20:2006+A1:2012  ·  FIA Code of Practice ASD Systems";
const TITLE = "Aspirating Smoke Detection — Annual Service Certificate";

export async function generateASDCommissioningPDF(p: ASDPayload): Promise<{ base64: string; fileName: string }> {
  const company = await loadCompany();
  const logo = await loadLogoData(company.report_logo_url || company.company_logo_url);
  const companyName = san(company.company_name) || "BHO Fire Ltd";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const certRef = san(p.cert_reference || "ASD-CERT");
  const status = san(p.overall_status || "—");
  const typeTag = p.installation_type === "modification"
    ? "Modification of Existing System" : "New Installation";

  // ── Page 1 ──────────────────────────────────────────────────────────────
  let y = drawCertHeader(doc, pw, logo, company);
  y = drawCertTitle(doc, pw, y + 8, certRef, "CERTIFICATE",
    `${TITLE} — ${typeTag} (Class ${p.sensitivity_class})`, STANDARD);

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
    ["Premises",           san(p.premises_name)],
    ["Address",            `${san(p.premises_address)} ${san(p.premises_postcode)}`.trim() || "—"],
    ["Responsible Person", san(p.responsible_person) || "—"],
    ["Installation Type",  typeTag],
    ["ASD Manufacturer",   san(p.asd_manufacturer) || "—"],
    ["ASD Model",          san(p.asd_model) || "—"],
    ["Serial Number",      san(p.asd_serial_number) || "—"],
    ["Software Version",   san(p.software_version) || "—"],
    ["EN 54-20 Class",     `Class ${p.sensitivity_class} — max transport ${p.transport_time_limit}s`],
    ["Pipe Material",      san(p.pipe_material) || "—"],
    ["No. Pipes",          String(p.num_pipes ?? "—")],
    ["Total Sampling Holes", String(p.num_sampling_holes ?? "—")],
    ["Protected Area",     san(p.protected_area) || "—"],
    ["Cert Date",          san(p.cert_date) || "—"],
  ]);

  // 02 Pre-modification record
  let secN = 2;
  if (p.installation_type === "modification") {
    y = checkPage(doc, pw, y, 20, logo, certRef, TITLE, STANDARD, company);
    y = drawSectionHeader(doc, pw, y, `0${secN++}   PRE-MODIFICATION RECORD`);
    y = kvTable(doc, pw, y, [
      ["Existing Configuration", san(p.pre_mod_config_description) || "—"],
      ["Modification Description", san(p.modification_description) || "—"],
      ["Areas Affected", san(p.areas_affected) || "—"],
    ]);
  }

  // Flow rate verification
  y = checkPage(doc, pw, y, 25, logo, certRef, TITLE, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `0${secN++}   FLOW RATE VERIFICATION — BASELINE READINGS`);
  doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...COLORS.textMut);
  doc.text("Future maintenance: flow readings must be within ±20% of these baseline values (FIA CoP §8.3)", MARGIN, y);
  y += 5;
  autoTable(doc, {
    startY: y,
    head: [["Pipe Reference", "Design (L/min)", "Measured (L/min)", "Deviation", "Within ±20%", "Notes"]],
    body: (p.pipe_records || []).map(pr => {
      const dev = pr.design_flow_lpm > 0
        ? Math.abs((pr.measured_flow_lpm - pr.design_flow_lpm) / pr.design_flow_lpm * 100).toFixed(1) + "%"
        : "—";
      return [
        san(pr.pipe_reference),
        pr.design_flow_lpm.toFixed(1),
        pr.measured_flow_lpm.toFixed(1),
        dev,
        pr.within_20_percent ? "Yes" : pr.measured_flow_lpm > 0 ? "No" : "—",
        san(pr.notes),
      ];
    }) as never,
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

  // Transport time
  y = checkPage(doc, pw, y, 25, logo, certRef, TITLE, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `0${secN++}   TRANSPORT TIME TEST`);
  y = kvTable(doc, pw, y, [
    ["Furthest Sampling Hole", san(p.furthest_hole_location) || "—"],
    ["Test Method", san(p.transport_time_test_method) || "—"],
    ["Class Limit", `Class ${p.sensitivity_class} — ${p.transport_time_limit}s maximum`],
    ["Measured Time", `${p.transport_time_measured_s}s — ${
      p.transport_time_pass ? "PASS" : p.transport_time_measured_s > 0 ? "FAIL" : "Not recorded"}`],
  ]);

  // Alarm thresholds
  y = checkPage(doc, pw, y, 25, logo, certRef, TITLE, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `0${secN++}   ALARM THRESHOLDS & VERIFICATION`);
  autoTable(doc, {
    startY: y,
    head: [["Level", "Set Value (obscuration)", "Test Result", "Notes"]],
    body: (p.thresholds || []).map(t => [t.level, san(t.set_value_obs) || "—", san(t.test_result), san(t.notes)]) as never,
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

  // Fault tests & panel integration
  y = checkPage(doc, pw, y, 35, logo, certRef, TITLE, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `0${secN++}   FAULT TESTS & PANEL INTEGRATION`);
  y = kvTable(doc, pw, y, [
    ["Airflow fault indicated (±20%)", p.low_flow_fault_indicated ? "PASS" : "Not tested"],
    ["Low flow fault time", `${p.low_flow_fault_time_s}s`],
    ["Alert signal → CIE", p.alert_signal_tested ? "PASS" : "Not tested"],
    ["Action signal → CIE", p.action_signal_tested ? "PASS" : "Not tested"],
    ["Fire 1 signal → CIE", p.fire1_signal_tested ? "PASS" : "Not tested"],
    ["Fire 2 signal → CIE", p.fire2_signal_tested ? "PASS" : "Not tested"],
    ["Isolate / disable", p.isolate_disable_tested ? "PASS" : "Not tested"],
    ["Panel", `${san(p.panel_manufacturer)} ${san(p.panel_model)}`.trim() || "—"],
    ["Zone / Address", san(p.panel_zone_address) || "—"],
  ]);

  // PSU & battery
  y = checkPage(doc, pw, y, 25, logo, certRef, TITLE, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `0${secN++}   PSU & STANDBY POWER`);
  y = kvTable(doc, pw, y, [
    ["PSU Voltage",  `${p.psu_voltage_v}V`],
    ["Battery Type", san(p.battery_type) || "—"],
    ["Battery Age",  `${p.battery_age_years} years`],
    ["Battery Voltage", `${p.battery_voltage_v}V`],
    ["PSU fault indication", p.psu_fault_signalled ? "Confirmed" : "Not tested"],
    ["Battery fault indication", p.battery_fault_signalled ? "Confirmed" : "Not tested"],
  ]);

  // Declaration
  y = checkPage(doc, pw, y, 60, logo, certRef, TITLE, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `0${secN++}   DECLARATION`);
  y = drawStandardBar(doc, pw, y, STANDARD, companyName);
  y = kvTable(doc, pw, y, [
    ["Engineer",           san(p.engineer_name) || "—"],
    ["Engineer Date",      san(p.engineer_date) || "—"],
    ["Engineer Signature", san(p.engineer_signature) || "—"],
    ["Client",             san(p.client_name) || "—"],
    ["Client Date",        san(p.client_date) || "—"],
    ["Client Signature",   san(p.client_signature) || "—"],
  ]);

  drawMasterFooter(doc, pw);
  const fileName = `${certRef}.pdf`;
  const base64 = doc.output("datauristring").split(",")[1] ?? "";
  doc.save(fileName);
  return { base64, fileName };
}

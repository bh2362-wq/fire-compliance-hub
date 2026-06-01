/**
 * Dry Rising Main Certificate PDF (BS 9990)
 * Uses the shared master cert template to match the service report style.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { DRPayload } from "@/services/dryRiserService";
import {
  loadLogoData, loadCompany, san,
  drawCertHeader, drawPage2Header, drawCertTitle,
  drawSectionHeader, drawStandardBar, drawMasterFooter,
  kvTable, checkPage, statusFill, statusText,
  COLORS, MARGIN,
} from "./certPdfMasterTemplate";

const STANDARD = "BS 9990:2015 — Non-automatic firefighting systems in buildings";

export async function generateDryRiserPDF(p: DRPayload): Promise<{ base64: string; fileName: string }> {
  const company = await loadCompany();
  const logo = await loadLogoData(company.report_logo_url || company.company_logo_url);
  const companyName = san(company.company_name) || "BHO Fire Ltd";

  const TITLE = `Dry Rising Main — ${p.form_type === "pressure_test"
    ? "Annual Hydraulic Pressure Test" : "6-Monthly Visual Inspection"}`;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const certRef = san(p.cert_reference || "DR-CERT");
  const status = san(p.overall_status || "—");

  // ── Page 1 ──────────────────────────────────────────────────────────────
  let y = drawCertHeader(doc, pw, logo, company);
  y = drawCertTitle(doc, pw, y + 8, certRef, "CERTIFICATE", TITLE, STANDARD);

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
    ["Building Height",     `${p.building_height_m ?? "—"} m`],
    ["No. of Risers",       String(p.num_risers ?? "—")],
    ["Inlet Type",          p.inlet_type || "—"],
    ["Inlet Location",      p.inlet_location || "—"],
    ["Cert Date",           p.cert_date || "—"],
    ["Next Inspection",     p.next_inspection_date || "—"],
  ]);

  // 02 Visual inspection failures
  const fails = (p.visual_checks || []).filter(c => c.result === "Fail");
  y = checkPage(doc, pw, y, 20, logo, certRef, TITLE, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, `02   VISUAL INSPECTION DEFECTS  (${fails.length})`);
  if (fails.length === 0) {
    y = kvTable(doc, pw, y, [["", "No visual defects identified."]]);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Category", "Description", "Notes"]],
      body: fails.map(f => [san(f.category), san(f.description), san(f.notes || "—")]) as never,
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

  // 03 Pressure test (annual only)
  if (p.form_type === "pressure_test") {
    y = checkPage(doc, pw, y, 25, logo, certRef, TITLE, STANDARD, company);
    y = drawSectionHeader(doc, pw, y, "03   HYDRAULIC PRESSURE TEST RESULTS");
    y = kvTable(doc, pw, y, [
      ["Test Pressure",         `${p.test_pressure_bar ?? "—"} bar`],
      ["Duration",              `${p.test_duration_mins ?? "—"} minutes`],
      ["Pressure at Start",     `${p.pressure_at_start_bar ?? "—"} bar`],
      ["Pressure at End",       `${p.pressure_at_end_bar ?? "—"} bar`],
      ["Pressure Drop",         `${p.pressure_drop_bar ?? "—"} bar`],
      ["Leaks Found",           p.leaks_found ? "Yes" : "None"],
      ["Air Release Functional",p.air_release_functional ? "Yes" : "No"],
      ["Drain Functional",      p.drain_functional ? "Yes" : "No"],
      ["Test Result",           san(p.pressure_test_result || "—")],
    ]);
  }

  // 04 Floor records
  const fr = p.floor_records || [];
  if (fr.length > 0) {
    y = checkPage(doc, pw, y, 20, logo, certRef, TITLE, STANDARD, company);
    y = drawSectionHeader(doc, pw, y, `04   LANDING VALVE RECORDS  (${fr.length})`);
    autoTable(doc, {
      startY: y,
      head: [["Floor", "Valve", "Box", "Signage", "Pressure (bar)", "Notes"]],
      body: fr.map(f => [
        san(f.floor_level), san(f.valve_condition), san(f.box_condition),
        f.signage_present ? "Yes" : "No",
        f.pressure_bar?.toString() || "—",
        san(f.notes || "—"),
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

  // 05 Declaration / signatures
  y = checkPage(doc, pw, y, 50, logo, certRef, TITLE, STANDARD, company);
  y = drawSectionHeader(doc, pw, y, "05   DECLARATION");
  y = drawStandardBar(doc, pw, y, STANDARD, companyName);
  y = kvTable(doc, pw, y, [
    ["Engineer",          san(p.engineer_name || "—")],
    ["Engineer Date",     san(p.engineer_date || "—")],
    ["Engineer Signature",san(p.engineer_signature || "—")],
    ["Client",            san(p.client_name || "—")],
    ["Client Date",       san(p.client_date || "—")],
    ["Client Signature",  san(p.client_signature || "—")],
  ]);

  drawMasterFooter(doc, pw);
  const fileName = `${certRef}.pdf`;
  const base64 = doc.output("datauristring").split(",")[1] ?? "";
  doc.save(fileName);
  return { base64, fileName };
}

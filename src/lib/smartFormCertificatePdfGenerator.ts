import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { BS5839Payload, percentageTested } from "@/services/smartFormService";

// ─── Color Palette (mirrors RAMS) ────────────────────────────────────────────
const C = {
  black: [0, 0, 0] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  textDark: [0, 0, 0] as [number, number, number],
  textGrey: [80, 80, 80] as [number, number, number],
  borderGrey: [180, 180, 180] as [number, number, number],
  lightGrey: [242, 242, 242] as [number, number, number],
  sectionBg: [217, 217, 217] as [number, number, number],
  yellowBanner: [255, 255, 204] as [number, number, number],
  green: [146, 208, 80] as [number, number, number],
  amber: [255, 192, 0] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  blue: [37, 99, 235] as [number, number, number],
};

interface CompanySettings {
  company_name: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  company_logo_url?: string | null;
  report_logo_url?: string | null;
  vat_number?: string | null;
  registration_number?: string | null;
}

async function loadCompanySettings(): Promise<CompanySettings | null> {
  const { data } = await supabase
    .from("company_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  return data;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function sanitize(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/\\\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013]/g, "-")
    .replace(/[\u2014]/g, "--")
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, "-")
    .replace(/[\u2026]/g, "...")
    .replace(/[\u00A0]/g, " ")
    .replace(/[^\x00-\x7F\xA3\xA9\xAE\xB0\xB1\xB2\xB3\xB5\xBC\xBD\xBE\xC0-\xFF]/g, "")
    .trim();
}

function statusColor(status: string): [number, number, number] {
  const s = (status || "").toLowerCase();
  if (s === "satisfactory" || s === "pass" || s === "yes") return C.green;
  if (s.includes("observation") || s === "n/a") return C.amber;
  if (s === "unsatisfactory" || s === "fail" || s === "no") return C.red;
  return C.borderGrey;
}

function severityColor(sev: string): [number, number, number] {
  switch ((sev || "").toLowerCase()) {
    case "critical": return C.red;
    case "major":    return [234, 88, 12];
    case "minor":    return C.amber;
    case "advisory": return C.blue;
    default:         return C.borderGrey;
  }
}

// ─── Main generator ──────────────────────────────────────────────────────────

export async function generateBS5839CertificatePDF(
  payload: BS5839Payload,
  options?: { autoSign?: boolean; engineerFallbackName?: string }
): Promise<void> {
  const company = await loadCompanySettings();
  const logoUrl = company?.report_logo_url || company?.company_logo_url || null;
  const logoBase64 = logoUrl ? await loadImageAsBase64(logoUrl) : null;
  const companyName = sanitize(company?.company_name) || "BHO Fire Ltd";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ML = 12;
  const MR = 12;
  const CW = pw - ML - MR;
  let page = 1;
  let y = 0;

  // ── Repeating header ──
  function drawHeader() {
    let yPos = 8;

    if (logoBase64) {
      try {
        doc.addImage(logoBase64, "PNG", ML, yPos - 2, 32, 28, undefined, "FAST");
      } catch {
        doc.setTextColor(...C.textDark);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(companyName, ML, yPos + 10);
      }
    } else {
      doc.setTextColor(...C.textDark);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(companyName, ML, yPos + 10);
    }

    const rightX = pw - MR;
    let contactY = yPos + 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.textGrey);

    const compAddr = sanitize(company?.address || "");
    const compCityPostcode = [sanitize(company?.city || ""), sanitize(company?.postcode || "")]
      .filter(Boolean)
      .join(", ");
    if (compAddr) { doc.text(compAddr, rightX, contactY, { align: "right" }); contactY += 3.5; }
    if (compCityPostcode) { doc.text(compCityPostcode, rightX, contactY, { align: "right" }); contactY += 3.5; }
    if (company?.phone) { doc.text(`T: ${company.phone}`, rightX, contactY, { align: "right" }); contactY += 3.5; }
    if (company?.email) { doc.text(`E: ${company.email}`, rightX, contactY, { align: "right" }); }

    // Separator
    const sepY = 38;
    doc.setDrawColor(...C.borderGrey);
    doc.setLineWidth(0.3);
    doc.line(ML, sepY, pw - MR, sepY);
  }

  function drawFooter() {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.textGrey);
      doc.text(`Page ${i} of ${total}`, pw - MR, 8, { align: "right" });
      doc.text(
        `${payload.certificate_reference ?? ""} | BS 5839-1:2025 Inspection & Servicing Certificate`,
        ML,
        ph - 6
      );
    }
  }

  function checkPage(need = 30) {
    if (y + need > ph - 14) {
      doc.addPage();
      page++;
      drawHeader();
      y = 42;
    }
  }

  function drawSectionBar(title: string) {
    checkPage(14);
    doc.setFillColor(...C.sectionBg);
    doc.setDrawColor(...C.borderGrey);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, CW, 7, "FD");
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.textDark);
    doc.text(title, ML + 3, y + 4.8);
    y += 9;
  }

  // ── Page 1 header ──
  drawHeader();
  y = 42;

  // ── Document title & banner ──
  doc.setFillColor(...C.sectionBg);
  doc.rect(ML, y, CW, 9, "F");
  doc.setDrawColor(...C.borderGrey);
  doc.rect(ML, y, CW, 9, "S");
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.textDark);
  doc.text("BS 5839-1:2025 Inspection & Servicing Certificate", ML + 3, y + 6);
  y += 11;

  // Cert ref / date / status banner
  const overall = payload.overall_status || "Pending";
  const statusBg = statusColor(overall);
  autoTable(doc, {
    startY: y,
    body: [
      [
        { content: "Certificate Ref:", styles: { fontStyle: "bold" } },
        sanitize(payload.certificate_reference || ""),
        { content: "Date of Service:", styles: { fontStyle: "bold" } },
        payload.date_of_service ? format(new Date(payload.date_of_service), "dd/MM/yyyy") : "",
      ],
      [
        { content: "Job Number:", styles: { fontStyle: "bold" } },
        sanitize(payload.job_number || "—"),
        { content: "System Status:", styles: { fontStyle: "bold" } },
        {
          content: overall,
          styles: { fontStyle: "bold", fillColor: statusBg, textColor: C.textDark, halign: "center" },
        },
      ],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: CW * 0.5 - 32 },
      2: { cellWidth: 32 },
      3: { cellWidth: CW * 0.5 - 32 },
    },
    margin: { left: ML, right: MR },
  });
  y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── Premises ──
  drawSectionBar("1. Premises Details");
  autoTable(doc, {
    startY: y,
    body: [
      [{ content: "Premises Name", styles: { fontStyle: "bold" } }, sanitize(payload.premises_name || "")],
      [{ content: "Premises Address", styles: { fontStyle: "bold" } }, sanitize(payload.premises_address || "")],
      [{ content: "Responsible Person", styles: { fontStyle: "bold" } }, sanitize(payload.responsible_person_name || "")],
      [{ content: "Responsible Person Contact", styles: { fontStyle: "bold" } }, sanitize(payload.responsible_person_contact || "—")],
      [{ content: "Site Contact", styles: { fontStyle: "bold" } }, sanitize(payload.site_contact || "—")],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 50, fillColor: C.lightGrey }, 1: { cellWidth: CW - 50 } },
    margin: { left: ML, right: MR },
  });
  y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── System ──
  drawSectionBar("2. System Details");
  autoTable(doc, {
    startY: y,
    body: [
      [
        { content: "System Category", styles: { fontStyle: "bold" } },
        (payload.system_categories ?? []).join(", ") || "—",
        { content: "System Type", styles: { fontStyle: "bold" } },
        sanitize(payload.system_type || "—"),
      ],
      [
        { content: "Panel Manufacturer", styles: { fontStyle: "bold" } },
        sanitize(payload.panel_manufacturer || "—"),
        { content: "Panel Model", styles: { fontStyle: "bold" } },
        sanitize(payload.panel_model || "—"),
      ],
      [
        { content: "Number of Panels", styles: { fontStyle: "bold" } },
        String(payload.number_of_panels ?? "—"),
        { content: "Approx Devices", styles: { fontStyle: "bold" } },
        String(payload.approx_number_of_devices ?? "—"),
      ],
      [
        { content: "Areas Covered", styles: { fontStyle: "bold" } },
        { content: sanitize(payload.areas_covered || "—"), colSpan: 3 },
      ],
      [
        { content: "Limitations / Exclusions", styles: { fontStyle: "bold" } },
        { content: sanitize(payload.system_limitations || "—"), colSpan: 3 },
      ],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 38, fillColor: C.lightGrey },
      1: { cellWidth: CW * 0.5 - 38 },
      2: { cellWidth: 32, fillColor: C.lightGrey },
      3: { cellWidth: CW * 0.5 - 32 },
    },
    margin: { left: ML, right: MR },
  });
  y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── Service Organisation ──
  drawSectionBar("3. Service Organisation");
  autoTable(doc, {
    startY: y,
    body: [
      [{ content: "Company", styles: { fontStyle: "bold" } }, sanitize(payload.company_name || companyName)],
      [{ content: "Company Address", styles: { fontStyle: "bold" } }, sanitize(payload.company_address || "")],
      [{ content: "Engineer Name", styles: { fontStyle: "bold" } }, sanitize(payload.engineer_name || "")],
      [
        { content: "Competency Confirmed", styles: { fontStyle: "bold" } },
        {
          content: payload.engineer_competency_confirmed ? "YES — competent person under BS 5839-1" : "NO",
          styles: { fontStyle: "bold", textColor: payload.engineer_competency_confirmed ? [0, 100, 0] : C.red },
        },
      ],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 50, fillColor: C.lightGrey }, 1: { cellWidth: CW - 50 } },
    margin: { left: ML, right: MR },
  });
  y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── Inspection Checklist ──
  drawSectionBar("4. Inspection & Servicing Checklist");
  const checklistRows = (payload.checklist ?? []).map((c) => {
    const sBg = statusColor(c.status);
    return [
      sanitize(c.label),
      { content: c.status || "—", styles: { fontStyle: "bold", halign: "center", fillColor: sBg, textColor: C.textDark } },
      sanitize(c.comment || ""),
    ];
  });
  autoTable(doc, {
    startY: y,
    head: [[
      { content: "Check", styles: { halign: "left" } },
      { content: "Status", styles: { halign: "center" } },
      { content: "Comment", styles: { halign: "left" } },
    ]],
    body: checklistRows as never,
    theme: "grid",
    headStyles: { fillColor: C.sectionBg, textColor: C.textDark, fontStyle: "bold", fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 1.8, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2, valign: "middle" },
    columnStyles: { 0: { cellWidth: CW * 0.45 }, 1: { cellWidth: 22 }, 2: { cellWidth: CW - CW * 0.45 - 22 } },
    margin: { left: ML, right: MR },
    didDrawPage: () => {
      // re-draw header for any page break inside the table
      if (doc.getCurrentPageInfo().pageNumber > page) {
        page = doc.getCurrentPageInfo().pageNumber;
        drawHeader();
      }
    },
  });
  y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── Device Testing ──
  drawSectionBar("5. Device Testing");
  const pct = percentageTested(payload);
  const testingMethod =
    payload.testing_method === "Other"
      ? `Other: ${sanitize(payload.testing_method_other || "")}`
      : payload.testing_method || "—";
  autoTable(doc, {
    startY: y,
    body: [
      [
        { content: "Total Devices on System", styles: { fontStyle: "bold" } },
        String(payload.total_devices ?? "—"),
        { content: "Devices Tested This Visit", styles: { fontStyle: "bold" } },
        String(payload.devices_tested ?? "—"),
      ],
      [
        { content: "Testing Method", styles: { fontStyle: "bold" } },
        testingMethod,
        { content: "% Tested", styles: { fontStyle: "bold" } },
        { content: `${pct}%`, styles: { fontStyle: "bold", halign: "center" } },
      ],
      [
        { content: "Devices Not Tested", styles: { fontStyle: "bold" } },
        { content: sanitize(payload.devices_not_tested || "—"), colSpan: 3 },
      ],
      [
        { content: "Reason Not Tested", styles: { fontStyle: "bold" } },
        { content: sanitize(payload.reason_not_tested || "—"), colSpan: 3 },
      ],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 50, fillColor: C.lightGrey },
      1: { cellWidth: CW * 0.5 - 50 },
      2: { cellWidth: 30, fillColor: C.lightGrey },
      3: { cellWidth: CW * 0.5 - 30 },
    },
    margin: { left: ML, right: MR },
  });
  y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── Standby Power ──
  drawSectionBar("6. Standby Power Check");
  autoTable(doc, {
    startY: y,
    body: [
      [
        { content: "Battery Type", styles: { fontStyle: "bold" } }, sanitize(payload.battery_type || "—"),
        { content: "Battery Age (yrs)", styles: { fontStyle: "bold" } }, String(payload.battery_age_years ?? "—"),
      ],
      [
        { content: "Battery Voltage", styles: { fontStyle: "bold" } }, sanitize(payload.battery_voltage || "—"),
        { content: "Charger Voltage", styles: { fontStyle: "bold" } }, sanitize(payload.charger_voltage || "—"),
      ],
      [
        { content: "Charger Operational", styles: { fontStyle: "bold" } }, sanitize(payload.charger_operational || "—"),
        { content: "Capacity Adequate", styles: { fontStyle: "bold" } }, sanitize(payload.battery_capacity_adequate || "—"),
      ],
      [
        { content: "Test Method", styles: { fontStyle: "bold" } },
        { content: sanitize(payload.test_method || "—"), colSpan: 3 },
      ],
      [
        { content: "Test Device", styles: { fontStyle: "bold" } },
        `${sanitize(payload.test_device || "ACT Chrome")}`,
        { content: "Serial Number", styles: { fontStyle: "bold" } },
        sanitize(payload.test_device_serial || "813AK1203058"),
      ],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 38, fillColor: C.lightGrey },
      1: { cellWidth: CW * 0.5 - 38 },
      2: { cellWidth: 38, fillColor: C.lightGrey },
      3: { cellWidth: CW * 0.5 - 38 },
    },
    margin: { left: ML, right: MR },
  });
  y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── False Alarms ──
  drawSectionBar("7. False Alarm Record");
  autoTable(doc, {
    startY: y,
    body: [
      [{ content: "False Alarms Since Last Visit", styles: { fontStyle: "bold" } }, String(payload.false_alarm_count ?? "0")],
      [{ content: "Known Causes", styles: { fontStyle: "bold" } }, sanitize(payload.false_alarm_causes || "—")],
      [{ content: "Actions Taken", styles: { fontStyle: "bold" } }, sanitize(payload.false_alarm_actions || "—")],
      [{ content: "Recommendations", styles: { fontStyle: "bold" } }, sanitize(payload.false_alarm_recommendations || "—")],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 60, fillColor: C.lightGrey }, 1: { cellWidth: CW - 60 } },
    margin: { left: ML, right: MR },
  });
  y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── Defects ──
  const defects = payload.defects ?? [];
  drawSectionBar(`8. Defects / Non-Compliances (${defects.length})`);
  if (defects.length === 0) {
    autoTable(doc, {
      startY: y,
      body: [[{
        content: "No defects recorded.",
        styles: { halign: "center", fontStyle: "italic", textColor: C.textGrey, fillColor: C.lightGrey },
      }]],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 3, lineColor: C.borderGrey, lineWidth: 0.2 },
      margin: { left: ML, right: MR },
    });
    y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  } else {
    const defectRows = defects.map((d, i) => [
      String(i + 1),
      sanitize(d.location),
      sanitize(d.description),
      { content: d.severity || "—", styles: { fontStyle: "bold", halign: "center", fillColor: severityColor(d.severity), textColor: C.white } },
      sanitize(d.bs_reference || "—"),
      sanitize(d.recommended_action),
      sanitize(d.status || "Open"),
    ]);
    autoTable(doc, {
      startY: y,
      head: [["#", "Location", "Description", "Severity", "BS Ref", "Recommended Action", "Status"]],
      body: defectRows,
      theme: "grid",
      headStyles: { fillColor: C.sectionBg, textColor: C.textDark, fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 1.6, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2, valign: "middle" },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 26 },
        2: { cellWidth: 50 },
        3: { cellWidth: 18, halign: "center" },
        4: { cellWidth: 18 },
        5: { cellWidth: CW - 8 - 26 - 50 - 18 - 18 - 22 },
        6: { cellWidth: 22, halign: "center" },
      },
      margin: { left: ML, right: MR },
      didDrawPage: () => {
        if (doc.getCurrentPageInfo().pageNumber > page) {
          page = doc.getCurrentPageInfo().pageNumber;
          drawHeader();
        }
      },
    });
    y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ── Variations ──
  drawSectionBar("9. Variations from BS 5839-1");
  if (payload.variations_present !== "Yes" || (payload.variations ?? []).length === 0) {
    autoTable(doc, {
      startY: y,
      body: [[{
        content: payload.variations_present === "No" ? "No variations from BS 5839-1." : "Not declared.",
        styles: { halign: "center", fontStyle: "italic", textColor: C.textGrey, fillColor: C.lightGrey },
      }]],
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 3, lineColor: C.borderGrey, lineWidth: 0.2 },
      margin: { left: ML, right: MR },
    });
    y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  } else {
    const varRows = (payload.variations ?? []).map((v, i) => [
      String(i + 1),
      sanitize(v.description),
      sanitize(v.justification),
      { content: v.agreed_with_responsible_person || "—", styles: { halign: "center", fontStyle: "bold" } },
    ]);
    autoTable(doc, {
      startY: y,
      head: [["#", "Variation", "Justification", "Agreed?"]],
      body: varRows,
      theme: "grid",
      headStyles: { fillColor: C.sectionBg, textColor: C.textDark, fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 7.8, cellPadding: 1.6, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: CW * 0.45 },
        2: { cellWidth: CW * 0.45 - 8 },
        3: { cellWidth: CW - 8 - CW * 0.45 - (CW * 0.45 - 8) },
      },
      margin: { left: ML, right: MR },
    });
    y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ── System Status ──
  drawSectionBar("10. System Status");
  autoTable(doc, {
    startY: y,
    body: [[{
      content: overall.toUpperCase(),
      styles: { halign: "center", fontStyle: "bold", fontSize: 12, fillColor: statusColor(overall), textColor: C.textDark, cellPadding: 4 },
    }]],
    theme: "grid",
    styles: { lineColor: C.borderGrey, lineWidth: 0.2 },
    margin: { left: ML, right: MR },
  });
  y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;

  autoTable(doc, {
    startY: y,
    body: [
      [{ content: "Final Remarks", styles: { fontStyle: "bold" } }, sanitize(payload.final_remarks || "—")],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2, textColor: C.textDark, lineColor: C.borderGrey, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 38, fillColor: C.lightGrey }, 1: { cellWidth: CW - 38 } },
    margin: { left: ML, right: MR },
  });
  y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── Engineer Declaration ──
  checkPage(70);
  drawSectionBar("11. Engineer Declaration");
  autoTable(doc, {
    startY: y,
    body: [[{
      content:
        "I certify that the inspection and servicing of the fire detection and fire alarm system has been carried out in accordance with BS 5839-1:2025 and that the system status is as stated above.",
      styles: { fontStyle: "italic", fillColor: C.yellowBanner, halign: "left", cellPadding: 3 },
    }]],
    theme: "grid",
    styles: { fontSize: 8.5, lineColor: C.borderGrey, lineWidth: 0.2 },
    margin: { left: ML, right: MR },
  });
  y = (doc as never as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // ── Signature boxes (Engineer + Client) — RAMS-styled ──
  checkPage(40);
  const generatedDate = format(new Date(), "dd/MM/yyyy");
  const engineerName =
    payload.engineer_declaration_name ||
    payload.engineer_name ||
    options?.engineerFallbackName ||
    "";

  const sigLabels = ["Engineer", payload.client_name ? `Client (${sanitize(payload.client_name)})` : "Client"];
  const sigs = [payload.engineer_signature, payload.client_signature];
  const sigDates = [payload.engineer_signed_date, payload.client_signed_date];
  const sigNames = [engineerName, payload.client_name || ""];
  const autoSigs: (string | null)[] = [
    options?.autoSign && !payload.engineer_signature ? engineerName : null,
    null, // client always blank for on-site capture
  ];

  const sigW = (CW - 8) / 2;
  for (let i = 0; i < 2; i++) {
    const x = ML + i * (sigW + 8);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C.textGrey);
    doc.text(sigLabels[i], x, y);

    doc.setFillColor(...C.lightGrey);
    doc.setDrawColor(...C.borderGrey);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y + 2, sigW, 22, 1, 1, "FD");

    if (sigs[i]) {
      const sigVal = sigs[i]!;
      if (sigVal.startsWith("typed:")) {
        const typedName = sigVal.replace("typed:", "");
        doc.setFontSize(18);
        doc.setFont("helvetica", "bolditalic");
        doc.setTextColor(...C.textDark);
        const w = doc.getTextWidth(typedName);
        doc.text(typedName, x + (sigW - w) / 2, y + 16);
      } else {
        try {
          doc.addImage(sigVal, "PNG", x + 2, y + 4, sigW - 4, 16, undefined, "FAST");
        } catch { /* skip */ }
      }
    } else if (autoSigs[i]) {
      const name = autoSigs[i]!;
      doc.setFont("times", "italic");
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 90);
      const w = doc.getTextWidth(name);
      doc.text(name, x + (sigW - w) / 2, y + 16);
    }

    if (sigNames[i]) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.textDark);
      doc.text(sanitize(sigNames[i]), x, y + 28);
    }
    const dateStr = sigDates[i]
      ? `Date: ${format(new Date(sigDates[i]!), "dd/MM/yyyy")}`
      : (i === 0 && autoSigs[0] ? `Date: ${generatedDate}` : "");
    if (dateStr) {
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...C.textGrey);
      doc.text(dateStr, x, y + 32);
    }
  }
  y += 38;

  // ── Footer & save ──
  drawFooter();
  const filename = `${payload.certificate_reference || "BS5839-Certificate"}.pdf`;
  doc.save(filename);
}

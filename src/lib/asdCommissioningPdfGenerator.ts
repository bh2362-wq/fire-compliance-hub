import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { ASDPayload } from "@/services/asdCommissioningService";
import { TRANSPORT_TIME_LIMITS } from "@/services/asdCommissioningService";

const C = {
  navy:      [30, 41, 90]    as [number, number, number],
  white:     [255, 255, 255] as [number, number, number],
  textDark:  [20, 20, 20]    as [number, number, number],
  textGrey:  [80, 80, 80]    as [number, number, number],
  lightGrey: [245, 245, 245] as [number, number, number],
  border:    [200, 200, 200] as [number, number, number],
  green:     [22, 163, 74]   as [number, number, number],
  greenBg:   [220, 252, 231] as [number, number, number],
  red:       [185, 28, 28]   as [number, number, number],
  redBg:     [254, 226, 226] as [number, number, number],
  amber:     [217, 119, 6]   as [number, number, number],
  amberBg:   [254, 243, 199] as [number, number, number],
  sectionBg: [230, 230, 240] as [number, number, number],
};

function s(t: string | null | undefined): string {
  return (t || "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2013/g, "-").trim();
}

async function loadLogo(url: string): Promise<{ b64: string; w: number; h: number } | null> {
  try {
    const r = await fetch(url); const b = await r.blob();
    const b64 = await new Promise<string>(res => { const fr = new FileReader(); fr.onloadend = () => res(fr.result as string); fr.readAsDataURL(b); });
    return new Promise(resolve => {
      const img = new Image(); img.onload = () => resolve({ b64, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ b64, w: 100, h: 100 }); img.src = b64;
    });
  } catch { return null; }
}

function fitBox(nw: number, nh: number, mw: number, mh: number): [number, number] {
  const r = nw / nh; let w = mw, h = w / r; if (h > mh) { h = mh; w = h * r; } return [w, h];
}

function passFailBadge(doc: jsPDF, x: number, y: number, result: string) {
  if (result === "Pass") { doc.setFillColor(...C.greenBg); doc.setTextColor(...C.green); }
  else if (result === "Fail") { doc.setFillColor(...C.redBg); doc.setTextColor(...C.red); }
  else { doc.setFillColor(...C.lightGrey); doc.setTextColor(...C.textGrey); }
  doc.roundedRect(x, y - 3, 16, 5, 1, 1, "F");
  doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.text(result === "N/A" ? " N/A" : result === "Pass" ? "  PASS" : "  FAIL", x + 1, y);
}

export async function generateASDCommissioningPDF(p: ASDPayload): Promise<void> {
  const { data: company } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
  const logoUrl = company?.report_logo_url || company?.company_logo_url;
  const logoData = logoUrl ? await loadLogo(logoUrl) : null;
  const companyName = s(company?.company_name) || "BHO Fire & Security Ltd";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const ML = 14, MR = 14, CW = pw - ML - MR;
  let y = 0;
  let pageNum = 0;

  function drawHeader() {
    pageNum++;
    y = 0;
    doc.setFillColor(...C.navy);
    doc.rect(0, 0, pw, 18, "F");
    if (logoData) {
      try { const [lw, lh] = fitBox(logoData.w, logoData.h, 30, 14); doc.addImage(logoData.b64, "PNG", ML, 2, lw, lh, undefined, "FAST"); } catch {}
    } else {
      doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white); doc.text(companyName, ML, 12);
    }
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
    doc.text("ASD COMMISSIONING CERTIFICATE", pw / 2, 8, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    const typeTag = p.installation_type === "modification" ? "MODIFICATION OF EXISTING SYSTEM" : "NEW INSTALLATION";
    doc.text(`${s(p.cert_reference)}  |  ${typeTag}  |  BS EN 54-20 Class ${p.sensitivity_class}`, pw / 2, 14, { align: "center" });
    y = 22;
  }

  function checkPage(needed: number) {
    if (y + needed > ph - 14) { doc.addPage(); drawHeader(); }
  }

  function sectionBar(num: string, title: string) {
    checkPage(10);
    doc.setFillColor(...C.navy); doc.rect(ML, y, CW, 8, "F");
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...C.white);
    doc.text(`${num}   ${title.toUpperCase()}`, ML + 3, y + 5.5);
    y += 10;
  }

  function drawFooter() {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(...C.border); doc.setLineWidth(0.2); doc.line(ML, ph - 10, pw - MR, ph - 10);
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textGrey);
      doc.text(`${companyName}  |  ${s(p.cert_reference)}  |  ASD Commissioning  |  ${s(p.standard_references)}`, ML, ph - 5.5, { maxWidth: CW - 20 });
      doc.text(`Page ${i} of ${total}`, pw - MR, ph - 5.5, { align: "right" });
    }
  }

  // ── Page 1: Header, premises, system details ───────────────────────────────
  drawHeader();

  // Status banner
  const statusColor = p.overall_status === "Fully Operational" ? C.green : p.overall_status === "Operational with Observations" ? C.amber : C.red;
  const statusBg    = p.overall_status === "Fully Operational" ? C.greenBg : p.overall_status === "Operational with Observations" ? C.amberBg : C.redBg;
  doc.setFillColor(...statusBg); doc.setDrawColor(...statusColor); doc.setLineWidth(0.5);
  doc.roundedRect(ML, y, CW, 9, 1, 1, "FD");
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...statusColor);
  doc.text(`System Status: ${s(p.overall_status).toUpperCase()}`, pw / 2, y + 6, { align: "center" });
  y += 11;

  // Meta table
  autoTable(doc, {
    startY: y,
    body: [
      [{ content: "Certificate Reference", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.cert_reference), { content: "Date", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.cert_date)],
      [{ content: "Premises", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.premises_name), { content: "Installation Type", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, p.installation_type === "new" ? "New Installation" : "Modification of Existing"],
      [{ content: "Address", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, `${s(p.premises_address)} ${s(p.premises_postcode)}`.trim(), { content: "Responsible Person", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.responsible_person)],
      [{ content: "ASD Manufacturer", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.asd_manufacturer), { content: "Model", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.asd_model)],
      [{ content: "Serial Number", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.asd_serial_number), { content: "Software Version", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.software_version)],
      [{ content: "EN 54-20 Class", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, { content: `Class ${p.sensitivity_class} — Max transport time: ${p.transport_time_limit}s`, styles: { fontStyle: "bold", textColor: C.navy } }, { content: "Pipe Material", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.pipe_material)],
      [{ content: "No. Pipes", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, String(p.num_pipes), { content: "Total Sampling Holes", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, String(p.num_sampling_holes)],
      [{ content: "Protected Area", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, { content: s(p.protected_area), colSpan: 3 }],
      [{ content: "Issuing Company", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, { content: companyName, colSpan: 3 }],
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2.5, textColor: C.textDark, lineColor: C.border, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: CW / 2 - 40 }, 2: { cellWidth: 40 }, 3: { cellWidth: CW / 2 - 40 } },
    margin: { left: ML, right: MR, top: 22 },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // ── Section: Pre-modification record (if applicable) ───────────────────────
  if (p.installation_type === "modification") {
    checkPage(20);
    sectionBar("1", "Pre-Modification Record");
    autoTable(doc, {
      startY: y, body: [
        [{ content: "Existing Configuration", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.pre_mod_config_description)],
        [{ content: "Modification Description", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.modification_description)],
        [{ content: "Areas Affected", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.areas_affected)],
      ],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2.5, textColor: C.textDark, lineColor: C.border, lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 55 } },
      margin: { left: ML, right: MR, top: 22 },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // ── Section: Flow rate verification ────────────────────────────────────────
  checkPage(20);
  sectionBar(p.installation_type === "modification" ? "2" : "1", "Flow Rate Verification — Baseline Readings");
  doc.setFontSize(7); doc.setFont("helvetica", "italic"); doc.setTextColor(...C.textGrey);
  doc.text("Future maintenance: flow readings must be within ±20% of these baseline commissioning values (FIA CoP §8.3)", ML, y); y += 5;
  autoTable(doc, {
    startY: y,
    head: [["Pipe Reference", "Design Flow (L/min)", "Measured Flow (L/min)", "Deviation", "Within ±20%", "Notes"]],
    body: p.pipe_records.map(pr => {
      const dev = pr.design_flow_lpm > 0 ? Math.abs((pr.measured_flow_lpm - pr.design_flow_lpm) / pr.design_flow_lpm * 100).toFixed(1) + "%" : "—";
      return [s(pr.pipe_reference), pr.design_flow_lpm.toFixed(1), pr.measured_flow_lpm.toFixed(1), dev, pr.within_20_percent ? "✓ Yes" : pr.measured_flow_lpm > 0 ? "✗ No" : "—", s(pr.notes)];
    }),
    theme: "grid",
    headStyles: { fillColor: C.navy, textColor: C.white, fontSize: 7.5, fontStyle: "bold" },
    styles: { fontSize: 8, cellPadding: 2.5, textColor: C.textDark, lineColor: C.border, lineWidth: 0.2 },
    margin: { left: ML, right: MR, top: 22 },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // ── Section: Transport time test ───────────────────────────────────────────
  checkPage(20);
  const secNum2 = p.installation_type === "modification" ? "3" : "2";
  sectionBar(secNum2, "Transport Time Test");
  autoTable(doc, {
    startY: y, body: [
      [{ content: "Furthest Sampling Hole", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.furthest_hole_location)],
      [{ content: "Test Method", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.transport_time_test_method)],
      [{ content: "Class Limit", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, `Class ${p.sensitivity_class} — ${p.transport_time_limit}s maximum`],
      [{ content: "Measured Time", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, { content: `${p.transport_time_measured_s}s — ${p.transport_time_pass ? "PASS" : p.transport_time_measured_s > 0 ? "FAIL" : "Not recorded"}`, styles: { fontStyle: "bold", textColor: p.transport_time_pass ? C.green : p.transport_time_measured_s > 0 ? C.red : C.textGrey } }],
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2.5, textColor: C.textDark, lineColor: C.border, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 55 } },
    margin: { left: ML, right: MR, top: 22 },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // ── Section: Alarm thresholds ──────────────────────────────────────────────
  checkPage(25);
  sectionBar(p.installation_type === "modification" ? "4" : "3", "Alarm Threshold Settings & Verification");
  autoTable(doc, {
    startY: y,
    head: [["Level", "Set Value (obscuration)", "Test Result", "Notes"]],
    body: p.thresholds.map(t => [t.level, s(t.set_value_obs) || "—", t.test_result, s(t.notes)]),
    theme: "grid",
    headStyles: { fillColor: C.navy, textColor: C.white, fontSize: 7.5, fontStyle: "bold" },
    styles: { fontSize: 8, cellPadding: 2.5, textColor: C.textDark, lineColor: C.border, lineWidth: 0.2 },
    margin: { left: ML, right: MR, top: 22 },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // ── Section: Fault tests & panel integration ───────────────────────────────
  checkPage(30);
  sectionBar(p.installation_type === "modification" ? "5" : "4", "Fault Tests & Panel Integration");
  const panelRows = [
    ["Airflow fault indicated (±20%)", p.low_flow_fault_indicated ? "PASS" : "Not tested"],
    ["Low flow fault time", `${p.low_flow_fault_time_s}s`],
    ["Alert signal → CIE", p.alert_signal_tested ? "PASS" : "Not tested"],
    ["Action signal → CIE", p.action_signal_tested ? "PASS" : "Not tested"],
    ["Fire 1 signal → CIE", p.fire1_signal_tested ? "PASS" : "Not tested"],
    ["Fire 2 signal → CIE", p.fire2_signal_tested ? "PASS" : "Not tested"],
    ["Isolate / disable", p.isolate_disable_tested ? "PASS" : "Not tested"],
    ["Panel", `${s(p.panel_manufacturer)} ${s(p.panel_model)}`.trim() || "—"],
    ["Zone / Address", s(p.panel_zone_address) || "—"],
  ];
  autoTable(doc, {
    startY: y, body: panelRows.map(([k, v]) => [{ content: k, styles: { fontStyle: "bold", fillColor: C.sectionBg } }, v]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2.5, textColor: C.textDark, lineColor: C.border, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 70 } },
    margin: { left: ML, right: MR, top: 22 },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // ── Section: PSU & battery ─────────────────────────────────────────────────
  checkPage(20);
  sectionBar(p.installation_type === "modification" ? "6" : "5", "PSU & Standby Power");
  autoTable(doc, {
    startY: y, body: [
      [{ content: "PSU Voltage", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, `${p.psu_voltage_v}V`, { content: "Battery Type", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.battery_type)],
      [{ content: "Battery Age", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, `${p.battery_age_years} years`, { content: "Battery Voltage", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, `${p.battery_voltage_v}V`],
      [{ content: "PSU fault indication", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, p.psu_fault_signalled ? "✓ Confirmed" : "Not tested", { content: "Battery fault indication", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, p.battery_fault_signalled ? "✓ Confirmed" : "Not tested"],
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2.5, textColor: C.textDark, lineColor: C.border, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: CW / 2 - 40 }, 2: { cellWidth: 40 }, 3: { cellWidth: CW / 2 - 40 } },
    margin: { left: ML, right: MR, top: 22 },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // ── Declaration ────────────────────────────────────────────────────────────
  checkPage(50);
  sectionBar(p.installation_type === "modification" ? "7" : "6", "Declaration");
  doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.textGrey);
  doc.text(`I certify that the commissioning of the aspirating smoke detection system has been carried out in accordance with ${s(p.standard_references)} and that the system status is as stated above.`, ML, y, { maxWidth: CW }); y += 9;
  autoTable(doc, {
    startY: y, body: [
      [{ content: "Engineer", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.engineer_name), { content: "Date", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.engineer_date)],
      [{ content: "Signature", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, { content: s(p.engineer_signature), styles: { fontStyle: "italic", textColor: C.navy } }, { content: "", styles: { fillColor: C.sectionBg } }, ""],
      [{ content: "Client", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.client_name), { content: "Date", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, s(p.client_date)],
      [{ content: "Signature", styles: { fontStyle: "bold", fillColor: C.sectionBg } }, { content: s(p.client_signature), styles: { fontStyle: "italic", textColor: C.navy } }, { content: "", styles: { fillColor: C.sectionBg } }, ""],
    ],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 3.5, textColor: C.textDark, lineColor: C.border, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 20 } },
    margin: { left: ML, right: MR, top: 22 },
  });

  drawFooter();
  doc.save(`${s(p.cert_reference) || "ASD-Commissioning"}.pdf`);
}

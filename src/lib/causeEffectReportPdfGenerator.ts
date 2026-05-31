import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import type { CauseEffectReportBundle } from "@/services/causeEffectTestService";

// Brand constants mirror src/lib/pdfGenerator.ts so the C&E report
// renders as part of the same printed family as the service report.
const COMPANY = {
  name: "BHO FIRE LTD",
  address: "St Georges Business Park, Castle Rd, Sittingbourne ME10 3TB",
  phone: "0330 043 8659",
  email: "admin@bhofire.com",
  website: "www.bhofire.com",
  registration: "Company Registration No. 12235152",
  country: "Registered in England & Wales",
};

const COLORS = {
  charcoal: [45, 45, 48] as [number, number, number],
  red: [200, 30, 30] as [number, number, number],
  darkGrey: [80, 80, 85] as [number, number, number],
  mediumGrey: [140, 140, 145] as [number, number, number],
  lightGrey: [245, 245, 247] as [number, number, number],
  borderGrey: [220, 220, 225] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  yes: [34, 139, 34] as [number, number, number],
  no: [200, 30, 30] as [number, number, number],
  na: [140, 140, 145] as [number, number, number],
};

const MARGIN = 12;

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/bho-fire-logo.png";
  });
}

// Compact branded header — logo left, company details right-aligned.
// Same shape as addCompactHeader in pdfGenerator.ts.
function header(doc: jsPDF, pageWidth: number, logo: HTMLImageElement | null): number {
  const yTop = 14;
  if (logo) {
    try { doc.addImage(logo, "PNG", MARGIN, yTop - 2, 32, 28); } catch { /* ignore */ }
  }

  const rightX = pageWidth - MARGIN;
  let cy = yTop;
  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(COMPANY.name, rightX, cy, { align: "right" });
  cy += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text(COMPANY.address, rightX, cy, { align: "right" });
  cy += 4;
  doc.text(`T: ${COMPANY.phone}`, rightX, cy, { align: "right" });
  cy += 4;
  doc.text(`E: ${COMPANY.email}`, rightX, cy, { align: "right" });

  const rule = 44;
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, rule, pageWidth - MARGIN, rule);
  return rule + 4;
}

function footer(doc: jsPDF, pageWidth: number, pageHeight: number) {
  const footerY = pageHeight - 18;
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, footerY, pageWidth - MARGIN, footerY);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text(`${COMPANY.name}  |  ${COMPANY.registration}`, MARGIN, footerY + 5);
  doc.text(
    `Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
    pageWidth - MARGIN,
    footerY + 5,
    { align: "right" },
  );
}

function sectionHeading(doc: jsPDF, text: string, y: number, pageWidth: number): number {
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(MARGIN, y, pageWidth - 2 * MARGIN, 6, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(text, MARGIN + 2, y + 4.2);
  return y + 9;
}

function subHeading(doc: jsPDF, text: string, y: number): number {
  doc.setTextColor(...COLORS.charcoal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(text, MARGIN, y);
  return y + 4;
}

function bodyText(doc: jsPDF, text: string, y: number, pageWidth: number, opts?: { italic?: boolean; muted?: boolean }): number {
  doc.setTextColor(...(opts?.muted ? COLORS.mediumGrey : COLORS.charcoal));
  doc.setFont("helvetica", opts?.italic ? "italic" : "normal");
  doc.setFontSize(8);
  const lines = doc.splitTextToSize(text, pageWidth - 2 * MARGIN);
  doc.text(lines, MARGIN, y);
  return y + lines.length * 4.2;
}

// Drawn checkbox — Helvetica can't render ☑/☐ glyphs, so the rendered
// PDF was showing `&` and `'` instead. Draw a real 3mm square and fill
// it when ticked. Matches the absent-reason tickboxes in pdfGenerator.ts.
function drawCheckBox(doc: jsPDF, x: number, y: number, checked: boolean) {
  doc.setDrawColor(...COLORS.charcoal);
  doc.setLineWidth(0.3);
  doc.rect(x, y, 3, 3);
  if (checked) {
    doc.setFillColor(...COLORS.charcoal);
    doc.rect(x, y, 3, 3, "F");
  }
}

function pageBreakIfNeeded(
  doc: jsPDF,
  y: number,
  pageHeight: number,
  pageWidth: number,
  logo: HTMLImageElement | null,
  needed = 30,
): number {
  if (y + needed > pageHeight - 22) {
    doc.addPage();
    return header(doc, pageWidth, logo);
  }
  return y;
}

function resultBadge(r: string | null): string {
  if (r === "pass") return "PASS";
  if (r === "fail") return "FAIL";
  if (r === "na") return "N/A";
  return "—";
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

// Engineers typically type just a number ("28") in the remedial timeframe
// field. Append "days" so the rendered sentence doesn't trail off as
// "All remedial works should be completed within 28."
function formatRemedialTimeframe(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return `${trimmed} days`;
  return trimmed;
}

function lastY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

// Side-by-side branded card used for SITE / SERVICE / SYSTEM blocks — the
// same visual shape the service report uses.
function drawInfoCard(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: Array<[string, string]>,
  boxHeight: number,
) {
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.rect(x, y, width, boxHeight);
  doc.setFillColor(...COLORS.charcoal);
  doc.rect(x, y, width, 7, "F");
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(title, x + 3, y + 5);

  doc.setFontSize(8);
  let ry = y + 12;
  rows.forEach(([label, val]) => {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.setFont("helvetica", "bold");
    doc.text(label, x + 3, ry);
    doc.setTextColor(...COLORS.charcoal);
    doc.setFont("helvetica", "normal");
    const maxW = width - 24;
    const txt = doc.splitTextToSize(val || "-", maxW)[0] || "-";
    doc.text(txt, x + 22, ry);
    ry += 6.5;
  });
}

/**
 * Render the Cause & Effect + Audibility test report PDF and trigger
 * a download. Mirrors the printed BHO Fire template the engineer team
 * uses, populated from the bundle returned by
 * loadCauseEffectReportBundle.
 */
export async function generateCauseEffectReportPDF(
  bundle: CauseEffectReportBundle,
  options?: { returnBlob?: boolean },
): Promise<Blob | void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 2 * MARGIN;
  const logo = await loadLogo();
  const { report, site, visit, outputs, stages, readings, issues, remedials, deviceTests, customer } = bundle;

  let y = header(doc, pageWidth, logo);

  // === Title row — matches service report exactly ===
  doc.setTextColor(...COLORS.charcoal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Fire Alarm Cause & Effect + Audibility Test Report", MARGIN, y + 4);
  doc.setTextColor(...COLORS.red);
  doc.setFontSize(10);
  doc.text("BS 5839-1:2017", MARGIN, y + 10);
  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  if (report.report_number) {
    doc.text(`Ref: ${report.report_number}`, pageWidth - MARGIN, y + 4, { align: "right" });
  }
  doc.text(formatDate(report.report_date), pageWidth - MARGIN, y + 10, { align: "right" });
  y += 16;

  // === SITE / SERVICE side-by-side cards ===
  const colWidth = (contentWidth - 6) / 2;
  const cardHeight = 38;
  const siteAddr = [site.address, site.city, site.postcode].filter(Boolean).join(", ");
  drawInfoCard(doc, MARGIN, y, colWidth, "SITE", [
    ["Site:", site.name],
    ["Address:", siteAddr || "-"],
    ["Contact:", site.contact_name || "-"],
    ["Phone:", site.contact_phone || "-"],
  ], cardHeight);

  const rightX = MARGIN + colWidth + 6;
  // Prefer the customer row's name when the wizard left client_name blank.
  const customerLine = report.client_name?.trim() || customer?.name || "-";
  drawInfoCard(doc, rightX, y, colWidth, "SERVICE", [
    ["Job Ref:", visit.job_number ?? "-"],
    ["Date:", formatDate(visit.visit_date)],
    ["Engineer:", report.engineer_name ?? "-"],
    ["Customer:", customerLine],
  ], cardHeight);
  y += cardHeight + 4;

  // Optional duty holder / ARC / access-hours single-line band, when set.
  const extras: string[] = [];
  if (site.duty_holder_name || site.duty_holder_email) {
    const dh = [site.duty_holder_name, site.duty_holder_role].filter(Boolean).join(" · ");
    const dhc = [site.duty_holder_phone, site.duty_holder_email].filter(Boolean).join(" · ");
    extras.push(`Responsible person: ${dh}${dhc ? ` (${dhc})` : ""}`);
  }
  if (site.arc_connected && (site.arc_provider || site.arc_account_ref)) {
    extras.push(`ARC: ${[site.arc_provider, site.arc_account_ref].filter(Boolean).join(" · ")}`);
  }
  if (site.access_hours?.trim()) {
    extras.push(`Access hours: ${site.access_hours.trim()}`);
  }
  if (extras.length > 0) {
    y = bodyText(doc, extras.join("    ·    "), y, pageWidth, { muted: true });
    y += 2;
  }

  // === §1 Purpose of visit ===
  y = sectionHeading(doc, "1. Purpose of visit", y, pageWidth);
  y = bodyText(
    doc,
    "To conduct cause and effect testing and full audibility testing of the fire alarm system in accordance with BS 5839-1:2017.",
    y,
    pageWidth,
  );
  y += 4;

  // === §2 System details — only show populated rows so the table
  // doesn't fill with em-dashes when fields aren't captured. ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 40);
  y = sectionHeading(doc, "2. System details", y, pageWidth);
  const sysRows: Array<[string, string]> = [];
  if (site.bs5839_category) sysRows.push(["BS 5839 Category", site.bs5839_category]);
  if (site.panel_make_model) sysRows.push(["Panel Make / Model", site.panel_make_model]);
  if (site.num_zones != null) sysRows.push(["Number of Zones", String(site.num_zones)]);
  if (site.num_devices != null) sysRows.push(["Number of Devices", String(site.num_devices)]);
  if (site.arc_connected === true) {
    sysRows.push(["ARC Monitoring", "Yes"]);
  } else if (site.arc_connected === false) {
    sysRows.push(["ARC Monitoring", "No"]);
  }
  if (sysRows.length === 0) {
    y = bodyText(doc, "System details not recorded.", y, pageWidth, { italic: true, muted: true });
    y += 2;
  } else {
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.5, textColor: COLORS.charcoal, lineColor: COLORS.borderGrey },
      columnStyles: {
        0: { fontStyle: "bold", textColor: COLORS.mediumGrey, cellWidth: 48, fillColor: COLORS.lightGrey },
      },
      body: sysRows,
    });
    y = lastY(doc) + 4;
  }

  // === §3 Cause & Effect ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 40);
  y = sectionHeading(doc, "3. Cause and effect test results", y, pageWidth);
  y = subHeading(doc, "3.1 Test methodology", y);
  y = bodyText(
    doc,
    "• Minimum one detector per zone activated to verify programmed responses.\n• All input/output relationships tested as per cause and effect matrix.\n• System responses observed and verified.",
    y,
    pageWidth,
  );
  y += 2;

  // §3.2 Devices/zones tested — skip the table entirely when nothing
  // captured so we don't print a row of em-dashes.
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 25);
  y = subHeading(doc, "3.2 Devices / zones tested", y);
  if (deviceTests.length === 0) {
    y = bodyText(doc, "No individual devices recorded for this visit.", y, pageWidth, { italic: true, muted: true });
    y += 2;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Zone Description", "Location", "Address", "Device Type", "Time", "Result"]],
      body: deviceTests.map((d) => [
        d.location?.split(" ").slice(0, 4).join(" ") ?? "—",
        d.location ?? "—",
        `${d.loop ? `L${d.loop}/` : ""}${d.address ?? "—"}`,
        d.device_type ?? "—",
        d.tested_at ? format(new Date(d.tested_at), "HH:mm") : "—",
        d.status === "passed" ? "PASS" : d.status === "fault" ? "FAIL" : "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: COLORS.charcoal, textColor: COLORS.white, fontSize: 7.5, fontStyle: "bold" },
      styles: { fontSize: 7.5, cellPadding: 1.3, textColor: COLORS.charcoal, lineColor: COLORS.borderGrey },
      columnStyles: {
        4: { halign: "center", cellWidth: 14 },
        5: { halign: "center", cellWidth: 16, fontStyle: "bold" },
      },
    });
    y = lastY(doc) + 4;
  }

  // §3.3 Output functions verified
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 25);
  y = subHeading(doc, "3.3 Output functions verified", y);
  if (outputs.length === 0) {
    y = bodyText(doc, "No output functions recorded.", y, pageWidth, { italic: true, muted: true });
    y += 2;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Function", "Expected response", "Actual response", "Result"]],
      body: outputs.map((o) => [
        o.function_name,
        o.expected ?? "—",
        o.actual ?? "—",
        resultBadge(o.result),
      ]),
      theme: "grid",
      headStyles: { fillColor: COLORS.charcoal, textColor: COLORS.white, fontSize: 7.5, fontStyle: "bold" },
      styles: { fontSize: 7.5, cellPadding: 1.5, textColor: COLORS.charcoal, lineColor: COLORS.borderGrey },
      columnStyles: { 3: { halign: "center", cellWidth: 18, fontStyle: "bold" } },
    });
    y = lastY(doc) + 4;
  }

  // §3.4 Stage testing
  if (stages.length > 0) {
    y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 25);
    y = subHeading(doc, "3.4 Stage testing", y);
    autoTable(doc, {
      startY: y,
      head: [["Stage", "Areas activated", "Delay time", "Result"]],
      body: stages.map((s) => [
        s.stage_name,
        s.areas_activated ?? "—",
        s.delay_time ?? "—",
        resultBadge(s.result),
      ]),
      theme: "grid",
      headStyles: { fillColor: COLORS.charcoal, textColor: COLORS.white, fontSize: 7.5, fontStyle: "bold" },
      styles: { fontSize: 7.5, cellPadding: 1.5, textColor: COLORS.charcoal, lineColor: COLORS.borderGrey },
      columnStyles: { 3: { halign: "center", cellWidth: 18, fontStyle: "bold" } },
    });
    y = lastY(doc) + 4;
  }

  // === §4 Audibility ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 40);
  y = sectionHeading(doc, "4. Full audibility test results", y, pageWidth);

  // §4.1 Test equipment — only show populated rows.
  const eqRows: Array<[string, string]> = [];
  if (report.sound_meter_make_model) eqRows.push(["Sound Level Meter", report.sound_meter_make_model]);
  if (report.sound_meter_serial) eqRows.push(["Serial Number", report.sound_meter_serial]);
  if (report.sound_meter_cal_due) eqRows.push(["Calibration Due", formatDate(report.sound_meter_cal_due)]);
  if (report.sound_meter_cal_on_file) eqRows.push(["Calibration Certificate", "On file"]);
  if (eqRows.length > 0) {
    y = subHeading(doc, "4.1 Test equipment", y);
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.5, textColor: COLORS.charcoal, lineColor: COLORS.borderGrey },
      columnStyles: {
        0: { fontStyle: "bold", textColor: COLORS.mediumGrey, cellWidth: 48, fillColor: COLORS.lightGrey },
      },
      body: eqRows,
    });
    y = lastY(doc) + 4;
  }

  // §4.2 Sound level measurements — same empty-state treatment as 3.2.
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 25);
  y = subHeading(doc, "4.2 Sound level measurements", y);
  y = bodyText(
    doc,
    "Minimum required: 65 dB(A) general areas · 75 dB(A) sleeping accommodation · 5 dB above ambient.",
    y,
    pageWidth,
    { italic: true, muted: true },
  );
  if (readings.length === 0) {
    y = bodyText(doc, "No reading-by-reading sound level entries recorded — see §5.2 for non-compliant locations.", y, pageWidth, { italic: true, muted: true });
    y += 2;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Location", "Floor", "Ambient dB", "Alarm dB", "Required dB", "Result"]],
      body: readings.map((r) => [
        r.location || "—",
        r.floor ?? "—",
        r.ambient_db != null ? String(r.ambient_db) : "—",
        r.alarm_db != null ? String(r.alarm_db) : "—",
        r.required_db != null ? String(r.required_db) : "—",
        r.result === "pass" ? "PASS" : r.result === "fail" ? "FAIL" : "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: COLORS.charcoal, textColor: COLORS.white, fontSize: 7.5, fontStyle: "bold" },
      styles: { fontSize: 7.5, cellPadding: 1.3, textColor: COLORS.charcoal, lineColor: COLORS.borderGrey },
      columnStyles: {
        2: { halign: "center" },
        3: { halign: "center" },
        4: { halign: "center" },
        5: { halign: "center", fontStyle: "bold", cellWidth: 16 },
      },
    });
    y = lastY(doc) + 3;
  }

  // §4.3 Summary
  const passReadings = readings.filter((r) => r.result === "pass").length;
  const failReadings = readings.filter((r) => r.result === "fail").length;
  y = subHeading(doc, "4.3 Audibility test summary", y);
  y = bodyText(
    doc,
    `Total locations tested: ${readings.length}    ·    Meeting requirements: ${passReadings}    ·    Below requirements: ${failReadings}`,
    y,
    pageWidth,
  );
  y += 4;

  // === §5 Findings & observations ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 40);
  y = sectionHeading(doc, "5. Findings & observations", y, pageWidth);
  const ceIssues = issues.filter((i) => i.kind === "cause_effect");
  const audIssues = issues.filter((i) => i.kind === "audibility");

  y = subHeading(doc, "5.1 Cause & effect issues", y);
  if (ceIssues.length === 0) {
    y = bodyText(doc, "No issues identified.", y, pageWidth, { italic: true, muted: true });
    y += 2;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Issue", "Location / zone", "Severity", "Action required"]],
      body: ceIssues.map((i) => [
        i.description ?? "—",
        i.location ?? "—",
        i.severity === "critical" ? "Critical" : i.severity === "non_critical" ? "Non-critical" : "—",
        i.action_required ?? "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: COLORS.charcoal, textColor: COLORS.white, fontSize: 7.5, fontStyle: "bold" },
      styles: { fontSize: 7.5, cellPadding: 1.3, textColor: COLORS.charcoal, lineColor: COLORS.borderGrey },
    });
    y = lastY(doc) + 3;
  }

  y = subHeading(doc, "5.2 Audibility issues", y);
  if (audIssues.length === 0) {
    y = bodyText(doc, "No issues identified.", y, pageWidth, { italic: true, muted: true });
    y += 2;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Issue", "Location", "Measured dB", "Required dB", "Action required"]],
      body: audIssues.map((i) => [
        i.description ?? "—",
        i.location ?? "—",
        i.measured_db != null ? String(i.measured_db) : "—",
        i.required_db != null ? String(i.required_db) : "—",
        i.action_required ?? "—",
      ]),
      theme: "grid",
      headStyles: { fillColor: COLORS.charcoal, textColor: COLORS.white, fontSize: 7.5, fontStyle: "bold" },
      styles: { fontSize: 7.5, cellPadding: 1.3, textColor: COLORS.charcoal, lineColor: COLORS.borderGrey },
      columnStyles: { 2: { halign: "center" }, 3: { halign: "center" } },
    });
    y = lastY(doc) + 3;
  }

  y = subHeading(doc, "5.3 General observations", y);
  if (report.general_observations?.trim()) {
    y = bodyText(doc, report.general_observations.trim(), y, pageWidth);
  } else {
    y = bodyText(doc, "None recorded.", y, pageWidth, { italic: true, muted: true });
  }
  y += 3;

  // === §6 Remedial works ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 30);
  y = sectionHeading(doc, "6. Remedial works required", y, pageWidth);
  if (remedials.length === 0) {
    y = bodyText(doc, "No remedial works required — system fully compliant.", y, pageWidth, { italic: true, muted: true });
    y += 2;
  } else {
    const total = remedials.reduce((s, r) => s + (r.estimated_cost ?? 0), 0);
    autoTable(doc, {
      startY: y,
      head: [["Priority", "Description", "Location", "Estimated cost"]],
      body: remedials.map((r) => [
        r.priority === "urgent" ? "URGENT" : r.priority === "routine" ? "Routine" : "—",
        r.description ?? "—",
        r.location ?? "—",
        r.estimated_cost != null ? `£${r.estimated_cost.toFixed(2)}` : "—",
      ]),
      foot: [["", "", "Total estimated", `£${total.toFixed(2)}`]],
      theme: "grid",
      headStyles: { fillColor: COLORS.charcoal, textColor: COLORS.white, fontSize: 7.5, fontStyle: "bold" },
      footStyles: { fillColor: COLORS.lightGrey, textColor: COLORS.charcoal, fontSize: 8, fontStyle: "bold" },
      styles: { fontSize: 7.5, cellPadding: 1.5, textColor: COLORS.charcoal, lineColor: COLORS.borderGrey },
      columnStyles: { 3: { halign: "right" } },
    });
    y = lastY(doc) + 4;
  }

  // === §7 Compliance — drawn tickboxes, not unicode glyphs ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 25);
  y = sectionHeading(doc, "7. Compliance statement", y, pageWidth);
  const compliant = report.bs5839_compliant === true;
  const nonCompliant = report.bs5839_compliant === false;

  drawCheckBox(doc, MARGIN, y - 2.5, compliant);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...(compliant ? COLORS.yes : COLORS.mediumGrey));
  doc.text("COMPLIES with BS 5839-1:2017 requirements.", MARGIN + 6, y);
  y += 6;

  drawCheckBox(doc, MARGIN, y - 2.5, nonCompliant);
  doc.setTextColor(...(nonCompliant ? COLORS.no : COLORS.mediumGrey));
  doc.text(
    nonCompliant
      ? "DOES NOT COMPLY — see remedial works in section 6."
      : "DOES NOT COMPLY.",
    MARGIN + 6,
    y,
  );
  doc.setTextColor(...COLORS.charcoal);
  y += 8;

  // === §8 Recommendations ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 25);
  y = sectionHeading(doc, "8. Recommendations", y, pageWidth);
  if (report.notes?.trim()) {
    y = bodyText(doc, report.notes.trim(), y, pageWidth);
    y += 2;
  }
  const recoLines: string[] = [];
  const remedialWindow = formatRemedialTimeframe(report.remedial_timeframe);
  if (remedialWindow) {
    recoLines.push(`• All remedial works should be completed within ${remedialWindow}.`);
  }
  if (report.next_service_due) {
    recoLines.push(`• Next routine service due: ${formatDate(report.next_service_due)}.`);
  }
  recoLines.push("• Cause & effect testing to be repeated annually.");
  recoLines.push("• Full audibility re-test recommended following any building alterations.");
  y = bodyText(doc, recoLines.join("\n"), y, pageWidth);
  y += 4;

  // === §9 Signatures ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 60);
  y = sectionHeading(doc, "9. Signatures", y, pageWidth);
  const sigColWidth = (pageWidth - 2 * MARGIN - 8) / 2;

  doc.setFontSize(8);
  doc.setTextColor(...COLORS.mediumGrey);
  doc.setFont("helvetica", "bold");
  doc.text("ENGINEER", MARGIN, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.charcoal);
  doc.text(report.engineer_name ?? "—", MARGIN, y + 5);
  if (report.engineer_signature?.startsWith("data:image")) {
    try { doc.addImage(report.engineer_signature, "PNG", MARGIN, y + 7, 70, 22); } catch { /* ignore */ }
  } else {
    doc.setDrawColor(...COLORS.borderGrey);
    doc.rect(MARGIN, y + 7, sigColWidth, 22);
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text("Not signed", MARGIN + 4, y + 19);
    doc.setTextColor(...COLORS.charcoal);
  }

  const cx = MARGIN + sigColWidth + 8;
  doc.setTextColor(...COLORS.mediumGrey);
  doc.setFont("helvetica", "bold");
  doc.text("CLIENT / RESPONSIBLE PERSON", cx, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.charcoal);
  doc.text(
    [report.client_sign_name, report.client_sign_position].filter(Boolean).join(" · ") || "—",
    cx,
    y + 5,
  );
  if (report.client_signature?.startsWith("data:image")) {
    try { doc.addImage(report.client_signature, "PNG", cx, y + 7, 70, 22); } catch { /* ignore */ }
  } else {
    doc.setDrawColor(...COLORS.borderGrey);
    doc.rect(cx, y + 7, sigColWidth, 22);
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text("Not signed", cx + 4, y + 19);
    doc.setTextColor(...COLORS.charcoal);
  }
  y += 34;

  // === §10 Attachments — drawn tickboxes, not unicode glyphs ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 36);
  y = sectionHeading(doc, "10. Attachments", y, pageWidth);
  const attachments = [
    "Cause and Effect Matrix",
    "Floor Plans with Test Locations Marked",
    "Sound Level Meter Calibration Certificate",
    "Photographic Evidence (if applicable)",
    "Previous Test Reports for Comparison",
  ];
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.charcoal);
  for (const label of attachments) {
    drawCheckBox(doc, MARGIN, y - 2.5, false);
    doc.text(label, MARGIN + 6, y);
    y += 5;
  }

  // Footer on every page once the body is done.
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    footer(doc, pageWidth, pageHeight);
  }

  const safeSiteName = site.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  const baseName = `CE_Audibility_${visit.job_number ?? safeSiteName}_${(report.report_date ?? "draft").replace(/-/g, "")}`;

  if (options?.returnBlob) {
    return doc.output("blob");
  }
  doc.save(`${baseName}.pdf`);
}

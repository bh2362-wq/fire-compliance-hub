import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import type { CauseEffectReportBundle } from "@/services/causeEffectTestService";

// Match the palette and company constants used by the existing
// pdfGenerator.ts so all BHO Fire PDFs feel like the same family.
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

function header(doc: jsPDF, pageWidth: number, logo: HTMLImageElement | null): number {
  const y = 14;
  if (logo) {
    try { doc.addImage(logo, "PNG", MARGIN, y - 2, 32, 28); } catch { /* ignore */ }
  }
  doc.setTextColor(...COLORS.charcoal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(COMPANY.name, MARGIN + 36, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.darkGrey);
  doc.text(COMPANY.address, MARGIN + 36, y + 9);
  doc.text(`${COMPANY.phone} · ${COMPANY.email}`, MARGIN + 36, y + 13);
  doc.text(COMPANY.website, MARGIN + 36, y + 17);
  doc.setDrawColor(...COLORS.borderGrey);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + 24, pageWidth - MARGIN, y + 24);
  return y + 28;
}

function footer(doc: jsPDF, pageWidth: number, pageHeight: number) {
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.mediumGrey);
  doc.text(
    "This report remains the property of BHO Fire Ltd and may not be reproduced without permission.",
    pageWidth / 2,
    pageHeight - 8,
    { align: "center" },
  );
  doc.text(
    `${COMPANY.registration} · ${COMPANY.country}`,
    pageWidth / 2,
    pageHeight - 4,
    { align: "center" },
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

function bodyText(doc: jsPDF, text: string, y: number, pageWidth: number, opts?: { italic?: boolean }): number {
  doc.setTextColor(...COLORS.charcoal);
  doc.setFont("helvetica", opts?.italic ? "italic" : "normal");
  doc.setFontSize(8);
  const lines = doc.splitTextToSize(text, pageWidth - 2 * MARGIN);
  doc.text(lines, MARGIN, y);
  return y + lines.length * 4.2;
}

function pageBreakIfNeeded(
  doc: jsPDF,
  y: number,
  pageHeight: number,
  pageWidth: number,
  logo: HTMLImageElement | null,
  needed = 30,
): number {
  if (y + needed > pageHeight - 18) {
    footer(doc, pageWidth, pageHeight);
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

function lastY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
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
  const logo = await loadLogo();
  const { report, site, visit, outputs, stages, readings, issues, remedials, deviceTests } = bundle;

  const { customer } = bundle;
  let y = header(doc, pageWidth, logo);

  // === Title row ===
  doc.setTextColor(...COLORS.charcoal);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Fire Alarm Cause & Effect + Audibility Test Report", MARGIN, y + 4);
  doc.setTextColor(...COLORS.red);
  doc.setFontSize(9);
  doc.text("BS 5839-1:2017", MARGIN, y + 10);
  doc.setTextColor(...COLORS.darkGrey);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  if (report.report_number) {
    doc.text(`Ref: ${report.report_number}`, pageWidth - MARGIN, y + 4, { align: "right" });
  }
  doc.text(formatDate(report.report_date), pageWidth - MARGIN, y + 10, { align: "right" });
  y += 16;

  // === Header block (Job / Date / Engineer / Customer / Site) ===
  // Prefer the customer row's name when the engineer left the field
  // blank in the wizard — falls through to client_name then to "—".
  const customerLine =
    report.client_name?.trim() || customer?.name || "—";
  const customerContactLine = customer
    ? [customer.contact_name, customer.contact_email, customer.contact_phone]
        .filter(Boolean)
        .join(" · ") || null
    : null;

  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 1.5, textColor: COLORS.charcoal },
    columnStyles: {
      0: { fontStyle: "bold", textColor: COLORS.mediumGrey, cellWidth: 36 },
      1: { cellWidth: 60 },
      2: { fontStyle: "bold", textColor: COLORS.mediumGrey, cellWidth: 36 },
      3: { cellWidth: "auto" },
    },
    body: [
      ["Job Reference:", visit.job_number ?? "—", "Date of Visit:", formatDate(visit.visit_date)],
      ["Engineer:", report.engineer_name ?? "—", "Customer:", customerLine],
      ...(customerContactLine ? [["", "", "Contact:", customerContactLine]] : []),
      [
        "Site:",
        site.name,
        "Address:",
        [site.address, site.city, site.postcode].filter(Boolean).join(", ") || "—",
      ],
      ...(site.contact_name || site.contact_phone || site.contact_email
        ? [[
            "Site contact:",
            [site.contact_name, site.contact_phone, site.contact_email].filter(Boolean).join(" · "),
            "",
            "",
          ]]
        : []),
      // Sites schema augmentation — render the responsible person on
      // the header band when populated. Two-line collapse keeps the
      // table tight.
      ...(site.duty_holder_name || site.duty_holder_email
        ? [[
            "Responsible person:",
            [site.duty_holder_name, site.duty_holder_role].filter(Boolean).join(" · "),
            "Contact:",
            [site.duty_holder_phone, site.duty_holder_email].filter(Boolean).join(" · ") || "—",
          ]]
        : []),
      // ARC provider line (only when the system is ARC-monitored).
      ...(site.arc_connected && (site.arc_provider || site.arc_account_ref)
        ? [[
            "ARC:",
            [site.arc_provider, site.arc_account_ref].filter(Boolean).join(" · "),
            "",
            "",
          ]]
        : []),
      // Access hours when captured.
      ...(site.access_hours?.trim()
        ? [[
            "Access hours:",
            site.access_hours.trim(),
            "",
            "",
          ]]
        : []),
    ],
  });
  y = lastY(doc) + 4;

  // === §1 Purpose of visit ===
  y = sectionHeading(doc, "1. Purpose of visit", y, pageWidth);
  y = bodyText(
    doc,
    "To conduct cause and effect testing and full audibility testing of the fire alarm system in accordance with BS 5839-1:2017.",
    y,
    pageWidth,
  );
  y += 4;

  // === §2 System details ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 50);
  y = sectionHeading(doc, "2. System details", y, pageWidth);
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5, textColor: COLORS.charcoal, lineColor: COLORS.borderGrey },
    columnStyles: {
      0: { fontStyle: "bold", textColor: COLORS.mediumGrey, cellWidth: 48, fillColor: COLORS.lightGrey },
    },
    body: [
      ["BS 5839 Category", site.bs5839_category ?? "—"],
      ["Panel Make / Model", site.panel_make_model ?? "—"],
      ["Number of Zones", site.num_zones != null ? String(site.num_zones) : "—"],
      ["Number of Devices", site.num_devices != null ? String(site.num_devices) : "—"],
      [
        "ARC Monitoring",
        site.arc_connected === true ? "Yes" : site.arc_connected === false ? "No" : "—",
      ],
    ],
  });
  y = lastY(doc) + 4;

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

  // §3.2 Devices/zones tested
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 25);
  y = subHeading(doc, "3.2 Devices / zones tested", y);
  const deviceRows = deviceTests.length === 0
    ? [["—", "—", "—", "—", "—", "—"]]
    : deviceTests.map((d) => [
        d.location?.split(" ").slice(0, 4).join(" ") ?? "—",
        d.location ?? "—",
        `${d.loop ? `L${d.loop}/` : ""}${d.address ?? "—"}`,
        d.device_type ?? "—",
        d.tested_at ? format(new Date(d.tested_at), "HH:mm") : "—",
        d.status === "passed" ? "✓" : d.status === "fault" ? "✗" : "—",
      ]);
  autoTable(doc, {
    startY: y,
    head: [["Zone Description", "Location", "Address", "Device Type", "Time", "Result"]],
    body: deviceRows,
    theme: "grid",
    headStyles: { fillColor: COLORS.charcoal, textColor: COLORS.white, fontSize: 7.5, fontStyle: "bold" },
    styles: { fontSize: 7.5, cellPadding: 1.3, textColor: COLORS.charcoal, lineColor: COLORS.borderGrey },
    columnStyles: {
      4: { halign: "center", cellWidth: 14 },
      5: { halign: "center", cellWidth: 14, fontStyle: "bold" },
    },
  });
  y = lastY(doc) + 4;

  // §3.3 Output functions verified
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 25);
  y = subHeading(doc, "3.3 Output functions verified", y);
  autoTable(doc, {
    startY: y,
    head: [["Function", "Expected response", "Actual response", "Result"]],
    body: outputs.length === 0
      ? [["—", "—", "—", "—"]]
      : outputs.map((o) => [
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
  y = subHeading(doc, "4.1 Test equipment", y);
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.5, textColor: COLORS.charcoal, lineColor: COLORS.borderGrey },
    columnStyles: {
      0: { fontStyle: "bold", textColor: COLORS.mediumGrey, cellWidth: 48, fillColor: COLORS.lightGrey },
    },
    body: [
      ["Sound Level Meter", report.sound_meter_make_model ?? "—"],
      ["Serial Number", report.sound_meter_serial ?? "—"],
      ["Calibration Due", formatDate(report.sound_meter_cal_due)],
      ["Calibration Certificate", report.sound_meter_cal_on_file ? "On file" : "—"],
    ],
  });
  y = lastY(doc) + 4;

  // §4.2 Sound level measurements
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 25);
  y = subHeading(doc, "4.2 Sound level measurements", y);
  y = bodyText(
    doc,
    "Minimum required: 65 dB(A) general areas · 75 dB(A) sleeping accommodation · 5 dB above ambient.",
    y,
    pageWidth,
    { italic: true },
  );
  autoTable(doc, {
    startY: y,
    head: [["Location", "Floor", "Ambient dB", "Alarm dB", "Required dB", "Result"]],
    body: readings.length === 0
      ? [["—", "—", "—", "—", "—", "—"]]
      : readings.map((r) => [
          r.location || "—",
          r.floor ?? "—",
          r.ambient_db != null ? String(r.ambient_db) : "—",
          r.alarm_db != null ? String(r.alarm_db) : "—",
          r.required_db != null ? String(r.required_db) : "—",
          r.result === "pass" ? "✓" : r.result === "fail" ? "✗" : "—",
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
    y = bodyText(doc, "✓ No issues identified.", y, pageWidth, { italic: true });
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
    y = bodyText(doc, "✓ No issues identified.", y, pageWidth, { italic: true });
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
  y = bodyText(
    doc,
    report.general_observations?.trim() || "— None recorded —",
    y,
    pageWidth,
    report.general_observations ? undefined : { italic: true },
  );
  y += 3;

  // === §6 Remedial works ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 30);
  y = sectionHeading(doc, "6. Remedial works required", y, pageWidth);
  if (remedials.length === 0) {
    y = bodyText(doc, "✓ No remedial works required — system fully compliant.", y, pageWidth, { italic: true });
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

  // === §7 Compliance ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 25);
  y = sectionHeading(doc, "7. Compliance statement", y, pageWidth);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  if (report.bs5839_compliant === true) {
    doc.setTextColor(...COLORS.yes);
    doc.text("☑ COMPLIES with BS 5839-1:2017 requirements.", MARGIN, y);
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text("☐ DOES NOT COMPLY.", MARGIN, y + 5);
  } else if (report.bs5839_compliant === false) {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text("☐ COMPLIES with BS 5839-1:2017 requirements.", MARGIN, y);
    doc.setTextColor(...COLORS.no);
    doc.text("☑ DOES NOT COMPLY — see remedial works in section 6.", MARGIN, y + 5);
  } else {
    doc.setTextColor(...COLORS.mediumGrey);
    doc.text("☐ COMPLIES with BS 5839-1:2017 requirements.", MARGIN, y);
    doc.text("☐ DOES NOT COMPLY.", MARGIN, y + 5);
  }
  doc.setTextColor(...COLORS.charcoal);
  y += 12;

  // === §8 Recommendations ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 25);
  y = sectionHeading(doc, "8. Recommendations", y, pageWidth);
  // Engineer's free-text summary first, then the standing bullets, then
  // any visit-specific timeframes. Putting the engineer's words at the
  // top makes the section read like a covering note rather than a
  // checklist.
  if (report.notes?.trim()) {
    y = bodyText(doc, report.notes.trim(), y, pageWidth);
    y += 2;
  }
  const recoLines: string[] = [];
  if (report.remedial_timeframe) {
    recoLines.push(`• All remedial works should be completed within ${report.remedial_timeframe}.`);
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

  // === §10 Attachments ===
  y = pageBreakIfNeeded(doc, y, pageHeight, pageWidth, logo, 30);
  y = sectionHeading(doc, "10. Attachments", y, pageWidth);
  const attachLines = [
    "☐ Cause and Effect Matrix",
    "☐ Floor Plans with Test Locations Marked",
    "☐ Sound Level Meter Calibration Certificate",
    "☐ Photographic Evidence (if applicable)",
    "☐ Previous Test Reports for Comparison",
  ];
  y = bodyText(doc, attachLines.join("\n"), y, pageWidth);

  footer(doc, pageWidth, pageHeight);

  const safeSiteName = site.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  const baseName = `CE_Audibility_${visit.job_number ?? safeSiteName}_${(report.report_date ?? "draft").replace(/-/g, "")}`;

  if (options?.returnBlob) {
    return doc.output("blob");
  }
  doc.save(`${baseName}.pdf`);
}

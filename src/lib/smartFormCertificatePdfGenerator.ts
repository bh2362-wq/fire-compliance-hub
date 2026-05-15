/**
 * smartFormCertificatePdfGenerator.ts
 * Fire Alarm Service Report — matches BHO_Service_Report_Palantir format exactly.
 * Fixes: logo loading, missing sections, regulation clauses, defects.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { BS5839Payload } from "@/services/smartFormService";
import {
  loadLogoData, loadCompany, san,
  drawCertHeader, drawPage2Header, drawMasterFooter,
  MARGIN, FOOTER_RES, COLORS,
} from "./certPdfMasterTemplate";

// ── Colour shortcuts ─────────────────────────────────────────────────────────
const DARK   : [number,number,number] = [60,  60,  60 ];
const WHITE  : [number,number,number] = [255, 255, 255];
const ORANGE : [number,number,number] = [232,  92,  44];
const BODY   : [number,number,number] = [ 55,  65,  81];
const MUTED  : [number,number,number] = [107, 114, 128];
const BORDER : [number,number,number] = [224, 224, 224];
const ALTROW : [number,number,number] = [250, 250, 250];
const G_FILL : [number,number,number] = [ 46, 125,  50];
const R_FILL : [number,number,number] = [198,  40,  40];
const N_FILL : [number,number,number] = [ 84, 110, 122];

const M = MARGIN;

// ── Helpers ───────────────────────────────────────────────────────────────────
function guard(doc: jsPDF, y: number, need: number): number {
  if (y + need > doc.internal.pageSize.getHeight() - FOOTER_RES) {
    doc.addPage(); return M;
  }
  return y;
}

function secBar(doc: jsPDF, pw: number, y: number, label: string): number {
  doc.setFillColor(...DARK);
  doc.rect(M, y, pw - M * 2, 7, "F");
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text(label, M + 4, y + 5);
  return y + 7;
}

// ── Main ─────────────────────────────────────────────────────────────────────
export async function generateBS5839CertificatePDF(
  payload: BS5839Payload,
  options?: { autoSign?: boolean; engineerFallbackName?: string }
): Promise<{ base64: string; fileName: string }> {

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw  = doc.internal.pageSize.getWidth();

  // Load company FIRST, then logo using the company's stored URL
  const company = await loadCompany();
  const logo    = await loadLogoData(
    company.report_logo_url || company.company_logo_url || null
  );

  const certRef = san(payload.certificate_reference || "DRAFT");
  const svcDate = payload.date_of_service
    ? format(new Date(payload.date_of_service), "dd MMM yyyy") : "";
  const engName = san(
    payload.engineer_declaration_name || payload.engineer_name ||
    options?.engineerFallbackName || ""
  );

  // ── Page 1 header (logo + company) ─────────────────────────────────────
  let y = drawCertHeader(doc, pw, logo, company);

  // ── Title block ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold"); doc.setFontSize(17);
  doc.setTextColor(26, 26, 26);
  doc.text("Fire Alarm Service Report", M, y + 6);

  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  doc.setTextColor(26, 26, 26);
  doc.text(certRef, pw - M, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(format(new Date(), "dd MMM yyyy"), pw - M, y + 5, { align: "right" });

  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.setTextColor(...ORANGE);
  doc.text("BS 5839-1:2025", M, y + 12);
  y += 20;

  // ── SITE / SERVICE ────────────────────────────────────────────────────────
  const half = (pw - M * 2 - 4) / 2;
  const lx   = M;
  const rx   = M + half + 4;

  // SITE left col
  let ly = secBar(doc, pw, y, "SITE") + 4;
  const siteRows: [string, string][] = [
    ["Site:",    san(payload.premises_name    || "")],
    ["Address:", san(payload.premises_address || "")],
    ["Contact:", san(payload.responsible_person_name || "")],
    ["Phone:",   san(payload.responsible_person_contact || "-")],
  ];
  siteRows.forEach(([l, v]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.setTextColor(...MUTED); doc.text(l, lx + 2, ly);
    doc.setTextColor(...BODY);  doc.text(v || "-", lx + 20, ly);
    ly += 5;
  });
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.rect(lx, y, half, ly - y + 2);

  // SERVICE right col
  let ry = secBar(doc, pw, y, "SERVICE") + 4;
  const svcRows: [string, string][] = [
    ["Type:",     san(payload.certificate_type || "Quarterly Service")],
    ["Date:",     svcDate],
    ["Engineer:", engName || "-"],
    ["Status:",   san(payload.overall_status  || "Completed")],
  ];
  svcRows.forEach(([l, v]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.setTextColor(...MUTED); doc.text(l, rx + 2, ry);
    doc.setTextColor(...BODY);  doc.text(v || "-", rx + 20, ry);
    ry += 5;
  });
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.rect(rx, y, half, ry - y + 2);

  y = Math.max(ly, ry) + 5;

  // ── SYSTEM bar ─────────────────────────────────────────────────────────────
  secBar(doc, pw, y, "SYSTEM");
  y += 9;
  const sysCols: [string, string][] = [
    ["Panel:",    san(payload.panel_manufacturer    || "-")],
    ["Model:",    san(payload.panel_model           || "-")],
    ["Category:", (payload.system_categories || []).join(", ") || "-"],
    ["Zones:",    String(payload.approx_number_of_zones    || "-")],
    ["Devices:",  String(payload.approx_number_of_devices  || "-")],
  ];
  const cw = (pw - M * 2) / sysCols.length;
  sysCols.forEach(([l, v], i) => {
    const cx = M + i * cw;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.setTextColor(...MUTED); doc.text(l, cx, y);
    doc.setTextColor(...BODY);  doc.text(v, cx + 13, y);
  });
  y += 7;

  // ── Checklist title ────────────────────────────────────────────────────────
  y = guard(doc, y, 28);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.setTextColor(26, 26, 26);
  doc.text("Fire Detection & Fire Alarm Inspection & Servicing Checklist", M, y + 5);
  y += 9;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.setTextColor(...ORANGE);
  doc.text("As recommended in BAFE SP203-1 Clause 9.8 & BS 5839-1:2025 Clause 45", M, y);
  y += 5;

  // Legend
  let lx2 = pw - M - 76;
  ([["YES", G_FILL], ["NO", R_FILL], ["N/A", N_FILL]] as [string, [number,number,number]][])
    .forEach(([label, col]) => {
      doc.setFillColor(...col);
      doc.rect(lx2, y - 3.5, 5, 5, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.setTextColor(...BODY);
      doc.text(label, lx2 + 7, y);
      lx2 += 26;
    });
  y += 5;

  // ── Checklist table ────────────────────────────────────────────────────────
  const checklist = (payload.checklist || []) as any[];

  type RowMeta = { type: "section"; label: string } | { type: "item"; idx: number };
  const meta: RowMeta[] = [];
  let lastSec = "";
  checklist.forEach((item, idx) => {
    const sec = item.section || "";
    if (sec && sec !== lastSec) {
      meta.push({ type: "section", label: sec });
      lastSec = sec;
    }
    meta.push({ type: "item", idx });
  });

  const TW = pw - M * 2;
  const body: any[][] = meta.map(m => {
    if (m.type === "section") {
      return [{ content: m.label.toUpperCase(), colSpan: 4 }];
    }
    const item = checklist[m.idx];
    const isSpecial = item.special === "number" || item.special === "text";
    if (isSpecial) {
      return [
        { content: san(item.label) },
        { content: san(item.comment ?? item.value ?? ""), colSpan: 3,
          styles: { halign: "center", fontStyle: "bold" } },
      ];
    }
    return [san(item.label), "", "", ""];
  });

  autoTable(doc, {
    startY: y,
    head: [["Requirement", "YES", "NO", "N/A"]],
    body,
    margin: { left: M, right: M, bottom: FOOTER_RES },
    tableWidth: TW,
    theme: "grid",
    headStyles: {
      fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 8,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
    },
    styles: {
      fontSize: 8.5, textColor: BODY,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      lineColor: BORDER, lineWidth: 0.15, overflow: "linebreak",
    },
    alternateRowStyles: { fillColor: ALTROW },
    columnStyles: {
      0: { cellWidth: TW - 42 },
      1: { cellWidth: 14, halign: "center" },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 14, halign: "center" },
    },
    didParseCell(data) {
      if (data.section !== "body") return;
      const row = meta[data.row.index];
      if (!row) return;

      if (row.type === "section") {
        data.cell.styles.fillColor     = DARK;
        data.cell.styles.textColor     = WHITE;
        data.cell.styles.fontStyle     = "bold";
        data.cell.styles.fontSize      = 7.5;
        data.cell.styles.cellPadding   = { top: 2, bottom: 2, left: 3, right: 3 } as any;
        return;
      }

      if (row.type === "item") {
        const item = checklist[row.idx];
        if (!item) return;
        const s = item.status || "";
        const ci = data.column.index;
        if (ci === 1) {
          data.cell.styles.fillColor = s === "YES" ? G_FILL : WHITE;
          data.cell.styles.textColor = s === "YES" ? WHITE  : MUTED;
        } else if (ci === 2) {
          data.cell.styles.fillColor = s === "NO"  ? R_FILL : WHITE;
          data.cell.styles.textColor = s === "NO"  ? WHITE  : MUTED;
        } else if (ci === 3) {
          data.cell.styles.fillColor = s === "N/A" ? N_FILL : WHITE;
          data.cell.styles.textColor = s === "N/A" ? WHITE  : MUTED;
        }
      }
    },
    didDrawPage() {
      const pg = doc.getCurrentPageInfo().pageNumber;
      if (pg > 1) {
        drawPage2Header(doc, pw, logo, certRef,
          "Fire Alarm Service Report", "BS 5839-1:2025", company);
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // ── Condition / Next Service ────────────────────────────────────────────────
  y = guard(doc, y, 12);
  const cond = san(payload.overall_status || "NOT ASSESSED");
  const nsd  = payload.next_service_date
    ? format(new Date(payload.next_service_date), "dd MMM yyyy") : "—";
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.rect(M, y, pw - M * 2, 10);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(26, 26, 26);
  doc.text("Condition:", M + 4, y + 6.5);
  doc.setFont("helvetica", "bold"); doc.setTextColor(...ORANGE);
  doc.text(cond, M + 27, y + 6.5);
  doc.setFont("helvetica", "normal"); doc.setTextColor(26, 26, 26);
  doc.text("Next Service:", pw / 2 + 2, y + 6.5);
  doc.setFont("helvetica", "bold");
  doc.text(nsd, pw / 2 + 30, y + 6.5);
  y += 14;

  // ── Device testing ─────────────────────────────────────────────────────────
  const totalDev  = Number(payload.total_devices)  || 0;
  const testedDev = Number(payload.devices_tested) || 0;
  const pctTested = totalDev > 0 ? Math.round((testedDev / totalDev) * 100) : 0;
  if (totalDev > 0 || testedDev > 0 || payload.testing_method) {
    y = guard(doc, y, 20);
    y = secBar(doc, pw, y, "DEVICE TESTING") + 4;
    const devRows: [string, string][] = [
      ["Total devices on system:", String(totalDev  || "—")],
      ["Devices tested this visit:", String(testedDev || "—")],
      ["Percentage tested:", totalDev > 0 ? `${pctTested}%` : "—"],
      ["Testing method:", san(payload.testing_method || "—")],
    ];
    if (payload.devices_not_tested) {
      devRows.push(["Devices not tested:", san(payload.devices_not_tested)]);
    }
    if (payload.reason_not_tested) {
      devRows.push(["Reason not tested:", san(payload.reason_not_tested)]);
    }
    devRows.forEach(([l, v]) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.setTextColor(...MUTED); doc.text(l, M + 2, y);
      doc.setTextColor(...BODY);  doc.text(v, M + 64, y);
      y += 5;
    });
    y += 2;
  }

  // ── Work carried out ────────────────────────────────────────────────────────
  if (payload.work_carried_out || payload.parts_used || payload.final_remarks) {
    y = guard(doc, y, 18);
    y = secBar(doc, pw, y, "WORK CARRIED OUT") + 4;

    if (payload.work_carried_out) {
      const wlines = doc.splitTextToSize(san(payload.work_carried_out), pw - M * 2 - 4);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...BODY);
      wlines.forEach((l: string) => { y = guard(doc, y, 5); doc.text(l, M + 2, y); y += 4.5; });
      y += 2;
    }
    if (payload.parts_used) {
      y = guard(doc, y, 8);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text("Parts used:", M + 2, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(...BODY);
      doc.text(san(payload.parts_used), M + 26, y);
      y += 5;
    }
    if (payload.final_remarks) {
      y = guard(doc, y, 8);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text("Final remarks:", M + 2, y);
      y += 4.5;
      const flines = doc.splitTextToSize(san(payload.final_remarks), pw - M * 2 - 4);
      doc.setFont("helvetica", "normal"); doc.setTextColor(...BODY);
      flines.forEach((l: string) => { y = guard(doc, y, 5); doc.text(l, M + 2, y); y += 4.5; });
    }
    y += 3;
  }

  // ── Defects ─────────────────────────────────────────────────────────────────
  const defects = (payload.defects || []) as any[];
  if (defects.length > 0) {
    y = guard(doc, y, 20);
    y = secBar(doc, pw, y, `DEFECTS / NON-COMPLIANCES (${defects.length})`);

    autoTable(doc, {
      startY: y,
      head: [["#", "Location", "Description", "Severity", "Recommended Action", "Status"]],
      body: defects.map((d: any, i: number) => [
        i + 1,
        san(d.location || ""),
        san(d.description || ""),
        san(d.severity || ""),
        san(d.recommended_action || ""),
        san(d.status || "Open"),
      ]),
      margin: { left: M, right: M, bottom: FOOTER_RES },
      tableWidth: pw - M * 2,
      headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 7.5,
        cellPadding: { top: 2, bottom: 2, left: 3, right: 3 } },
      styles: { fontSize: 7.5, textColor: BODY, lineColor: BORDER, lineWidth: 0.15,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 }, overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: 8,  halign: "center" },
        1: { cellWidth: 24 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 16, halign: "center" },
        4: { cellWidth: "auto" },
        5: { cellWidth: 16, halign: "center" },
      },
      alternateRowStyles: { fillColor: ALTROW },
      didParseCell(h) {
        if (h.section !== "body") return;
        const d = defects[h.row.index];
        if (!d) return;
        const sev = (d.severity || "").toLowerCase();
        const st  = (d.status   || "").toLowerCase();
        if (h.column.index === 3) {
          h.cell.styles.fontStyle = "bold";
          if      (sev === "critical") h.cell.styles.textColor = [198,  40,  40] as any;
          else if (sev === "major")    h.cell.styles.textColor = [230, 120,   0] as any;
          else if (sev === "minor")    h.cell.styles.textColor = [ 25, 100, 150] as any;
        }
        if (h.column.index === 5) {
          if      (st === "open")   h.cell.styles.textColor = [198,  40,  40] as any;
          else if (st === "closed") h.cell.styles.textColor = [ 46, 125,  50] as any;
        }
      },
      didDrawPage() {
        const pg = doc.getCurrentPageInfo().pageNumber;
        if (pg > 1) {
          drawPage2Header(doc, pw, logo, certRef,
            "Fire Alarm Service Report", "BS 5839-1:2025", company);
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── Signatures ─────────────────────────────────────────────────────────────
  y = guard(doc, y, 42);
  const sigW = (pw - M * 2 - 4) / 2;

  // ENGINEER
  secBar(doc, pw, y, "ENGINEER");
  let ey = y + 9;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(26, 26, 26);
  doc.text(engName || "—", M + 2, ey); ey += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  const engDate = payload.engineer_signed_date
    ? format(new Date(payload.engineer_signed_date), "dd/MM/yyyy") : svcDate;
  doc.text(`Signed: ${engDate}`, M + 2, ey); ey += 16;
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.4);
  doc.line(M + 2, ey, M + sigW - 4, ey); ey += 4;
  doc.setFontSize(7.5); doc.text("Signature", M + 2, ey);

  // CLIENT
  const clx = M + sigW + 4;
  secBar(doc, pw, y, "CLIENT");
  let cy2 = y + 9;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(26, 26, 26);
  doc.text(san(payload.client_name || "—"), clx + 2, cy2); cy2 += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  const clientDate = payload.client_signed_date
    ? format(new Date(payload.client_signed_date), "dd/MM/yyyy") : svcDate;
  doc.text(`Signed: ${clientDate}`, clx + 2, cy2); cy2 += 16;
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.4);
  doc.line(clx + 2, cy2, clx + sigW - 4, cy2); cy2 += 4;
  doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text("Signature", clx + 2, cy2);

  // ── Footer on every page ───────────────────────────────────────────────────
  drawMasterFooter(doc, pw);

  const b64 = doc.output("datauristring").split(",")[1];
  return { base64: b64, fileName: `${certRef}.pdf` };
}

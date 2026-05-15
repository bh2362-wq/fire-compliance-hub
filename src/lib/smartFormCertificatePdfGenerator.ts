/**
 * smartFormCertificatePdfGenerator.ts
 *
 * Produces the "Fire Alarm Service Report" — the 4-page format matching
 * the paper certificate exactly (not the old 9-section complex format).
 *
 * Layout:
 *   p1: Header → Title → SITE/SERVICE blocks → SYSTEM bar → Checklist start
 *   p2-3: Checklist continues
 *   p3 end: Condition + Next Service
 *   p4+: Work Carried Out → Defects → Signatures
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { BS5839Payload, percentageTested } from "@/services/smartFormService";
import {
  loadLogoData, loadCompany, san,
  drawMasterFooter, MARGIN, FOOTER_RES,
} from "./certPdfMasterTemplate";

// ── Colours ───────────────────────────────────────────────────────────────────
const DARK   : [number,number,number] = [60, 60, 60];      // #3c3c3c section headers
const WHITE  : [number,number,number] = [255,255,255];
const ORANGE : [number,number,number] = [232, 92, 44];     // #e85c2c BS ref
const BODY   : [number,number,number] = [55, 65, 81];      // body text
const MUTED  : [number,number,number] = [107,114,128];     // labels
const BORDER : [number,number,number] = [224,224,224];     // #e0e0e0
const ALTROW : [number,number,number] = [250,250,250];
const G_FILL : [number,number,number] = [46,125,50];       // YES green
const R_FILL : [number,number,number] = [198,40,40];       // NO red
const N_FILL : [number,number,number] = [84,110,122];      // N/A grey

const M = MARGIN;

// ── Page break guard ──────────────────────────────────────────────────────────
function guard(doc: jsPDF, y: number, need: number): number {
  if (y + need > doc.internal.pageSize.getHeight() - FOOTER_RES) {
    doc.addPage(); return M;
  }
  return y;
}

// ── Dark section header bar ───────────────────────────────────────────────────
function secBar(doc: jsPDF, pw: number, y: number, label: string, suffix?: string): number {
  doc.setFillColor(...DARK);
  doc.rect(M, y, pw - M * 2, 7, "F");
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text(label, M + 4, y + 5);
  if (suffix) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text(suffix, pw - M - 2, y + 5, { align: "right" });
  }
  return y + 7;
}

// ── Inline label + value row ──────────────────────────────────────────────────
function kv(doc: jsPDF, label: string, value: string, x: number, y: number, lw = 22) {
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(label, x, y);
  doc.setTextColor(...BODY);
  doc.text(san(value), x + lw, y);
}

function triggerPdfDownload(doc: jsPDF, fileName: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    doc.save(fileName);
    return;
  }

  const blob = doc.output("blob");
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateBS5839CertificatePDF(
  payload: BS5839Payload,
  options?: { autoSign?: boolean; engineerFallbackName?: string }
): Promise<{ base64: string; fileName: string }> {

  const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw   = doc.internal.pageSize.getWidth();
  const ph   = doc.internal.pageSize.getHeight();

  const [logo, company] = await Promise.all([loadLogoData(null), loadCompany()]);
  const certRef = san(payload.certificate_reference || "DRAFT");
  const svcDate = payload.date_of_service
    ? format(new Date(payload.date_of_service), "dd MMM yyyy") : "";
  const engName = san(
    payload.engineer_declaration_name || payload.engineer_name ||
    options?.engineerFallbackName || ""
  );
  const compName = san(company.company_name || "BHO Fire Ltd");

  // ── PAGE HEADER (draw on every new page via callback) ────────────────────
  const drawRunningHeader = () => {
    const cw = pw - M * 2;
    // Logo
    if (logo) {
      try { doc.addImage(logo.base64, "PNG", M, 10, logo.w || 22, logo.h || 22); } catch {}
    }
    // Company block top-right
    const rx = pw - M; let ry = 12;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(26, 26, 26);
    doc.text(compName, rx, ry, { align: "right" }); ry += 4;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    const addr = san(company.address || "St Georges Business Park, Castle Rd");
    doc.text(addr, rx, ry, { align: "right" }); ry += 3.5;
    const city = san(company.city ? `${company.city} ${company.postcode || ""}`.trim() : "Sittingbourne ME10 3TB");
    doc.text(city, rx, ry, { align: "right" }); ry += 3.5;
    doc.text(`T: ${san(company.phone || "0330 043 8659")}`, rx, ry, { align: "right" }); ry += 3.5;
    doc.text(`E: ${san(company.email || "admin@bhofire.com")}`, rx, ry, { align: "right" });
    // Divider
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
    doc.line(M, 34, pw - M, 34);
  };

  drawRunningHeader();
  let y = 40;

  // ── TITLE BLOCK ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(26, 26, 26);
  doc.text("Fire Alarm Service Report", M, y + 6);
  // Standard ref top-right
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(26, 26, 26);
  doc.text(certRef, pw - M, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(format(new Date(), "dd MMM yyyy"), pw - M, y + 5, { align: "right" });
  // BS ref below title
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...ORANGE);
  doc.text("BS 5839-1:2025", M, y + 12);
  y += 20;

  // ── SITE / SERVICE blocks ────────────────────────────────────────────────
  const half = (pw - M * 2 - 4) / 2;
  const lx = M, rx2 = M + half + 4;

  // SITE
  let ly = secBar(doc, pw, y, "SITE") + 3;
  const siteFields: [string, string][] = [
    ["Site:",     san(payload.premises_name || "")],
    ["Address:",  san(payload.premises_address || "")],
    ["Contact:",  san(payload.responsible_person_name || "")],
    ["Phone:",    san(payload.responsible_person_contact || "-")],
  ];
  siteFields.forEach(([l, v]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(l, lx + 2, ly);
    doc.setTextColor(...BODY); doc.text(v || "-", lx + 20, ly);
    ly += 5;
  });
  // Draw SITE border
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.rect(lx, y, half, ly - y + 1);

  // SERVICE
  let ry3 = y;
  secBar(doc, pw, ry3, "SERVICE");
  ry3 += 7 + 3;
  const svcFields: [string, string][] = [
    ["Type:",      san(payload.certificate_type || "")],
    ["Date:",      svcDate],
    ["Engineer:",  engName || "-"],
    ["Status:",    san(payload.overall_status || "Completed")],
  ];
  svcFields.forEach(([l, v]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(l, rx2 + 2, ry3);
    doc.setTextColor(...BODY); doc.text(v || "-", rx2 + 20, ry3);
    ry3 += 5;
  });
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.rect(rx2, y, half, ry3 - y + 1);

  // Draw SITE left border only (for right col, draw after determining height)
  y = Math.max(ly, ry3) + 5;

  // ── SYSTEM bar ───────────────────────────────────────────────────────────
  secBar(doc, pw, y, "SYSTEM");
  y += 9;
  const sysFields: [string, string][] = [
    ["Panel:",    san(payload.panel_manufacturer || "-")],
    ["Model:",    san(payload.panel_model || "-")],
    ["Category:", (payload.system_categories || []).join(", ") || "-"],
    ["Zones:",    String(payload.approx_number_of_zones || "-")],
    ["Devices:",  String(payload.approx_number_of_devices || "-")],
  ];
  const colW = (pw - M * 2) / sysFields.length;
  sysFields.forEach(([l, v], i) => {
    const cx = M + i * colW;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(l, cx, y);
    doc.setTextColor(...BODY); doc.text(v, cx + 14, y);
  });
  y += 7;

  // ── CHECKLIST header ──────────────────────────────────────────────────────
  y = guard(doc, y, 30);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(26, 26, 26);
  doc.text("Fire Detection & Fire Alarm Inspection & Servicing Checklist", M, y + 5);
  y += 9;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...ORANGE);
  doc.text("As recommended in BAFE SP203-1 Clause 9.8 & BS5839-1:2025 Clause 45", M, y);
  y += 5;

  // Legend
  const legendItems: [string, [number,number,number]][] = [
    ["YES", G_FILL], ["NO", R_FILL], ["N/A", N_FILL],
  ];
  let lx2 = pw - M - 80;
  legendItems.forEach(([label, color]) => {
    doc.setFillColor(...color);
    doc.rect(lx2, y - 4, 5, 5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...BODY);
    doc.text(label, lx2 + 7, y);
    lx2 += 26;
  });
  y += 5;

  // ── CHECKLIST TABLE ───────────────────────────────────────────────────────
  const checklist = payload.checklist || [];

  // Build rows meta and body
  type RowMeta = { type: "section"; label: string } | { type: "item"; idx: number };
  const meta: RowMeta[] = [];
  let lastSection = "";
  checklist.forEach((item: any, idx: number) => {
    const sec = item.section || "";
    if (sec && sec !== lastSection) {
      meta.push({ type: "section", label: sec });
      lastSection = sec;
    }
    meta.push({ type: "item", idx });
  });

  const tableBody: any[][] = meta.map(m => {
    if (m.type === "section") {
      return [{ content: m.label.toUpperCase(), colSpan: 4 }];
    }
    const item: any = checklist[m.idx];
    const isSpecial = item.special === "number" || item.special === "text";
    if (isSpecial) {
      const val = item.comment ?? "";
      return [
        { content: san(item.label) },
        { content: san(val), colSpan: 3, styles: { halign: "center", fontStyle: "bold" } },
      ];
    }
    return [san(item.label), "", "", ""];
  });

  const CW = pw - M * 2;

  autoTable(doc, {
    startY: y,
    head: [["Requirement", "YES", "NO", "N/A"]],
    body: tableBody,
    margin: { left: M, right: M, bottom: FOOTER_RES },
    tableWidth: CW,
    theme: "grid",
    headStyles: {
      fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 8,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
    },
    styles: {
      fontSize: 8.5, textColor: BODY,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      lineColor: BORDER, lineWidth: 0.15, overflow: "linebreak",
    },
    alternateRowStyles: { fillColor: ALTROW },
    columnStyles: {
      0: { cellWidth: CW - 42 },
      1: { cellWidth: 14, halign: "center" },
      2: { cellWidth: 14, halign: "center" },
      3: { cellWidth: 14, halign: "center" },
    },
    didParseCell(data) {
      if (data.section !== "body") return;
      const rowMeta = meta[data.row.index];

      // Section header rows
      if (rowMeta?.type === "section") {
        data.cell.styles.fillColor = DARK;
        data.cell.styles.textColor = WHITE;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 7.5;
        data.cell.styles.lineColor = [80, 80, 80] as any;
        return;
      }

      // Item rows — colour YES/NO/N/A cells
      if (rowMeta?.type === "item") {
        const item: any = checklist[rowMeta.idx];
        if (!item) return;
        const status = item.status || "";
        const ci = data.column.index;
        if (ci === 1) {
          data.cell.styles.fillColor = status === "YES" ? G_FILL : WHITE;
          data.cell.styles.textColor = status === "YES" ? WHITE : MUTED;
        } else if (ci === 2) {
          data.cell.styles.fillColor = status === "NO" ? R_FILL : WHITE;
          data.cell.styles.textColor = status === "NO" ? WHITE : MUTED;
        } else if (ci === 3) {
          data.cell.styles.fillColor = status === "N/A" ? N_FILL : WHITE;
          data.cell.styles.textColor = status === "N/A" ? WHITE : MUTED;
        }
      }
    },
    didDrawPage() {
      // Running header on pages 2+
      const pg = doc.getCurrentPageInfo().pageNumber;
      if (pg > 1) {
        drawRunningHeader();
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
        doc.text(`${certRef}  ·  Fire Alarm Service Report  ·  BS 5839-1:2025`, pw / 2, 36, { align: "center" });
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // ── CONDITION / NEXT SERVICE footer row ───────────────────────────────────
  y = guard(doc, y, 10);
  const cond = san(payload.overall_status || "NOT ASSESSED");
  const nsd  = payload.next_service_date
    ? format(new Date(payload.next_service_date), "dd MMM yyyy") : "—";
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(26, 26, 26);
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.2);
  doc.rect(M, y, pw - M * 2, 10);
  doc.text(`Condition: `, M + 4, y + 6.5);
  doc.setFont("helvetica", "bold"); doc.setTextColor(...ORANGE);
  doc.text(cond, M + 26, y + 6.5);
  doc.setFont("helvetica", "normal"); doc.setTextColor(26, 26, 26);
  doc.text(`Next Service:`, pw / 2 + 4, y + 6.5);
  doc.setFont("helvetica", "bold"); doc.setTextColor(26, 26, 26);
  doc.text(nsd, pw / 2 + 32, y + 6.5);
  y += 14;

  // ── WORK CARRIED OUT ──────────────────────────────────────────────────────
  if (payload.work_carried_out || payload.parts_used || payload.final_remarks) {
    y = guard(doc, y, 20);
    y = secBar(doc, pw, y, "WORK CARRIED OUT") + 4;

    if (payload.work_carried_out) {
      const lines = doc.splitTextToSize(san(payload.work_carried_out), pw - M * 2 - 6);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...BODY);
      lines.forEach((l: string) => { y = guard(doc, y, 5); doc.text(l, M + 2, y); y += 4.5; });
      y += 2;
    }

    if (payload.parts_used) {
      y = guard(doc, y, 10);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text("Parts used:", M + 2, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(...BODY);
      doc.text(san(payload.parts_used), M + 24, y);
      y += 5;
    }

    if (payload.final_remarks) {
      y = guard(doc, y, 10);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.text("Final remarks:", M + 2, y);
      y += 4.5;
      const flines = doc.splitTextToSize(san(payload.final_remarks), pw - M * 2 - 6);
      doc.setFont("helvetica", "normal"); doc.setTextColor(...BODY);
      flines.forEach((l: string) => { y = guard(doc, y, 5); doc.text(l, M + 2, y); y += 4.5; });
      y += 2;
    }
  }

  // ── DEFECTS ───────────────────────────────────────────────────────────────
  // Include ALL defects: new ones added this visit AND ones imported from
  // the site defects register (which have _register_id set).
  const defects = (payload.defects || []) as any[];
  if (defects.length > 0) {
    y = guard(doc, y, 24);
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
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 26 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 18, halign: "center" },
        4: { cellWidth: "auto" },
        5: { cellWidth: 18, halign: "center" },
      },
      alternateRowStyles: { fillColor: ALTROW },
      didParseCell(h) {
        if (h.section !== "body") return;
        const d = defects[h.row.index];
        if (!d) return;
        const sev = (d.severity || "").toLowerCase();
        if (h.column.index === 3) {
          h.cell.styles.fontStyle = "bold";
          if (sev === "critical") h.cell.styles.textColor = [198, 40, 40];
          else if (sev === "major") h.cell.styles.textColor = [230, 120, 0];
          else if (sev === "minor") h.cell.styles.textColor = [25, 100, 150];
        }
        if (h.column.index === 5) {
          const st = (d.status || "").toLowerCase();
          if (st === "open") h.cell.styles.textColor = [198, 40, 40];
          else if (st === "closed") h.cell.styles.textColor = [46, 125, 50];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── SIGNATURES ────────────────────────────────────────────────────────────
  y = guard(doc, y, 40);
  const sigW = (pw - M * 2 - 4) / 2;

  // ENGINEER
  const elx = M;
  secBar(doc, pw, y, "ENGINEER");
  let ey = y + 9;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(26, 26, 26);
  doc.text(engName || "—", elx + 2, ey); ey += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  const engDate = payload.engineer_signed_date
    ? format(new Date(payload.engineer_signed_date), "dd/MM/yyyy") : svcDate;
  doc.text(`Signed: ${engDate}`, elx + 2, ey); ey += 14;
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.4);
  doc.line(elx + 2, ey, elx + sigW - 4, ey); ey += 4;
  doc.setFontSize(7.5); doc.text("Signature", elx + 2, ey);

  // CLIENT
  const clx = M + sigW + 4;
  secBar(doc, pw, y, "CLIENT");
  let cy2 = y + 9;
  const clientName = san(payload.client_name || "—");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(26, 26, 26);
  doc.text(clientName, clx + 2, cy2); cy2 += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  const clientDate = payload.client_signed_date
    ? format(new Date(payload.client_signed_date), "dd/MM/yyyy") : svcDate;
  doc.text(`Signed: ${clientDate}`, clx + 2, cy2); cy2 += 14;
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.4);
  doc.line(clx + 2, cy2, clx + sigW - 4, cy2); cy2 += 4;
  doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text("Signature", clx + 2, cy2);

  // ── FOOTERS ───────────────────────────────────────────────────────────────
  try {
    drawMasterFooter(doc, pw);
  } catch {
    // fallback simple footer
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      const fy = ph - 13;
      doc.setDrawColor(...BORDER); doc.setLineWidth(0.3); doc.line(M, fy, pw - M, fy);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(156,163,175);
      doc.text(`${compName} | Company Registration No. 12235152 | FIA Member | BAFE Registered`, M, fy + 4);
      doc.text(`Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pw - M, fy + 4, { align: "right" });
      doc.text(`Page ${i} of ${n}`, pw / 2, fy + 9, { align: "center" });
    }
  }

  // ── Return ────────────────────────────────────────────────────────────────
  const fileName = `${certRef}.pdf`;
  const b64 = doc.output("datauristring").split(",")[1];
  // Trigger browser download
  try { triggerPdfDownload(doc, fileName); } catch (e) { console.error("PDF download failed", e); doc.save(fileName); }
  return { base64: b64, fileName };
}

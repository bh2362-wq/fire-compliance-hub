/**
 * BHO Fire & Security — Master Certificate PDF Template
 * ======================================================
 * Single source of truth for header, footer, section headers,
 * cards, tables, signatures. All colours/spacing match
 * quotationPdfGenerator.ts exactly.
 *
 * Drop this file at: src/lib/certPdfMasterTemplate.ts
 * All four cert generators import from here.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// ── Exact colour palette from quotationPdfGenerator.ts ───────────────────────
export const COLORS = {
  primary:    [28, 28, 32]    as [number, number, number],   // #1C1C20
  accent:     [185, 28, 28]   as [number, number, number],   // #B91C1C
  textPri:    [17, 24, 39]    as [number, number, number],   // #111827
  textSec:    [55, 65, 81]    as [number, number, number],   // #374151
  textMut:    [107, 114, 128] as [number, number, number],   // #6B7280
  textLgt:    [156, 163, 175] as [number, number, number],   // #9CA3AF
  bgLight:    [249, 250, 251] as [number, number, number],   // #F9FAFB
  bgSubtle:   [243, 244, 246] as [number, number, number],   // #F3F4F6
  border:     [229, 231, 235] as [number, number, number],   // #E5E7EB
  borderDark: [209, 213, 219] as [number, number, number],   // #D1D5DB
  white:      [255, 255, 255] as [number, number, number],
  greenDark:  [20, 83, 45]    as [number, number, number],
  greenBg:    [220, 252, 231] as [number, number, number],
  greenBd:    [134, 239, 172] as [number, number, number],
  ambDark:    [146, 64, 14]   as [number, number, number],
  ambBg:      [254, 252, 232] as [number, number, number],
  ambBd:      [253, 224, 71]  as [number, number, number],
  redBg:      [254, 242, 242] as [number, number, number],
  redBd:      [252, 165, 165] as [number, number, number],
};

export const MARGIN = 15;         // mm
export const FOOTER_RES = 26;     // mm from bottom — keep content above this

// ── Sanitise text (strips non-latin chars, fixes smart quotes) ────────────────
export function san(t: string | null | undefined): string {
  if (!t) return "";
  return String(t)
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013]/g, "-").replace(/[\u2014]/g, "--")
    .replace(/[\u2022\u2023\u25E6\u2043]/g, "-")
    .replace(/[\u2026]/g, "...").replace(/[\u00A0]/g, " ")
    .replace(/[^\x00-\x7F\xA3\xC0-\xFF]/g, "")
    .trim();
}

// ── Logo loader ───────────────────────────────────────────────────────────────
interface LogoData { base64: string; w: number; h: number }

export async function loadLogoData(url: string | null | undefined): Promise<LogoData | null> {
  if (!url) return null;
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const base64: string = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror  = () => resolve("");
      reader.readAsDataURL(blob);
    });
    if (!base64) return null;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload  = () => resolve({ base64, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ base64, w: 100, h: 100 });
      img.src = base64;
    });
  } catch { return null; }
}

function fitLogo(nw: number, nh: number, maxW = 32, maxH = 28): [number, number] {
  const r = nw / nh;
  let w = maxW, h = w / r;
  if (h > maxH) { h = maxH; w = h * r; }
  return [w, h];
}

// ── Company settings loader ───────────────────────────────────────────────────
export interface CompanySettings {
  company_name?: string;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  phone?: string | null;
  email?: string | null;
  vat_number?: string | null;
  company_logo_url?: string | null;
  report_logo_url?: string | null;
}

export async function loadCompany(): Promise<CompanySettings> {
  const { data } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
  return data ?? {};
}

// ── PAGE HEADER (Page 1) — logo left, company right, rule below ──────────────
// Matches addHeader() in quotationPdfGenerator.ts exactly
export function drawCertHeader(
  doc: jsPDF, pw: number, logo: LogoData | null, company: CompanySettings
): number {
  const yLogo = 18;   // mm from top — logo top at 18mm, bottom at 46mm
  const ml    = MARGIN;

  if (logo) {
    const [lw, lh] = fitLogo(logo.w, logo.h);
    try { doc.addImage(logo.base64, "PNG", ml, yLogo, lw, lh, undefined, "FAST"); }
    catch { _companyNameFallback(doc, ml, yLogo + 10, company); }
  } else {
    _companyNameFallback(doc, ml, yLogo + 10, company);
  }

  // Company details — right-aligned, matches quotation
  const rx = pw - ml;
  const name = san(company.company_name) || "BHO Fire Ltd";
  let cy = 20;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.setTextColor(...COLORS.textSec);
  doc.text(name, rx, cy, { align: "right" }); cy += 7;

  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.textMut);
  if (company.address) { doc.text(san(company.address), rx, cy, { align: "right" }); cy += 5; }
  const cityPost = [company.city, company.postcode].filter(Boolean).join(", ");
  if (cityPost) { doc.text(cityPost, rx, cy, { align: "right" }); cy += 5; }
  if (company.phone) { doc.text(`T: ${company.phone}`, rx, cy, { align: "right" }); cy += 5; }
  if (company.email) { doc.text(`E: ${company.email}`, rx, cy, { align: "right" }); }

  // Rule at 50mm (logo ends at ~46mm)
  const ruleY = 50;
  doc.setDrawColor(...COLORS.border); doc.setLineWidth(0.3);
  doc.line(ml, ruleY, pw - ml, ruleY);
  return ruleY + 8;   // content starts at 58mm
}

function _companyNameFallback(doc: jsPDF, x: number, y: number, company: CompanySettings) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.setTextColor(...COLORS.primary);
  doc.text(san(company.company_name) || "BHO Fire Ltd", x, y);
}

// ── PAGE 2+ COMPACT HEADER ───────────────────────────────────────────────────
export function drawPage2Header(
  doc: jsPDF, pw: number, logo: LogoData | null,
  certRef: string, title: string, standard: string, company: CompanySettings
): number {
  const ml = MARGIN;
  const yLogo = 18;

  if (logo) {
    const [lw, lh] = fitLogo(logo.w, logo.h);
    try { doc.addImage(logo.base64, "PNG", ml, yLogo, lw, lh, undefined, "FAST"); }
    catch { _companyNameFallback(doc, ml, yLogo + 10, company); }
  } else {
    _companyNameFallback(doc, ml, yLogo + 8, company);
  }

  const rx = pw - ml;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.setTextColor(...COLORS.primary);
  doc.text(certRef, rx, 24, { align: "right" });

  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.setTextColor(...COLORS.textMut);
  doc.text(title, rx, 32, { align: "right" });
  doc.setFontSize(7.5);
  doc.text(standard, rx, 39, { align: "right" });

  doc.setDrawColor(...COLORS.border); doc.setLineWidth(0.3);
  doc.line(ml, 50, pw - ml, 50);
  return 58;
}

// ── TITLE BLOCK — CERTIFICATE in black 28pt ───────────────────────────────────
export function drawCertTitle(
  doc: jsPDF, pw: number, y: number,
  certRef: string, typeLabel: string, subtitle: string, standard: string
): number {
  const ml = MARGIN;
  doc.setFont("helvetica", "bold"); doc.setFontSize(28);
  doc.setTextColor(...COLORS.textPri);
  doc.text(typeLabel, ml, y + 8);

  doc.setFontSize(12);
  doc.text(certRef, pw - ml, y + 4, { align: "right" });
  y += 18;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.setTextColor(...COLORS.textSec);
  doc.text(subtitle, ml, y); y += 7;
  doc.text(standard, ml, y); y += 10;
  return y;
}

// ── INFO CARDS ────────────────────────────────────────────────────────────────
export interface CardField { label: string; value: string; plain?: boolean }

export function drawInfoCards(
  doc: jsPDF, pw: number, y: number,
  certFields: CardField[], issuedToFields: CardField[]
): number {
  const ml  = MARGIN;
  const cw  = pw - ml * 2;
  const cardW = (cw - 8) / 2;
  const lx  = ml;
  const rx  = ml + cardW + 8;
  const LH  = 6.5;  // 1.5× line height
  const hh  = 8;    // card header height

  // Calculate card height from content
  const lRows = certFields.length;
  const rRows = issuedToFields.filter(f => !f.plain).length;
  const rPlain = issuedToFields.filter(f => f.plain).length;
  const cardH = Math.max(hh + 6 + lRows * LH * 2.8, hh + 6 + rRows * LH * 2.8 + rPlain * LH * 1.5, 44);

  // ── Left card ─────────────────────────────────────────────────────────────
  doc.setFillColor(...COLORS.bgLight);
  doc.setDrawColor(...COLORS.border); doc.setLineWidth(0.3);
  doc.roundedRect(lx, y, cardW, cardH, 3, 3, "FD");

  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(lx, y, cardW, hh, 3, 3, "F");
  doc.rect(lx, y + 5, cardW, 3, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.setTextColor(...COLORS.white);
  doc.text("CERTIFICATE DETAILS", lx + 6, y + 5.5);

  let cy = y + hh + 6;
  certFields.forEach(({ label, value }) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7);
    doc.setTextColor(...COLORS.textMut);
    doc.text(label, lx + 6, cy); cy += LH * 1.0;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.setTextColor(...COLORS.textPri);
    doc.text(san(value), lx + 6, cy); cy += LH * 1.8;
  });

  // ── Right card ────────────────────────────────────────────────────────────
  doc.setFillColor(...COLORS.bgLight);
  doc.setDrawColor(...COLORS.border); doc.setLineWidth(0.3);
  doc.roundedRect(rx, y, cardW, cardH, 3, 3, "FD");

  doc.setFillColor(...COLORS.accent);
  doc.roundedRect(rx, y, cardW, hh, 3, 3, "F");
  doc.rect(rx, y + 5, cardW, 3, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.setTextColor(...COLORS.white);
  doc.text("ISSUED TO", rx + 6, y + 5.5);

  cy = y + hh + 6;
  issuedToFields.forEach(({ label, value, plain }) => {
    if (plain) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.setTextColor(...COLORS.textSec);
      doc.text(san(value), rx + 6, cy); cy += LH * 1.5;
    } else {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7);
      doc.setTextColor(...COLORS.textMut);
      doc.text(label, rx + 6, cy); cy += LH * 1.0;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.setTextColor(...COLORS.textPri);
      doc.text(san(value), rx + 6, cy); cy += LH * 1.8;
    }
  });

  return y + cardH + 6;
}

// ── SITE BAR ─────────────────────────────────────────────────────────────────
export function drawSiteBar(doc: jsPDF, pw: number, y: number, address: string): number {
  const ml = MARGIN, cw = pw - ml * 2;
  doc.setFillColor(...COLORS.bgSubtle);
  doc.roundedRect(ml, y, cw, 16, 2, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  doc.setTextColor(...COLORS.textMut);
  doc.text("SITE ADDRESS", ml + 6, y + 5.5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.setTextColor(...COLORS.textPri);
  doc.text(san(address), ml + 6, y + 12);
  return y + 22;
}

// ── SECTION HEADER — accent bar + primary block ───────────────────────────────
// Exact match to quotationPdfGenerator.ts addSectionHeader()
export function drawSectionHeader(doc: jsPDF, pw: number, y: number, title: string): number {
  const ml = MARGIN, cw = pw - ml * 2;
  doc.setFillColor(...COLORS.accent); doc.rect(ml, y, 3, 7, "F");
  doc.setFillColor(...COLORS.primary); doc.rect(ml + 3, y, cw - 3, 7, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.setTextColor(...COLORS.white);
  doc.text(title, ml + 8, y + 5);
  return y + 10;
}

// ── STATUS BAR ────────────────────────────────────────────────────────────────
export function drawStatusSection(
  doc: jsPDF, pw: number, y: number, status: string, ok: boolean
): number {
  y = drawSectionHeader(doc, pw, y, "SYSTEM STATUS");
  const dc = ok ? [22, 163, 74] as [number,number,number] : COLORS.accent;
  const rc = ok ? COLORS.greenBg : COLORS.redBg;
  const tc = ok ? COLORS.greenDark : COLORS.accent;
  doc.setFillColor(...dc);
  doc.circle(MARGIN + 6, y + 3, 3, "F");
  doc.setDrawColor(...rc); doc.setLineWidth(1.8);
  doc.circle(MARGIN + 6, y + 3, 5, "S");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.setTextColor(...tc);
  doc.text(san(status), MARGIN + 14, y + 5);
  return y + 14;
}

// ── STANDARD + PREPARED BY BAR ────────────────────────────────────────────────
export function drawStandardBar(
  doc: jsPDF, pw: number, y: number, standard: string, preparedBy: string
): number {
  const ml = MARGIN, cw = pw - ml * 2;
  doc.setFillColor(...COLORS.bgSubtle);
  doc.roundedRect(ml, y, cw, 16, 2, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  doc.setTextColor(...COLORS.textMut);
  doc.text("STANDARD", ml + 6, y + 5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.textSec);
  doc.text(san(standard), ml + 6, y + 12);
  const midX = ml + cw / 2 + 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  doc.setTextColor(...COLORS.textMut);
  doc.text("PREPARED BY", midX, y + 5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.setTextColor(...COLORS.textSec);
  doc.text(san(preparedBy), midX, y + 12);
  return y + 22;
}

// ── DECLARATION & SIGNATURE BOX — matches quotation acceptance box ─────────────
export function drawSignatureBox(
  doc: jsPDF, pw: number, y: number,
  eng: { name: string; date?: string; sig?: string },
  cli: { name: string; date?: string; sig?: string },
  title = "DECLARATION & SIGNATURES"
): number {
  const ml = MARGIN, cw = pw - ml * 2, boxH = 46;
  doc.setFillColor(...COLORS.bgLight);
  doc.setDrawColor(...COLORS.accent); doc.setLineWidth(1);
  doc.roundedRect(ml, y, cw, boxH, 3, 3, "FD");

  // Header strip
  doc.setFillColor(...COLORS.accent);
  doc.roundedRect(ml, y, cw, 9, 3, 3, "F");
  doc.rect(ml, y + 6, cw, 3, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.setTextColor(...COLORS.white);
  doc.text(title, ml + 6, y + 6);

  const sigW = (cw - 8) / 2;
  y += 14;

  [[eng, "ENGINEER / COMPETENT PERSON"],
   [cli, "CLIENT / RESPONSIBLE PERSON"]] .forEach(([person, label], i) => {
    const p = person as typeof eng;
    const x = ml + 6 + i * (sigW + 8);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7);
    doc.setTextColor(...COLORS.textMut);
    doc.text(label as string, x, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.textPri);
    doc.text(san(p.name), x, y + 7);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.setTextColor(...COLORS.textSec);
    if (p.date) doc.text(san(p.date), x, y + 13);

    // Signature
    if (p.sig) {
      if (p.sig.startsWith("typed:")) {
        const name = p.sig.replace("typed:", "");
        doc.setFont("times", "bolditalic"); doc.setFontSize(16);
        doc.setTextColor(...COLORS.textPri);
        doc.text(name, x + 2, y + 28);
      } else {
        try { doc.addImage(p.sig, "PNG", x + 2, y + 17, sigW - 4, 12, undefined, "FAST"); }
        catch { /* skip */ }
      }
    }

    // Signature line
    doc.setDrawColor(...COLORS.borderDark); doc.setLineWidth(0.5);
    doc.line(x, y + 32, x + sigW - 4, y + 32);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.setTextColor(...COLORS.textMut);
    doc.text("Signature", x, y + 36);
  });

  // Vertical divider
  doc.setDrawColor(...COLORS.border); doc.setLineWidth(0.5);
  doc.line(ml + cw / 2, y - 4, ml + cw / 2, y + 38);

  return y + 44;
}

// ── MASTER FOOTER — exact match to quotationPdfGenerator.ts ──────────────────
// Rule at pageHeight-18, company|reg left, generated right, page centred
export function drawMasterFooter(doc: jsPDF, pw: number): void {
  const total = doc.getNumberOfPages();
  const ph    = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const fy = ph - 18;
    doc.setDrawColor(...COLORS.border); doc.setLineWidth(0.3);
    doc.line(MARGIN, fy, pw - MARGIN, fy);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.setTextColor(...COLORS.textLgt);
    doc.text(
      "BHO FIRE LTD  |  Company Registration No. 12235152",
      MARGIN, fy + 5
    );
    doc.text(
      `Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
      pw - MARGIN, fy + 5, { align: "right" }
    );
    doc.text(
      `Page ${i} of ${total}`,
      pw / 2, fy + 10, { align: "center" }
    );
  }
}

// ── autoTable with master styling ────────────────────────────────────────────
export interface ColDef { header: string; width?: number; align?: "left"|"center"|"right"; bold?: boolean }

export function masterTable(
  doc: jsPDF, pw: number, y: number,
  cols: ColDef[], rows: (string | { content: string; styles?: object })[][][],
  opts?: { headerBg?: [number,number,number]; noHeader?: boolean }
): number {
  const ml  = MARGIN;
  const cw  = pw - ml * 2;
  const cs: Record<number, object> = {};
  cols.forEach((c, i) => {
    cs[i] = {
      cellWidth: c.width ?? (cw / cols.length),
      halign:    c.align ?? "left",
      fontStyle: c.bold ? "bold" : "normal",
    };
  });

  autoTable(doc, {
    startY:       y,
    head:         opts?.noHeader ? [] : [cols.map(c => c.header)],
    body:         rows as never,
    margin:       { left: ml, right: ml },
    tableWidth:   cw,
    theme:        "grid",
    headStyles:   {
      fillColor:  opts?.headerBg ?? COLORS.primary,
      textColor:  COLORS.white,
      fontStyle:  "bold",
      fontSize:   7.5,
      cellPadding:{ top: 3, bottom: 3, left: 4, right: 4 },
    },
    styles: {
      fontSize:   8.5,
      cellPadding:{ top: 3.5, bottom: 3.5, left: 4, right: 4 },
      textColor:  COLORS.textSec,
      lineColor:  COLORS.border,
      lineWidth:  0.15,
      overflow:   "linebreak",
    },
    alternateRowStyles: { fillColor: COLORS.bgLight },
    columnStyles: cs,
  });
  return (doc as any).lastAutoTable.finalY + 6;
}

// ── Two-column key-value table ────────────────────────────────────────────────
export function kvTable(
  doc: jsPDF, pw: number, y: number,
  rows: [string, string | { content: string; styles?: object }][],
  labelW = 50
): number {
  const ml = MARGIN, cw = pw - ml * 2;
  autoTable(doc, {
    startY: y,
    body:   rows.map(([k, v]) => [
      { content: san(k), styles: { fontStyle: "bold", textColor: COLORS.textMut, fillColor: COLORS.bgSubtle, fontSize: 7.5 } },
      typeof v === "string" ? san(v) : v,
    ]) as never,
    theme:  "grid",
    margin: { left: ml, right: ml },
    tableWidth: cw,
    styles: { fontSize: 8.5, cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 }, textColor: COLORS.textSec, lineColor: COLORS.border, lineWidth: 0.15 },
    alternateRowStyles: { fillColor: COLORS.bgLight },
    columnStyles: {
      0: { cellWidth: labelW },
      1: { cellWidth: cw - labelW },
    },
  });
  return (doc as any).lastAutoTable.finalY + 6;
}

// ── Status colour helper ──────────────────────────────────────────────────────
export function statusFill(s: string): [number, number, number] {
  const v = (s || "").toLowerCase();
  if (v === "pass" || v === "satisfactory" || v === "yes" || v === "fully operational" || v === "compliant") return COLORS.greenBg;
  if (v.includes("observation") || v === "partial" || v === "n/a") return COLORS.ambBg;
  if (v === "fail" || v === "unsatisfactory" || v === "no" || v === "not operational") return COLORS.redBg;
  return COLORS.bgSubtle;
}
export function statusText(s: string): [number, number, number] {
  const v = (s || "").toLowerCase();
  if (v === "pass" || v === "satisfactory" || v === "yes" || v === "fully operational" || v === "compliant") return COLORS.greenDark;
  if (v.includes("observation") || v === "partial" || v === "n/a") return COLORS.ambDark;
  if (v === "fail" || v === "unsatisfactory" || v === "no" || v === "not operational") return COLORS.accent;
  return COLORS.textMut;
}

// ── New-page check ────────────────────────────────────────────────────────────
export function checkPage(
  doc: jsPDF, pw: number, y: number, need: number,
  logo: LogoData | null, certRef: string, title: string, standard: string, company: CompanySettings
): number {
  const ph = doc.internal.pageSize.getHeight();
  if (y + need > ph - FOOTER_RES) {
    doc.addPage();
    return drawPage2Header(doc, pw, logo, certRef, title, standard, company);
  }
  return y;
}

/**
 * Callout Report PDF generator.
 *
 * Reactive-visit attendance record. Uses the shared BHO chassis
 * (certPdfMasterTemplate) for header / footer / cards / tables /
 * signature box so it sits visually next to the certs and service
 * report.
 *
 * Inputs come from the Migration B columns on service_visits
 * (priority, classification, call timing, fault narrative, affected
 * zones), plus the matching service_report row for system status /
 * parts used / signatures when present.
 */

import jsPDF from "jspdf";
import { format } from "date-fns";
import {
  MARGIN,
  COLORS,
  loadLogoData,
  loadCompany,
  san,
  drawCertHeader,
  drawCertTitle,
  drawSectionHeader,
  kvTable,
  drawSignatureBox,
  drawMasterFooter,
  checkPage,
} from "./certPdfMasterTemplate";

export interface CalloutReportInput {
  ref: string;
  // The service_visits row id this report is for. Required by the
  // cloud DOCX generator so it can write to a stable storage path
  // (callout-outputs/<visitId>/callout-report.docx). The in-browser
  // PDF generator doesn't use it, but it's cheap to carry through.
  visitId: string;
  visitDate: string;                            // ISO
  priority?: string | null;                     // p1 | p2 | p3 | ooh | weekend
  priorityLabel?: string | null;                // e.g. "P1 — Immediate (4hr)"
  commercialClassification?: string | null;     // ppm | chargeable | quote_required
  commercialLabel?: string | null;

  customer: {
    name: string;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
  };
  site: {
    name: string;
    address?: string | null;
    city?: string | null;
    postcode?: string | null;
  };
  engineerName?: string | null;

  panelMakeModel?: string | null;
  bs5839Category?: string | null;
  numZones?: number | null;
  numLoops?: number | null;

  affectedZones?: string[] | null;
  affectedLoops?: string[] | null;
  arcConnected?: boolean | null;

  callReceivedAt?: string | null;
  reportedBy?: string | null;
  reportMethod?: string | null;
  engineerAssignedAt?: string | null;
  arrivedAt?: string | null;
  departedAt?: string | null;
  arcNotifiedAt?: string | null;

  fault?: {
    reported?: string | null;
    onArrival?: string | null;
    found?: string | null;
    actionTaken?: string | null;
  } | null;

  systemStatus?: string | null;
  partsUsed?: string | null;
  outstandingWorks?: string | null;

  // Wizard step 2/3 — full work narrative + defects, sitting alongside
  // the shorter fault.found / fault.actionTaken used in the PDF
  // sign-off blocks. The DOCX generator prefers the long form when
  // present so the report shows the full diagnosis story.
  workCarriedOut?: string | null;
  defectsFound?: string | null;

  // Wizard step 4 — material costs the DOCX renders in §4. The PDF
  // generator only knows partsUsed; the wizard captures labour hours
  // + mileage separately, which the DOCX surfaces in their own rows.
  labourHours?: number | null;
  mileageMiles?: number | null;

  // Wizard step 2/5 — isolation note. Same field captures both
  // arrival isolation and departure isolation; the wizard updates it
  // in place as the engineer works. Surfaced in §5 of the DOCX.
  isolationDetails?: string | null;

  // Wizard step 5 — recommendations + free-form notes. Both go into
  // §5 of the DOCX; recommendations gets the headline slot, notes the
  // follow-up slot below it.
  recommendations?: string | null;
  followupNotes?: string | null;

  // Wizard step 6 — captured from service_reports.client_sign_position.
  // Renders next to the client name in §6 of the DOCX. The PDF
  // generator doesn't show position; only the DOCX does.
  clientSignPosition?: string | null;

  // Wizard step 2 — §2 evidence photos. Loaded from the
  // callout_photos table + signed for storage download by the bundle
  // builder. The DOCX generator renders these in a captioned grid as
  // Appendix A at the end of the document.
  photos?: Array<{
    storage_path: string;
    caption: string | null;
    ordinal: number;
    signed_url?: string | null;
  }>;

  engineerSignature?: string | null;
  engineerSignDate?: string | null;
  clientName?: string | null;
  clientSignature?: string | null;
  clientSignDate?: string | null;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const fmtDateTime = (iso?: string | null): string =>
  iso ? format(new Date(iso), "dd MMM yyyy HH:mm") : "—";

const fmtDate = (iso?: string | null): string =>
  iso ? format(new Date(iso), "dd MMM yyyy") : "—";

const yesNo = (v?: boolean | null): string =>
  v == null ? "—" : v ? "Yes" : "No";

const list = (a?: string[] | null): string =>
  a && a.length > 0 ? a.join(", ") : "—";

// Response-time SLA: hours between call received and arrival, plus a
// pass/fail vs the priority's target window. Returns formatted strings
// for direct insertion into the kvTable.
function computeResponse(
  callReceivedAt?: string | null,
  arrivedAt?: string | null,
  priority?: string | null,
): { actual: string; target: string; met: string } {
  if (!callReceivedAt || !arrivedAt)
    return { actual: "—", target: "—", met: "—" };
  const hours =
    (new Date(arrivedAt).getTime() - new Date(callReceivedAt).getTime()) /
    3_600_000;
  const target =
    priority === "p1" || priority === "ooh"
      ? 4
      : priority === "p2" || priority === "weekend"
      ? 24
      : null;
  return {
    actual: `${hours.toFixed(1)} h`,
    target: target == null ? "Next visit" : `${target} h`,
    met:
      target == null
        ? "—"
        : hours <= target
        ? "Yes (within target)"
        : "No — outside target",
  };
}

// Draw a single coloured pill — used for the priority + classification
// strip at the top of the report. Width auto-sized to fit the label.
function drawPill(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  fill: [number, number, number],
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const padX = 4;
  const w = doc.getTextWidth(label) + padX * 2;
  const h = 6;
  doc.setFillColor(...fill);
  doc.roundedRect(x, y, w, h, 1.2, 1.2, "F");
  doc.setTextColor(...COLORS.white);
  doc.text(label, x + padX, y + 4.2);
  return x + w + 3;
}

function priorityFill(p?: string | null): [number, number, number] {
  if (p === "p1" || p === "ooh") return [185, 28, 28];     // red
  if (p === "p2" || p === "weekend") return [217, 119, 6]; // amber
  if (p === "p3") return [29, 78, 216];                    // blue
  return COLORS.textMut as [number, number, number];
}

function classificationFill(c?: string | null): [number, number, number] {
  if (c === "chargeable") return [185, 28, 28];
  if (c === "quote_required") return [217, 119, 6];
  if (c === "ppm") return [22, 101, 52];                   // green
  return COLORS.textMut as [number, number, number];
}

// Free-text paragraph block — renders a label and wrapped body text;
// inserts a page break if not enough room. Returns the new y.
function drawParagraph(
  doc: jsPDF,
  pw: number,
  y: number,
  label: string,
  body: string,
  ctx: {
    logo: Awaited<ReturnType<typeof loadLogoData>>;
    ref: string;
    title: string;
    standard: string;
    company: Awaited<ReturnType<typeof loadCompany>>;
  },
): number {
  const text = san(body || "—");
  const lines = doc.splitTextToSize(text, pw - MARGIN * 2);
  const blockH = 6 + lines.length * 4.5 + 4;
  y = checkPage(doc, pw, y, blockH, ctx.logo, ctx.ref, ctx.title, ctx.standard, ctx.company);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.textMut);
  doc.text(label.toUpperCase(), MARGIN, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textSec);
  doc.text(lines, MARGIN, y);
  y += lines.length * 4.5 + 4;
  return y;
}

// ── main generator ──────────────────────────────────────────────────────────

export async function generateCalloutReportPDF(
  input: CalloutReportInput,
): Promise<{ base64: string; fileName: string }> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();

  const company = await loadCompany();
  const logo = await loadLogoData(
    company.report_logo_url || company.company_logo_url || null,
  );

  const certRef = san(input.ref || "DRAFT");
  const title = "Callout Report";
  const standard = "Reactive Attendance Record";

  // Page 1 header
  let y = drawCertHeader(doc, pw, logo, company);
  y = drawCertTitle(
    doc,
    pw,
    y,
    certRef,
    title,
    input.visitDate ? `Attended ${fmtDate(input.visitDate)}` : "",
    standard,
  );

  const ctx = { logo, ref: certRef, title, standard, company };

  // Priority + classification strip
  if (input.priority || input.commercialClassification) {
    let x = MARGIN;
    if (input.priority) {
      x = drawPill(
        doc,
        x,
        y,
        (input.priorityLabel || input.priority).toUpperCase(),
        priorityFill(input.priority),
      );
    }
    if (input.commercialClassification) {
      drawPill(
        doc,
        x,
        y,
        (input.commercialLabel || input.commercialClassification).toUpperCase(),
        classificationFill(input.commercialClassification),
      );
    }
    y += 10;
  }

  // ── Customer / Site / Engineer ────────────────────────────────────
  y = checkPage(doc, pw, y, 60, logo, certRef, title, standard, company);
  y = drawSectionHeader(doc, pw, y, "CLIENT, SITE & ENGINEER");
  y = kvTable(doc, pw, y, [
    ["Customer", san(input.customer.name)],
    ...(input.customer.contactName
      ? ([["Contact", san(input.customer.contactName)]] as [string, string][])
      : []),
    ...(input.customer.contactEmail
      ? ([["Email", san(input.customer.contactEmail)]] as [string, string][])
      : []),
    ...(input.customer.contactPhone
      ? ([["Phone", san(input.customer.contactPhone)]] as [string, string][])
      : []),
    [
      "Site",
      san(
        [
          input.site.name,
          input.site.address,
          input.site.city,
          input.site.postcode,
        ]
          .filter(Boolean)
          .join(", "),
      ),
    ],
    ["Engineer attended", san(input.engineerName || "—")],
  ]);

  // ── Call details ─────────────────────────────────────────────────
  const resp = computeResponse(
    input.callReceivedAt,
    input.arrivedAt,
    input.priority,
  );
  y = checkPage(doc, pw, y, 70, logo, certRef, title, standard, company);
  y = drawSectionHeader(doc, pw, y, "CALL DETAILS & RESPONSE");
  y = kvTable(doc, pw, y, [
    ["Call received", fmtDateTime(input.callReceivedAt)],
    ["Reported by", san(input.reportedBy || "—")],
    ["Method", san(input.reportMethod || "—")],
    ["Engineer assigned", fmtDateTime(input.engineerAssignedAt)],
    ["On site at", fmtDateTime(input.arrivedAt)],
    ["Departed at", fmtDateTime(input.departedAt)],
    ["Response time", resp.actual],
    ["Target", resp.target],
    ["SLA met", resp.met],
  ]);

  // ── System & affected ────────────────────────────────────────────
  y = checkPage(doc, pw, y, 55, logo, certRef, title, standard, company);
  y = drawSectionHeader(doc, pw, y, "SYSTEM & AFFECTED");
  y = kvTable(doc, pw, y, [
    ["Panel", san(input.panelMakeModel || "—")],
    ["BS 5839-1 category", san(input.bs5839Category || "—")],
    ["Zones / loops on system", `${input.numZones ?? "—"} / ${input.numLoops ?? "—"}`],
    ["Affected zones", list(input.affectedZones)],
    ["Affected loops", list(input.affectedLoops)],
    ["ARC connected", yesNo(input.arcConnected)],
    ["ARC notified at", fmtDateTime(input.arcNotifiedAt)],
  ]);

  // ── Fault narrative ──────────────────────────────────────────────
  if (
    input.fault &&
    (input.fault.reported ||
      input.fault.onArrival ||
      input.fault.found ||
      input.fault.actionTaken)
  ) {
    y = checkPage(doc, pw, y, 30, logo, certRef, title, standard, company);
    y = drawSectionHeader(doc, pw, y, "FAULT NARRATIVE");
    if (input.fault.reported)
      y = drawParagraph(doc, pw, y, "Fault as reported", input.fault.reported, ctx);
    if (input.fault.onArrival)
      y = drawParagraph(doc, pw, y, "Status on arrival", input.fault.onArrival, ctx);
    if (input.fault.found)
      y = drawParagraph(doc, pw, y, "Investigation & fault found", input.fault.found, ctx);
    if (input.fault.actionTaken)
      y = drawParagraph(doc, pw, y, "Action taken", input.fault.actionTaken, ctx);
  }

  // ── Wrap-up ──────────────────────────────────────────────────────
  if (input.systemStatus || input.partsUsed || input.outstandingWorks) {
    y = checkPage(doc, pw, y, 40, logo, certRef, title, standard, company);
    y = drawSectionHeader(doc, pw, y, "WRAP-UP");
    const wrapRows: [string, string][] = [];
    if (input.systemStatus)
      wrapRows.push(["System status on departure", san(input.systemStatus.replace(/_/g, " "))]);
    if (input.partsUsed)
      wrapRows.push(["Parts / materials used", san(input.partsUsed)]);
    if (input.outstandingWorks)
      wrapRows.push(["Outstanding works", san(input.outstandingWorks)]);
    y = kvTable(doc, pw, y, wrapRows);
  }

  // ── Signatures ───────────────────────────────────────────────────
  y = checkPage(doc, pw, y, 70, logo, certRef, title, standard, company);
  y = drawSignatureBox(
    doc,
    pw,
    y,
    {
      name: input.engineerName || "—",
      date: input.engineerSignDate ? fmtDate(input.engineerSignDate) : fmtDate(input.visitDate),
      sig: input.engineerSignature || undefined,
    },
    {
      name: input.clientName || "—",
      date: input.clientSignDate ? fmtDate(input.clientSignDate) : undefined,
      sig: input.clientSignature || undefined,
    },
  );

  drawMasterFooter(doc, pw);

  const fileName = `${certRef}.pdf`;
  const base64 = doc.output("datauristring").split(",")[1];
  try {
    doc.save(fileName);
  } catch (e) {
    console.warn("doc.save failed", e);
  }
  return { base64, fileName };
}

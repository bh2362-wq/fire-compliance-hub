// Cause & Effect + Audibility Test report DOCX generator. Mirrors the
// content of src/lib/causeEffectReportPdfGenerator.ts but builds a Word
// document programmatically — Verdana body font, BHO colour palette,
// charcoal section bars matching the quotation template's look. The
// generated DOCX is uploaded to the ce-outputs bucket and converted to
// PDF by convert-quote-pdf (which now accepts `bucket: "ce-outputs"`).
//
// Input shape: caller sends the full CauseEffectReportBundle as JSON.
// Keeping the bundle on the client avoids replicating the loader's
// joins/RLS handling in this function. Output: signed URL to the DOCX.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "https://esm.sh/docx@8.5.0";

// ──────────────────────────────────────────────────────────────────────
// Branding constants — kept here rather than imported from src/ so the
// edge function has zero runtime dependency on the React app's
// constants module.

const COLORS = {
  charcoal: "1C1C20",
  red: "B91C1C",
  white: "FFFFFF",
  borderGrey: "D1D5DB",
  lightGrey: "F4F4F5",
  mediumGrey: "6B7280",
};

const FONT = "Verdana";
const BODY_SIZE = 18;        // half-points → 9pt
const SMALL_SIZE = 16;       // 8pt
const TINY_SIZE = 14;        // 7pt
const SUBHEADING_SIZE = 18;  // 9pt bold
const SECTION_BAR_SIZE = 20; // 10pt bold (white-on-charcoal)
const TITLE_SIZE = 32;       // 16pt
const COMPANY = {
  name: "BHO FIRE LTD",
  address: "St Georges Business Park, Castle Rd, Sittingbourne ME10 3TB",
  phone: "T: 0330 043 8659",
  email: "E: admin@bhofire.com",
  registration: "Company Registration No. 12235152",
};

// ──────────────────────────────────────────────────────────────────────
// Input types — must match CauseEffectReportBundle in
// src/services/causeEffectTestService.ts. Kept narrow (only fields we
// render) so TypeScript drift is obvious if the bundle shape changes.

interface Report {
  id: string;
  visit_id: string;
  site_id: string;
  general_observations: string | null;
  test_methodology: string | null;
  panel_make_model: string | null;
  num_devices_total: number | null;
  arc_monitoring: boolean | null;
  sound_meter_make_model: string | null;
  sound_meter_serial: string | null;
  sound_meter_cal_due: string | null;
  sound_meter_cal_on_file: boolean | null;
  compliance_status: string | null;          // 'complies' | 'does_not_comply'
  remedial_timeframe_days: string | null;
  next_service_due: string | null;
  engineer_name: string | null;
  engineer_signature_url: string | null;
  client_name: string | null;
  client_company: string | null;
  client_signature_url: string | null;
  attach_ce_matrix: boolean | null;
  attach_floor_plans: boolean | null;
  attach_calibration_cert: boolean | null;
  attach_photos: boolean | null;
  attach_previous_reports: boolean | null;
}

interface Site {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  panel_make_model: string | null;
}
interface Customer { name: string | null; }
interface Visit { id: string; visit_date: string; job_number: string | null; }
interface OutputCheck { function_name: string; expected: string | null; actual: string | null; result: string | null; }
interface AudibilityReading {
  location: string | null;
  floor: string | null;
  ambient_db: number | null;
  alarm_db: number | null;
  required_db: number | null;
  result: string | null;
}
interface Issue {
  kind: string;
  description: string | null;
  location: string | null;
  measured_db: number | null;
  required_db: number | null;
  severity: string | null;
  action_required: string | null;
}
interface Remedial {
  priority: string | null;
  description: string | null;
  location: string | null;
  estimated_cost: number | null;
}

interface Bundle {
  report: Report;
  site: Site;
  customer: Customer | null;
  visit: Visit;
  outputs: OutputCheck[];
  readings: AudibilityReading[];
  issues: Issue[];
  remedials: Remedial[];
}

// ──────────────────────────────────────────────────────────────────────
// Small helpers

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso ?? "—"; }
}

function fmtTimeframe(value: string | null): string {
  const t = value?.trim();
  if (!t) return "the agreed timescale";
  if (/^\d+$/.test(t)) return `${t} days`;
  return t;
}

function dedupeParagraphs(text: string): string {
  // Two-layer defence (see PR #79): legacy general_observations rows
  // can carry duplicate paragraphs from the paste-apply append bug.
  // Trim on blank-line boundaries, casefold-normalise whitespace for
  // matching, keep first occurrence only.
  const seen = new Set<string>();
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => {
      if (p.length === 0) return false;
      const key = p.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n\n");
}

// ──────────────────────────────────────────────────────────────────────
// Paragraph builders — thin wrappers so the document body reads like
// HTML rather than a sea of {children: [new TextRun(...)]} objects.

function body(text: string, opts?: { bold?: boolean; italic?: boolean; muted?: boolean; size?: number; spacingAfter?: number }) {
  return new Paragraph({
    spacing: { after: opts?.spacingAfter ?? 60 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: opts?.size ?? BODY_SIZE,
        bold: opts?.bold,
        italics: opts?.italic,
        color: opts?.muted ? COLORS.mediumGrey : COLORS.charcoal,
      }),
    ],
  });
}

function multiPara(text: string, opts?: { italic?: boolean; muted?: boolean }) {
  // Split on blank lines so paragraphs render with breathing room
  // (single \n inside a paragraph stays as a soft wrap which Word
  // collapses to a space — exactly what we want for body prose).
  const blocks = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return blocks.map((p) => body(p, opts));
}

function bullet(text: string, opts?: { size?: number }) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: opts?.size ?? BODY_SIZE,
        color: COLORS.charcoal,
      }),
    ],
  });
}

function sectionBar(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    shading: { type: ShadingType.SOLID, color: COLORS.charcoal, fill: COLORS.charcoal },
    children: [
      new TextRun({
        text: ` ${text}`,
        font: FONT,
        size: SECTION_BAR_SIZE,
        bold: true,
        color: COLORS.white,
      }),
    ],
  });
}

function subHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: SUBHEADING_SIZE,
        bold: true,
        color: COLORS.charcoal,
      }),
    ],
  });
}

// ──────────────────────────────────────────────────────────────────────
// Table builders

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const GREY_BORDER = { style: BorderStyle.SINGLE, size: 4, color: COLORS.borderGrey };

function headCell(text: string): TableCell {
  return new TableCell({
    shading: { type: ShadingType.SOLID, color: COLORS.charcoal, fill: COLORS.charcoal },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, font: FONT, size: SMALL_SIZE, bold: true, color: COLORS.white })],
      }),
    ],
  });
}

function dataCell(text: string, opts?: { bold?: boolean; align?: AlignmentType; color?: string; size?: number }): TableCell {
  return new TableCell({
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: opts?.align,
        children: [
          new TextRun({
            text,
            font: FONT,
            size: opts?.size ?? SMALL_SIZE,
            bold: opts?.bold,
            color: opts?.color ?? COLORS.charcoal,
          }),
        ],
      }),
    ],
  });
}

// ──────────────────────────────────────────────────────────────────────
// Info card — Site / Service summary boxes at the top of page 1.

function infoCard(title: string, rows: Array<[string, string]>): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: GREY_BORDER, bottom: GREY_BORDER, left: GREY_BORDER, right: GREY_BORDER,
      insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            shading: { type: ShadingType.SOLID, color: COLORS.charcoal, fill: COLORS.charcoal },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: title, font: FONT, size: SUBHEADING_SIZE, bold: true, color: COLORS.white })],
              }),
            ],
          }),
        ],
      }),
      ...rows.map(([label, value]) => new TableRow({
        children: [
          new TableCell({
            width: { size: 32, type: WidthType.PERCENTAGE },
            margins: { top: 40, bottom: 40, left: 120, right: 60 },
            children: [
              new Paragraph({ children: [new TextRun({ text: label, font: FONT, size: SMALL_SIZE, bold: true, color: COLORS.mediumGrey })] }),
            ],
          }),
          new TableCell({
            margins: { top: 40, bottom: 40, left: 60, right: 120 },
            children: [
              new Paragraph({ children: [new TextRun({ text: value || "—", font: FONT, size: SMALL_SIZE, color: COLORS.charcoal })] }),
            ],
          }),
        ],
      })),
    ],
  });
}

// ──────────────────────────────────────────────────────────────────────
// §1 - §10 builders

function buildSection_purpose(): Paragraph[] {
  return [
    sectionBar("1. Purpose of visit"),
    body("To conduct cause and effect testing and full audibility testing of the fire alarm system in accordance with BS 5839-1:2017."),
  ];
}

function buildSection_systemDetails(bundle: Bundle): Array<Paragraph | Table> {
  const r = bundle.report;
  const s = bundle.site;
  const rows: string[][] = [];
  const panel = r.panel_make_model ?? s.panel_make_model ?? "—";
  rows.push(["Panel Make / Model", panel]);
  if (r.num_devices_total != null) rows.push(["Number of Devices", String(r.num_devices_total)]);
  if (r.arc_monitoring != null) rows.push(["ARC Monitoring", r.arc_monitoring ? "Yes" : "No"]);
  return [
    sectionBar("2. System details"),
    rows.length === 0
      ? body("System details not recorded.", { italic: true, muted: true })
      : new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: GREY_BORDER, bottom: GREY_BORDER, left: GREY_BORDER, right: GREY_BORDER, insideHorizontal: GREY_BORDER, insideVertical: GREY_BORDER },
          columnWidths: [3000, 6000],
          rows: rows.map(([label, value]) => new TableRow({
            children: [
              new TableCell({
                shading: { type: ShadingType.SOLID, color: COLORS.lightGrey, fill: COLORS.lightGrey },
                margins: { top: 60, bottom: 60, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: label, font: FONT, size: SMALL_SIZE, bold: true, color: COLORS.mediumGrey })] })],
              }),
              dataCell(value),
            ],
          })),
        }),
  ];
}

function buildSection_ceResults(bundle: Bundle): Array<Paragraph | Table> {
  const blocks: Array<Paragraph | Table> = [sectionBar("3. Cause and effect test results")];

  blocks.push(subHeading("3.1 Test methodology"));
  const methodology = bundle.report.test_methodology?.trim() ||
    "• Minimum one detector per zone activated to verify programmed responses.\n• All input/output relationships tested as per cause and effect matrix.\n• System responses observed and verified.";
  // Render each line of the methodology as its own paragraph so
  // bullets line up. Lines that start with • / - / * become bullets,
  // others are body paragraphs.
  for (const line of methodology.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (/^[•\-*]\s+/.test(t)) {
      blocks.push(bullet(t.replace(/^[•\-*]\s+/, "")));
    } else {
      blocks.push(body(t));
    }
  }

  blocks.push(subHeading("3.2 Devices / zones tested"));
  blocks.push(body("No individual devices recorded for this visit.", { italic: true, muted: true }));

  blocks.push(subHeading("3.3 Output functions verified"));
  if (bundle.outputs.length === 0) {
    blocks.push(body("No output functions recorded.", { italic: true, muted: true }));
  } else {
    blocks.push(buildOutputsTable(bundle.outputs));
  }
  return blocks;
}

function buildOutputsTable(outputs: OutputCheck[]): Table {
  const resultLabel = (r: string | null) =>
    r === "pass" ? "PASS" : r === "fail" ? "FAIL" : r === "na" ? "N/A" : "—";
  const resultColor = (r: string | null) =>
    r === "fail" ? COLORS.red : r === "pass" ? "166534" : COLORS.charcoal;

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [2400, 2400, 2400, 1200],
    borders: {
      top: GREY_BORDER, bottom: GREY_BORDER, left: GREY_BORDER, right: GREY_BORDER,
      insideHorizontal: GREY_BORDER, insideVertical: GREY_BORDER,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: ["Function", "Expected response", "Actual response", "Result"].map(headCell),
      }),
      ...outputs.map((o) => new TableRow({
        children: [
          dataCell(o.function_name ?? "—"),
          dataCell(o.expected ?? "—"),
          dataCell(o.actual ?? "—"),
          dataCell(resultLabel(o.result), { bold: true, align: AlignmentType.CENTER, color: resultColor(o.result) }),
        ],
      })),
    ],
  });
}

function buildSection_audibilityResults(bundle: Bundle): Array<Paragraph | Table> {
  const r = bundle.report;
  const readings = bundle.readings;
  const blocks: Array<Paragraph | Table> = [sectionBar("4. Full audibility test results")];

  blocks.push(subHeading("4.1 Test equipment"));
  const eqRows: Array<[string, string]> = [];
  if (r.sound_meter_make_model) eqRows.push(["Sound Level Meter", r.sound_meter_make_model]);
  if (r.sound_meter_serial) eqRows.push(["Serial Number", r.sound_meter_serial]);
  if (r.sound_meter_cal_due) eqRows.push(["Calibration Due", fmtDate(r.sound_meter_cal_due)]);
  if (r.sound_meter_cal_on_file) eqRows.push(["Calibration Certificate", "On file"]);
  if (eqRows.length === 0) {
    blocks.push(body("Sound level meter details not recorded.", { italic: true, muted: true }));
  } else {
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: GREY_BORDER, bottom: GREY_BORDER, left: GREY_BORDER, right: GREY_BORDER, insideHorizontal: GREY_BORDER, insideVertical: GREY_BORDER },
      columnWidths: [3000, 6000],
      rows: eqRows.map(([label, value]) => new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.SOLID, color: COLORS.lightGrey, fill: COLORS.lightGrey },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: label, font: FONT, size: SMALL_SIZE, bold: true, color: COLORS.mediumGrey })] })],
          }),
          dataCell(value),
        ],
      })),
    }));
  }

  blocks.push(subHeading("4.2 Sound level measurements"));
  blocks.push(body("Minimum required: 65 dB(A) general areas · 75 dB(A) sleeping accommodation · 5 dB above ambient.", { italic: true, muted: true }));
  if (readings.length === 0) {
    blocks.push(body("No reading-by-reading sound level entries recorded — see §5.2 for non-compliant locations.", { italic: true, muted: true }));
  } else {
    blocks.push(buildReadingsTable(readings));
  }

  blocks.push(subHeading("4.3 Audibility test summary"));
  const passCount = readings.filter((r) => r.result === "pass").length;
  const failCount = readings.filter((r) => r.result === "fail").length;
  blocks.push(body(
    `Total locations tested: ${readings.length}    ·    Meeting requirements: ${passCount}    ·    Below requirements: ${failCount}`,
  ));
  return blocks;
}

function buildReadingsTable(readings: AudibilityReading[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [2400, 1000, 1400, 1400, 1400, 1400],
    borders: { top: GREY_BORDER, bottom: GREY_BORDER, left: GREY_BORDER, right: GREY_BORDER, insideHorizontal: GREY_BORDER, insideVertical: GREY_BORDER },
    rows: [
      new TableRow({ tableHeader: true, children: ["Location", "Floor", "Ambient dB", "Alarm dB", "Required dB", "Result"].map(headCell) }),
      ...readings.map((r) => new TableRow({
        children: [
          dataCell(r.location || "—"),
          dataCell(r.floor || "—"),
          dataCell(r.ambient_db != null ? String(r.ambient_db) : "—", { align: AlignmentType.CENTER }),
          dataCell(r.alarm_db != null ? String(r.alarm_db) : "—", { align: AlignmentType.CENTER }),
          dataCell(r.required_db != null ? String(r.required_db) : "—", { align: AlignmentType.CENTER }),
          dataCell(
            r.result === "pass" ? "PASS" : r.result === "fail" ? "FAIL" : "—",
            { bold: true, align: AlignmentType.CENTER, color: r.result === "fail" ? COLORS.red : r.result === "pass" ? "166534" : COLORS.charcoal },
          ),
        ],
      })),
    ],
  });
}

function buildSection_findings(bundle: Bundle): Array<Paragraph | Table> {
  const ceIssues = bundle.issues.filter((i) => i.kind === "cause_effect");
  const audIssues = bundle.issues.filter((i) => i.kind === "audibility");
  const blocks: Array<Paragraph | Table> = [sectionBar("5. Findings & observations")];

  blocks.push(subHeading("5.1 Cause & effect issues"));
  if (ceIssues.length === 0) {
    blocks.push(body("No issues identified.", { italic: true, muted: true }));
  } else {
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [3200, 1800, 1400, 2600],
      borders: { top: GREY_BORDER, bottom: GREY_BORDER, left: GREY_BORDER, right: GREY_BORDER, insideHorizontal: GREY_BORDER, insideVertical: GREY_BORDER },
      rows: [
        new TableRow({ tableHeader: true, children: ["Issue", "Location / zone", "Severity", "Action required"].map(headCell) }),
        ...ceIssues.map((i) => new TableRow({
          children: [
            dataCell(i.description ?? "—"),
            dataCell(i.location ?? "—"),
            dataCell(i.severity === "critical" ? "Critical" : i.severity === "non_critical" ? "Non-critical" : "—"),
            dataCell(i.action_required ?? "—"),
          ],
        })),
      ],
    }));
  }

  blocks.push(subHeading("5.2 Audibility issues"));
  if (audIssues.length === 0) {
    blocks.push(body("No issues identified.", { italic: true, muted: true }));
  } else {
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [2800, 1800, 1100, 1100, 2200],
      borders: { top: GREY_BORDER, bottom: GREY_BORDER, left: GREY_BORDER, right: GREY_BORDER, insideHorizontal: GREY_BORDER, insideVertical: GREY_BORDER },
      rows: [
        new TableRow({ tableHeader: true, children: ["Issue", "Location", "Measured dB", "Required dB", "Action required"].map(headCell) }),
        ...audIssues.map((i) => new TableRow({
          children: [
            dataCell(i.description ?? "—"),
            dataCell(i.location ?? "—"),
            dataCell(i.measured_db != null ? String(i.measured_db) : "—", { align: AlignmentType.CENTER }),
            dataCell(i.required_db != null ? String(i.required_db) : "—", { align: AlignmentType.CENTER }),
            dataCell(i.action_required ?? "—"),
          ],
        })),
      ],
    }));
  }

  blocks.push(subHeading("5.3 General observations"));
  const obs = bundle.report.general_observations?.trim();
  if (obs) {
    blocks.push(...multiPara(dedupeParagraphs(obs)));
  } else {
    blocks.push(body("None recorded.", { italic: true, muted: true }));
  }
  return blocks;
}

function buildSection_remedials(bundle: Bundle): Array<Paragraph | Table> {
  const blocks: Array<Paragraph | Table> = [sectionBar("6. Remedial works required")];
  if (bundle.remedials.length === 0) {
    blocks.push(body("No remedial works required.", { italic: true, muted: true }));
    return blocks;
  }
  const totalCost = bundle.remedials.reduce((s, r) => s + (r.estimated_cost ?? 0), 0);
  const priorityLabel = (p: string | null) => p === "urgent" ? "URGENT" : p === "routine" ? "Routine" : "—";
  const priorityColor = (p: string | null) => p === "urgent" ? COLORS.red : COLORS.charcoal;
  blocks.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [1200, 4400, 2400, 1200],
    borders: { top: GREY_BORDER, bottom: GREY_BORDER, left: GREY_BORDER, right: GREY_BORDER, insideHorizontal: GREY_BORDER, insideVertical: GREY_BORDER },
    rows: [
      new TableRow({ tableHeader: true, children: ["Priority", "Description", "Location", "Estimated cost"].map(headCell) }),
      ...bundle.remedials.map((r) => new TableRow({
        children: [
          dataCell(priorityLabel(r.priority), { bold: true, color: priorityColor(r.priority) }),
          dataCell(r.description ?? "—"),
          dataCell(r.location ?? "—"),
          dataCell(r.estimated_cost != null ? `£${r.estimated_cost.toFixed(2)}` : "—", { align: AlignmentType.RIGHT }),
        ],
      })),
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 3,
            shading: { type: ShadingType.SOLID, color: COLORS.lightGrey, fill: COLORS.lightGrey },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Total estimated", font: FONT, size: SMALL_SIZE, bold: true, color: COLORS.charcoal })] })],
          }),
          new TableCell({
            shading: { type: ShadingType.SOLID, color: COLORS.lightGrey, fill: COLORS.lightGrey },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `£${totalCost.toFixed(2)}`, font: FONT, size: SMALL_SIZE, bold: true, color: COLORS.charcoal })] })],
          }),
        ],
      }),
    ],
  }));
  return blocks;
}

function buildSection_compliance(bundle: Bundle): Paragraph[] {
  const status = bundle.report.compliance_status;
  const complies = status === "complies";
  const doesNot = status === "does_not_comply";
  return [
    sectionBar("7. Compliance statement"),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: complies ? "☑ " : "☐ ", font: FONT, size: BODY_SIZE, bold: true, color: COLORS.charcoal }),
        new TextRun({ text: "COMPLIES with BS 5839-1:2017 requirements.", font: FONT, size: BODY_SIZE, bold: true, color: complies ? COLORS.charcoal : COLORS.mediumGrey }),
      ],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: doesNot ? "☑ " : "☐ ", font: FONT, size: BODY_SIZE, bold: true, color: COLORS.red }),
        new TextRun({ text: "DOES NOT COMPLY — see remedial works in section 6.", font: FONT, size: BODY_SIZE, bold: true, color: doesNot ? COLORS.red : COLORS.mediumGrey }),
      ],
    }),
  ];
}

function buildSection_recommendations(bundle: Bundle): Paragraph[] {
  const r = bundle.report;
  const items: string[] = [];
  items.push(`All remedial works should be completed within ${fmtTimeframe(r.remedial_timeframe_days)}.`);
  if (r.next_service_due) items.push(`Next routine service due: ${fmtDate(r.next_service_due)}.`);
  items.push("Cause & effect testing to be repeated annually.");
  items.push("Full audibility re-test recommended following any building alterations.");
  return [sectionBar("8. Recommendations"), ...items.map((t) => bullet(t))];
}

function buildSection_signatures(bundle: Bundle): Array<Paragraph | Table> {
  const r = bundle.report;
  return [
    sectionBar("9. Signatures"),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
              children: [
                new Paragraph({ children: [new TextRun({ text: "ENGINEER", font: FONT, size: SMALL_SIZE, bold: true, color: COLORS.charcoal })] }),
                new Paragraph({ spacing: { after: 600 }, children: [new TextRun({ text: r.engineer_name ?? "—", font: FONT, size: SMALL_SIZE, color: COLORS.charcoal })] }),
                new Paragraph({ children: [new TextRun({ text: r.engineer_signature_url ? "[signature on file]" : " ", font: FONT, size: TINY_SIZE, italics: true, color: COLORS.mediumGrey })] }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
              children: [
                new Paragraph({ children: [new TextRun({ text: "CLIENT / RESPONSIBLE PERSON", font: FONT, size: SMALL_SIZE, bold: true, color: COLORS.charcoal })] }),
                new Paragraph({ spacing: { after: 600 }, children: [new TextRun({ text: `${r.client_name ?? "—"}${r.client_company ? `  ·  ${r.client_company}` : ""}`, font: FONT, size: SMALL_SIZE, color: COLORS.charcoal })] }),
                new Paragraph({ children: [new TextRun({ text: r.client_signature_url ? "[signature on file]" : " ", font: FONT, size: TINY_SIZE, italics: true, color: COLORS.mediumGrey })] }),
              ],
            }),
          ],
        }),
      ],
    }),
  ];
}

function buildSection_attachments(bundle: Bundle): Paragraph[] {
  const r = bundle.report;
  const items: Array<[string, boolean]> = [
    ["Cause and Effect Matrix", !!r.attach_ce_matrix],
    ["Floor Plans with Test Locations Marked", !!r.attach_floor_plans],
    ["Sound Level Meter Calibration Certificate", !!r.attach_calibration_cert],
    ["Photographic Evidence (if applicable)", !!r.attach_photos],
    ["Previous Test Reports for Comparison", !!r.attach_previous_reports],
  ];
  return [
    sectionBar("10. Attachments"),
    ...items.map(([label, checked]) => new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: checked ? "☑  " : "☐  ", font: FONT, size: BODY_SIZE, color: COLORS.charcoal }),
        new TextRun({ text: label, font: FONT, size: BODY_SIZE, color: COLORS.charcoal }),
      ],
    })),
  ];
}

// ──────────────────────────────────────────────────────────────────────
// Header — title, BHO logo on the left, company info on the right.
// docx@8 puts headers in a separate `headers` property on the section
// rather than inline. We embed the logo via ImageRun.

async function loadLogoBytes(supabase: any): Promise<Uint8Array | null> {
  // Fetch BHO logo from the existing quote-assets bucket. If missing
  // we simply render without a logo — the report still works.
  try {
    const { data } = await supabase.storage.from("quote-assets").download("bho-logo.png");
    if (!data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch { return null; }
}

function buildHeaderTitle(bundle: Bundle): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 240, after: 60 },
      children: [
        new TextRun({ text: "Fire Alarm Cause & Effect + Audibility Test Report", font: FONT, size: TITLE_SIZE, bold: true, color: COLORS.charcoal }),
      ],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({ text: "BS 5839-1:2017", font: FONT, size: BODY_SIZE, bold: true, color: COLORS.red }),
        new TextRun({ text: "    ·    ", font: FONT, size: BODY_SIZE, color: COLORS.mediumGrey }),
        new TextRun({ text: fmtDate(bundle.visit.visit_date), font: FONT, size: BODY_SIZE, color: COLORS.mediumGrey }),
      ],
    }),
  ];
}

function buildInfoCards(bundle: Bundle): Table[] {
  const addr = [bundle.site.address, bundle.site.city, bundle.site.postcode].filter(Boolean).join(", ");
  const siteRows: Array<[string, string]> = [
    ["Site", bundle.site.name ?? "—"],
    ["Address", addr || "—"],
    ["Contact", bundle.site.contact_name ?? "—"],
    ["Phone", bundle.site.contact_phone ?? "—"],
  ];
  const serviceRows: Array<[string, string]> = [
    ["Job Ref", bundle.visit.job_number ?? "—"],
    ["Date", fmtDate(bundle.visit.visit_date)],
    ["Engineer", bundle.report.engineer_name ?? "—"],
    ["Customer", bundle.customer?.name ?? "—"],
  ];
  // Stacked rather than side-by-side because docx@8 wrapping logic for
  // nested tables in cells is fiddly. Two full-width cards still reads
  // cleanly and matches the section-heading rhythm.
  return [infoCard("SITE", siteRows), infoCard("SERVICE", serviceRows)];
}

// Header band (logo + company block). Rendered as a borderless table so
// the logo can sit left-aligned next to the right-aligned address.
async function buildPageHeader(supabase: any): Promise<{ paragraphs?: Paragraph[]; table: Table }> {
  const logoBytes = await loadLogoBytes(supabase);
  const logoCell = new TableCell({
    width: { size: 30, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: [
      logoBytes
        ? new Paragraph({
            children: [
              new ImageRun({
                data: logoBytes,
                transformation: { width: 90, height: 90 },
                type: "png",
              } as any),
            ],
          })
        : new Paragraph({ children: [new TextRun({ text: "BHO FIRE", font: FONT, size: 28, bold: true, color: COLORS.red })] }),
    ],
  });
  const infoCell = new TableCell({
    width: { size: 70, type: WidthType.PERCENTAGE },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: [
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: COMPANY.name, font: FONT, size: SUBHEADING_SIZE, bold: true, color: COLORS.charcoal })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: COMPANY.address, font: FONT, size: SMALL_SIZE, color: COLORS.charcoal })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: COMPANY.phone, font: FONT, size: SMALL_SIZE, color: COLORS.charcoal })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: COMPANY.email, font: FONT, size: SMALL_SIZE, color: COLORS.charcoal })] }),
    ],
  });
  return {
    table: new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
      rows: [new TableRow({ children: [logoCell, infoCell] })],
    }),
  };
}

function buildPageFooter(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { before: 120 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.borderGrey, space: 4 } },
    children: [
      new TextRun({ text: `${COMPANY.name}  |  ${COMPANY.registration}`, font: FONT, size: TINY_SIZE, color: COLORS.mediumGrey }),
      new TextRun({ text: `        Generated ${new Date().toLocaleString("en-GB")}`, font: FONT, size: TINY_SIZE, color: COLORS.mediumGrey }),
    ],
  });
}

// ──────────────────────────────────────────────────────────────────────
// Main builder

async function buildDocx(bundle: Bundle, supabase: any): Promise<Uint8Array> {
  const headerBand = await buildPageHeader(supabase);
  const sectionChildren: Array<Paragraph | Table> = [
    headerBand.table,
    ...buildHeaderTitle(bundle),
    ...buildInfoCards(bundle),
    ...buildSection_purpose(),
    ...buildSection_systemDetails(bundle),
    ...buildSection_ceResults(bundle),
    ...buildSection_audibilityResults(bundle),
    ...buildSection_findings(bundle),
    ...buildSection_remedials(bundle),
    ...buildSection_compliance(bundle),
    ...buildSection_recommendations(bundle),
    ...buildSection_signatures(bundle),
    ...buildSection_attachments(bundle),
  ];

  const doc = new Document({
    creator: "BHO Fire Compliance Hub",
    title: `Fire Alarm Cause & Effect + Audibility Test Report — ${bundle.visit.job_number ?? bundle.report.id}`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: BODY_SIZE, color: COLORS.charcoal },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 1080, bottom: 720, left: 1080 }, // 0.5" top/bot, 0.75" sides
            size: { orientation: PageOrientation.PORTRAIT },
          },
        },
        footers: { default: { children: [buildPageFooter()] } as any },
        children: sectionChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

// ──────────────────────────────────────────────────────────────────────
// HTTP handler

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const payload = await req.json();
    const bundle = payload as Bundle;
    if (!bundle?.report?.id) throw new Error("Missing bundle.report.id");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const docxBytes = await buildDocx(bundle, supabase);
    const storagePath = `${bundle.report.id}/cause-effect-report.docx`;
    const { error: upErr } = await supabase.storage.from("ce-outputs").upload(storagePath, docxBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
    if (upErr) throw new Error(`DOCX upload failed: ${upErr.message}`);

    const { data: signed, error: signErr } = await supabase.storage.from("ce-outputs").createSignedUrl(storagePath, 3600);
    if (signErr || !signed) throw new Error(`Sign failed: ${signErr?.message}`);

    return new Response(JSON.stringify({
      storage_path: storagePath,
      signed_url: signed.signedUrl,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      file_size_bytes: docxBytes.byteLength,
      bucket: "ce-outputs",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate-cause-effect-docx error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

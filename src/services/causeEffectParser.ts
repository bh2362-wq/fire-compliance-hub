import * as XLSX from "xlsx";

// Parses a fire-alarm Cause & Effect Matrix from an Excel workbook into a
// structured shape we can store in cause_effect_matrices / outputs / rules.
//
// Heuristic (validated against the Lister Community School master):
//   1. Find the row containing "O1" — that's the output-code row.
//   2. The row below is the panel location, the row below that is the
//      output identification description.
//   3. Find the row whose first non-empty cells contain "Ref" + something
//      starting with "Trigger" — that's the rule-column header row.
//   4. From that row+1 to end-of-sheet, each non-blank row is a rule.
//      Action codes (E / C / A / D / …) live in the output columns;
//      anything in the column immediately after the last output column
//      is the notes/effect description.
//
// Trigger text is kept verbatim — no attempt to parse panel/zone refs
// into structured fields.

export type ActionCode = string; // typically E / C / A / D — kept open for variants

export interface ParsedOutput {
  ordinal: number;
  code: string;
  panel_location: string | null;
  identification: string | null;
}

export interface ParsedRule {
  ordinal: number;
  ref: string | null;
  trigger_device: string | null;
  trigger_type: string | null;
  trigger_location: string | null;
  notes: string | null;
  actions: Record<string, ActionCode>;
}

export interface ParsedMatrix {
  title: string | null;
  legend: string | null;
  outputs: ParsedOutput[];
  rules: ParsedRule[];
}

export class CauseEffectParseError extends Error {}

const NOISE_VALUES = new Set(["", " ", "N/A", "n/a", "-", "—"]);

function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return NOISE_VALUES.has(s) ? null : s;
}

function rawCellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function isOutputCode(s: string): boolean {
  return /^O\d+$/i.test(s.trim());
}

export async function parseCauseEffectFile(file: File): Promise<ParsedMatrix> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new CauseEffectParseError("Workbook has no sheets");
  return parseCauseEffectSheet(wb.Sheets[sheetName]);
}

export function parseCauseEffectSheet(sheet: XLSX.WorkSheet): ParsedMatrix {
  // Convert to a 2-D array of raw cell values (rows of arrays).
  const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });

  // Locate landmarks in the top of the sheet.
  let title: string | null = null;
  let legend: string | null = null;
  let outputCodeRow = -1;
  let columnHeaderRow = -1;

  const scanLimit = Math.min(grid.length, 12);
  for (let r = 0; r < scanLimit; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < Math.min(row.length, 12); c++) {
      const raw = rawCellText(row[c]);
      if (!raw) continue;
      const lower = raw.toLowerCase();

      if (!legend && lower.startsWith("key:")) legend = raw;

      if (
        !title &&
        lower.includes("cause") &&
        lower.includes("effect") &&
        lower.includes("matrix")
      ) {
        title = raw.split(/\r?\n/)[0]?.trim() ?? raw;
      }

      if (outputCodeRow < 0 && isOutputCode(raw) && /^o1$/i.test(raw)) {
        outputCodeRow = r;
      }

      if (columnHeaderRow < 0 && lower === "ref") {
        // Confirm by checking neighbouring cells for "trigger"
        const neighbours = row
          .slice(c + 1, c + 6)
          .map((v) => rawCellText(v).toLowerCase());
        if (neighbours.some((n) => n.includes("trigger"))) {
          columnHeaderRow = r;
        }
      }
    }
  }

  if (outputCodeRow < 0) {
    throw new CauseEffectParseError(
      "Could not find the output-code header row (looking for 'O1').",
    );
  }
  if (columnHeaderRow < 0) {
    throw new CauseEffectParseError(
      "Could not find the rule-header row (looking for 'Ref' + 'Trigger…').",
    );
  }

  // Output columns = every column on outputCodeRow whose value matches O\d+
  const outRow = grid[outputCodeRow] ?? [];
  const locRow = grid[outputCodeRow + 1] ?? [];
  const idRow = grid[outputCodeRow + 2] ?? [];

  const outputs: ParsedOutput[] = [];
  const outputColIndices: number[] = [];
  for (let c = 0; c < outRow.length; c++) {
    const code = rawCellText(outRow[c]);
    if (code && isOutputCode(code)) {
      outputs.push({
        ordinal: outputs.length + 1,
        code: code,
        panel_location: cellText(locRow[c]),
        identification: cellText(idRow[c]),
      });
      outputColIndices.push(c);
    }
  }

  if (outputs.length === 0) {
    throw new CauseEffectParseError("No output columns (O1, O2, …) found.");
  }

  // Identify rule columns by scanning the column-header row
  const hdrRow = grid[columnHeaderRow] ?? [];
  const colMap: Partial<Record<
    "ref" | "trigger_device" | "trigger_type" | "trigger_location",
    number
  >> = {};

  for (let c = 0; c < hdrRow.length; c++) {
    const v = rawCellText(hdrRow[c]).toLowerCase();
    if (!v) continue;
    if (v === "ref") colMap.ref = c;
    else if (v.includes("trigger device")) colMap.trigger_device = c;
    else if (v.includes("trigger type")) colMap.trigger_type = c;
    else if (v.includes("trigger location") || v.includes("trigger area"))
      colMap.trigger_location = c;
  }

  // Notes column convention: column immediately after the last output column.
  const notesCol = outputColIndices[outputColIndices.length - 1] + 1;

  const rules: ParsedRule[] = [];
  for (let r = columnHeaderRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];

    // Skip rows that are entirely empty.
    const anyValue = row.some(
      (v) => v !== null && v !== undefined && String(v).trim() !== "",
    );
    if (!anyValue) continue;

    const actions: Record<string, ActionCode> = {};
    outputs.forEach((o, idx) => {
      const v = cellText(row[outputColIndices[idx]]);
      if (v) actions[o.code] = v;
    });

    rules.push({
      ordinal: rules.length + 1,
      ref: colMap.ref !== undefined ? cellText(row[colMap.ref]) : null,
      trigger_device:
        colMap.trigger_device !== undefined
          ? cellText(row[colMap.trigger_device])
          : null,
      trigger_type:
        colMap.trigger_type !== undefined
          ? cellText(row[colMap.trigger_type])
          : null,
      trigger_location:
        colMap.trigger_location !== undefined
          ? cellText(row[colMap.trigger_location])
          : null,
      notes: cellText(row[notesCol]),
      actions,
    });
  }

  return { title, legend, outputs, rules };
}

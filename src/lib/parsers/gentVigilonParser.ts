import * as pdfjsLib from "pdfjs-dist";
import type { DeviceImport } from "@/services/siteService";

// Worker setup — Vite + pdfjs-dist@4 needs an ESM worker URL.
// Failing back to disableWorker for environments where worker init fails
// keeps the parser usable instead of throwing.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  (pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;
} catch {
  // ignore — pdfjs will run on the main thread
}

// Gent Vigilon device-label codes → friendly names. Same table the existing
// DeviceImportDialog uses for the (different) ZONE-style Gent format, plus
// the extra codes seen in the device-labels printout (Q2H, QH, QOH, q2HV3,
// 3SFW, 3VFR, 3FW, 3FR, 3SFR, qHV2, qHS, q2HS, LVI4, LVI2, COMPS, STSS,
// SCBS, OH, Li/f).
const GENT_TYPE_LABELS: Record<string, string> = {
  MCP: "Manual Call Point",
  "3FW": "Wall Sounder",
  "3SFW": "Wall Sounder/Beacon",
  "3VFR": "Voice Sounder/Beacon",
  "3FR": "Sounder/Beacon",
  "3SFR": "Sounder/Beacon (alt)",
  Q2H: "Quad 2 Heat Detector",
  QH: "Quad Heat Detector",
  QOH: "Quad Optical Heat Detector",
  q2HV4: "Dual Optical Heat Sounder/VAD",
  q2HV3: "Dual Optical Heat VAD",
  q2HV2: "Dual Optical Heat Sounder",
  q2HS: "Dual Optical Heat Sounder",
  qHV2: "Heat Sounder/Beacon",
  qHS: "Heat Sounder",
  OH: "Optical Heat Detector",
  MVI: "Multi-Input Interface",
  LVI4: "Loop Voltage Input (4-channel)",
  LVI2: "Loop Voltage Input (2-channel)",
  "Li/f": "Loop Interface",
  COMPS: "Combined Sounder",
  STSS: "Sounder",
  SCBS: "Sounder/Beacon",
};

function friendlyType(code: string): string {
  if (GENT_TYPE_LABELS[code]) return GENT_TYPE_LABELS[code];
  // Case-insensitive fallback (q2HV4 vs Q2HV4).
  const found = Object.entries(GENT_TYPE_LABELS).find(([k]) => k.toLowerCase() === code.toLowerCase());
  return found ? found[1] : code;
}

export interface GentVigilonParseResult {
  devices: DeviceImport[];
  pageHeadersSkipped: number;
  channelLinesAttached: number;
  warnings: string[];
}

/**
 * Detect whether the text looks like a Gent Vigilon "Device Labels" report.
 * The report header is always:  "Device Labels For D1 N1 L1-8 OS1-NNN: Page N"
 * and the second line points at a .cfg file path.
 */
export function looksLikeGentVigilonReport(text: string): boolean {
  return /Device Labels For\s+D\d+\s+N\d+/i.test(text) || /\.cfg\s+\d{1,2}\/\d{1,2}\/\d{4}/.test(text);
}

/**
 * Parse the textual content of a Gent Vigilon device-labels printout into
 * DeviceImport rows. The format is:
 *
 *   DEVICE   TYPE   LABEL
 *      1 Lp 1    MCP   GROUND FLOOR STAIR 1
 *      2 Lp 1    3FW   A BLOCK FRONT EXTERNAL SOUNDER
 *    103 Lp 1    MVI   G.23 BA14-1 COMPUTER HUB ROOM 1
 *        Chan 1        ACCESS CONTROL
 *        Chan 2
 *        ...
 *
 * Device rows are unindented (the address sits in the first column block);
 * "Chan N" rows are indented and belong to the most recent interface
 * device (MVI/LVI4/LVI2). Channel descriptions are folded into the parent
 * device's raw_import_data so the engineer can see them later without
 * inflating the device count.
 */
export function parseGentVigilonText(text: string): GentVigilonParseResult {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const devices: DeviceImport[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];
  let pageHeadersSkipped = 0;
  let channelLinesAttached = 0;
  let lastDeviceIdx: number | null = null;

  // Pattern: optional leading whitespace, address (digits), "Lp", loop digits,
  // device type (no whitespace), then the label (rest of the line).
  const devicePattern = /^\s*(\d{1,4})\s+Lp\s+(\d{1,2})\s+(\S+)\s*(.*?)\s*$/;
  // Indented Chan row, optionally followed by a description.
  const chanPattern = /^\s+Chan\s+(\d+)\s*(.*?)\s*$/;
  // Page header / column header / footer lines to skip.
  const skipPatterns = [
    /^Device Labels For/i,
    /^DEVICE\s+TYPE\s+LABEL/i,
    /\.cfg\s+\d{1,2}\/\d{1,2}\/\d{4}/,
    /^\s*Page \d+\s*$/i,
  ];

  for (const rawLine of lines) {
    const line = rawLine.replace(/ /g, " ").trimEnd();
    if (!line.trim()) continue;

    if (skipPatterns.some((p) => p.test(line))) {
      pageHeadersSkipped++;
      continue;
    }

    const chanMatch = line.match(chanPattern);
    if (chanMatch && lastDeviceIdx !== null) {
      const ch = chanMatch[1];
      const desc = chanMatch[2].trim();
      const parent = devices[lastDeviceIdx];
      const raw = parent.raw_import_data ?? {};
      const key = `chan_${ch}`;
      raw[key] = desc;
      parent.raw_import_data = raw;
      channelLinesAttached++;
      continue;
    }

    const m = line.match(devicePattern);
    if (!m) {
      // Not a device row and not a skip — record so the user can see what
      // we couldn't parse.
      if (line.length < 200) warnings.push(`Unrecognised line: ${line.trim()}`);
      continue;
    }

    const address = m[1].padStart(3, "0");
    const loop = m[2];
    const code = m[3];
    const label = m[4] || "";

    const key = `${loop}-${address}`;
    if (seen.has(key)) continue;
    seen.add(key);

    devices.push({
      loop,
      address,
      device_type: friendlyType(code),
      location: label || undefined,
      raw_import_data: {
        // Preserve the original codes and label so the wizard / inventory
        // can still surface them even after the friendly-name remap.
        gent_type_code: code,
        gent_label: label,
      },
      imported_source_columns: ["gent_type_code", "gent_label", "chan_1", "chan_2", "chan_3", "chan_4"],
    });
    lastDeviceIdx = devices.length - 1;
  }

  return { devices, pageHeadersSkipped, channelLinesAttached, warnings };
}

/**
 * Extract text from every page of a PDF using pdfjs-dist. Pages are joined
 * with newlines so line-based parsers (parseGentVigilonText) work directly.
 */
export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // pdfjs returns text items in reading order; group by approximate
    // vertical position (transform[5]) so we recover line breaks.
    type TextItem = { str: string; transform: number[] };
    const items = (content.items as TextItem[]).filter((it) => typeof it.str === "string");
    const lines = new Map<number, string[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push(it.str);
    }
    // Higher y is higher on the page in pdfjs's coord system → reverse sort.
    const ys = [...lines.keys()].sort((a, b) => b - a);
    pages.push(ys.map((y) => lines.get(y)!.join(" ")).join("\n"));
  }
  return pages.join("\n");
}

/**
 * Convenience wrapper: read the PDF, detect the Gent Vigilon header, parse.
 * Returns null if the PDF doesn't look like a Gent Vigilon report so the
 * caller can fall back to other parsers.
 */
export async function parseGentVigilonPdf(file: File): Promise<GentVigilonParseResult | null> {
  const text = await extractPdfText(file);
  if (!looksLikeGentVigilonReport(text)) return null;
  return parseGentVigilonText(text);
}

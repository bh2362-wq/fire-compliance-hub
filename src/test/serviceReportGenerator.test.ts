/**
 * Layout regression tests for the BS5839 Service Report PDF.
 *
 * Strategy: spy on jsPDF prototype methods to record every text / image /
 * rect / fill-color call the generator issues, then assert structural
 * invariants that previously broke (jumbled SYSTEM row, missing tick
 * boxes, logo overlap with right-aligned company info).
 *
 * We avoid pixel-diff snapshots — they are flaky in jsdom — and instead
 * check coordinates and content the generator commits to the PDF.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import jsPDF from "jspdf";
import type { BS5839Payload } from "@/services/smartFormService";

// ── Mock the supabase client used by certPdfMasterTemplate.loadCompany ───────
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        limit: () => ({
          maybeSingle: async () => ({
            data: {
              company_name: "BHO Fire & Security Solutions Ltd",
              address: "123 Industrial Estate, Long Road",
              city: "London",
              postcode: "SW1A 1AA",
              phone: "020 1234 5678",
              email: "info@bhofire.example",
              // No logo URL → loadLogoData returns null without network.
              company_logo_url: null,
              report_logo_url: null,
            },
          }),
        }),
      }),
    }),
  },
}));

// ── jsPDF call recorder ──────────────────────────────────────────────────────
type TextCall    = { page: number; x: number; y: number; text: string; size: number; font: string; color: [number, number, number] };
type RectCall    = { page: number; x: number; y: number; w: number; h: number; style: string; fill: [number, number, number] };
type ImageCall   = { page: number; x: number; y: number; w: number; h: number };

const recorder = {
  pages: 1,
  textCalls:  [] as TextCall[],
  rectCalls:  [] as RectCall[],
  imageCalls: [] as ImageCall[],
  reset() { this.pages = 1; this.textCalls = []; this.rectCalls = []; this.imageCalls = []; },
};

function installSpies() {
  const proto: any = (jsPDF as any).prototype;
  let curSize: number = 10;
  let curFont: string = "helvetica";
  let curFill: [number, number, number] = [0, 0, 0];
  let curText: [number, number, number] = [0, 0, 0];

  vi.spyOn(proto, "setFontSize").mockImplementation(function (this: any, s: number) { curSize = s; return this; });
  vi.spyOn(proto, "setFont").mockImplementation(function (this: any, f: string) { curFont = f; return this; });
  vi.spyOn(proto, "setFillColor").mockImplementation(function (this: any, ...rgb: any[]) {
    curFill = (rgb.length === 3 ? rgb : [rgb[0], rgb[0], rgb[0]]) as [number, number, number]; return this;
  });
  vi.spyOn(proto, "setTextColor").mockImplementation(function (this: any, ...rgb: any[]) {
    curText = (rgb.length === 3 ? rgb : [rgb[0], rgb[0], rgb[0]]) as [number, number, number]; return this;
  });

  const realText = proto.text;
  vi.spyOn(proto, "text").mockImplementation(function (this: any, text: any, x: number, y: number, opts?: any) {
    const items: string[] = Array.isArray(text) ? text : [String(text ?? "")];
    items.forEach((t, i) => {
      recorder.textCalls.push({
        page: recorder.pages, x, y: y + i * (curSize * 0.35),
        text: t, size: curSize, font: curFont, color: [...curText] as any,
      });
    });
    return realText.call(this, text, x, y, opts);
  });

  const realRect = proto.rect;
  vi.spyOn(proto, "rect").mockImplementation(function (this: any, x: number, y: number, w: number, h: number, style?: string) {
    recorder.rectCalls.push({ page: recorder.pages, x, y, w, h, style: style ?? "S", fill: [...curFill] as any });
    return realRect.call(this, x, y, w, h, style);
  });

  const realAddImage = proto.addImage;
  vi.spyOn(proto, "addImage").mockImplementation(function (this: any, ...args: any[]) {
    const [, , x, y, w, h] = args;
    recorder.imageCalls.push({ page: recorder.pages, x, y, w, h });
    return realAddImage.apply(this, args);
  });

  const realAddPage = proto.addPage;
  vi.spyOn(proto, "addPage").mockImplementation(function (this: any, ...args: any[]) {
    recorder.pages += 1;
    return realAddPage.apply(this, args);
  });

  // doc.save triggers a browser download — stub it.
  vi.spyOn(proto, "save").mockImplementation(function (this: any) { return this; });
}

// ── Sample payloads ──────────────────────────────────────────────────────────
function basePayload(over: Partial<BS5839Payload> = {}): BS5839Payload {
  return {
    certificate_reference: "BHO-SR-2026-00042",
    certificate_type: "Service",
    date_of_service: "2026-05-09",
    next_service_date: "2026-11-09",
    overall_status: "SATISFACTORY",
    premises_name: "Palantir Technologies UK Ltd",
    premises_address: "20 Soho Square, London, W1D 3QW",
    responsible_person_name: "Giles Barton-Smith",
    responsible_person_contact: "07700 900123",
    panel_manufacturer: "Fireclass",
    panel_model: "FC-503",
    system_categories: ["L1"],
    approx_number_of_devices: 522,
    total_devices: 522,
    devices_tested: 89,
    testing_method: "Quarterly rotation per BS 5839-1 Cl 45",
    engineer_name: "John Smith",
    engineer_declaration_name: "John Smith",
    client_name: "Giles Barton-Smith",
    checklist: [
      { section: "Documentation", label: "Logbook present and up to date", status: "YES" },
      { section: "Documentation", label: "As-fitted drawings available",   status: "NO"  },
      { section: "Documentation", label: "Zone plan adjacent to panel",    status: "N/A" },
      { section: "Control Panel", label: "Panel powers up correctly",      status: "YES" },
      { section: "Control Panel", label: "Battery voltage within spec",    status: "YES" },
      { section: "Control Panel", label: "No outstanding faults",          status: "NO"  },
      { section: "Devices",       label: "Sounders audible in all areas",  status: "YES" },
      { section: "Devices",       label: "Manual call points unobstructed", status: "YES" },
      // Special inputs (text/number) render value, not tick boxes.
      { section: "Devices", label: "Number of devices tested", special: "number", value: 89 },
    ],
    defects: [],
    ...over,
  } as any;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const M = 15;             // matches MARGIN in certPdfMasterTemplate
const A4_W = 210;
const TICK_LABELS = new Set(["YES", "NO", "N/A"]);
const G_FILL: [number, number, number] = [46, 125, 50];
const R_FILL: [number, number, number] = [198, 40, 40];
const N_FILL: [number, number, number] = [84, 110, 122];

function eqColor(a: [number, number, number], b: [number, number, number]) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

async function generate(payload: BS5839Payload) {
  recorder.reset();
  const { generateServiceReport } = await import("@/lib/serviceReportGenerator");
  const result = await generateServiceReport(payload);
  expect(result.fileName).toMatch(/\.pdf$/);
  return result;
}

describe("BS5839 service report PDF — layout regressions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installSpies();
  });

  it("renders without throwing for a fully-populated payload", async () => {
    await generate(basePayload());
    expect(recorder.textCalls.length).toBeGreaterThan(20);
  });

  describe("checklist tick boxes", () => {
    it("emits YES / NO / N/A label in every non-special checklist row", async () => {
      await generate(basePayload());

      // jspdf-autotable emits cell text as part of doc.text calls. Count
      // standalone label calls.
      const labels = recorder.textCalls.filter(c => TICK_LABELS.has(c.text.trim()));

      // We have 8 non-special checklist items × 3 columns = 24 tick labels,
      // plus 3 in the legend. Allow some tolerance for header re-renders.
      expect(labels.length).toBeGreaterThanOrEqual(24 + 3);
    });

    it("paints the chosen tick cell with the matching brand colour", async () => {
      await generate(basePayload());

      // Look for filled rectangles using the YES / NO / N/A palette.
      const filled = recorder.rectCalls.filter(r =>
        (r.style === "F" || r.style === "FD") &&
        (eqColor(r.fill, G_FILL) || eqColor(r.fill, R_FILL) || eqColor(r.fill, N_FILL))
      );

      const greens = filled.filter(r => eqColor(r.fill, G_FILL));
      const reds   = filled.filter(r => eqColor(r.fill, R_FILL));
      const greys  = filled.filter(r => eqColor(r.fill, N_FILL));

      // Payload has 5 YES, 2 NO, 1 N/A non-special items → at least one of each.
      expect(greens.length).toBeGreaterThan(0);
      expect(reds.length).toBeGreaterThan(0);
      expect(greys.length).toBeGreaterThan(0);
    });
  });

  describe("SYSTEM row layout", () => {
    it("keeps each value within its own 5-column band (no jumble)", async () => {
      await generate(basePayload({
        panel_manufacturer: "A-Very-Long-Panel-Manufacturer-Name-That-Used-To-Overflow",
        panel_model: "Model-XYZ-Extended-Variant-9000",
      }));

      const colW = (A4_W - M * 2) / 5;
      // SYSTEM row labels are drawn at fontSize 8, so we can isolate them.
      const labelTexts = ["Panel:", "Model:", "Category:", "Zones:", "Devices:"];
      const labelCalls = labelTexts.map(t =>
        recorder.textCalls.find(c => c.page === 1 && c.text === t && c.size === 8)
      );

      // Every label must exist exactly once and at the expected column origin.
      labelCalls.forEach((call, i) => {
        expect(call, `missing SYSTEM label "${labelTexts[i]}"`).toBeTruthy();
        const expectedX = M + i * colW;
        expect(Math.abs(call!.x - expectedX)).toBeLessThan(0.5);
      });

      // For each label, verify the value text right-edge stays inside the column.
      for (let i = 0; i < labelCalls.length; i++) {
        const call = labelCalls[i]!;
        const colRight = M + (i + 1) * colW;
        // Value is drawn on the same baseline immediately after the label.
        const valueCalls = recorder.textCalls.filter(c =>
          c.page === 1 && Math.abs(c.y - call.y) < 0.1 && c.x > call.x && c.text !== labelTexts[i]
        );
        valueCalls.forEach(v => {
          // Approximate width: helvetica 8pt ≈ 1.6mm per char.
          const approxRight = v.x + v.text.length * 1.6;
          expect(approxRight, `SYSTEM column ${i} value "${v.text}" overflows`).toBeLessThanOrEqual(colRight + 0.5);
        });
      }
    });
  });

  describe("page header / logo region", () => {
    it("right-aligned company info never crosses into the logo region", async () => {
      await generate(basePayload());

      // Logo (when present) sits in [M, M+32]. We mocked no logo, so the
      // company-name fallback renders at x=M with helvetica bold 14.
      // Right-aligned company info uses { align: "right" } at x = pw - M.
      // jsPDF's text() with align:right is forwarded to our spy with the
      // anchor x — we cannot detect the rendered left edge directly, so
      // instead we assert that no left-anchored header text shares a y
      // coordinate with right-anchored header text (which would only
      // happen if the layout collapsed).

      const headerBand = recorder.textCalls.filter(c => c.page === 1 && c.y < 50);
      const leftAnchored  = headerBand.filter(c => c.x <= M + 0.1);
      const rightAnchored = headerBand.filter(c => Math.abs(c.x - (A4_W - M)) < 0.1);

      // For every right-anchored header line, ensure its baseline does not
      // clash with a left-anchored line at the same y (would indicate
      // overlap of company name + contact details with the logo column).
      rightAnchored.forEach(r => {
        const clash = leftAnchored.find(l => Math.abs(l.y - r.y) < 1.5);
        expect(clash, `header overlap at y=${r.y}: "${clash?.text}" vs "${r.text}"`).toBeUndefined();
      });
    });

    it("title wraps so it doesn't collide with the right-aligned cert reference", async () => {
      await generate(basePayload({ certificate_reference: "BHO-SR-2026-00042-LONG-VARIANT" }));

      const titleCall = recorder.textCalls.find(c =>
        c.page === 1 && c.size === 17 && c.text.startsWith("Fire Alarm")
      );
      const refCall = recorder.textCalls.find(c =>
        c.page === 1 && c.text === "BHO-SR-2026-00042-LONG-VARIANT"
      );
      expect(titleCall).toBeTruthy();
      expect(refCall).toBeTruthy();

      // Title left-anchored at M=15. Right-anchored ref sits at x=pw-M=195.
      // Title-line approx right edge: x + chars * 3.2mm (helvetica bold 17pt).
      const titleRight = titleCall!.x + titleCall!.text.length * 3.2;
      // Approx left edge of right-anchored ref:
      const refLeft = refCall!.x - refCall!.text.length * 1.7;
      expect(titleRight, "title overlaps cert reference").toBeLessThan(refLeft);
    });
  });
});

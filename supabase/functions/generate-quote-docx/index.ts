import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  Header, Footer, AlignmentType, WidthType, BorderStyle, ShadingType,
  LevelFormat, PageNumber,
} from "npm:docx@9.6.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface QuoteItem { desc: string; qty: number; unit: number; }

interface QuoteInput {
  ref: string;
  issued_date: string;
  valid_until: string;
  project_title: string;
  client: { company: string; contact: string; address: string };
  introduction: string;
  scope: string[];
  items: QuoteItem[];
  assumptions: string[];
  exclusions: string[];
  vat_rate?: number;
  quotation_id?: string;
}

const RED       = "EB1D23";
const BLACK     = "1F1F1F";
const MUTED     = "888888";
const LIGHT     = "BFBFBF";
const RULE      = "D8D3C4";
const BG_GREY   = "F4F2EC";
const BODY_FONT = "Calibri";
const CONTENT_W = 9026;

const NONE  = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NONES = { top: NONE, bottom: NONE, left: NONE, right: NONE } as const;
const THIN  = (color: string = RULE)  => ({ style: BorderStyle.SINGLE, size: 4, color });
const MED   = (color: string = BLACK) => ({ style: BorderStyle.SINGLE, size: 8, color });

const gbp = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const text = (str: string, opts: Record<string, unknown> = {}) =>
  new TextRun({ text: str, font: BODY_FONT, color: BLACK, size: 22, ...opts });
const blank = (after = 120) =>
  new Paragraph({ children: [new TextRun({ text: "", font: BODY_FONT, size: 22 })], spacing: { after } });

const sectionHeading = (num: number, label: string, opts: { pageBreakBefore?: boolean } = {}) =>
  new Paragraph({
    children: [new TextRun({ text: `${num}. ${label.toUpperCase()}`, font: BODY_FONT, color: RED, bold: true, size: 22, characterSpacing: 30 })],
    spacing: { before: 320, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RED, space: 4 } },
    pageBreakBefore: opts.pageBreakBefore ?? false,
  });

const body = (str: string) =>
  new Paragraph({ children: [text(str)], alignment: AlignmentType.JUSTIFIED, spacing: { after: 160, line: 320 } });

const cell = (children: (Paragraph | Table)[], opts: Record<string, unknown> = {}) =>
  new TableCell({ children, borders: NONES, margins: { top: 60, bottom: 60, left: 0, right: 0 }, ...opts });

function buildDocument(q: QuoteInput, logo: ArrayBuffer): Document {
  const vatRate = q.vat_rate ?? 0.20;
  const subtotal = q.items.reduce((s, it) => s + it.qty * it.unit, 0);
  const vat = subtotal * vatRate;
  const total = subtotal + vat;

  const banner = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [1800, 7226],
    borders: { ...NONES, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({ children: [
      cell([new Paragraph({ children: [new ImageRun({ data: logo, transformation: { width: 95, height: 75 }, type: "jpg" })] })],
        { width: { size: 1800, type: WidthType.DXA }, verticalAlign: "top" }),
      cell([
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "BHO Fire Ltd", font: BODY_FONT, bold: true, size: 22, color: BLACK })], spacing: { after: 40 } }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "St Georges Business Park, Castle Rd, Sittingbourne ME10 3TB", font: BODY_FONT, size: 18, color: MUTED })], spacing: { after: 30 } }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "0330 043 8659  ·  admin@bhofire.com  ·  www.bhofire.com", font: BODY_FONT, size: 18, color: MUTED })] }),
      ], { width: { size: 7226, type: WidthType.DXA }, verticalAlign: "top" }),
    ] })],
  });

  const redRule = new Paragraph({
    children: [new TextRun({ text: "", size: 2 })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 1 } },
    spacing: { before: 200, after: 280 },
  });

  const title = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Quotation", font: BODY_FONT, bold: true, size: 56, color: BLACK, characterSpacing: -10 })],
    spacing: { after: 120 },
  });

  const subtitle = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: q.project_title, font: BODY_FONT, size: 24, color: MUTED, italics: true })],
    spacing: { after: 320 },
  });

  const refRow = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [3008, 3009, 3009],
    borders: { ...NONES, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({ children: [
      cell([
        new Paragraph({ children: [new TextRun({ text: "QUOTE REF", font: BODY_FONT, size: 16, color: MUTED, characterSpacing: 30 })], spacing: { after: 40 } }),
        new Paragraph({ children: [new TextRun({ text: q.ref, font: BODY_FONT, size: 22, color: BLACK, bold: true })] }),
      ]),
      cell([
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ISSUED", font: BODY_FONT, size: 16, color: MUTED, characterSpacing: 30 })], spacing: { after: 40 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: q.issued_date, font: BODY_FONT, size: 22, color: BLACK, bold: true })] }),
      ]),
      cell([
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "VALID UNTIL", font: BODY_FONT, size: 16, color: MUTED, characterSpacing: 30 })], spacing: { after: 40 } }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: q.valid_until, font: BODY_FONT, size: 22, color: BLACK, bold: true })] }),
      ]),
    ] })],
  });

  const clientBoxBorders = { top: THIN(), bottom: THIN(), left: THIN(), right: THIN() };
  const clientBox = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({ children: [
      new TableCell({
        borders: clientBoxBorders,
        margins: { top: 160, bottom: 160, left: 200, right: 200 },
        children: [
          new Paragraph({ spacing: { after: 100 }, children: [
            new TextRun({ text: "CLIENT  ", font: BODY_FONT, size: 18, color: RED, bold: true, characterSpacing: 30 }),
            new TextRun({ text: `${q.client.company}  ·  ${q.client.contact}`, font: BODY_FONT, size: 22, color: BLACK }),
          ] }),
          new Paragraph({ children: [
            new TextRun({ text: "SITE      ", font: BODY_FONT, size: 18, color: RED, bold: true, characterSpacing: 30 }),
            new TextRun({ text: q.client.address, font: BODY_FONT, size: 22, color: BLACK }),
          ] }),
        ],
      }),
    ] })],
  });

  const priceBorders = { top: THIN(), bottom: THIN(), left: THIN(), right: THIN() };
  const priceHeader = new TableRow({ tableHeader: true, children: [
    new TableCell({ width: { size: 5400, type: WidthType.DXA }, borders: { ...priceBorders, bottom: MED() }, shading: { fill: BG_GREY, type: ShadingType.CLEAR, color: "auto" }, margins: { top: 100, bottom: 100, left: 140, right: 140 }, children: [new Paragraph({ children: [new TextRun({ text: "DESCRIPTION", font: BODY_FONT, size: 18, bold: true, color: BLACK, characterSpacing: 30 })] })] }),
    new TableCell({ width: { size: 900, type: WidthType.DXA }, borders: { ...priceBorders, bottom: MED() }, shading: { fill: BG_GREY, type: ShadingType.CLEAR, color: "auto" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "QTY", font: BODY_FONT, size: 18, bold: true, color: BLACK, characterSpacing: 30 })] })] }),
    new TableCell({ width: { size: 1363, type: WidthType.DXA }, borders: { ...priceBorders, bottom: MED() }, shading: { fill: BG_GREY, type: ShadingType.CLEAR, color: "auto" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "UNIT £", font: BODY_FONT, size: 18, bold: true, color: BLACK, characterSpacing: 30 })] })] }),
    new TableCell({ width: { size: 1363, type: WidthType.DXA }, borders: { ...priceBorders, bottom: MED() }, shading: { fill: BG_GREY, type: ShadingType.CLEAR, color: "auto" }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "NET £", font: BODY_FONT, size: 18, bold: true, color: BLACK, characterSpacing: 30 })] })] }),
  ] });

  const priceItemRow = (it: QuoteItem) => new TableRow({ children: [
    new TableCell({ width: { size: 5400, type: WidthType.DXA }, borders: priceBorders, margins: { top: 80, bottom: 80, left: 140, right: 140 }, children: [new Paragraph({ children: [text(it.desc)] })] }),
    new TableCell({ width: { size: 900, type: WidthType.DXA }, borders: priceBorders, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [text(String(it.qty))] })] }),
    new TableCell({ width: { size: 1363, type: WidthType.DXA }, borders: priceBorders, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [text(gbp(it.unit))] })] }),
    new TableCell({ width: { size: 1363, type: WidthType.DXA }, borders: priceBorders, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [text(gbp(it.qty * it.unit))] })] }),
  ] });

  const totalsRow = (label: string, value: number, bold = false, top = false) => new TableRow({ children: [
    new TableCell({ width: { size: 6300, type: WidthType.DXA }, columnSpan: 3, borders: { ...priceBorders, top: top ? MED() : THIN() }, margins: { top: 80, bottom: 80, left: 140, right: 140 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: label, font: BODY_FONT, size: 22, color: BLACK, bold })] })] }),
    new TableCell({ width: { size: 1363, type: WidthType.DXA }, borders: { ...priceBorders, top: top ? MED() : THIN() }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: gbp(value), font: BODY_FONT, size: 22, color: BLACK, bold })] })] }),
  ] });

  const priceTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [5400, 900, 1363, 1363],
    rows: [
      priceHeader,
      ...q.items.map(priceItemRow),
      totalsRow("Subtotal (excl. VAT)", subtotal, false, true),
      totalsRow(`VAT @ ${Math.round(vatRate * 100)}%`, vat, false, false),
      totalsRow("TOTAL (incl. VAT)", total, true, true),
    ],
  });

  const acceptanceBox = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [new TableRow({ cantSplit: true, children: [
      new TableCell({
        borders: clientBoxBorders,
        margins: { top: 180, bottom: 180, left: 240, right: 240 },
        children: [
          new Paragraph({ spacing: { after: 200 }, children: [text("To accept this quotation, please sign and return a copy to admin@bhofire.com. Works will be scheduled within 10 working days of acceptance, subject to material lead times and access availability.")] }),
          new Table({
            width: { size: CONTENT_W - 480, type: WidthType.DXA },
            columnWidths: [4273, 4273],
            borders: { ...NONES, insideHorizontal: NONE, insideVertical: NONE },
            rows: [new TableRow({ cantSplit: true, children: [
              cell([
                new Paragraph({ children: [new TextRun({ text: "SIGNED", font: BODY_FONT, size: 16, color: MUTED, characterSpacing: 30 })], spacing: { after: 320 } }),
                new Paragraph({ children: [new TextRun({ text: " ", font: BODY_FONT, size: 22 })], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BLACK, space: 1 } }, spacing: { after: 60 } }),
                new Paragraph({ children: [new TextRun({ text: "Name & position", font: BODY_FONT, size: 16, color: MUTED, italics: true })] }),
              ]),
              cell([
                new Paragraph({ children: [new TextRun({ text: "DATE", font: BODY_FONT, size: 16, color: MUTED, characterSpacing: 30 })], spacing: { after: 320 } }),
                new Paragraph({ children: [new TextRun({ text: " ", font: BODY_FONT, size: 22 })], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BLACK, space: 1 } }, spacing: { after: 60 } }),
                new Paragraph({ children: [new TextRun({ text: `On behalf of ${q.client.company}`, font: BODY_FONT, size: 16, color: MUTED, italics: true })] }),
              ]),
            ] })],
          }),
        ],
      }),
    ] })],
  });

  return new Document({
    creator: "BHO Fire Ltd",
    title: `Quotation ${q.ref}`,
    styles: { default: { document: { run: { font: BODY_FONT, size: 22, color: BLACK } } } },
    numbering: { config: [{ reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }] }] },
    sections: [{
      properties: { page: { margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${q.ref}   ·   ${q.issued_date}`, font: BODY_FONT, size: 16, color: LIGHT })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 } },
        spacing: { before: 60 },
        children: [
          new TextRun({ text: "BHO Fire Ltd  ·  Registered in England & Wales  ·  Co. No. 12235152  ·  ", font: BODY_FONT, size: 14, color: MUTED }),
          new TextRun({ text: "Page ", font: BODY_FONT, size: 14, color: MUTED }),
          new TextRun({ children: [PageNumber.CURRENT], font: BODY_FONT, size: 14, color: MUTED }),
          new TextRun({ text: " of ", font: BODY_FONT, size: 14, color: MUTED }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: BODY_FONT, size: 14, color: MUTED }),
        ],
      })] }) },
      children: [
        banner, redRule, title, subtitle, refRow, blank(160), clientBox,
        sectionHeading(1, "Introduction"), body(q.introduction),
        sectionHeading(2, "Scope of Works"), ...q.scope.map(body),
        sectionHeading(3, "Pricing Schedule", { pageBreakBefore: true }), priceTable, blank(80),
        new Paragraph({ children: [new TextRun({ text: "All prices in pounds sterling. VAT charged at the prevailing rate.", font: BODY_FONT, size: 16, color: MUTED, italics: true })] }),
        sectionHeading(4, "Assumptions"),
        ...q.assumptions.map((a) => new Paragraph({ numbering: { reference: "bul", level: 0 }, children: [text(a)], spacing: { after: 100 } })),
        sectionHeading(5, "Exclusions"),
        ...q.exclusions.map((e) => new Paragraph({ numbering: { reference: "bul", level: 0 }, children: [text(e)], spacing: { after: 100 } })),
        sectionHeading(6, "Acceptance", { pageBreakBefore: true }), acceptanceBox,
      ],
    }],
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const quote = (await req.json()) as QuoteInput;
    const required: (keyof QuoteInput)[] = ["ref", "issued_date", "valid_until", "project_title", "client", "introduction", "scope", "items"];
    for (const k of required) if (quote[k] == null) throw new Error(`Missing required field: ${k}`);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: logoBlob, error: logoErr } = await supabase.storage.from("quote-assets").download("bho-logo.jpg");
    if (logoErr || !logoBlob) throw new Error(`Logo fetch failed: ${logoErr?.message ?? "no data"}`);
    const logoBuffer = await logoBlob.arrayBuffer();

    const doc = buildDocument(quote, logoBuffer);
    const blob = await Packer.toBlob(doc);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const pathBase = quote.quotation_id ?? quote.ref.replace(/[^A-Za-z0-9_-]/g, "_");
    const storagePath = `${pathBase}/quote.docx`;
    const { error: uploadErr } = await supabase.storage.from("quote-outputs").upload(storagePath, bytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: signed, error: signedErr } = await supabase.storage.from("quote-outputs").createSignedUrl(storagePath, 3600);
    if (signedErr || !signed) throw new Error(`Sign failed: ${signedErr?.message ?? "no url"}`);

    if (quote.quotation_id) {
      await supabase.from("quotations").update({ latest_docx_path: storagePath }).eq("id", quote.quotation_id);
    }

    return new Response(JSON.stringify({
      storage_path: storagePath,
      signed_url: signed.signedUrl,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      file_size_bytes: bytes.byteLength,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

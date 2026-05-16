/**
 * extract-pdf-prices (v2)
 *
 * Handles large supplier price list PDFs by:
 *  1. Splitting the PDF into page chunks using pdf-lib
 *  2. Processing each chunk sequentially with retry + exponential backoff
 *  3. Returning combined results from all chunks
 *
 * Accepts:
 *   pdfBase64    string  — raw base64 (no data: prefix needed)
 *   emailText?   string  — fallback plain text if no PDF
 *   filename?    string
 *   supplierName? string
 *   chunkSize?   number  — pages per chunk (default 15)
 */

import { PDFDocument } from "https://cdn.skypack.dev/pdf-lib@1.17.1?dts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RETRIES  = 4;
const BASE_DELAY   = 4000;  // 4s initial backoff on 429
const CHUNK_PAGES  = 3;     // pages per Claude request when PDF text extraction is unavailable
const TEXT_CHARS   = 6000;  // keep each text request safely below token-per-minute limits

// ── Claude call with retry/backoff ────────────────────────────────────────────
async function callClaude(
  apiKey: string,
  content: any[],
  attempt = 0
): Promise<any[]> {

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-5",
      max_tokens: 4096,
      system: `You are a fire alarm parts pricing extractor. Read supplier invoices, quotations, price lists or pricing emails and extract every identifiable line item.

Return ONLY a valid JSON array — no other text, no markdown fences:
[
  {
    "part_number": "S4-711",
    "description": "S4 Dual Optical Heat Sensor",
    "manufacturer": "Gent",
    "category": "Detector",
    "unit_cost": 28.50,
    "labour_cost": 0
  }
]

Rules:
- Only include items where you can identify BOTH a part/product number AND a price
- unit_cost = the net/trade price (ex VAT) per unit. If only total price shown, divide by quantity.
- labour_cost = installation labour cost if shown separately, otherwise 0
- manufacturer: infer from part number prefix if not stated (S4- = Gent, E80 = Hochiki, etc.)
- category: Detector | Sounder | VAD | MCP | Panel | Cable | Interface | Battery | Other
- Return [] if no extractable pricing found in this section`,
      messages: [{ role: "user", content }],
    }),
  });

  // Rate limited — wait and retry
  if (response.status === 429) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(`Rate limit exceeded after ${MAX_RETRIES} retries`);
    }
    const delay = BASE_DELAY * Math.pow(2, attempt);
    console.log(`Rate limited — waiting ${delay}ms before retry ${attempt + 1}/${MAX_RETRIES}`);
    await new Promise(r => setTimeout(r, delay));
    return callClaude(apiKey, content, attempt + 1);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const aiData = await response.json();
  const rawText: string = aiData.content
    ?.filter((c: any) => c.type === "text")
    ?.map((c: any) => c.text)
    ?.join("")
    ?.trim() || "";

  // Parse JSON array from response
  let rows: any[] = [];
  try {
    rows = JSON.parse(rawText.replace(/```json|```/g, "").trim());
  } catch {
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) {
      try { rows = JSON.parse(match[0]); } catch { rows = []; }
    }
  }
  return Array.isArray(rows) ? rows : [];
}


// ── Split pasted/extracted text into small model-safe sections ────────────────
function splitTextIntoChunks(text: string, maxChars = TEXT_CHARS): string[] {
  const cleaned = String(text || "").replace(/\r/g, "").trim();
  if (!cleaned) return [];

  const lines = cleaned.split("\n");
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxChars && current) {
      chunks.push(current.trim());
      current = line;
    } else {
      current = next;
    }

    while (current.length > maxChars) {
      chunks.push(current.slice(0, maxChars).trim());
      current = current.slice(maxChars);
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ── Sanitise extracted rows ───────────────────────────────────────────────────
function sanitise(rows: any[]): any[] {
  return rows
    .filter((r: any) => r.part_number && Number(r.unit_cost) > 0)
    .map((r: any) => ({
      part_number:  String(r.part_number  || "").trim(),
      description:  String(r.description  || "").trim(),
      manufacturer: String(r.manufacturer || "").trim(),
      category:     String(r.category     || "Other").trim(),
      unit_cost:    Number(r.unit_cost)    || 0,
      labour_cost:  Number(r.labour_cost)  || 0,
    }));
}

// ── Deduplicate by part_number (last wins — later pages override earlier) ─────
function dedup(rows: any[]): any[] {
  const map = new Map<string, any>();
  rows.forEach(r => map.set(r.part_number.toLowerCase(), r));
  return Array.from(map.values());
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      pdfBase64,
      emailText = "",
      filename = "document.pdf",
      supplierName = "",
      chunkSize = CHUNK_PAGES,
    } = await req.json();

    if (!pdfBase64 && !emailText) throw new Error("pdfBase64 or emailText required");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    // Strip data URI prefix if present
    const b64 = pdfBase64
      ? (pdfBase64.includes(",") ? pdfBase64.split(",")[1] : pdfBase64)
      : null;

    let allRows: any[] = [];

    // ── Email/text-only path — split into smaller model-safe chunks ──────────
    if (!b64 && emailText) {
      const textChunks = splitTextIntoChunks(emailText, Math.max(2000, Math.min(Number(chunkSize) || TEXT_CHARS, TEXT_CHARS)));
      const numChunks = textChunks.length;
      console.log(`Processing text in ${numChunks} chunk(s)`);

      for (let chunk = 0; chunk < numChunks; chunk++) {
        const content = [
          { type: "text", text: `Supplier price list text${supplierName ? ` from ${supplierName}` : ""}. Section ${chunk + 1} of ${numChunks}:\n\n${textChunks[chunk]}` },
          { type: "text", text: "Extract every fire alarm part with a price from this text section only." },
        ];

        try {
          const rows = await callClaude(ANTHROPIC_API_KEY, content);
          const cleaned = sanitise(rows);
          allRows.push(...cleaned);
          console.log(`Text chunk ${chunk + 1}/${numChunks}: extracted ${cleaned.length} items`);
        } catch (e: any) {
          console.error(`Text chunk ${chunk + 1} failed:`, e.message);
        }

        if (chunk < numChunks - 1) {
          await new Promise(r => setTimeout(r, 2500));
        }
      }

    } else if (b64) {
      // ── PDF path — split into page chunks ─────────────────────────────────
      let pageCount = 1;
      let pdfBytes: Uint8Array;

      try {
        pdfBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const pdfDoc = await PDFDocument.load(pdfBytes);
        pageCount = pdfDoc.getPageCount();
        console.log(`PDF has ${pageCount} pages — processing in chunks of ${chunkSize}`);
      } catch (e) {
        // pdf-lib failed — fall back to sending whole PDF to Claude
        console.warn("pdf-lib failed, sending whole PDF:", e);
        const content = [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: b64 },
            title: filename,
          },
          { type: "text", text: `Extract every fire alarm part with a price from the attached document${supplierName ? ` (supplier: ${supplierName})` : ""}.` },
        ];
        const rows = await callClaude(ANTHROPIC_API_KEY, content);
        allRows = sanitise(rows);

        return new Response(
          JSON.stringify({ rows: dedup(allRows), total: allRows.length, chunks: 1 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Process in chunks
      const numChunks = Math.ceil(pageCount / chunkSize);
      console.log(`Processing ${numChunks} chunks`);

      for (let chunk = 0; chunk < numChunks; chunk++) {
        const startPage = chunk * chunkSize;
        const endPage   = Math.min(startPage + chunkSize, pageCount);

        console.log(`Chunk ${chunk + 1}/${numChunks}: pages ${startPage + 1}–${endPage}`);

        // Extract chunk as separate PDF
        const chunkDoc = await PDFDocument.create();
        const srcDoc   = await PDFDocument.load(pdfBytes);
        const pageIdxs = Array.from({ length: endPage - startPage }, (_, i) => startPage + i);
        const pages    = await chunkDoc.copyPages(srcDoc, pageIdxs);
        pages.forEach(p => chunkDoc.addPage(p));

        const chunkBytes  = await chunkDoc.save();
        let binary = "";
        for (let i = 0; i < chunkBytes.length; i += 8192) {
          binary += String.fromCharCode(...chunkBytes.slice(i, i + 8192));
        }
        const chunkB64 = btoa(binary);

        const content = [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: chunkB64 },
            title: `${filename} — pages ${startPage + 1}–${endPage}`,
          },
          {
            type: "text",
            text: `Extract every fire alarm part with a price from this section of the price list${supplierName ? ` from ${supplierName}` : ""}. Pages ${startPage + 1}–${endPage} of ${pageCount}.`,
          },
        ];

        try {
          const rows = await callClaude(ANTHROPIC_API_KEY, content);
          const cleaned = sanitise(rows);
          allRows.push(...cleaned);
          console.log(`Chunk ${chunk + 1}: extracted ${cleaned.length} items (running total: ${allRows.length})`);
        } catch (e: any) {
          console.error(`Chunk ${chunk + 1} failed:`, e.message);
          // Continue with remaining chunks rather than failing the whole request
        }

        // Small pause between chunks to stay within rate limits
        if (chunk < numChunks - 1) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }

    const final = dedup(allRows);

    return new Response(
      JSON.stringify({ rows: final, total: final.length, chunksProcessed: allRows.length ? undefined : 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("extract-pdf-prices:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

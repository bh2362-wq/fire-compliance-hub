// extract-pdf-prices
// Accepts a base64 PDF from a supplier invoice or price list,
// sends it to Claude with the Anthropic document API, returns
// structured price list rows ready for upsert.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pdfBase64, emailText = "", filename = "document.pdf", supplierName = "" } = await req.json();
    if (!pdfBase64 && !emailText) throw new Error("pdfBase64 or emailText required");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    // Strip data URI prefix if present
    const b64 = pdfBase64 ? (pdfBase64.includes(",") ? pdfBase64.split(",")[1] : pdfBase64) : null;

    type Block =
      | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string }; title?: string }
      | { type: "text"; text: string };

    const userContent: Block[] = [];
    if (b64) {
      userContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: b64 },
        title: filename,
      });
    }
    if (emailText) {
      userContent.push({
        type: "text",
        text: `Email body / quotation text${supplierName ? ` from ${supplierName}` : ""}:\n\n${emailText}`,
      });
    }
    userContent.push({
      type: "text",
      text: `Extract every fire alarm part with a price from the ${b64 ? "attached document" : "text above"}${supplierName ? ` (supplier: ${supplierName})` : ""}.`,
    });

    const callClaude = () => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
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
- Return [] if no extractable pricing`,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    // Retry on 429 / 5xx with exponential backoff, honoring Retry-After
    let response: Response | null = null;
    let lastErr = "";
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      response = await callClaude();
      if (response.ok) break;

      const status = response.status;
      const errText = await response.text();
      lastErr = errText;

      const retriable = status === 429 || status === 529 || (status >= 500 && status < 600);
      if (!retriable || attempt === maxAttempts) {
        if (status === 429) {
          const retryAfter = Number(response.headers.get("retry-after")) || 60;
          return new Response(JSON.stringify({
            error: `AI rate limit reached. The PDF is too large for the current per-minute token quota. Please wait ~${retryAfter}s and try again, or split the PDF into smaller files.`,
            rows: [],
            total: 0,
            rateLimited: true,
            retryAfterSeconds: retryAfter,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        throw new Error(`Claude API error ${status}: ${errText.slice(0, 300)}`);
      }

      // Backoff: prefer Retry-After header, else exponential (2s, 4s, 8s)
      const retryAfterHdr = Number(response.headers.get("retry-after"));
      const waitMs = (retryAfterHdr > 0 ? retryAfterHdr : Math.pow(2, attempt)) * 1000;
      console.log(`extract-pdf-prices: ${status} on attempt ${attempt}, retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    if (!response || !response.ok) {
      throw new Error(`Claude API failed after retries: ${lastErr.slice(0, 300)}`);
    }

    const aiData = await response.json();
    const rawText: string = aiData.content
      ?.filter((c: { type: string }) => c.type === "text")
      ?.map((c: { text: string }) => c.text)
      ?.join("")
      ?.trim() || "";

    let rows: unknown[] = [];
    try {
      rows = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    } catch {
      // Try to find a JSON array in the text
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) {
        try { rows = JSON.parse(match[0]); } catch { rows = []; }
      }
    }

    if (!Array.isArray(rows)) rows = [];

    // Sanitise each row
    const clean = rows
      .filter((r: any) => r.part_number && r.unit_cost > 0)
      .map((r: any) => ({
        part_number: String(r.part_number || "").trim(),
        description: String(r.description || "").trim(),
        manufacturer: String(r.manufacturer || "").trim(),
        category: String(r.category || "Other").trim(),
        unit_cost: Number(r.unit_cost) || 0,
        labour_cost: Number(r.labour_cost) || 0,
        model: String(r.model || "").trim(),
        short_name: "",
      }));

    return new Response(JSON.stringify({ rows: clean, total: clean.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("extract-pdf-prices:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractJsonArray(text: string): any[] {
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch { /* continue */ }

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.substring(start, end + 1));
    } catch { /* continue */ }
  }

  // Fix truncated JSON
  if (start !== -1) {
    let fragment = cleaned.substring(start);
    const lastComplete = fragment.lastIndexOf("},");
    if (lastComplete > 0) {
      fragment = fragment.substring(0, lastComplete + 1) + "]";
      try { return JSON.parse(fragment); } catch { /* continue */ }
    }
    const lastObj = fragment.lastIndexOf("}");
    if (lastObj > 0) {
      fragment = fragment.substring(0, lastObj + 1) + "]";
      try { return JSON.parse(fragment); } catch { /* continue */ }
    }
  }

  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, chunkIndex, totalChunks, pageStart, pageEnd } = await req.json();

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If we have pdfBase64, send the PDF directly to Gemini for visual parsing
    if (pdfBase64) {
      console.log(`Processing PDF chunk ${chunkIndex + 1}/${totalChunks} (pages ${pageStart}-${pageEnd})`);

      const prompt = `You are a product catalog parser. This is a PDF page from a Huvo fire safety trade price list.

Extract EVERY product you can see on this page. For each product return:
- "product_code": the exact product/part code (e.g. "S4-34805EP", "HFC-WSR-03", "58000-600APO")  
- "description": the full product name/description
- "trade_price": the trade price as a number (no £ symbol). Use 0 if not visible.
- "category": the product category/section heading if visible, or null

Rules:
- Return ONLY a JSON array: [{"product_code":"...","description":"...","trade_price":0,"category":"..."}]
- NO markdown, NO explanation, NO code fences
- Extract ALL products visible on the page
- Copy product codes EXACTLY as printed
- If this page has no products (e.g. it's a cover page, index, or terms), return []`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          }],
          temperature: 0.0,
          max_tokens: 65000,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Chunk ${chunkIndex + 1} AI error:`, response.status, errText.substring(0, 300));
        return new Response(JSON.stringify({ products: [], error: `AI error: ${response.status}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rawBody = await response.text();
      let aiResult;
      try {
        aiResult = JSON.parse(rawBody);
      } catch {
        console.error(`Chunk ${chunkIndex + 1} invalid API response`);
        return new Response(JSON.stringify({ products: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const content = aiResult.choices?.[0]?.message?.content || "";
      const products = extractJsonArray(content);

      const cleaned = products
        .filter((p: any) => p && p.product_code && p.description)
        .map((p: any) => ({
          product_code: String(p.product_code).trim(),
          description: String(p.description).trim(),
          trade_price: parseFloat(p.trade_price) || 0,
          category: p.category ? String(p.category).trim() : null,
        }));

      console.log(`Chunk ${chunkIndex + 1}/${totalChunks}: found ${cleaned.length} products`);

      return new Response(JSON.stringify({ products: cleaned }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: text-based parsing (kept for compatibility)
    const { text } = await req.json().catch(() => ({ text: "" }));
    return new Response(JSON.stringify({ products: [], error: "No PDF data provided" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message, products: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

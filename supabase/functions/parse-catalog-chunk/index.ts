import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractJsonArray(text: string): any[] {
  // Remove markdown code fences
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

  // Try direct parse
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch { /* continue */ }

  // Try to find array brackets
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.substring(start, end + 1));
    } catch { /* continue */ }
  }

  // Try fixing truncated JSON by closing brackets
  if (start !== -1) {
    let fragment = cleaned.substring(start);
    // Remove trailing incomplete object
    const lastComplete = fragment.lastIndexOf("},");
    if (lastComplete > 0) {
      fragment = fragment.substring(0, lastComplete + 1) + "]";
      try {
        return JSON.parse(fragment);
      } catch { /* continue */ }
    }
    const lastObj = fragment.lastIndexOf("}");
    if (lastObj > 0) {
      fragment = fragment.substring(0, lastObj + 1) + "]";
      try {
        return JSON.parse(fragment);
      } catch { /* continue */ }
    }
  }

  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, chunkIndex, totalChunks } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "No text provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are a product catalog parser. Extract EVERY product from this trade price list section.

For each product return a JSON object with these fields:
- "product_code": the exact part/model code (e.g. "S4-34805EP", "HFC-WSR-03")
- "description": full product name/description
- "trade_price": trade price as a number (no £ sign). Use 0 if not found.
- "category": product category from context, or null

Rules:
- Return ONLY a JSON array: [{...}, {...}]
- NO markdown, NO explanation, NO code fences
- Extract ALL products, do not skip any
- Copy product codes exactly as shown

Chunk ${chunkIndex + 1} of ${totalChunks}:
${text}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.0,
        max_tokens: 65000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Chunk ${chunkIndex + 1} AI error:`, response.status, errText.substring(0, 200));
      return new Response(JSON.stringify({ products: [], error: `AI error: ${response.status}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await response.text();
    if (!rawBody || rawBody.trim().length === 0) {
      console.error(`Chunk ${chunkIndex + 1} empty response`);
      return new Response(JSON.stringify({ products: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Clean products
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
  } catch (err) {
    console.error("Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message, products: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

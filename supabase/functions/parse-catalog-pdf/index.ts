import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CHUNK_SIZE = 40000; // chars per chunk - safe for token limits
const MAX_CHUNKS = 50; // safety cap

async function parseChunk(apiKey: string, chunkText: string, chunkIndex: number, totalChunks: number): Promise<any[]> {
  const prompt = `You are a product catalog parser. Extract EVERY product from this section of a supplier catalog.

For each product, extract:
- product_code: The product/part code (e.g. "S4-34805EP", "HFC-WSR-03")
- description: The full product description/name
- trade_price: The trade price as a number (no currency symbols). If multiple prices exist, use the trade/wholesale price. If no price found, use 0.
- category: The product category if one is apparent from the context

Return a JSON array of objects. Extract ALL products from this section.
Be extremely precise with product codes - copy them exactly as shown.
Do NOT skip any products.

IMPORTANT: Return ONLY the JSON array, no other text. If no products found in this section, return [].

This is chunk ${chunkIndex + 1} of ${totalChunks}.

Catalog text:
${chunkText}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 65000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Chunk ${chunkIndex + 1} AI error:`, response.status, errText.substring(0, 200));
    return [];
  }

  const rawBody = await response.text();
  if (!rawBody || rawBody.trim().length === 0) {
    console.error(`Chunk ${chunkIndex + 1} returned empty response`);
    return [];
  }

  let aiResult;
  try {
    aiResult = JSON.parse(rawBody);
  } catch {
    console.error(`Chunk ${chunkIndex + 1} invalid JSON response`);
    return [];
  }

  const content = aiResult.choices?.[0]?.message?.content || "";

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`Chunk ${chunkIndex + 1}: found ${parsed.length} products`);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (parseErr) {
    console.error(`Chunk ${chunkIndex + 1} parse error:`, parseErr);
  }

  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
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

    // Split text into chunks
    const chunks: string[] = [];
    for (let i = 0; i < text.length && chunks.length < MAX_CHUNKS; i += CHUNK_SIZE) {
      chunks.push(text.substring(i, i + CHUNK_SIZE));
    }

    console.log(`Processing ${text.length} chars in ${chunks.length} chunks`);

    // Process chunks sequentially to avoid rate limits
    const allProducts: any[] = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
      const products = await parseChunk(apiKey, chunks[i], i, chunks.length);
      allProducts.push(...products);

      // Small delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Validate, clean, and deduplicate
    const seen = new Set<string>();
    const cleaned = allProducts
      .filter((p: any) => p.product_code && p.description)
      .map((p: any) => ({
        product_code: String(p.product_code).trim(),
        description: String(p.description).trim(),
        trade_price: parseFloat(p.trade_price) || 0,
        category: p.category ? String(p.category).trim() : null,
      }))
      .filter(p => {
        if (seen.has(p.product_code)) return false;
        seen.add(p.product_code);
        return true;
      });

    console.log(`Total: ${allProducts.length} raw, ${cleaned.length} unique products`);

    return new Response(JSON.stringify({ products: cleaned, total: cleaned.length, chunks_processed: chunks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

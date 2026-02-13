import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Use AI to extract structured product data from the PDF text
    const prompt = `You are a product catalog parser. Extract EVERY product from the following supplier catalog text.

For each product, extract:
- product_code: The product/part code (e.g. "S4-34805EP", "HFC-WSR-03")  
- description: The full product description/name
- trade_price: The trade price as a number (no currency symbols). If multiple prices exist, use the trade/wholesale price. If no price found, use 0.
- category: The product category if one is apparent from the context

Return a JSON array of objects. Extract ALL products, even if there are hundreds.
Be extremely precise with product codes - copy them exactly as shown.
Do NOT skip any products.

IMPORTANT: Return ONLY the JSON array, no other text.

Catalog text:
${text.substring(0, 50000)}`;

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
      console.error("AI API error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI parsing failed", status: response.status }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await response.text();
    if (!rawBody || rawBody.trim().length === 0) {
      console.error("AI returned empty response body");
      return new Response(JSON.stringify({ error: "AI returned empty response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let aiResult;
    try {
      aiResult = JSON.parse(rawBody);
    } catch (jsonErr) {
      console.error("Failed to parse AI response JSON:", rawBody.substring(0, 300));
      return new Response(JSON.stringify({ error: "Invalid AI response format" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = aiResult.choices?.[0]?.message?.content || "";
    console.log("AI response length:", content.length);

    // Extract JSON array from the response
    let products = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        products = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr);
      console.error("Raw content:", content.substring(0, 500));
      return new Response(JSON.stringify({ error: "Failed to parse AI response", raw: content.substring(0, 200) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate and clean products
    const cleaned = products
      .filter((p: any) => p.product_code && p.description)
      .map((p: any) => ({
        product_code: String(p.product_code).trim(),
        description: String(p.description).trim(),
        trade_price: parseFloat(p.trade_price) || 0,
        category: p.category ? String(p.category).trim() : null,
      }));

    return new Response(JSON.stringify({ products: cleaned, total: cleaned.length }), {
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

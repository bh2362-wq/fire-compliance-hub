/**
 * verify-device-price edge function
 *
 * Uses Claude with real web search to find actual UK trade prices
 * for fire alarm devices from real supplier websites.
 *
 * Called when a user manually edits a description and clicks "Look Up".
 * Returns real prices with live URLs, not AI estimates.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are a UK fire and security product pricing specialist.
Your job is to find REAL current UK trade prices for fire alarm and security products
from actual supplier websites. Use web search to find live prices.

Focus on these UK suppliers:
- ADI Global Distribution (adiglobal.com) — UK's largest distributor
- Acorn Fire & Security (acornfiresecurity.com)
- Huvo (huvo.co.uk)
- Discount Fire Supplies (discountfiresupplies.co.uk)
- SafelinCS (safelincs.co.uk)
- Fire Protection Online (fireprotectiononline.co.uk)
- CPC Farnell (cpc.farnell.com)
- RS Components (uk.rs-online.com)
- ESP Fire (espfire.co.uk)
- Hochiki Europe (hochikieurope.com)
- Texecom (texe.com)

Search for the EXACT product, verify the product code matches, and get the actual listed price.
If you cannot find an exact match, search for the closest equivalent and note the difference.

Return ONLY valid JSON — no markdown, no explanation.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const { description, model_number, quantity } = await req.json();

    if (!description && !model_number) {
      return new Response(JSON.stringify({ error: "description or model_number required" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const query = model_number
      ? `${model_number} ${description || ""} UK fire alarm trade price`
      : `${description} UK fire alarm trade price site:adiglobal.com OR site:acornfiresecurity.com OR site:discountfiresupplies.co.uk`;

    const userPrompt = `Find the current UK trade price for this fire alarm product:
Product: ${description || model_number}
${model_number ? `Part number / model: ${model_number}` : ""}
Quantity needed: ${quantity || 1}

Search for this product on UK fire alarm supplier websites and return:
1. The verified product name (correct and complete)
2. The verified part number / product code
3. Current trade/list prices from at least 3 suppliers
4. Direct product page URLs (not homepages)

Return this exact JSON structure:
{
  "verified_description": "Full correct product name",
  "verified_model_number": "Exact part number",
  "best_trade_price": 45.00,
  "confidence": "high|medium|low",
  "suppliers": [
    {
      "name": "ADI Global",
      "url": "https://adiglobal.com/...",
      "price": 42.50,
      "product_code": "ABC123",
      "in_stock": true,
      "notes": ""
    }
  ],
  "search_notes": "What you found / any caveats"
}`;

    // Call Anthropic with web search enabled
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 3000,
        system: SYSTEM,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Anthropic error ${resp.status}: ${err}`);
    }

    const data = await resp.json();

    // Extract the final text response (after tool use)
    const textBlock = data.content
      ?.filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");

    if (!textBlock) {
      throw new Error("No text response from AI");
    }

    // Parse JSON from the response
    let result: any;
    try {
      const clean = textBlock
        .replace(/^```[a-z]*\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();
      result = JSON.parse(clean);
    } catch {
      // Try to extract JSON object from text
      const match = textBlock.match(/\{[\s\S]*\}/);
      if (match) {
        result = JSON.parse(match[0]);
      } else {
        throw new Error("Could not parse AI response as JSON");
      }
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("verify-device-price error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

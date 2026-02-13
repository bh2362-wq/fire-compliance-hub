import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { devices } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      return new Response(
        JSON.stringify({ error: "No devices provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build a prompt asking AI to find prices for fire & security devices
    const deviceList = devices
      .map((d: any, i: number) => `${i + 1}. ${d.model_number || d.description} (qty: ${d.quantity || 1})`)
      .join("\n");

    const systemPrompt = `You are a UK fire and security product pricing specialist. You have expert knowledge of suppliers like:
- Acorn Fire & Security (acornfiresecurity.com)
- Huvo (huvo.co.uk)
- The Safety Centre (thesafetycentre.co.uk)
- ADI Global Distribution (adiglobal.com)
- CPC Farnell (cpc.farnell.com)
- RS Components (uk.rs-online.com)
- Discount Fire Supplies (discountfiresupplies.co.uk)
- Bull Products (bullproducts.co.uk)
- Fire Protection Online (fireprotectiononline.co.uk)
- SafelinCS (safelincs.co.uk)

For each product, provide realistic UK trade/wholesale pricing based on your knowledge of these products. Gent/Honeywell fire alarm products are your specialty. If you recognise a model number, provide the accurate product name and a realistic trade price range.

IMPORTANT: Always provide your best estimate based on known UK market pricing. If a model number is not recognised, suggest the closest equivalent Gent/Honeywell product.`;

    const userPrompt = `Find UK trade prices for these fire alarm devices. For each device, return the product name, estimated trade price (GBP), and up to 3 likely UK suppliers with their estimated prices.

Devices:
${deviceList}

Return results as a JSON array with this structure for each device:
[
  {
    "index": 1,
    "model_number": "S4-711",
    "product_name": "Gent S4-711 Optical Smoke Detector",
    "estimated_trade_price": 45.00,
    "suppliers": [
      { "name": "Acorn Fire & Security", "url": "https://acornfiresecurity.com", "estimated_price": 42.50 },
      { "name": "ADI Global", "url": "https://adiglobal.com", "estimated_price": 46.00 },
      { "name": "Discount Fire Supplies", "url": "https://discountfiresupplies.co.uk", "estimated_price": 48.50 }
    ],
    "notes": "Standard Gent S-Quad optical detector, widely available"
  }
]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_device_prices",
              description: "Return pricing data for fire alarm devices",
              parameters: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number" },
                        model_number: { type: "string" },
                        product_name: { type: "string" },
                        estimated_trade_price: { type: "number" },
                        suppliers: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              url: { type: "string" },
                              estimated_price: { type: "number" },
                            },
                            required: ["name", "estimated_price"],
                            additionalProperties: false,
                          },
                        },
                        notes: { type: "string" },
                      },
                      required: ["index", "model_number", "product_name", "estimated_trade_price", "suppliers"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["results"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_device_prices" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up in workspace settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    
    // Extract tool call result
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let results = [];
    
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      results = parsed.results || [];
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-device-prices error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

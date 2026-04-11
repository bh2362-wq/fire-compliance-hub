import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmed = query.trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // 1. Check materials_catalog first
    const { data: catalogHits } = await sb
      .from("materials_catalog")
      .select("*")
      .or(`part_number.ilike.%${trimmed}%,description.ilike.%${trimmed}%`)
      .order("part_number")
      .limit(5);

    // 2. Also check supplier_products
    const { data: supplierHits } = await sb
      .from("supplier_products")
      .select("*")
      .or(`product_code.ilike.%${trimmed}%,description.ilike.%${trimmed}%`)
      .order("product_code")
      .limit(5);

    const localResults = [
      ...(catalogHits || []).map((c: any) => ({
        part_number: c.part_number,
        description: c.description,
        retail_price: Number(c.retail_price) || 0,
        source: "catalog" as const,
        supplier: c.supplier_name || "",
        category: c.category || "",
      })),
      ...(supplierHits || []).map((s: any) => ({
        part_number: s.product_code,
        description: s.description,
        retail_price: Number(s.trade_price) || 0,
        source: "supplier" as const,
        supplier: s.supplier_name || "",
        category: s.category || "",
      })),
    ];

    // If we have local results, return them without AI
    if (localResults.length > 0) {
      return new Response(JSON.stringify({ suggestions: localResults, ai_used: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. No local results — ask AI to identify the product
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ suggestions: [], ai_used: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a fire alarm and fire safety product expert. When given a product description or partial part number, identify the correct product with:
- Exact manufacturer part number
- Full product description
- Approximate UK retail/trade price in GBP
- Category (e.g. "Fire Detection", "Emergency Lighting", "Cabling", "Accessories", "Control Panels")
- Manufacturer/supplier name

Return up to 3 matching products. Focus on UK fire safety market brands like Apollo, Hochiki, Gent, Morley, Advanced, C-TEC, Kentec, Nittan, Hyfire, EMS, Haes, Fike.`,
          },
          {
            role: "user",
            content: `Identify this fire safety product: "${trimmed}"`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_products",
              description: "Return matching fire safety products",
              parameters: {
                type: "object",
                properties: {
                  products: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        part_number: { type: "string", description: "Manufacturer part number" },
                        description: { type: "string", description: "Full product description" },
                        retail_price: { type: "number", description: "Approximate UK trade price in GBP" },
                        category: { type: "string" },
                        supplier: { type: "string", description: "Manufacturer name" },
                      },
                      required: ["part_number", "description", "retail_price", "category", "supplier"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["products"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_products" } },
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI gateway error:", aiResponse.status);
      return new Response(JSON.stringify({ suggestions: [], ai_used: true, error: "AI lookup failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let aiProducts: any[] = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        aiProducts = (parsed.products || []).map((p: any) => ({
          part_number: p.part_number || "",
          description: p.description || "",
          retail_price: Number(p.retail_price) || 0,
          category: p.category || "",
          supplier: p.supplier || "",
          source: "ai" as const,
        }));
      } catch {
        console.error("Failed to parse AI response");
      }
    }

    return new Response(JSON.stringify({ suggestions: aiProducts, ai_used: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("lookup-material error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

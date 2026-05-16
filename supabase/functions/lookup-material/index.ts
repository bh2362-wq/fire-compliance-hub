/**
 * lookup-material (v2 — unified)
 *
 * Searches ALL price sources in priority order:
 *   1. price_list_items  (Huvo + auto-imported supplier emails — PRIMARY)
 *   2. materials_catalog (manually imported price lists)
 *   3. supplier_products (supplementary supplier table)
 *   4. AI fallback      (when no catalog match found)
 *
 * Returns up to 5 suggestions with source label so the UI knows where the price came from.
 */

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
    const { query, limit = 5 } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmed = query.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // ── 1. price_list_items (Huvo + supplier email imports) ───────────────────
    const { data: huvoHits } = await sb
      .from("price_list_items")
      .select("part_number, description, short_name, unit_cost, manufacturer, category")
      .or(`part_number.ilike.%${trimmed}%,description.ilike.%${trimmed}%,short_name.ilike.%${trimmed}%`)
      .eq("is_active", true)
      .order("part_number")
      .limit(limit);

    // ── 2. materials_catalog ───────────────────────────────────────────────────
    const { data: catalogHits } = await sb
      .from("materials_catalog")
      .select("part_number, description, retail_price, supplier_name, category")
      .or(`part_number.ilike.%${trimmed}%,description.ilike.%${trimmed}%`)
      .order("part_number")
      .limit(limit);

    // ── 3. supplier_products ───────────────────────────────────────────────────
    const { data: supplierHits } = await sb
      .from("supplier_products")
      .select("product_code, description, trade_price, supplier_name, category")
      .or(`product_code.ilike.%${trimmed}%,description.ilike.%${trimmed}%`)
      .order("product_code")
      .limit(limit);

    // Merge, label source, deduplicate by part_number
    const seen = new Set<string>();
    const localResults: any[] = [];

    for (const h of (huvoHits || [])) {
      const key = (h.part_number || h.description).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      localResults.push({
        part_number:  h.part_number || "",
        description:  h.description || "",
        retail_price: Number(h.unit_cost) || 0,
        source:       "huvo",
        supplier:     h.manufacturer || "Huvo",
        category:     h.category || "",
      });
    }

    for (const c of (catalogHits || [])) {
      const key = (c.part_number || c.description).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      localResults.push({
        part_number:  c.part_number || "",
        description:  c.description || "",
        retail_price: Number(c.retail_price) || 0,
        source:       "catalog",
        supplier:     c.supplier_name || "",
        category:     c.category || "",
      });
    }

    for (const s of (supplierHits || [])) {
      const key = (s.product_code || s.description).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      localResults.push({
        part_number:  s.product_code || "",
        description:  s.description || "",
        retail_price: Number(s.trade_price) || 0,
        source:       "supplier",
        supplier:     s.supplier_name || "",
        category:     s.category || "",
      });
    }

    const results = localResults.slice(0, limit);

    // If we have local results, return them (no AI needed)
    if (results.length > 0) {
      return new Response(JSON.stringify({ suggestions: results, ai_used: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. AI fallback — no catalog match found ───────────────────────────────
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ suggestions: [], ai_used: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a fire alarm and fire safety product expert. Return up to 3 matching UK products with exact part numbers, descriptions, and approximate UK trade prices. Focus on Apollo, Hochiki, Gent, Morley, Advanced, C-TEC, Kentec, Nittan.`,
          },
          { role: "user", content: `Find UK fire safety product: "${trimmed}"` },
        ],
        tools: [{
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
                      part_number:  { type: "string" },
                      description:  { type: "string" },
                      retail_price: { type: "number" },
                      category:     { type: "string" },
                      supplier:     { type: "string" },
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
        }],
        tool_choice: { type: "function", function: { name: "suggest_products" } },
      }),
    });

    if (!aiResponse.ok) {
      return new Response(JSON.stringify({ suggestions: [], ai_used: true }), {
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
          part_number:  p.part_number  || "",
          description:  p.description  || "",
          retail_price: Number(p.retail_price) || 0,
          category:     p.category    || "",
          supplier:     p.supplier    || "",
          source:       "ai",
        }));
      } catch { /* parse failure */ }
    }

    return new Response(JSON.stringify({ suggestions: aiProducts, ai_used: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("lookup-material error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

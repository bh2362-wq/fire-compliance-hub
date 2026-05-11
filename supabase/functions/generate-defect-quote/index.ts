import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface DefectIn {
  id: string;
  description: string;
  category: number | string;
  location?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { defects, siteName } = (await req.json()) as { defects: DefectIn[]; siteName: string };
    if (!Array.isArray(defects) || defects.length === 0) {
      return new Response(JSON.stringify({ error: "No defects provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const defectList = defects
      .map(
        (d, i) =>
          `${i + 1}. [Cat ${d.category}] ${d.description}${d.location ? ` — Location: ${d.location}` : ""}`
      )
      .join("\n");

    const systemPrompt = `You are a UK fire alarm engineering quotation specialist.
Generate professional remedial works quote line items from defect descriptions.
Cat 1 = immediate danger, Cat 2 = urgent (within 3 months), Cat 3 = advisory.
Use realistic UK fire alarm contractor rates: simple device replacements £45-120 materials, complex work higher. Labour at £65/hr typical. Use UK English. Reference BS 5839-1:2017+A2:2019 clauses where applicable.
Group related defects into logical line items where appropriate.
Leave cost_price/labour_cost as 0 if uncertain — engineer will fill them in.`;

    const tools = [
      {
        type: "function",
        function: {
          name: "build_quote",
          description: "Return a quote summary and line items for the supplied defects.",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string", description: "2-3 sentence professional summary of remedial works" },
              line_items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    item_name: { type: "string" },
                    description: { type: "string" },
                    quantity: { type: "number" },
                    cost_price: { type: "number" },
                    labour_cost: { type: "number" },
                    regulation_reference: { type: "string" },
                    notes: { type: "string" },
                  },
                  required: ["item_name", "description", "quantity", "cost_price", "labour_cost", "regulation_reference", "notes"],
                  additionalProperties: false,
                },
              },
            },
            required: ["summary", "line_items"],
            additionalProperties: false,
          },
        },
      },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate remedial works quote line items for the following defects found at ${siteName}:\n\n${defectList}`,
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "build_quote" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response from AI");

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(
      JSON.stringify({ summary: parsed.summary || "", line_items: parsed.line_items || [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-defect-quote error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RewriteRequest {
  text: string;
  type: "defects" | "recommendations" | "works" | "comments";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { text, type } = (await req.json()) as RewriteRequest;

    if (!text || !text.trim()) {
      return new Response(
        JSON.stringify({ error: "No text provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formatRules = `
STRICT FORMATTING RULES - You MUST follow these exactly:
1. NO markdown (no **, no ##, no ###, no headers)
2. NO bullet points or dashes at the start of lines
3. NO numbered lists
4. NO special characters or symbols
5. Write as plain flowing sentences only
6. Separate multiple items with a blank line between paragraphs
7. Return ONLY the rewritten plain text`;

    let systemPrompt = "";
    switch (type) {
      case "defects":
        systemPrompt = `You are a professional fire safety engineer. Rewrite the defect description to be clear, concise, and professional using proper fire safety terminology for a BS5839 compliance report.${formatRules}`;
        break;
      case "recommendations":
        systemPrompt = `You are a professional fire safety engineer. Rewrite the recommendations to be clear, actionable, and professional using proper fire safety terminology for a BS5839 compliance report.${formatRules}`;
        break;
      case "works":
        systemPrompt = `You are a professional fire safety engineer. Rewrite this works report description to be clear, comprehensive, and professional. Use proper fire safety and engineering terminology suitable for a service report or job sheet. Include specific technical details where relevant.${formatRules}`;
        break;
      case "comments":
        systemPrompt = `You are a professional fire safety engineer. Rewrite these comments or follow-up actions to be clear, actionable, and professional. Use proper fire safety terminology and ensure any required actions are clearly stated.${formatRules}`;
        break;
      default:
        systemPrompt = `You are a professional technical writer. Rewrite this text to be clear, concise, and professional.${formatRules}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const rewrittenText = data.choices?.[0]?.message?.content?.trim();

    if (!rewrittenText) {
      throw new Error("No response from AI");
    }

    return new Response(
      JSON.stringify({ rewrittenText }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Rewrite error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

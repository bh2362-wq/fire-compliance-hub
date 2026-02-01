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
STRICT RULES:
1. Keep the same level of detail as the original - DO NOT add extra information
2. Just improve grammar, spelling and use professional fire safety terminology
3. NO markdown, bullet points, numbered lists or special characters
4. Write as plain flowing sentences only
5. Keep it concise - similar length to the original text
6. Return ONLY the rewritten plain text`;

    let systemPrompt = "";
    switch (type) {
      case "defects":
        systemPrompt = `You are a professional fire safety engineer. Rewrite this defect description using proper BS5839 terminology. Keep it concise - don't add details that weren't in the original.${formatRules}`;
        break;
      case "recommendations":
        systemPrompt = `You are a professional fire safety engineer. Rewrite these recommendations using proper BS5839 terminology. Keep it concise - don't add details that weren't in the original.${formatRules}`;
        break;
      case "works":
        systemPrompt = `You are a professional fire safety engineer. Rewrite this works description using proper fire safety terminology. Keep it concise - improve the wording but don't expand into multiple paragraphs.${formatRules}`;
        break;
      case "comments":
        systemPrompt = `You are a professional fire safety engineer. Rewrite these comments using proper fire safety terminology. Keep it concise - don't add details that weren't in the original.${formatRules}`;
        break;
      default:
        systemPrompt = `You are a professional technical writer. Rewrite this text to be clear and professional. Keep it concise.${formatRules}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Rewrite this concisely (similar length to original):\n\n${text}` },
        ],
        max_tokens: 500,
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

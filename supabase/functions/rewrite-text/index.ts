import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RewriteRequest {
  text: string;
  type: "defects" | "recommendations" | "works" | "comments" | "quotation_items";
  context?: string;
  generateRecommendations?: boolean;
  generateQuotationMeta?: boolean;
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

    const { text, type, generateRecommendations, generateQuotationMeta } = (await req.json()) as RewriteRequest;

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
6. IMPORTANT: Separate distinct topics or steps with blank lines (double newline) for readability
7. Each paragraph should cover one topic or action
8. Return ONLY the rewritten plain text`;

    let systemPrompt = "";
    switch (type) {
      case "defects":
        systemPrompt = `You are a professional fire safety engineer. Rewrite this defect description using proper BS5839 terminology. Keep it concise - don't add details that weren't in the original. Separate different defects or issues with blank lines.${formatRules}`;
        break;
      case "recommendations":
        systemPrompt = `You are a professional fire safety engineer. Rewrite these recommendations using proper BS5839 terminology. Keep it concise - don't add details that weren't in the original. Separate different recommendations with blank lines.${formatRules}`;
        break;
      case "works":
        systemPrompt = `You are a professional fire safety engineer. Rewrite this works description using proper fire safety terminology. Keep it concise but well-structured. Separate different work items or steps with blank lines for clarity.${formatRules}`;
        break;
      case "comments":
        systemPrompt = `You are a professional fire safety engineer. Rewrite these comments using proper fire safety terminology. Keep it concise - don't add details that weren't in the original. Separate different points with blank lines.${formatRules}`;
        break;
      case "quotation_items":
        systemPrompt = `You are a professional fire safety engineer preparing a quotation. Improve the grammar, spelling and professional presentation of these numbered quotation line item descriptions. Keep the same numbering format (1. 2. 3. etc). Use proper fire safety and engineering terminology. Make descriptions clear, professional and suitable for a formal quotation document. Do NOT add information that wasn't in the original.${formatRules}`;
        break;
      default:
        systemPrompt = `You are a professional technical writer. Rewrite this text to be clear and professional. Keep it concise. Separate different topics with blank lines.${formatRules}`;
    }

    // First, rewrite the text
    const rewriteResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        max_tokens: 350,
      }),
    });

    if (!rewriteResponse.ok) {
      if (rewriteResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (rewriteResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await rewriteResponse.text();
      console.error("AI gateway error:", rewriteResponse.status, errorText);
      throw new Error(`AI gateway error: ${rewriteResponse.status}`);
    }

    const rewriteData = await rewriteResponse.json();
    const rewrittenText = rewriteData.choices?.[0]?.message?.content?.trim();

    if (!rewrittenText) {
      throw new Error("No response from AI");
    }

    // If generateRecommendations is requested and this is a works report, generate recommendations
    let generatedRecommendations: string | null = null;
    if (generateRecommendations && type === "works") {
      const recommendationsPrompt = `You are a professional fire safety engineer. Based on the following work report, analyze if there are any issues, defects, or areas that need follow-up action. If the work mentions any problems, faults, repairs needed, or areas of concern, generate a concise recommendation for further action.

STRICT RULES:
1. If the work report indicates everything is fine with no issues, return exactly: "No further action required."
2. If there are issues mentioned, provide brief, professional recommendations for follow-up
3. NO markdown, bullet points, or special characters
4. Write as plain flowing sentences only
5. Keep it under 100 words total
6. Focus only on actionable recommendations based on what's mentioned
7. IMPORTANT: Separate different recommendations with blank lines (double newline) for readability
8. Return ONLY the recommendation text, nothing else

Work Report:
${text}`;

      const recommendationsResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "user", content: recommendationsPrompt },
          ],
          max_tokens: 200,
        }),
      });

      if (recommendationsResponse.ok) {
        const recommendationsData = await recommendationsResponse.json();
        generatedRecommendations = recommendationsData.choices?.[0]?.message?.content?.trim() || null;
      }
    }

    // Generate quotation title and summary from line items
    let suggestedTitle: string | null = null;
    let suggestedSummary: string | null = null;
    if (generateQuotationMeta && type === "quotation_items") {
      const metaPrompt = `You are a professional fire safety engineer at BHO Fire Ltd. Based on the following quotation line items, generate:
1. A concise quotation title (max 8 words) - use terminology like: Fire Alarm Service & Maintenance, Emergency Lighting Installation, Fire Detection System Upgrade, Detector Replacement Works, Fire Alarm Remedial Works, Panel Upgrade & Commissioning, Weekly Fire Alarm Testing, Fire Risk Assessment Remedial Works, Smoke Detection System Installation, etc.
2. A professional scope of works summary (2-3 sentences) describing the works - use fire safety engineering terminology consistent with BS5839 standards.

STRICT RULES:
- Title should be short and descriptive, like a job sheet title
- Summary should read like a professional scope of works
- NO markdown or special formatting
- Return ONLY valid JSON in this exact format: {"title": "...", "summary": "..."}

Line Items:
${rewrittenText}`;

      const metaResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: metaPrompt }],
          max_tokens: 200,
        }),
      });

      if (metaResponse.ok) {
        const metaData = await metaResponse.json();
        const metaText = metaData.choices?.[0]?.message?.content?.trim() || "";
        try {
          const cleaned = metaText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const parsed = JSON.parse(cleaned);
          suggestedTitle = parsed.title || null;
          suggestedSummary = parsed.summary || null;
        } catch {
          console.error("Failed to parse meta JSON:", metaText);
        }
      }
    }

    return new Response(
      JSON.stringify({ rewrittenText, generatedRecommendations, suggestedTitle, suggestedSummary }),
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RewriteRequest {
  text: string;
  type: "defects" | "defect_simplify" | "recommendations" | "works" | "comments" | "parts" | "notes" | "quotation_items" | "quotation_title" | "quotation_summary" | "po_line_items" | "quotation_bs5839_expand";
  context?: string;
  customInstructions?: string;
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

    const { text, type, context, customInstructions, generateRecommendations, generateQuotationMeta } = (await req.json()) as RewriteRequest;

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
      case "parts":
        systemPrompt = `You are a professional fire safety engineer. Rewrite this list of parts and materials used, ensuring correct product names, model numbers, and fire safety terminology. Keep it concise and well-structured. Separate different items with blank lines.${formatRules}`;
        break;
      case "notes":
        systemPrompt = `You are a professional fire safety engineer. Rewrite these additional notes using proper fire safety terminology. Keep it concise and professional. Separate different observations with blank lines.${formatRules}`;
        break;
        break;
      case "quotation_items":
        systemPrompt = `You are a professional fire safety engineer preparing a quotation. Improve the grammar, spelling and professional presentation of these numbered quotation line item descriptions. Keep the same numbering format (1. 2. 3. etc). Use proper fire safety and engineering terminology. Make descriptions clear, professional and suitable for a formal quotation document. Do NOT add information that wasn't in the original.${formatRules}`;
        break;
      case "quotation_title":
        systemPrompt = `You are a professional fire safety engineer at a UK fire safety company. Rewrite this quotation title to be grammatically correct, properly capitalised, and use professional UK English fire safety terminology consistent with BS5839 standards. Keep it concise (max 10 words). Return ONLY the improved title text, nothing else. Use UK English spelling (e.g. organisation, recognised, defence).`;
        break;
      case "quotation_summary":
        systemPrompt = `You are a professional fire safety engineer at a UK fire safety company preparing a formal quotation scope of works for a client.

Based on the existing summary text AND the line items provided below, generate a comprehensive, professionally formatted scope of works summary.

FORMATTING RULES:
- Use **bold text** (wrapped in double asterisks) for headings and key terms e.g. **Scope of Works**, **Fire Detection Devices**
- Use __underline__ (wrapped in double underscores) for important standards or references e.g. __BS 5839-1__
- Use bullet points starting with "- " for listing devices, locations or key items
- Group devices by type with quantities
- Include device model numbers where available from the line items
- Mention locations if evident from the descriptions
- Reference relevant British Standards where applicable (e.g. __BS 5839-1__, __BS 5266__)
- Use UK English spelling throughout (organisation, recognised, defence, colour, centre)
- Keep it professional, clear and suitable for a formal client-facing quotation
- Start with a brief introductory paragraph, then list the scope items
- End with a brief note about compliance or standards if relevant

LINE ITEMS FOR CONTEXT:
${context || "No line items provided"}

Return ONLY the formatted summary text.`;
        break;
      case "po_line_items":
        systemPrompt = `You are a professional procurement specialist. Improve the grammar, spelling and clarity of these numbered purchase order line item descriptions. Keep the same numbering format (1. 2. 3. etc). Make descriptions clear, professional and suitable for a formal purchase order. Each description should be well-formatted - if a description contains multiple details (e.g. part number, specification, quantity notes), space them clearly across up to 2 lines using a newline within the numbered item. Do NOT add information that wasn't in the original. Use UK English spelling.${formatRules}`;
        break;
      case "quotation_bs5839_expand":
        systemPrompt = `You are a senior fire safety engineer preparing a detailed quotation for a client. You must expand brief line item descriptions into comprehensive, professional descriptions that reference relevant British Standards (BS 5839-1, BS 5839-6, BS 5266, etc.) where applicable.

For each line item, expand the description to include:
- What work will be carried out (supply, install, commission, test)
- Reference to relevant BS 5839 clauses where applicable
- Commissioning and testing requirements per the standard
- Any handover documentation or certification that will be provided
- Professional fire safety engineering terminology

IMPORTANT RULES:
1. Return a JSON array of objects with "index" (0-based) and "expanded_description" and "expanded_summary_section" fields
2. expanded_description should be 2-4 sentences of detailed professional text for the line item
3. expanded_summary_section should be a brief scope entry (1 sentence) for the overall summary
4. Reference BS 5839-1:2017+A2:2019 for fire detection and alarm systems
5. Reference BS 5839-6 for domestic fire detection
6. Reference BS 5266-1 for emergency lighting where relevant
7. Use UK English spelling throughout
8. Be technically accurate - don't reference standards that don't apply
9. Include commissioning, testing and certification where relevant
10. Return ONLY valid JSON, no markdown wrapping

${context ? `\nADDITIONAL CONTEXT FROM EMAIL/SOURCE:\n${context}` : ""}

Example output:
[
  {
    "index": 0,
    "expanded_description": "Supply and install one Hochiki ESP Intelligent multi-sensor detector to replace the existing end-of-life unit. The detector shall be installed in accordance with BS 5839-1:2017+A2:2019, Clause 25. Upon completion, the device will be commissioned and functionally tested to confirm correct operation with the existing fire alarm control panel, and a completion certificate issued.",
    "expanded_summary_section": "Replacement of end-of-life multi-sensor detector with commissioning and testing to BS 5839-1"
  }
]`;
        break;
      default:
        systemPrompt = `You are a professional technical writer. Rewrite this text to be clear and professional. Keep it concise. Separate different topics with blank lines.${formatRules}`;
    }

    // Append custom instructions if provided
    if (customInstructions) {
      systemPrompt += `\n\nADDITIONAL USER INSTRUCTIONS: ${customInstructions}`;
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
        max_tokens: type === "quotation_summary" ? 800 : 350,
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

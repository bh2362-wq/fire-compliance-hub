import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RewriteRequest {
  text: string;
  type:
    | "defects" | "defect_simplify" | "recommendations" | "works" | "comments"
    | "parts" | "notes" | "quotation_items" | "quotation_title" | "quotation_summary"
    | "po_line_items" | "quotation_bs5839_expand";
  context?: string;
  customInstructions?: string;
  generateRecommendations?: boolean;
  generateQuotationMeta?: boolean;
  useReferenceLibrary?: boolean;
  referenceLibraryOptions?: {
    limit?: number;
    minSimilarity?: number;
    docTypes?: string[];
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = "google/gemini-3-flash-preview";

interface GroundingChunk {
  chunk_id: string;
  document_id: string;
  document_title: string;
  doc_type: string;
  standard_reference: string | null;
  section_title: string | null;
  page_number: number | null;
  content: string;
  similarity: number;
}

async function retrieveGrounding(
  query: string,
  opts: { limit?: number; minSimilarity?: number; docTypes?: string[] } = {},
): Promise<{ chunks: GroundingChunk[]; usedLibrary: boolean; error?: string }> {
  if (!OPENAI_API_KEY) return { chunks: [], usedLibrary: false, error: "OPENAI_API_KEY missing" };
  try {
    const embedResp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
    });
    if (!embedResp.ok) {
      return { chunks: [], usedLibrary: false, error: `embedding failed: ${embedResp.status}` };
    }
    const embedJson = await embedResp.json();
    const embedding: number[] = embedJson.data[0].embedding;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const limit = opts.limit ?? 5;
    const filterDocType = opts.docTypes && opts.docTypes.length === 1 ? opts.docTypes[0] : null;
    const { data, error } = await admin.rpc("ref_lib_query_by_embedding", {
      query_embedding: embedding as unknown as string,
      match_count: limit,
      filter_doc_type: filterDocType,
    });
    if (error) return { chunks: [], usedLibrary: false, error: `rpc failed: ${error.message}` };
    const min = opts.minSimilarity ?? 0;
    const filtered = ((data ?? []) as GroundingChunk[]).filter((c) => c.similarity >= min);
    return { chunks: filtered, usedLibrary: true };
  } catch (e) {
    return { chunks: [], usedLibrary: false, error: String((e as Error)?.message ?? e) };
  }
}

// Find references like "BS 5839-1:2017+A2:2019", "BS5266-1", "Clause 25.2", "Section 12"
function extractClauseMentions(text: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /BS\s?\d{3,5}(?:[-:]\d+)?(?::\d{4})?(?:\+A\d+(?::\d{4})?)?/gi,
    /Clause\s+\d+(?:\.\d+)*[a-z]?/gi,
    /Section\s+\d+(?:\.\d+)*/gi,
    /Annex(?:\s+[A-Z])?/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      out.add(m[0].replace(/\s+/g, " ").trim());
    }
  }
  return Array.from(out);
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s\.\-:]/g, "");
}

function validateGrounding(
  output: string,
  chunks: GroundingChunk[],
): { hallucinated_clauses: string[]; verified_clauses: string[] } {
  const mentions = extractClauseMentions(output);
  if (mentions.length === 0) return { hallucinated_clauses: [], verified_clauses: [] };
  const corpus = normalise(chunks.map((c) => `${c.standard_reference ?? ""} ${c.content}`).join("\n"));
  const hallucinated: string[] = [];
  const verified: string[] = [];
  for (const m of mentions) {
    const n = normalise(m);
    if (corpus.includes(n)) verified.push(m);
    else hallucinated.push(m);
  }
  return { hallucinated_clauses: hallucinated, verified_clauses: verified };
}

async function logAssist(row: Record<string, unknown>): Promise<void> {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    await admin.from("ai_assists").insert(row);
  } catch (e) {
    console.error("ai_assists insert failed:", e);
  }
}

async function getUserIdFromAuth(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const verifyKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const client = createClient(SUPABASE_URL, verifyKey, { auth: { persistSession: false } });
    const { data } = await client.auth.getUser(token);
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const startedAt = Date.now();

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = (await req.json()) as RewriteRequest;
    const {
      text, type, context, customInstructions,
      generateRecommendations, generateQuotationMeta,
      useReferenceLibrary, referenceLibraryOptions,
    } = body;

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: "No text provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = await getUserIdFromAuth(req);

    // -------- Grounding (optional, opt-in) --------
    let grounding: GroundingChunk[] = [];
    let groundingError: string | undefined;
    let groundingActuallyUsed = false;
    if (useReferenceLibrary) {
      const r = await retrieveGrounding(
        `${text}\n${context ?? ""}`.trim(),
        referenceLibraryOptions ?? {},
      );
      grounding = r.chunks;
      groundingError = r.error;
      groundingActuallyUsed = r.usedLibrary && grounding.length > 0;
    }

    const groundingBlock = groundingActuallyUsed
      ? `\n\nREFERENCE LIBRARY EXCERPTS (the ONLY allowed source for standards/clauses you cite).\n` +
        `If a clause or standard is not explicitly present in these excerpts, DO NOT mention it.\n\n` +
        grounding.map((c, i) =>
          `[#${i + 1}] ${c.document_title}${c.section_title ? ` — ${c.section_title}` : ""}` +
          `${c.standard_reference ? ` (${c.standard_reference})` : ""}` +
          `${c.page_number ? ` p.${c.page_number}` : ""}\n${c.content}`
        ).join("\n\n---\n\n")
      : "";

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
      case "defect_simplify":
        systemPrompt = `You are explaining a fire alarm system defect to a non-technical building owner or facilities manager.

Rewrite the defect in PLAIN ENGLISH that a layperson can understand:
- Avoid jargon, acronyms (BS5839, EOL, MCP, IRS) and clause references
- Briefly say WHAT the issue is and WHY it matters for safety (1-2 short sentences)
- Use everyday language (e.g. "smoke detector" not "optical sensor", "call point" not "MCP")
- Do not invent details that aren't in the original
- Keep it under 60 words
- Plain text only, no markdown, no bullets

Return ONLY the simplified description.`;
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
      case "quotation_items":
        systemPrompt = `You are a professional fire safety engineer preparing a quotation. Improve the grammar, spelling and professional presentation of these numbered quotation line item descriptions. Keep the same numbering format (1. 2. 3. etc). Use proper fire safety and engineering terminology. Make descriptions clear, professional and suitable for a formal quotation document. Do NOT add information that wasn't in the original.${formatRules}`;
        break;
      case "quotation_title":
        systemPrompt = `You are a senior fire safety engineer at a UK fire safety company writing a concise, professional QUOTATION TITLE for an internal job sheet / customer-facing quote.

GOALS:
- Produce a clear, well-capitalised UK English title (max 10 words).
- Use industry-accurate terminology (e.g. "Cause & Effect Testing", "PPM", "Remedial Works", "ASD Sensitivity Test", "Fire Alarm Installation").
- Where the input names a building type or location, retain it (Title Case).
- Where the input names a manufacturer/system (Gent, Vigilon, Hochiki, Advanced, Kentec, Notifier), preserve and capitalise correctly.

STRICT RULES:
- Output ONLY the title, no quotes, no trailing punctuation.
- No markdown.
- Do NOT invent standards, clause numbers or scope detail that wasn't in the input.
${groundingActuallyUsed
  ? "- You MAY reference a British Standard ONLY if it appears verbatim in the reference excerpts below.\n- Prefer standards naming over generic phrasing where supported by the excerpts."
  : "- Do NOT cite any specific clause numbers or standards in the title."}
- UK English spelling.`;
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
4. Reference BS 5839-1:2025 for fire detection and alarm systems
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

    if (customInstructions) {
      systemPrompt += `\n\nADDITIONAL USER INSTRUCTIONS: ${customInstructions}`;
    }
    if (groundingBlock) {
      systemPrompt += groundingBlock;
    }

    const rewriteResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        max_tokens: type === "quotation_summary" ? 800 : type === "quotation_title" ? 60 : 350,
      }),
    });

    if (!rewriteResponse.ok) {
      if (rewriteResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (rewriteResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await rewriteResponse.text();
      console.error("AI gateway error:", rewriteResponse.status, errorText);
      throw new Error(`AI gateway error: ${rewriteResponse.status}`);
    }

    const rewriteData = await rewriteResponse.json();
    let rewrittenText: string = rewriteData.choices?.[0]?.message?.content?.trim() ?? "";
    if (!rewrittenText) throw new Error("No response from AI");

    // Strip quotes/trailing punct on titles
    if (type === "quotation_title") {
      rewrittenText = rewrittenText.replace(/^["'`]+|["'`]+$/g, "").replace(/[.;:]+$/g, "").trim();
    }

    // Validate hallucinated clauses against retrieved chunks (only when grounding was used)
    const { hallucinated_clauses, verified_clauses } = groundingActuallyUsed
      ? validateGrounding(rewrittenText, grounding)
      : { hallucinated_clauses: [], verified_clauses: [] };

    const grounding_used = {
      enabled: !!useReferenceLibrary,
      applied: groundingActuallyUsed,
      chunks_retrieved: grounding.length,
      documents_referenced: new Set(grounding.map((c) => c.document_id)).size,
      top_similarity: grounding.length ? Math.max(...grounding.map((c) => c.similarity)) : 0,
      verified_clauses,
      error: groundingError,
      chunks: grounding.map((c) => ({
        document_title: c.document_title,
        standard_reference: c.standard_reference,
        section_title: c.section_title,
        page_number: c.page_number,
        similarity: c.similarity,
      })),
    };

    // Existing optional extras
    let generatedRecommendations: string | null = null;
    if (generateRecommendations && (type === "works" || type === "defect_simplify")) {
      const recommendationsPrompt = type === "defect_simplify"
        ? `You are explaining the resolution path for a fire alarm defect to a non-technical building owner.

Defect: ${text}
${context ? `Engineer's recommended action (technical): ${context}` : ""}

Write a short, clear RESOLUTION PATH the customer can follow:
- 2-4 short steps in plain English (no jargon, no clause numbers)
- Say who typically does each step (e.g. "your fire alarm engineer", "your facilities team")
- Mention urgency in simple terms (e.g. "address within the next service visit", "arrange repair as soon as possible")
- Plain text only, separate steps with blank lines, no markdown or bullets
- Keep under 100 words

Return ONLY the resolution path text.`
        : `You are a professional fire safety engineer. Based on the following work report, analyze if there are any issues, defects, or areas that need follow-up action. If the work mentions any problems, faults, repairs needed, or areas of concern, generate a concise recommendation for further action.

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
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: recommendationsPrompt }],
          max_tokens: 200,
        }),
      });
      if (recommendationsResponse.ok) {
        const recommendationsData = await recommendationsResponse.json();
        generatedRecommendations = recommendationsData.choices?.[0]?.message?.content?.trim() || null;
      }
    }

    let suggestedTitle: string | null = null;
    let suggestedSummary: string | null = null;
    if (generateQuotationMeta && type === "quotation_items") {
      const metaPrompt = `You are a professional fire safety engineer at BHO Fire Ltd. Based on the following quotation line items, generate:
1. A concise quotation title (max 8 words).
2. A professional scope of works summary (2-3 sentences).

Return ONLY valid JSON: {"title": "...", "summary": "..."}

Line Items:
${rewrittenText}`;
      const metaResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: metaPrompt }], max_tokens: 200 }),
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

    const latency_ms = Date.now() - startedAt;

    // Fire and forget log
    logAssist({
      user_id: userId,
      assist_type: type,
      input_text: text,
      output_text: rewrittenText,
      use_reference_library: !!useReferenceLibrary,
      grounding: grounding_used,
      hallucinated_clauses,
      custom_instructions: customInstructions ?? null,
      model: MODEL,
      latency_ms,
      status: "success",
    });

    return new Response(
      JSON.stringify({
        rewrittenText,
        generatedRecommendations,
        suggestedTitle,
        suggestedSummary,
        grounding_used,
        hallucinated_clauses,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Rewrite error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

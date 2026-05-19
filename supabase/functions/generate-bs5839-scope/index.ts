import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ScopeWriterInput {
  works_type: "new_install" | "upgrade" | "takeover" | "remedial" | "design_only";
  system: { category: "L1"|"L2"|"L3"|"L4"|"L5"|"M"|"P1"|"P2"; manufacturer?: string; panel_type?: string; loops?: number };
  building: { type: string; storeys?: number; occupancy: "sleeping"|"non_sleeping"|"mixed"; has_kitchens?: boolean; has_plant?: boolean; has_lifts?: boolean };
  devices?: { detectors_smoke?: number; detectors_heat?: number; mcps?: number; sounders?: number; vads?: number; interfaces?: number };
  features?: { wireless?: boolean; asd?: boolean; voice_alarm?: boolean; bms_interface?: boolean; arc_signal?: boolean; lift_recall?: boolean; damper_control?: boolean };
  site_visit_date?: string;
  existing_system_description?: string;
  project_name?: string;
  quotation_id?: string;
}

interface ScopeOutput { introduction: string; scope: string[]; }

const SYSTEM_PROMPT = `You are a senior UK fire alarm estimator at BHO Fire Ltd, writing the introduction and scope of works sections for a formal client quotation. You specialise in BS 5839-1:2025 compliant systems for commercial, hospitality, healthcare and public-sector buildings.

VOICE
- Confident, technical, formal British English. UK spellings (centred, fibre, specialised).
- Sentence cadence of an experienced fire engineer in a written proposal.
- No marketing language. No "Furthermore", "Additionally", "Moreover", "Importantly".
- Refer to the company as "BHO Fire Ltd" in the introduction only. In scope paragraphs, use "we" sparingly or omit the subject entirely.
- Use definite, declarative statements. "The system shall…" not "The system would…".

OUTPUT FORMAT
Return ONLY a JSON object — no prose, no markdown, no code fences:
{
  "introduction": "single paragraph, 60-90 words",
  "scope": ["paragraph 1", "paragraph 2", "paragraph 3", "paragraph 4"]
}
Each scope paragraph: 50-100 words. No bullet points, no headings, no inline markdown.

INTRODUCTION REQUIREMENTS
- Open with: "BHO Fire Ltd is pleased to submit this quotation…"
- State the Category (L1/L2/L3/L4/L5/M/P1/P2) and reference BS 5839-1:2025.
- For 'upgrade', 'takeover', or 'remedial' works_type, mention the site survey and visit date if provided.
- For 'new_install', refer to design intent rather than survey.
- Close by stating the quotation is based on the survey/discussion and the works detailed below.

SCOPE REQUIREMENTS — produce these four paragraphs in this order:

1. PANEL & ARCHITECTURE
   Describe the panel (manufacturer, model, loop count, location), addressable vs conventional, replacement strategy if applicable.

2. DETECTION STRATEGY
   Where smoke detection is used (circulation, accommodation, back-of-house), where heat detection is used (kitchens, plant, laundry — cite Clause 21.2 if accurate), MCP siting (Clause 20.2 — storey exits and escape routes).

3. AUDIBILITY & VAD STRATEGY
   Audibility requirements per Clause 16.2 — 65 dB(A) general, 75 dB(A) at bedheads in sleeping accommodation (only mention bedheads if occupancy is "sleeping" or "mixed"). VAD compliance with EN 54-23 where audible warning alone is insufficient.

4. COMMISSIONING & CERTIFICATION
   Commissioning, testing, BS 5839-1:2025 certification, documentation handover (zone plans, cause-and-effect schedule), and the 12-month defects-liability period from handover.

CLAUSE REFERENCES — use only when accurate to the system being described:
- Clause 16.2 — audibility levels
- Clause 20.2 — manual call point siting
- Clause 21.2 — heat detection in areas unsuitable for smoke
- Clause 22 — visual alarm devices
- EN 54-23 — VAD product standard
- EN 54-3 — sounder product standard

CONSTRAINTS
- Never invent device counts, clause numbers, or product names not provided in the input.
- If a feature is absent from the input, do not mention it.
- If a Category contradicts the building type (e.g. Category M for sleeping accommodation), still write to the Category specified — the estimator decided the category.
- Do not include pricing, programme, or commercial terms — those are separate sections of the quotation.`;

async function callAI(input: ScopeWriterInput) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const userMessage = `Write the introduction and scope of works for this fire alarm quotation.\n\nINPUT (JSON):\n${JSON.stringify(input, null, 2)}\n\nReturn minified, valid JSON only. Do not include markdown fences or commentary.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      max_tokens: 3000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("AI rate limit exceeded. Please try again in a moment.");
    if (response.status === 402) throw new Error("AI credits exhausted. Please add credits to continue.");
    throw new Error(`AI gateway error ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No text content in AI response");

  const rawText = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const jsonStart = rawText.indexOf("{");
  const jsonEnd = rawText.lastIndexOf("}");
  const raw = jsonStart >= 0 && jsonEnd > jsonStart ? rawText.slice(jsonStart, jsonEnd + 1) : rawText;
  let parsed: ScopeOutput;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`Failed to parse AI output as JSON. Raw: ${raw.slice(0, 200)}…`); }

  if (typeof parsed.introduction !== "string" || !Array.isArray(parsed.scope)) throw new Error("AI output missing required fields");
  if (parsed.scope.length < 3 || parsed.scope.length > 5) throw new Error(`Expected 3-5 scope paragraphs, got ${parsed.scope.length}`);

  return { output: parsed, usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0, model: data.model ?? "google/gemini-2.5-flash" } };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const input = (await req.json()) as ScopeWriterInput;
    if (!input.works_type || !input.system?.category || !input.building?.type || !input.building?.occupancy) {
      throw new Error("Missing required fields: works_type, system.category, building.type, building.occupancy");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const { output, usage } = await callAI(input);

    let generationId: string | null = null;
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userData } = await supabase.auth.getUser();
      const { data: row } = await supabase.from("scope_generations").insert({
        quotation_id: input.quotation_id ?? null,
        inputs: input,
        output,
        model: usage.model,
        tokens_input: usage.input_tokens,
        tokens_output: usage.output_tokens,
        generated_by: userData?.user?.id ?? null,
      }).select("id").single();
      generationId = row?.id ?? null;
    } catch (auditErr) {
      console.error("Audit log failed (non-fatal):", auditErr);
    }

    return new Response(JSON.stringify({ introduction: output.introduction, scope: output.scope, generation_id: generationId, usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

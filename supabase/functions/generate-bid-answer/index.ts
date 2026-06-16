import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ════════════════════════════════════════════════════════════════════
// generate-bid-answer
// Drafts and refines answers to tender / ITT questions.
// Mirrors generate-bs5839-scope: Lovable AI gateway + bid_generations audit.
// ════════════════════════════════════════════════════════════════════

type Mode = "draft" | "refine";
type RefineInstruction = "improve" | "expand" | "shorten" | "fit_limit" | "custom";

interface CompanyContext {
  company_name?: string;
  accreditations?: string;     // e.g. "BAFE SP203-1, FIA member, ISO 9001"
  about?: string;              // short capability statement
}

interface BidContext {
  bid_title?: string;
  buyer_name?: string;
  section?: string;
}

interface GenerateBidAnswerInput {
  mode: Mode;
  question_text: string;
  guidance?: string;           // buyer's marking guidance / "what good looks like"
  word_limit?: number | null;
  char_limit?: number | null;
  current_answer?: string;     // required for refine
  instruction?: RefineInstruction;
  custom_instruction?: string; // free text when instruction === 'custom'
  company?: CompanyContext;
  bid?: BidContext;
  bid_id?: string;
  question_id?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a senior UK bid writer at a fire & life-safety contractor, writing answers to formal tender / Invitation to Tender (ITT) quality questions. Your answers are scored by the buyer's evaluators, so every answer must directly and fully address the question and any stated marking guidance.

VOICE & STYLE
- Confident, evidence-led, formal British English (UK spellings: organisation, specialise, programme, fibre).
- Write as the bidding organisation in the first person plural ("We will…", "Our approach…").
- No marketing fluff, no filler ("Furthermore", "Moreover", "It is worth noting"). Every sentence must earn its place.
- Make commitments specific and measurable (timescales, responsibilities, named roles, KPIs) rather than vague assurances.
- Reference relevant standards and accreditations ONLY when genuinely relevant: BS 5839-1/-6, BS 5266, BAFE SP203, FIA membership, ISO 9001/14001/45001, RISQS, SafeContractor, CHAS, Gas Safe, NICEIC. Never invent an accreditation the company has not provided.

STRUCTURE
- Open by directly answering the question asked.
- Where the question has multiple parts or the guidance lists criteria, address each one, in order.
- Use short paragraphs. Use a method/approach structure where appropriate (mobilisation, delivery, quality assurance, communication, continuous improvement).
- Close with the tangible outcome / benefit to the buyer.

HARD RULES
- Never fabricate facts: no invented client names, case studies, numbers, certifications, or staff. If a concrete detail would strengthen the answer but was not supplied, write a clearly bracketed placeholder like "[INSERT: recent comparable contract]" so the user knows to complete it.
- If a word or character limit is given, you MUST stay within it. Aim for 90-100% of the limit — evaluators reward thorough answers, but never exceed the limit.
- Plain prose only. No markdown headings, no bold, no bullet characters unless a list genuinely aids readability (then use simple hyphen bullets).

OUTPUT FORMAT
Return ONLY a JSON object — no prose, no markdown, no code fences:
{ "answer": "the full answer text" }`;

function buildUserMessage(input: GenerateBidAnswerInput): string {
  const lines: string[] = [];
  const c = input.company ?? {};
  const b = input.bid ?? {};

  lines.push("COMPANY CONTEXT");
  lines.push(`- Organisation: ${c.company_name || "(not provided)"}`);
  if (c.accreditations) lines.push(`- Accreditations / memberships: ${c.accreditations}`);
  if (c.about) lines.push(`- Capability summary: ${c.about}`);
  lines.push("");

  if (b.bid_title || b.buyer_name || b.section) {
    lines.push("TENDER CONTEXT");
    if (b.bid_title) lines.push(`- Bid: ${b.bid_title}`);
    if (b.buyer_name) lines.push(`- Buyer / contracting authority: ${b.buyer_name}`);
    if (b.section) lines.push(`- Section: ${b.section}`);
    lines.push("");
  }

  lines.push("QUESTION");
  lines.push(input.question_text.trim());
  lines.push("");

  if (input.guidance?.trim()) {
    lines.push("MARKING GUIDANCE / WHAT GOOD LOOKS LIKE");
    lines.push(input.guidance.trim());
    lines.push("");
  }

  const limitNote =
    input.word_limit != null
      ? `STRICT LIMIT: ${input.word_limit} words maximum. Aim for ${Math.round(input.word_limit * 0.9)}-${input.word_limit} words.`
      : input.char_limit != null
      ? `STRICT LIMIT: ${input.char_limit} characters maximum (including spaces).`
      : "No fixed limit — write a thorough answer of roughly 250-400 words.";

  if (input.mode === "draft") {
    lines.push("TASK: Write a complete, evaluator-ready first-draft answer to the question above.");
    lines.push(limitNote);
  } else {
    const instr = input.instruction ?? "improve";
    const map: Record<RefineInstruction, string> = {
      improve: "Improve the draft below: sharpen the answer to the question, make commitments more specific and measurable, and tighten the prose. Keep its factual content.",
      expand: "Expand the draft below with more relevant detail and specificity, fully using the available limit. Do not pad with filler.",
      shorten: "Shorten the draft below, keeping the strongest points and removing weaker or repetitive material.",
      fit_limit: "Rewrite the draft below so it fits the limit as closely as possible without losing key points.",
      custom: input.custom_instruction?.trim() || "Improve the draft below.",
    };
    lines.push("TASK: Refine an existing answer.");
    lines.push(map[instr]);
    lines.push(limitNote);
    lines.push("");
    lines.push("CURRENT DRAFT");
    lines.push((input.current_answer || "").trim() || "(empty)");
  }

  lines.push("");
  lines.push('Return minified, valid JSON only: {"answer":"..."}. No markdown fences, no commentary.');
  return lines.join("\n");
}

async function callAI(input: GenerateBidAnswerInput) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserMessage(input) },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
      temperature: 0.4,
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

  let parsed: { answer?: string };
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`Failed to parse AI output as JSON. Raw: ${raw.slice(0, 200)}…`); }

  if (typeof parsed.answer !== "string" || !parsed.answer.trim()) {
    throw new Error("AI output missing 'answer' field");
  }

  return {
    answer: parsed.answer.trim(),
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
      model: data.model ?? "google/gemini-2.5-flash",
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const input = (await req.json()) as GenerateBidAnswerInput;
    if (!input.mode || !input.question_text?.trim()) {
      throw new Error("Missing required fields: mode, question_text");
    }
    if (input.mode === "refine" && !input.current_answer?.trim()) {
      throw new Error("Refine mode requires a current_answer");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const { answer, usage } = await callAI(input);

    let generationId: string | null = null;
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userData } = await supabase.auth.getUser();
      const { data: row } = await supabase.from("bid_generations").insert({
        bid_id: input.bid_id ?? null,
        question_id: input.question_id ?? null,
        mode: input.mode,
        instruction: input.mode === "refine" ? (input.instruction ?? "improve") : null,
        inputs: input,
        output: answer,
        model: usage.model,
        tokens_input: usage.input_tokens,
        tokens_output: usage.output_tokens,
        generated_by: userData?.user?.id ?? null,
      }).select("id").single();
      generationId = row?.id ?? null;
    } catch (auditErr) {
      console.error("Bid generation audit log failed (non-fatal):", auditErr);
    }

    return new Response(JSON.stringify({ answer, generation_id: generationId, usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

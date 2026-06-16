import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ════════════════════════════════════════════════════════════════════
// analyse-tender-pack
// Reads every extracted document in a bid's tender pack and produces a
// structured analysis (summary, dates, evaluation weighting, compliance
// matrix, mandatory criteria, risks, win themes) plus the extracted
// scored questions. Persists analysis to bids and inserts bid_questions.
// Uses Claude (Anthropic) — long-context document reasoning.
// ════════════════════════════════════════════════════════════════════

// Opus for pack analysis — runs once per bid; accuracy on weightings,
// extracted questions and the compliance matrix is worth the cost here.
const MODEL = "claude-opus-4-8";
const MAX_PACK_CHARS = 320_000; // generous; Claude handles ~200k tokens

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a senior UK bid manager at a fire & life-safety contractor (fire alarms, emergency lighting, extinguishers, sprinklers). You are dissecting a tender pack on behalf of the bid team.

You read the supplied documents (ITT/RFP, specification, conditions of contract, selection questionnaire, pricing schedule, social value requirements) and produce a precise, no-nonsense analysis the team can act on.

GROUND RULES
- Use ONLY the supplied documents. Never invent dates, weightings, question text, or requirements. If something important is not stated, say so.
- UK English. UK public-procurement literacy: SQ/PQQ, CCS frameworks, PPN 06/20 Social Value Model, BS 5839-1, BS 5266, BAFE SP203, FIA, price/quality envelopes.
- For the scored QUESTIONS: extract them verbatim where possible. Capture the question reference (e.g. "3.1"), the section/heading it sits under, any stated word or character limit, and any stated mark/weighting. Only include questions the bidder must WRITE answers to (quality/method/social-value/technical) — do NOT include pass/fail SQ tick-box items as questions (put those under mandatory_requirements instead).

OUTPUT — return ONLY a JSON object, no prose, no markdown, no code fences:
{
  "summary": "3-5 sentence plain-English overview of the opportunity and what's being procured",
  "buyer_name": "contracting authority, or null",
  "key_dates": [{"label": "Submission deadline", "date": "2026-07-15", "notes": "via portal, 12:00"}],
  "evaluation": {"price_weight": 40, "quality_weight": 60, "method": "short description of how it's scored, or null"},
  "mandatory_requirements": ["pass/fail or compliance items the bidder must meet (insurance levels, accreditations, financial standing, TUPE, etc.)"],
  "compliance_matrix": [{"requirement": "what the buyer requires", "where": "doc/section if known", "met_by": "how we'd evidence it, or INSERT note"}],
  "risks": ["commercial, delivery, or compliance risks worth flagging"],
  "win_themes": ["angles likely to score well given the spec and a competent fire-safety contractor"],
  "questions": [{"question_ref": "3.1", "section": "Quality", "question_text": "verbatim question", "word_limit": 500, "char_limit": null, "weighting": 20}]
}

Rules for fields:
- Dates as ISO yyyy-mm-dd where derivable, else put the raw text in notes and date null.
- Weights are numbers (percent) or null if not stated. They need not sum to 100 if the pack doesn't say.
- word_limit / char_limit numbers or null. weighting number or null.
- Keep arrays focused and useful — quality over quantity. Do not pad.`;

function buildUserMessage(
  bidTitle: string,
  docs: Array<{ file_name: string; doc_type: string; extracted_text: string | null }>,
  evidence: Array<{ title: string; category: string; description: string | null }>,
): string {
  const parts: string[] = [];
  parts.push(`BID: ${bidTitle}`);
  parts.push("");

  if (evidence.length) {
    parts.push("OUR COMPANY EVIDENCE LIBRARY (for the compliance_matrix 'met_by' field — what we can already evidence):");
    evidence.forEach((e) => parts.push(`- [${e.category}] ${e.title}${e.description ? ` — ${e.description}` : ""}`));
    parts.push("");
  }

  parts.push("=== TENDER PACK DOCUMENTS ===");
  let budget = MAX_PACK_CHARS;
  for (const d of docs) {
    const header = `\n----- DOCUMENT: ${d.file_name} (type: ${d.doc_type}) -----\n`;
    const text = (d.extracted_text || "").trim();
    if (!text) {
      parts.push(`${header}[no extractable text — likely scanned/image-only; flag to the user]`);
      continue;
    }
    const slice = text.slice(0, Math.max(0, budget));
    parts.push(header + slice + (text.length > slice.length ? "\n[…truncated…]" : ""));
    budget -= slice.length;
    if (budget <= 0) { parts.push("\n[pack truncated — remaining documents omitted due to size]"); break; }
  }
  parts.push("");
  parts.push('Analyse the pack and return the JSON object specified. Return minified JSON only — no markdown, no commentary.');
  return parts.join("\n");
}

async function callClaude(apiKey: string, system: string, user: string) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    if (resp.status === 401) throw new Error("Invalid Anthropic API key");
    if (resp.status === 429) throw new Error("Claude rate limit exceeded, please try again shortly.");
    throw new Error(`Claude API error ${resp.status}: ${errText.slice(0, 500)}`);
  }
  const data = await resp.json();
  const text = Array.isArray(data?.content)
    ? data.content.map((c: any) => c?.text || "").join("\n").trim()
    : "";
  return { text, usage: data?.usage, model: data?.model };
}

function parseJsonObject(raw: string): any {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const { bid_id } = await req.json();
    if (!bid_id) throw new Error("Missing bid_id");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();

    const { data: bid, error: bidErr } = await supabase
      .from("bids").select("id, title").eq("id", bid_id).single();
    if (bidErr || !bid) throw new Error("Bid not found");

    const { data: docs } = await supabase
      .from("bid_documents")
      .select("file_name, doc_type, extracted_text")
      .eq("bid_id", bid_id);
    if (!docs || docs.length === 0) throw new Error("No documents uploaded for this bid");

    const hasText = docs.some((d: any) => (d.extracted_text || "").trim().length > 0);
    if (!hasText) throw new Error("None of the uploaded documents have extractable text (scanned/image-only). Run OCR or upload text-based PDFs.");

    const { data: evidence } = await supabase
      .from("company_documents")
      .select("title, category, description")
      .eq("is_archived", false);

    const userMsg = buildUserMessage(bid.title, docs as any, (evidence as any) || []);
    const { text, usage, model } = await callClaude(ANTHROPIC_API_KEY, SYSTEM_PROMPT, userMsg);
    if (!text) throw new Error("No content returned from Claude");

    let analysis: any;
    try { analysis = parseJsonObject(text); }
    catch { throw new Error(`Failed to parse Claude output as JSON. Head: ${text.slice(0, 200)}…`); }

    // Persist analysis on the bid
    const deadline = Array.isArray(analysis.key_dates)
      ? analysis.key_dates.find((d: any) => /deadline|submission|return/i.test(d?.label || "") && d?.date)
      : null;
    const bidUpdate: Record<string, unknown> = { analysis, analysed_at: new Date().toISOString() };
    if (analysis.summary) bidUpdate.summary = analysis.summary;
    if (analysis.buyer_name) bidUpdate.buyer_name = analysis.buyer_name;
    if (deadline?.date) bidUpdate.submission_deadline = new Date(deadline.date).toISOString();
    await supabase.from("bids").update(bidUpdate).eq("id", bid_id);

    // Insert extracted questions only if none exist yet (don't clobber edits)
    let questionsInserted = 0;
    const { count } = await supabase
      .from("bid_questions")
      .select("id", { count: "exact", head: true })
      .eq("bid_id", bid_id);
    if ((count ?? 0) === 0 && Array.isArray(analysis.questions) && analysis.questions.length) {
      const rows = analysis.questions.map((q: any, i: number) => ({
        bid_id,
        sort_order: i,
        section: q.section ?? null,
        question_ref: q.question_ref ?? null,
        question_text: String(q.question_text ?? "").slice(0, 8000) || "(question text not captured)",
        word_limit: typeof q.word_limit === "number" ? q.word_limit : null,
        char_limit: typeof q.char_limit === "number" ? q.char_limit : null,
        weighting: typeof q.weighting === "number" ? q.weighting : null,
        auto_extracted: true,
      }));
      const { error: insErr } = await supabase.from("bid_questions").insert(rows);
      if (!insErr) questionsInserted = rows.length;
    }

    // Audit log
    try {
      await supabase.from("bid_generations").insert({
        bid_id,
        mode: "analyse",
        inputs: { document_count: docs.length },
        output: text,
        model: model ?? MODEL,
        tokens_input: usage?.input_tokens ?? null,
        tokens_output: usage?.output_tokens ?? null,
        generated_by: userData?.user?.id ?? null,
      });
    } catch (e) { console.error("analysis audit log failed (non-fatal):", e); }

    return new Response(JSON.stringify({ analysis, questions_inserted: questionsInserted, usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

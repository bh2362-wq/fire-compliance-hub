// BS 5839-1 clause suggester.
//
// Single-purpose helper for the smart-form Variations step: takes the
// engineer's description of a deviation from the standard and suggests
// the BS 5839-1:2025 clause(s) that the variation falls under. Used by
// the "Suggest BS clause" button next to the BS Clause Reference input
// on the cert wizards.
//
// Intentionally narrow: only the variation text is sent — no premises,
// engineer, or other payload fields. This matches the form's "scope to
// the variation only" requirement and keeps the call cheap.
//
// Returns up to 3 suggestions with confidence + reasoning so the
// engineer can pick the best fit or write their own. The cert wizard
// shows the suggestions in a popover; clicking one fills the field.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SuggestRequest {
  description?: string;
  justification?: string;
}

interface ClauseSuggestion {
  clause: string;       // e.g. "Cl. 22.2(g)"
  title: string;        // human title, e.g. "Spacing of point smoke detectors"
  confidence: "high" | "medium" | "low";
  reasoning: string;    // one sentence explaining the link to the variation
}

const SYSTEM_PROMPT = `You are a UK fire-alarm compliance assistant specialising in BS 5839-1:2025
(Fire detection and fire alarm systems for buildings — Code of practice for design,
installation, commissioning and maintenance of systems in non-domestic premises).

The user will give you the text of a single variation entered on a Modification
or Commissioning Certificate. Your job is to identify which BS 5839-1:2025 clause(s)
the variation departs from, so the engineer can cite them on the cert.

CRITICAL RULES
- Only consider the variation text supplied. Do not invent context.
- Only cite BS 5839-1:2025 clauses (Sections 1-7 + Annexes A-H). Don't cite
  BS 7671, BS 9990, BS EN 54 series, or other standards even if mentioned.
- Use the exact clause notation seen in the standard, e.g. "Cl. 22.2(g)",
  "Cl. 13.2.4(b)", "Cl. 35.2.6", "Annex G". Use the prefix "Cl." for clauses
  and "Annex" for annexes.
- Return at most 3 suggestions, ordered most likely first.
- If the variation text is too vague to map to any clause confidently,
  return a single suggestion with confidence "low" and reasoning explaining
  what's missing.
- Output STRICT JSON only — no markdown fences, no preamble.

OUTPUT FORMAT
[
  {
    "clause": "Cl. 22.2(g)",
    "title": "Spacing of point smoke detectors",
    "confidence": "high",
    "reasoning": "Variation describes detector spacing exceeding 10.5 m — falls under detector siting rules."
  }
]
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as SuggestRequest;
    const desc = (body.description ?? "").toString().trim();
    const just = (body.justification ?? "").toString().trim();

    if (!desc && !just) {
      return new Response(
        JSON.stringify({ suggestions: [], error: "No variation text supplied" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Hard cap to prevent prompt injection / payload bloat. A variation
    // entry on a cert is short by nature — 2 KB is generous.
    const MAX = 2000;
    const variationText = [
      desc ? `Description: ${desc.slice(0, MAX)}` : null,
      just ? `Justification: ${just.slice(0, MAX)}` : null,
    ].filter(Boolean).join("\n\n");

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ suggestions: [], error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // Match the model id every other edge function in this repo
        // uses (claude-chat, scan-email, extract-report-notes, etc.) —
        // Haiku 4.5 isn't enabled on this Anthropic account and
        // returned a non-200 the engineer saw as an edge-function
        // error in the wizard.
        model: "claude-sonnet-4-5",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: variationText }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[suggest-bs5839-clause] Claude error:", resp.status, errText);
      // Surface the upstream Anthropic message so the engineer sees
      // (e.g.) "model not found" or "credit balance is too low" rather
      // than a generic edge-function failure.
      let upstreamMessage = "";
      try {
        const parsed = JSON.parse(errText);
        upstreamMessage = parsed?.error?.message ?? "";
      } catch {
        upstreamMessage = errText.slice(0, 200);
      }
      return new Response(
        JSON.stringify({
          suggestions: [],
          error: upstreamMessage || `AI service returned ${resp.status}`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();
    const raw = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .trim();

    // Strip any accidental markdown fences before parsing.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let suggestions: ClauseSuggestion[] = [];
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) suggestions = parsed.slice(0, 3);
    } catch (e) {
      console.error("[suggest-bs5839-clause] JSON parse failed:", e, "raw:", cleaned);
      return new Response(
        JSON.stringify({ suggestions: [], error: "AI response wasn't valid JSON" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[suggest-bs5839-clause] fatal:", message);
    return new Response(
      JSON.stringify({ suggestions: [], error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

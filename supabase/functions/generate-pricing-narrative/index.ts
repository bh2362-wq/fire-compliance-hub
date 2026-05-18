import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a pricing analyst for BHO Fire & Security, a UK fire alarm and security contractor specialising in Gent systems (Vigilon, S-Quad, Compact). You analyse quote scopes against historical comparable jobs and UK public sector market data to produce calibrated pricing recommendations for the estimating team.

CRITICAL RULES:
1. You may ONLY cite numbers from the data provided in the user message. Do NOT invent prices, percentages, or statistics. If you don't have enough data to make a claim, say so.
2. CITATION INTEGRITY (CRITICAL): You may ONLY cite job references that appear verbatim in the comparables array provided in the user message. Before writing any citation, verify the exact string exists in that array. If you cannot find a real reference to support a claim, state the claim without citation OR rephrase to make it a general observation ('several won jobs averaged X% margin') without naming references. NEVER invent, infer, extrapolate or pattern-match new job reference numbers. If only 3 jobs exist in the comparables, you may only cite those 3 — even if your reasoning would benefit from more examples. Inventing a citation is the single worst thing you can do in this role.
3. Risk flags must be specific and actionable. Bad: "Watch labour costs". Good: "3 of 5 hotel takeovers in this size band came in under 12% margin due to ceiling void access — budget +2 days for false-ceiling work".
4. Win probability should reflect the actual win/loss ratio in the comparables, weighted toward recency. Be honest — if 4 of 6 similar jobs lost on price, the win probability at target is roughly 33%, not 80%.
5. If sample size is below 5 comparables, mention this as a confidence caveat.
6. Be direct and operational. The reader is an experienced estimator, not a board member. No fluff, no hedging, no marketing language.
7. Output MUST be valid JSON matching the schema. No prose outside JSON. No markdown code fences.
8. NUMBER INTEGRITY: Every numeric claim (£X, Y%, N of M, etc.) must derive from a value in the data provided. Do not interpolate, average, or compute new statistics unless you show the source values being aggregated. If you write 'X jobs averaged Y%', the X jobs must be enumerable from the comparables and the average must be computable from their actual margin values. If the data doesn't support the specific number you want to claim, choose a different claim or omit it.
9. FIELD-LEVEL ACCURACY (CRITICAL): When you cite ANY specific attribute of a comparable job — outcome (won/lost), margin %, quoted total, device count, client, region, anything — that attribute must match the comparable's actual data verbatim. Do not infer outcomes from price patterns ('this looks expensive so probably lost'). Do not assume two losses if one is loss and one is win. Read the bid_outcome field literally for each cited job. If you want to make a claim about a job's outcome or margin, copy the value directly from that row. Misattributing a won job as lost (or vice versa) is treated as severely as fabricating a reference.



OUTPUT SCHEMA (exact keys, no extras):
{
  "narrative": "string — exactly 2 paragraphs, max 180 words total. Para 1: where this quote sits in the comparable distribution and why. Para 2: the recommendation with specific reasoning.",
  "risk_flags": [
    { "severity": "high|medium|low", "category": "labour|materials|access|programme|competitive|scope|margin", "flag": "string — max 30 words, specific and citing comparable evidence" }
  ],
  "win_probability_pct": number (0-100),
  "suggested_margin_pct": number,
  "confidence_score": number (0-100, reflects data quality + sample size),
  "caveats": ["string"]
}`;

const MODEL_VERSION = "claude-sonnet-4-5";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "method_not_allowed" }, 405);

  const t0 = Date.now();
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const PUBLISHABLE_KEYS = (Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  // Accept new short keys, legacy JWT publishable keys (role=anon for this project), or service role
  const isProjectAnonJwt = token.startsWith("eyJ") && token.includes("anon") === false
    ? (() => { try { const p = JSON.parse(atob(token.split(".")[1])); return p.role === "anon" && p.ref === "qtsboanwhzskkdvkfcdt"; } catch { return false; } })()
    : token.startsWith("eyJ");
  const validAnon = token && (token === ANON_KEY || token === PUBLISHABLE_KEY || PUBLISHABLE_KEYS.includes(token) || isProjectAnonJwt);
  const validService = token && token === SERVICE_KEY;
  if (!validAnon && !validService) return jsonResp({ error: "unauthorized" }, 401);

  if (!ANTHROPIC_API_KEY) return jsonResp({ error: "missing_anthropic_key" }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResp({ error: "invalid_json" }, 400);
  }

  const scope = body?.scope ?? {};
  const systemType: string = scope.systemType;
  const buildingType: string = scope.buildingType;
  if (!systemType || !buildingType) {
    return jsonResp({ error: "scope.systemType and scope.buildingType are required" }, 400);
  }
  const jobCategory = scope.jobCategory ?? null;
  const deviceCount = scope.deviceCount ?? null;
  const loopCount = scope.loopCount ?? null;
  const region = scope.region ?? null;
  const bs5839 = scope.bs5839Category ?? null;
  const giaSqm = scope.giaSqm ?? null;
  const lookbackYears = scope.lookbackYears ?? 3;
  const currentQuoteTotal = body?.currentQuoteTotal ?? null;
  const quoteId = body?.quoteId ?? null;
  const visitId = body?.visitId ?? null;

  console.log(`[generate-pricing-narrative] start system=${systemType} building=${buildingType} cat=${jobCategory} devices=${deviceCount} quote=${quoteId}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    db: { schema: "cost_intelligence" as any },
    auth: { persistSession: false },
  });

  const rpcCommon = {
    p_system_type: systemType,
    p_building_type: buildingType,
    p_job_category: jobCategory,
    p_device_count: deviceCount,
    p_loop_count: loopCount,
    p_region: region,
    p_bs5839_category: bs5839,
    p_lookback_years: lookbackYears,
  };

  let comparables: any[] = [];
  let stats: any = null;
  let market: any = null;
  let errorDetail: string | null = null;

  try {
    const [cmpRes, statsRes, mktRes] = await Promise.all([
      supabase.rpc("find_comparable_jobs", { ...rpcCommon, p_limit: 10 }),
      supabase.rpc("comparable_jobs_stats", { ...rpcCommon, p_pool_size: 20 }),
      supabase.rpc("get_market_context", {
        p_system_type: systemType,
        p_building_type: buildingType,
        p_region: region,
        p_lookback_months: 24,
      }),
    ]);
    if (cmpRes.error) throw new Error(`find_comparable_jobs: ${cmpRes.error.message}`);
    if (statsRes.error) throw new Error(`comparable_jobs_stats: ${statsRes.error.message}`);
    if (mktRes.error) throw new Error(`get_market_context: ${mktRes.error.message}`);
    comparables = cmpRes.data ?? [];
    stats = (statsRes.data ?? [])[0] ?? null;
    market = (mktRes.data ?? [])[0] ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[generate-pricing-narrative] rpc failure", msg);
    return jsonResp({ success: false, error: "rpc_failed", detail: msg }, 500);
  }

  const sampleSize = Number(stats?.sample_size ?? 0);
  const marketSample = Number(market?.sample_size ?? 0);

  // e) insufficient data short-circuit
  if (comparables.length === 0 && marketSample === 0) {
    console.log("[generate-pricing-narrative] insufficient_data");
    return jsonResp({
      success: true,
      narrative: null,
      reason: "insufficient_data",
      flags: [],
      win_probability: null,
      suggested_margin: null,
      confidence: 0,
    });
  }

  // Build user prompt
  const compactComparables = comparables.map((c) => ({
    job_reference: c.job_reference,
    client_name: c.client_name,
    system_type: c.system_type,
    building_type: c.building_type,
    job_category: c.job_category,
    region: c.region,
    classified_at: c.classified_at ? String(c.classified_at).slice(0, 10) : null,
    loop_count: c.loop_count,
    device_count_total: c.device_count_total,
    quoted_total: c.quoted_total,
    invoiced_total: c.invoiced_total,
    achieved_margin_pct: c.achieved_margin_pct,
    bid_outcome: c.bid_outcome,
    cost_per_device: c.cost_per_device,
    similarity_score: c.similarity_score,
  }));

  const userPrompt =
`VALIDATION CHECK: Before producing your final output, for every job reference and every attribute claim about a cited job:
1. Identify which entry in the comparables array supports it
2. Verify the attribute value matches that entry verbatim (outcome, margin, value, device count)
3. If you cannot verify an attribute, do not state it
This applies in particular to bid_outcome values — never characterise a 'won' job as 'lost' or vice versa.


Analyse this quote scope against the data below.


QUOTE SCOPE:
${JSON.stringify(scope, null, 2)}

CURRENT QUOTE TOTAL (if set): £${currentQuoteTotal ?? "not set"}

COMPARABLE JOBS (most similar first, similarity score 0-100):
${JSON.stringify(compactComparables, null, 2)}

INTERNAL BENCHMARK STATISTICS:
${JSON.stringify(stats, null, 2)}

UK PUBLIC SECTOR MARKET CONTEXT (last 24 months, Contracts Finder awards):
${JSON.stringify(market, null, 2)}

Produce your assessment as JSON per the schema. Reason carefully about the win probability — count the won/lost outcomes in the comparables, weight by recency and similarity score, and be honest.`;

  // Call Anthropic with 30s timeout
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);

  let parsed: any = null;
  let rawText = "";
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_VERSION,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`anthropic ${resp.status}: ${txt.slice(0, 400)}`);
    }
    const data = await resp.json();
    rawText = (data?.content?.[0]?.text ?? "").trim();
    parsed = JSON.parse(stripFences(rawText));
  } catch (e) {
    clearTimeout(timer);
    errorDetail = e instanceof Error ? e.message : String(e);
    console.error("[generate-pricing-narrative] synthesis failed", errorDetail);
    // Write failed row
    try {
      await supabase.from("pricing_recommendations").insert({
        quote_id: quoteId,
        job_id: visitId,
        scope_input: { ...scope, _error: errorDetail, _raw: rawText?.slice(0, 1000) },
        comparable_job_ids: comparables.map((c) => c.job_id),
        market_benchmark_ids: [],
        recommended_low: stats?.recommended_low ?? null,
        recommended_target: stats?.recommended_target ?? null,
        recommended_high: stats?.recommended_high ?? null,
        narrative: null,
        model_version: MODEL_VERSION,
      });
    } catch (logErr) {
      console.error("[generate-pricing-narrative] failed-row insert error", logErr);
    }
    return jsonResp({ success: false, error: "synthesis_failed", detail: errorDetail }, 502);
  }

  // Validate parsed
  const narrative = String(parsed?.narrative ?? "");
  const riskFlags = Array.isArray(parsed?.risk_flags) ? parsed.risk_flags : [];
  const winProb = Number(parsed?.win_probability_pct ?? 0);
  const suggestedMargin = Number(parsed?.suggested_margin_pct ?? 0);
  const confidence = Number(parsed?.confidence_score ?? 0);

  if (!narrative || Number.isNaN(winProb) || Number.isNaN(suggestedMargin)) {
    console.error("[generate-pricing-narrative] schema validation failed", parsed);
    return jsonResp({ success: false, error: "invalid_model_output", detail: rawText.slice(0, 400) }, 502);
  }

  // ============================================================
  // HALLUCINATION VALIDATION LAYER
  // ============================================================
  const JOB_REF_RE = /JOB-\d{4,6}/g;
  const OUTCOME_RE = /\b(won|lost|win|loss|winning|losing|secured|awarded)\b/i;

  const validRefs = new Map<string, string | null>(); // ref -> bid_outcome
  for (const c of compactComparables) {
    if (c.job_reference) validRefs.set(String(c.job_reference), c.bid_outcome ?? null);
  }

  const flagText = riskFlags.map((f: any) => String(f?.flag ?? "")).join("\n");
  const fullText = `${narrative}\n${flagText}`;

  // 1) Reference fabrication check
  const fabricatedRefs = new Set<string>();
  const referencedRefs = new Set<string>();
  for (const m of fullText.matchAll(JOB_REF_RE)) {
    const ref = m[0];
    referencedRefs.add(ref);
    if (!validRefs.has(ref)) fabricatedRefs.add(ref);
  }

  // 2) Outcome misattribution check — scan window of ~80 chars around each ref mention
  const outcomeMisattributions: string[] = [];
  for (const m of fullText.matchAll(JOB_REF_RE)) {
    const ref = m[0];
    const actual = validRefs.get(ref);
    if (!actual) continue; // fabricated refs handled above
    const start = Math.max(0, (m.index ?? 0) - 80);
    const end = Math.min(fullText.length, (m.index ?? 0) + ref.length + 80);
    const window = fullText.slice(start, end);
    const om = window.match(OUTCOME_RE);
    if (!om) continue;
    const word = om[0].toLowerCase();
    const claimed = /^(won|win|winning|secured|awarded)$/.test(word) ? "won"
                  : /^(lost|loss|losing)$/.test(word) ? "lost"
                  : null;
    if (claimed && actual && claimed !== String(actual).toLowerCase()) {
      outcomeMisattributions.push(`${ref}: claimed=${claimed}, actual=${actual}`);
    }
  }

  const fabricatedRefsArr = [...fabricatedRefs];
  const hallucinationDetected = fabricatedRefsArr.length > 0 || outcomeMisattributions.length > 0;

  let finalRiskFlags = riskFlags;
  if (hallucinationDetected) {
    const issues: string[] = [];
    if (fabricatedRefsArr.length > 0) issues.push(`${fabricatedRefsArr.length} fabricated reference(s)`);
    if (outcomeMisattributions.length > 0) issues.push(`${outcomeMisattributions.length} misattributed outcome(s)`);
    finalRiskFlags = [
      {
        severity: "high",
        category: "scope",
        flag: `AI assessment hallucination detected — ${issues.join(", ")}. Review carefully before relying on this output.`,
      },
      ...riskFlags,
    ];
    console.warn("[generate-pricing-narrative] hallucination", {
      fabricated: fabricatedRefsArr,
      misattributions: outcomeMisattributions,
    });
  }

  // Insert recommendation row
  const { data: inserted, error: insertErr } = await supabase
    .from("pricing_recommendations")
    .insert({
      quote_id: quoteId,
      job_id: visitId,
      scope_input: scope,
      comparable_job_ids: comparables.map((c) => c.job_id),
      market_benchmark_ids: [],
      recommended_low: stats?.recommended_low ?? null,
      recommended_target: stats?.recommended_target ?? null,
      recommended_high: stats?.recommended_high ?? null,
      recommended_margin_pct: suggestedMargin,
      confidence_score: confidence,
      win_probability_pct: winProb,
      risk_flags: finalRiskFlags,
      narrative,
      model_version: MODEL_VERSION,
      hallucination_detected: hallucinationDetected,
      fabricated_references: fabricatedRefsArr,
      outcome_misattributions: outcomeMisattributions,
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[generate-pricing-narrative] insert error", insertErr);
    return jsonResp({ success: false, error: "persist_failed", detail: insertErr.message }, 500);
  }

  const dur = Date.now() - t0;
  console.log(`[generate-pricing-narrative] done id=${inserted.id} comparables=${comparables.length} market=${marketSample} ms=${dur} hallucination=${hallucinationDetected}`);

  return jsonResp({
    success: true,
    recommendation_id: inserted.id,
    narrative,
    risk_flags: finalRiskFlags,
    win_probability_pct: winProb,
    suggested_margin_pct: suggestedMargin,
    confidence_score: confidence,
    hallucination_detected: hallucinationDetected,
    fabricated_references: fabricatedRefsArr,
    outcome_misattributions: outcomeMisattributions,
    based_on: {
      comparable_count: comparables.length,
      market_context_count: marketSample,
      lookback_years: lookbackYears,
    },
  });

});

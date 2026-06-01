// analyze-bs5839-defects
//
// Takes the live state of a BS 5839 service report (free-text fields +
// already-logged site defects) and runs an LLM pass to extract a structured
// "defect register" with suggested parts (catalog-aware), labour estimates,
// and prose ready to feed into the quote scope.
//
// Mirrors the response_format pattern from generate-bs5839-scope (Lovable
// gateway, JSON-only output, audit row written to ai_analysis_runs). Adds
// a content-hash echo so the client can dedupe re-runs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface AnalysisInput {
  report_id: string;
  site: {
    name: string;
    address?: string | null;
    occupancy_type?: string | null;
    bs5839_category?: string | null;
    system_type?: string | null;
    panel_manufacturer?: string | null;
  };
  // Defects already logged in site_defects for this visit/report.
  defects: Array<{
    id: string;
    description: string;
    location: string | null;
    category: 1 | 2 | 3;
  }>;
  // Free-text fields from the service_reports row at time of analysis.
  free_text: {
    recommendations?: string | null;
    defects_found?: string | null;
    system_condition?: string | null;
    work_carried_out?: string | null;
    notes?: string | null;
  };
  // Content hash from the client — echoed back so the client can detect
  // stale responses and dedupe identical reruns.
  content_hash: string;
  // Default £75/hr if not provided. Used for labour cost calculation only;
  // the office can edit the labour line once the draft quote is saved.
  labour_rate?: number;
}

interface DetectedDefect {
  description: string;
  category: 1 | 2 | 3;
  location: string | null;
  source: "logged" | "extracted"; // logged = from site_defects, extracted = from free-text
  source_defect_id?: string | null; // when source === "logged"
  suggested_parts: Array<{
    part_number: string;
    description: string;
    qty: number;
    unit_price: number;
    catalog_match: boolean; // true if we mapped to a materials_catalog row
  }>;
  labour_hours: number;
  labour_cost: number;
  scope_note: string;
  subtotal: number;
}

interface AnalysisOutput {
  defects: DetectedDefect[];
  scope_introduction: string;
  totals: {
    parts: number;
    labour: number;
    subtotal: number;
  };
}

const SYSTEM_PROMPT = `You are a senior UK fire alarm estimator at BHO Fire Ltd analysing a BS 5839 service report mid-flight. Your job is to extract every actionable defect — both ones the engineer has formally logged AND ones implied by their free-text notes — and turn each into a structured remedial line.

VOICE / STYLE
- UK English. Sentence cadence of an experienced fire engineer.
- Concise, declarative. No marketing language.
- Reference BS 5839-1:2025 clauses ONLY when accurate.

CATEGORY RULES
- 1 (Critical): immediate risk to life safety, system non-operational, mandatory rectification.
- 2 (Major): significant impairment but system still functional.
- 3 (Minor): cosmetic / non-impairing non-conformance.

LOGGED VS EXTRACTED
- For each row in 'logged_defects' in the input, output one defect entry with source="logged" and source_defect_id set.
- Additionally, scan all free-text fields ('recommendations', 'defects_found', 'system_condition', 'work_carried_out', 'notes') for further issues NOT already covered by a logged defect. Output those with source="extracted" and source_defect_id=null.
- DO NOT double-count: if a free-text note clearly refers to the same issue as a logged defect, skip it.

PARTS SOURCING — STRICT
- The user message includes a 'materials_catalog_sample' list. For each defect, prefer parts from this list when they match the work needed. Set catalog_match=true and copy part_number, description and unit_price (retail_price) verbatim from the catalog row.
- If no catalog match is appropriate, you MAY estimate a part with catalog_match=false. In that case, the description must start with "Est. — " and the part_number must start with "EST-" (e.g. "EST-DET-OPT"). Use realistic UK trade prices for fire alarm parts.
- Quantities must be integers >= 1.

LABOUR
- labour_hours: realistic time to investigate + rectify. Examples:
  • Replace one detector head: 0.5 hrs
  • Replace one MCP: 0.5 hrs
  • Replace battery set: 0.75 hrs
  • Re-program one zone: 1 hr
  • Investigate intermittent fault: 1.5–2 hrs
- labour_cost = labour_hours × labour_rate (the user provides labour_rate; default £75/hr).

SUBTOTALS
- Each defect's subtotal = sum(suggested_parts[].qty × unit_price) + labour_cost. You compute these.
- totals.parts = sum of all parts (qty × unit_price across every defect).
- totals.labour = sum of all labour_cost.
- totals.subtotal = totals.parts + totals.labour.
- All money values are GBP, no VAT (added by the office later).

SCOPE NOTE
- One or two sentences per defect describing the works. Suitable for pasting into a client quotation. Reference Clause 45 / 46 where relevant.

INTRODUCTION
- 60–90 words, one paragraph.
- Open with "BHO Fire Ltd is pleased to submit this quotation for the reactive remedial works identified during the service visit at <site>." Cite Clause 45 / 46.
- Close with one sentence about the deliverable (service report update + logbook entry).

OUTPUT FORMAT — return ONLY a JSON object, no prose / markdown / fences:
{
  "defects": [
    {
      "description": "...",
      "category": 1|2|3,
      "location": "..."|null,
      "source": "logged"|"extracted",
      "source_defect_id": "uuid"|null,
      "suggested_parts": [{ "part_number": "...", "description": "...", "qty": 1, "unit_price": 0.00, "catalog_match": true|false }],
      "labour_hours": 0.5,
      "labour_cost": 37.50,
      "scope_note": "...",
      "subtotal": 0.00
    }
  ],
  "scope_introduction": "...",
  "totals": { "parts": 0, "labour": 0, "subtotal": 0 }
}

CONSTRAINTS
- If there are no logged defects AND nothing actionable in the free-text, return defects=[], totals all zero, and a brief introduction noting that no remedial works were identified.
- Never invent device counts or system features absent from the input.
- Never invent BS 5839 clause numbers.`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function loadCatalogSample(
  supabase: ReturnType<typeof createClient>,
): Promise<Array<{ part_number: string; description: string; retail_price: number; supplier: string | null }>> {
  // Top-N most-relevant fire-alarm catalog rows. Pulling a broad sample by
  // common categories rather than a query-time search keeps the prompt
  // deterministic across reruns (better cache behaviour) and gives the AI
  // enough context to make sensible matches without ballooning tokens.
  const { data, error } = await supabase
    .from("materials_catalog")
    .select("part_number, description, retail_price, supplier_name, category")
    .order("retail_price", { ascending: false })
    .limit(60);
  if (error || !data) return [];
  return data
    .filter((r) => r.part_number && r.description && typeof r.retail_price === "number")
    .map((r) => ({
      part_number: r.part_number as string,
      description: r.description as string,
      retail_price: r.retail_price as number,
      supplier: (r.supplier_name as string | null) ?? null,
    }));
}

async function callAI(input: AnalysisInput, catalog: unknown[]): Promise<{
  output: AnalysisOutput;
  usage: { input_tokens: number; output_tokens: number; model: string };
}> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const labourRate = input.labour_rate ?? 75;

  const userMessage =
    `Analyse this BS 5839 service report and extract a structured remedial register.\n\n` +
    `labour_rate (£/hour): ${labourRate}\n\n` +
    `INPUT (JSON):\n${JSON.stringify(
      {
        site: input.site,
        logged_defects: input.defects,
        free_text: input.free_text,
        materials_catalog_sample: catalog,
      },
      null,
      2,
    )}\n\nReturn minified, valid JSON only.`;

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
      max_tokens: 4000,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("AI rate limit exceeded. Please try again in a moment.");
    if (response.status === 402) throw new Error("AI credits exhausted.");
    throw new Error(`AI gateway error ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No text content in AI response");

  const rawText = String(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const jsonStart = rawText.indexOf("{");
  const jsonEnd = rawText.lastIndexOf("}");
  const raw = jsonStart >= 0 && jsonEnd > jsonStart ? rawText.slice(jsonStart, jsonEnd + 1) : rawText;

  let parsed: AnalysisOutput;
  try {
    parsed = JSON.parse(raw) as AnalysisOutput;
  } catch {
    throw new Error(`Failed to parse AI output as JSON. Raw: ${raw.slice(0, 200)}…`);
  }

  if (!Array.isArray(parsed.defects) || !parsed.totals) {
    throw new Error("AI output missing required fields (defects / totals)");
  }

  return {
    output: parsed,
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
      model: data.model ?? "google/gemini-2.5-flash",
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const input = (await req.json()) as AnalysisInput;
    if (!input.report_id || !input.site?.name || !input.content_hash) {
      throw new Error("Missing required fields: report_id, site.name, content_hash");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const catalog = await loadCatalogSample(supabase);
    const { output, usage } = await callAI(input, catalog);

    // Best-effort audit row. Uses the existing scope_generations table —
    // good enough for the first cut; if usage gets significant we can split
    // into a dedicated ai_defect_analyses table.
    try {
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("scope_generations").insert({
        quotation_id: null,
        inputs: {
          kind: "analyze-bs5839-defects",
          report_id: input.report_id,
          content_hash: input.content_hash,
          input,
        },
        output,
        model: usage.model,
        tokens_input: usage.input_tokens,
        tokens_output: usage.output_tokens,
        generated_by: userData?.user?.id ?? null,
      });
    } catch (auditErr) {
      console.error("Audit log failed (non-fatal):", auditErr);
    }

    return new Response(
      JSON.stringify({ ...output, usage, content_hash: input.content_hash }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

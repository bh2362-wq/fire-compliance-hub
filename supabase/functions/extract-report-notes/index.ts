// extract-report-notes
//
// Input:  { report_type: "bs5839"|"asd"|"drm"|"work"|"ce", notes_text: string }
// Action: pass the freeform engineer/AI notes to Claude with a per-report-type
//         extraction prompt, returns structured `defects[]` + per-field
//         addenda the wizard's PasteAINotesDialog can render as a checklist.
// Output: { defects: [...], fields: { ... }, summary, usage }
//
// Mirrors the prompting style of analyze-bs5839-defects + scan-email:
// strict JSON output, low temperature, conservative extraction (we'd
// rather miss something than invent it). Heavy lifting on the prompt
// side; the function itself is just glue.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReportType = "bs5839" | "asd" | "drm" | "work" | "ce";

interface ExtractInput {
  report_type: ReportType;
  notes_text: string;
}

interface ExtractedDefect {
  description: string;
  category: 1 | 2 | 3;
  location: string | null;
  recommended_action: string | null;
}

interface ExtractedFields {
  defects_found_addendum?: string | null;
  recommendations_addendum?: string | null;
  work_carried_out_addendum?: string | null;
  system_condition_addendum?: string | null;
  notes_addendum?: string | null;
}

interface ExtractOutput {
  defects: ExtractedDefect[];
  fields: ExtractedFields;
  summary: string;
}

const COMMON_RULES = `RULES
- Never invent details that aren't in the notes. If something's ambiguous, leave it out.
- Use UK English spelling and phrasing throughout addenda.
- Addenda are written TO BE APPENDED to existing report fields, so write in continuation style — no "Summary:" / "Notes:" prefixes, no headings, no bullet points unless the source notes already use them.
- Keep each addendum concise — a couple of sentences max per field. The engineer pastes raw notes from a chat; the report shouldn't read like a wall of AI-generated prose.

DEFECT CATEGORY RULES (BS 5839 / fire-safety convention)
- 1 (Critical): immediate risk to life safety, system non-operational, mandatory immediate rectification
- 2 (Major): significant impairment but system still functional
- 3 (Minor): cosmetic / non-impairing non-conformance

CATEGORY HEURISTICS
- Words like "fault", "disabled", "missing", "not working", "no audibility" → likely cat 1 or 2
- Words like "advisory", "minor", "cosmetic", "future consideration" → cat 3
- If in doubt, prefer cat 2 over cat 1 — the engineer can upgrade.

OUTPUT FORMAT — return ONLY a JSON object, no prose / markdown / code fences:
{
  "defects": [
    {
      "description": "What was found",
      "category": 1|2|3,
      "location": "Zone 3 detector L1.21" | null,
      "recommended_action": "Replace battery and re-test" | null
    }
  ],
  "fields": {
    "defects_found_addendum":      "..." | null,
    "recommendations_addendum":    "..." | null,
    "work_carried_out_addendum":   "..." | null,
    "system_condition_addendum":   "..." | null,
    "notes_addendum":              "..." | null
  },
  "summary": "One-sentence human summary of what was extracted"
}

If a field has nothing relevant in the notes, set it to null (NOT an empty string).
If there are no actionable defects, return defects: [].`;

const REPORT_TYPE_GUIDANCE: Record<ReportType, string> = {
  bs5839: `REPORT TYPE: BS 5839-1 fire alarm service report.
The engineer has just pasted freeform notes from a chat — likely from
a cause-and-effect test, a service visit, or remedial work. Pull out
distinct defects (each one a separate entry) and split the rest of
the prose into the appropriate report field addenda.

Field guidance:
- defects_found_addendum: short prose summary of new defects identified
  during this visit. Should complement (not duplicate) the structured
  defects[] entries.
- recommendations_addendum: forward-looking actions the customer should
  take (e.g. "client to arrange access to plant room for next visit",
  "recommend battery upgrade before next service"). NOT immediate
  rectification — that's a defect's recommended_action.
- work_carried_out_addendum: what was DONE on the visit (tests run,
  parts replaced, programming changes).
- system_condition_addendum: how the system was found / left
  (operational / fault present / disabled etc).
- notes_addendum: anything else worth recording that doesn't fit above.`,

  ce: `REPORT TYPE: Cause-and-effect test report.
The engineer has pasted notes from a C&E test session. Defects are
typically inputs that didn't trigger their expected outputs, or outputs
that failed to operate as designed.

Field guidance:
- defects_found_addendum: prose summary of C&E failures.
- recommendations_addendum: programming changes or wiring fixes needed.
- work_carried_out_addendum: tests performed, zones covered.
- system_condition_addendum: overall C&E pass status.
- notes_addendum: anything else (ARC notifications, witness present etc).`,

  asd: `REPORT TYPE: Aspirating Smoke Detection (ASD) service report.
Watch for: airflow fault thresholds, sample pipe blockages, sensitivity
drift, filter status, panel firmware versions.`,

  drm: `REPORT TYPE: Disabled Refuge service report.
Watch for: handset faults, call buttons, intercom audibility,
two-way speech, voltage drops, fire-resistance of cabling.`,

  work: `REPORT TYPE: Work / job-sheet style report (remedial,
installation, callout). Tends to be lighter on defects and heavier
on work-carried-out detail.

Field guidance (this report type uses different column names but the
shape is the same):
- defects_found_addendum: still maps — defects discovered during work.
- recommendations_addendum: further work suggested.
- work_carried_out_addendum: PRIMARY field for this report type.
- system_condition_addendum: condition on leaving site.
- notes_addendum: parts, time, materials notes.`,
};

function systemPrompt(reportType: ReportType): string {
  return `You are an accounts/operations assistant at BHO Fire Ltd helping engineers populate a service report from freeform notes (often pasted from ChatGPT or another AI chat). Your job is to extract structured defects + per-field addenda from the notes.

${REPORT_TYPE_GUIDANCE[reportType]}

${COMMON_RULES}`;
}

async function callClaude(input: ExtractInput): Promise<{
  output: ExtractOutput;
  usage: { input_tokens: number; output_tokens: number; model: string };
}> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const userMessage =
    `Extract structured data from these engineer notes.\n\n` +
    `--- NOTES ---\n${input.notes_text.slice(0, 20_000)}\n--- END NOTES ---\n\n` +
    `Return JSON only.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 3000,
      system: systemPrompt(input.report_type),
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 429) throw new Error("AI rate limit — try again shortly");
    if (response.status === 401) throw new Error("Invalid Anthropic API key");
    throw new Error(`Claude API ${response.status}: ${errText.slice(0, 300)}`);
  }
  const data = await response.json();
  const rawText: string =
    data.content
      ?.filter((c: { type: string }) => c.type === "text")
      ?.map((c: { text: string }) => c.text)
      ?.join("\n")
      ?.trim() || "";
  if (!rawText) throw new Error("No text content in Claude response");

  const codeBlock = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = codeBlock ? codeBlock[1] : rawText;

  let parsed: ExtractOutput;
  try {
    parsed = JSON.parse(jsonText) as ExtractOutput;
  } catch (e) {
    throw new Error(`Failed to parse Claude JSON: ${(e as Error).message}. Raw: ${rawText.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.defects)) parsed.defects = [];
  if (!parsed.fields) parsed.fields = {};

  return {
    output: parsed,
    usage: {
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
      model: data.model ?? "claude-sonnet-4-5",
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const input = (await req.json()) as ExtractInput;
    if (!input.report_type || !input.notes_text) {
      throw new Error("Missing required fields: report_type, notes_text");
    }
    if (!["bs5839", "asd", "drm", "work", "ce"].includes(input.report_type)) {
      throw new Error(`Unsupported report_type: ${input.report_type}`);
    }
    if (input.notes_text.trim().length < 20) {
      throw new Error("Notes too short — paste at least a couple of sentences");
    }

    const { output, usage } = await callClaude(input);

    return new Response(JSON.stringify({ ...output, usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

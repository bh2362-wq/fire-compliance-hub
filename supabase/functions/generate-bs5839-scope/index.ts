import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type WorksType =
  | "new_install" | "system_upgrade" | "system_takeover" | "extension"
  | "reactive_remedial" | "planned_maintenance" | "cause_and_effect"
  | "commissioning_only" | "acceptance_testing" | "verification"
  | "design_only" | "certification"
  // legacy aliases kept for backwards compatibility with old saved values
  | "upgrade" | "takeover" | "remedial";

interface ScopeWriterInput {
  works_type: WorksType;
  system: { category: "L1"|"L2"|"L3"|"L4"|"L5"|"M"|"P1"|"P2"; manufacturer?: string; panel_type?: string; loops?: number };
  building: { type: string; storeys?: number; occupancy: "sleeping"|"non_sleeping"|"mixed"; has_kitchens?: boolean; has_plant?: boolean; has_lifts?: boolean };
  devices?: { detectors_smoke?: number; detectors_heat?: number; mcps?: number; sounders?: number; vads?: number; interfaces?: number };
  features?: { wireless?: boolean; asd?: boolean; voice_alarm?: boolean; bms_interface?: boolean; arc_signal?: boolean; lift_recall?: boolean; damper_control?: boolean };
  site_visit_date?: string;
  existing_system_description?: string;
  project_name?: string;
  quotation_id?: string;
  line_items?: Array<{ description: string; quantity?: number; unit_price?: number; total?: number }>;
}

function normaliseWorksType(wt: WorksType): Exclude<WorksType, "upgrade" | "takeover" | "remedial"> {
  if (wt === "upgrade") return "system_upgrade";
  if (wt === "takeover") return "system_takeover";
  if (wt === "remedial") return "reactive_remedial";
  return wt;
}

// Per-works-type prompt template. Each describes the scope structure, applicable
// clauses, and the deliverables an experienced engineer would produce for that
// job type. The AI is then asked to write to the matching template.
const WORKS_TYPE_GUIDANCE: Record<Exclude<WorksType, "upgrade" | "takeover" | "remedial">, string> = {
  new_install: `WORKS TYPE: NEW INSTALL
Produce four scope paragraphs covering (1) panel & architecture, (2) detection strategy with Clause 21.2/20.2 references, (3) audibility per Clause 16.2 and EN 54-23 VADs, (4) commissioning/handover per Clause 39 with full BS 5839-1:2017 certificate and 12-month defects-liability period.`,
  system_upgrade: `WORKS TYPE: SYSTEM UPGRADE
Reference the existing system. Cover (1) removal/replacement strategy and compatibility, (2) new panel and migrated/replaced devices, (3) any extension of detection coverage with Clause references, (4) re-commissioning and Modification Certificate per Clause 44 and Annex G.`,
  system_takeover: `WORKS TYPE: SYSTEM TAKEOVER (MAINTENANCE CONTRACT TRANSFER)
Cover (1) initial inspection and condition survey, (2) verification of zone plans, cause-and-effect schedule and as-fitted documentation, (3) any remedial works identified during takeover, (4) issue of an Acceptance Certificate per BS 5839-1:2017 and commencement of routine servicing.`,
  extension: `WORKS TYPE: EXTENSION / MODIFICATION
Reference Section 7 (Extensions and modifications). Cover (1) impact assessment on existing system architecture and battery capacity, (2) installation of additional devices and any reconfiguration, (3) partial commissioning of new equipment per Clause 39, (4) update of zone plans, cause-and-effect and logbook; issue of Modification Certificate per Clause 44.`,
  reactive_remedial: `WORKS TYPE: REACTIVE REMEDIAL WORKS
Cover (1) site investigation of the reported defect, (2) rectification works (component replacement, wiring repair, configuration change), (3) re-testing of affected zones and output groups, (4) update of the system logbook (Annex G) and issue of a service report. Do not describe new installation or full commissioning.`,
  planned_maintenance: `WORKS TYPE: PLANNED MAINTENANCE (PPM / SERVICING)
Reference Clause 43. Cover (1) inspection of panel, batteries, indications and printer; (2) functional testing of detectors and manual call points to the routine specified in Clause 43.3 with the agreed servicing frequency (typically 6-monthly per 43.2.1); (3) ARC signalling verification; (4) issue of a Service Certificate (Annex G) and update of the logbook. Do not describe a new installation.`,
  cause_and_effect: `WORKS TYPE: CAUSE AND EFFECT TESTING
This is a focused functional test of the programmed cause-and-effect logic — NOT a new installation. Cover (1) review of the documented C&E matrix and any site-specific software configuration; (2) systematic activation of each input (manual call points, detectors, interfaces) to verify the corresponding output groups (sounders, VADs, plant shutdowns, ancillary interfaces) operate as designed; (3) verification of ARC signal transmission with the receiving centre notified before and after testing; (4) issue of a Cause and Effect Test Report, update of the logbook and the cause-and-effect schedule. Reference Clause 43 routine testing and any verified clauses from the source material. Keep the scope proportionate — typical value £800–£2,000.`,
  commissioning_only: `WORKS TYPE: COMMISSIONING ONLY
The system has been installed by others. Cover (1) review of as-installed documentation and zone plans; (2) commissioning sequence per Clause 39 — visual inspection, insulation tests, functional testing of every detector, MCP, sounder and interface; (3) cause-and-effect verification; (4) issue of a BS 5839-1:2017 Commissioning Certificate per Annex G and handover of completion documentation.`,
  acceptance_testing: `WORKS TYPE: ACCEPTANCE TESTING
Verification of installed system against the design specification on behalf of the client. Cover (1) review of design documentation and Commissioning Certificate; (2) witness testing of a representative sample of devices and cause-and-effect operations; (3) verification of zone plans, signage and accessibility of equipment; (4) issue of an Acceptance Certificate per BS 5839-1:2017 and recording of any outstanding items.`,
  verification: `WORKS TYPE: INDEPENDENT VERIFICATION
Independent third-party verification of system compliance. Cover (1) documentation review (design, commissioning, modification certificates); (2) physical verification of installation against the design and BS 5839-1:2017; (3) sample functional testing; (4) issue of a verification report listing compliance status and any non-conformities.`,
  design_only: `WORKS TYPE: DESIGN ONLY
No installation works. Cover (1) site survey and design brief capture; (2) production of a BS 5839-1:2017 compliant design — zone plans, device schedules, cabling routes, cause-and-effect matrix; (3) issue of a Design Certificate per Clause 44 and Annex G; (4) handover pack for the installing contractor. Do not describe installation, commissioning or testing.`,
  certification: `WORKS TYPE: CERTIFICATION (RE-ISSUE / DOCUMENTATION)
Production of formal certification for an existing system where original paperwork is missing or outdated. Cover (1) site audit and verification of installed equipment; (2) functional sample testing where required; (3) production of the certificate (Commissioning, Modification or Acceptance as appropriate) per Annex G; (4) issue to the responsible person with logbook update.`,
};

const SYSTEM_PROMPT = `You are a senior UK fire alarm estimator at BHO Fire Ltd, writing the introduction and scope of works sections for a formal client quotation. You specialise in BS 5839-1:2017 compliant systems for commercial, hospitality, healthcare and public-sector buildings.

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

INTRODUCTION REQUIREMENTS — 2-3 sentences total.
- Open with: "BHO Fire Ltd is pleased to submit this quotation…"
- State the JOB TYPE EXPLICITLY in the first sentence (cause and effect testing /
  remedial works / annual servicing / new installation / system upgrade etc.).
- Cite the SPECIFIC BS 5839-1:2017 clause(s) most relevant to the job type and
  briefly explain in plain English what the clause requires. Use these defaults
  (do NOT invent clause numbers for job types outside this list — use the closest
  match):
    • Cause and effect testing  → Clause 39 (commissioning) and Clause 43
      (verification) — "require systematic activation of every input device to
      confirm that all programmed output responses operate correctly".
    • Reactive remedial works    → Clause 45 (inspection and servicing) and
      Clause 46 (non-routine attention) — "set out the requirements for
      rectifying faults to maintain system integrity".
    • Planned maintenance        → Clause 45 — "requires inspection and
      servicing at intervals not exceeding six months by a competent person".
    • New installation           → Section 2 (Design), Section 4 (Installation),
      Section 5 (Commissioning and handover) — together with BS 7671 for all
      mains-related wiring. Also state the Category (L1/L2/L3/L4/L5/M/P1/P2).
    • System upgrade             → Section 7 (Extensions and modifications) and
      Clause 44 (Modification Certificate).
    • System takeover            → Clause 45.4 (acceptance of an existing
      system by a new servicing organisation) and issue of an Acceptance
      Certificate to BS 5839-1:2017.
    • Commissioning only         → Clause 39 (commissioning) — the system was
      installed by others and BHO is verifying full functional compliance.
    • Verification / acceptance  → Clause 44 and Annex G certification process.
    • Design only                → Clause 44 (Design Certificate per Annex G).
- For 'upgrade', 'takeover', 'remedial', 'planned_maintenance', 'cause_and_effect',
  'acceptance_testing' or 'verification' works_type, mention the site survey and
  visit date if provided.
- For 'new_install' or 'design_only', refer to design intent rather than survey.
- Close with a one-sentence deliverable statement (e.g. "A detailed Cause and
  Effect Test Report will be issued on completion." or "A BS 5839-1:2017
  Commissioning Certificate will be issued to the responsible person.").
- Do NOT use the boilerplate phrase "supply, installation, commissioning and
  certification of a fire alarm and life safety system" unless the job is
  genuinely a NEW INSTALL.

SCOPE REQUIREMENTS — produce these four paragraphs in this order:

1. PANEL & ARCHITECTURE
   Describe the panel (manufacturer, model, loop count, location), addressable vs conventional, replacement strategy if applicable.

2. DETECTION STRATEGY
   Where smoke detection is used (circulation, accommodation, back-of-house), where heat detection is used (kitchens, plant, laundry — cite Clause 21.2 if accurate), MCP siting (Clause 20.2 — storey exits and escape routes).

3. AUDIBILITY & VAD STRATEGY
   Audibility requirements per Clause 16.2 — 65 dB(A) general, 75 dB(A) at bedheads in sleeping accommodation (only mention bedheads if occupancy is "sleeping" or "mixed"). VAD compliance with EN 54-23 where audible warning alone is insufficient.

4. COMMISSIONING & CERTIFICATION
   Commissioning, testing, BS 5839-1:2017 certification, documentation handover (zone plans, cause-and-effect schedule), and the 12-month defects-liability period from handover.

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

  const wt = normaliseWorksType(input.works_type);
  const guidance = WORKS_TYPE_GUIDANCE[wt] ?? "";
  const lineItemsBlock = input.line_items?.length
    ? `\n\nLINE ITEMS (the SOURCE OF TRUTH for scope — match prose to these, not to context fields):\n` +
      input.line_items.map((li, i) => `${i + 1}. ${li.description}${li.total != null ? ` — £${li.total}` : ""}`).join("\n")
    : "";
  const userMessage =
    `Write the introduction and scope of works for this fire alarm quotation.\n\n` +
    `${guidance}\n${lineItemsBlock}\n\n` +
    `INPUT (JSON):\n${JSON.stringify({ ...input, works_type: wt }, null, 2)}\n\n` +
    `Return minified, valid JSON only. Do not include markdown fences or commentary.`;


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
  let parsed: { introduction: string; scope: string[] };
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`Failed to parse AI output as JSON. Raw: ${raw.slice(0, 200)}…`); }

  if (typeof parsed.introduction !== "string" || !Array.isArray(parsed.scope)) throw new Error("AI output missing required fields");
  if (parsed.scope.length < 3 || parsed.scope.length > 5) throw new Error(`Expected 3-5 scope paragraphs, got ${parsed.scope.length}`);

  return { output: parsed, usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0, model: data.model ?? "google/gemini-2.5-flash" } };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

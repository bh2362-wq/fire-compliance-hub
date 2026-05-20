/**
 * generate-quote-scope-costs edge function
 *
 * Phase 2 of the quote refactor: takes a normalised list of work items
 * (from FireLogbook defects, email scanner output, or manual entry) and
 * runs two Claude Sonnet 4.6 calls:
 *
 *   1. Scope generation — markdown narrative for the client
 *   2. Cost estimation  — line items split into labour / materials / extras
 *
 * The cost call receives the scope output as additional context. Both
 * outputs are returned together; the frontend hook surfaces them for the
 * engineer to review and edit before persisting the quote.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WorkItem {
  description: string;
  location?: string | null;
  urgency?: string | null; // "Cat1-Immediate" | "Cat2-Urgent" | "Cat3-Advisory" | freeform
  source: string;          // "defect" | "email" | "manual"
}

interface RequestBody {
  site_name: string;
  building_type?: string | null;
  site_postcode?: string | null;
  work_items: WorkItem[];
}

interface CostLine {
  description: string;
  quantity: number;
  unit_price: number;
  notes: string;
  regulation_reference?: string;
}

interface CostEstimate {
  labour: CostLine[];
  materials: CostLine[];
  extras: CostLine[];
}

// ── Prompts ────────────────────────────────────────────────────────────────────

const SCOPE_SYSTEM = `You are a fire alarm engineering scope-of-works author for BHO Fire Ltd, a UK fire alarm contractor based in Kent.

Given a list of work items (defects, requests, or scope inputs), write a professional scope-of-works narrative that goes to the client as part of a remedial-works quotation.

Output: A markdown numbered list. One numbered item per logical scope of work.

Conventions:
- Each item begins with a short, declarative trade-language heading, followed by a 1-2 sentence technical narrative describing WHAT will be done and WHY.
- Cite the specific BS 5839-1:2025 clause where relevant (e.g. "in accordance with BS 5839-1:2025 Cl. 25.2(d)"). Do NOT invent clause numbers — omit if uncertain.
- Group related work items into a single numbered point where it reads more naturally.
- Use UK English. Use the active voice.
- Be specific and technical. This represents BHO's professional standing to the client.
- Do NOT include prices, timelines, or commercial terms. Scope only.
- Do NOT preface the list with a heading or summary paragraph. Start directly with \`1. ...\`.
- Urgency labels (Cat 1 / Cat 2 / Cat 3) are provided as context to inform tone — do NOT print the labels in the output. A Cat 1 item should read as immediate-action language; a Cat 3 item can be framed as recommended improvement.

If a work item is ambiguous, write the scope conservatively (describe investigation + remediation as separate phases if needed) and flag the assumption parenthetically at the end of that item.`;

const COST_SYSTEM = `You are a fire alarm engineering quotation cost estimator for BHO Fire Ltd, a UK fire alarm contractor based in Kent (Sittingbourne ME10 3TB).

Given a scope of works AND the underlying work items, return a FIRST-PASS commercial estimate in three buckets via the build_cost_estimate tool.

CRITICAL RULE — the line item "description" field:
EVERY line item description MUST be a SHORT commercial label, ABSOLUTE
MAXIMUM 10 WORDS. Think "what a finance person reads on an invoice" — a
category, not a narrative.

DO (these are correct line item descriptions):
  • "Site engineering — investigation, repair, retest"
  • "Yuasa 12V 17Ah replacement battery"
  • "Vesda VLP aspirating detector unit"
  • "Honeywell Gent S-Quad smoke detector"
  • "Out-of-hours premium (Saturday working)"
  • "MEWP hire (3.5m, 1 day)"
  • "Congestion charge (London ULEZ)"
  • "Travel and fuel supplement"
  • "2 engineers × 1 day site visit"

DO NOT (these are SCOPE content, NOT line items):
  • "Two engineers for two days to investigate battery faults, earth
     fault on Zone 07.000, replace Vesda unit on 6th floor and conduct
     system retest in accordance with BS 5839-1:2025 Cl.45"
  • "Investigate and rectify open circuit wiring fault on contact input
     device A114, Zone 07.032 — check cable continuity, verify EOL
     resistor, repair or replace damaged cabling, test and commission"

Clause references, methodology, defect-by-defect explanation — all of that
belongs in the SCOPE output, not in line items. If you need to capture extra
context for a line item, put it in the "notes" field (which is internal).
The "description" itself is just the commercial label.

LABOUR — Holistic labour for the whole job, NOT per defect.
  - BHO's default is a 2-engineer team at £350/day base rate.
  - Output one line per discrete day or visit. Description format:
    "2 engineers × N days on-site" or "Half-day commissioning visit".
  - **ANY line representing engineer time, day rates, half-day visits,
    on-site labour, investigation work, fault-finding, or "N men × M days"
    MUST go in this `labour` array.** Never put engineering time in
    materials or extras — the routing depends on bucket placement.
  - Adjust team size / days if the scope clearly implies more (major
    install may need 4 engineers × 3 days; a single device swap can be ½ day).
  - Label commissioning or witness-test visits separately.

MATERIALS — Per-item or per-group material costs (qty × unit_price).
  - UK rates: simple devices £45–120, panels and loop modules £200–1200,
    cable sold per metre. Use realistic UK fire-alarm contractor pricing.
  - Group identical items into a single line where the scope groups them.
  - Description is the product type/name only — no fitting instructions.

EXTRAS — Job-specific surcharges and access costs.
  - ALWAYS include these three placeholder lines so the engineer can fill or
    delete (set quantity 1, unit_price 0, and note "Engineer to confirm
    based on site location"):
      • Travel / fuel supplement
      • Parking
      • Congestion charge (London ULEZ / CCZ)
    If the scope or site postcode clearly justifies a number, fill it in;
    otherwise leave at 0.
  - Add other extras the scope implies (scaffolding/MEWP/access equipment,
    out-of-hours premium, waste removal, certification fees, etc.).

For any line where you are genuinely uncertain on price, return 0 and put a
brief note explaining what would clarify it. The engineer reviews every line
before the quote is finalised — accurate categorisation matters more than
precision of price.

Do NOT duplicate scope text in descriptions — costs only. Use the "notes"
field for any extra context ("covers items 2 and 4 of scope").`;

const COST_TOOL = {
  name: "build_cost_estimate",
  description: "Return the cost estimate in three buckets: labour, materials, extras.",
  input_schema: {
    type: "object",
    properties: {
      labour: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            quantity:    { type: "number" },
            unit_price:  { type: "number" },
            notes:       { type: "string" },
          },
          required: ["description", "quantity", "unit_price", "notes"],
        },
      },
      materials: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description:           { type: "string" },
            quantity:              { type: "number" },
            unit_price:            { type: "number" },
            notes:                 { type: "string" },
            regulation_reference:  { type: "string" },
          },
          required: ["description", "quantity", "unit_price", "notes"],
        },
      },
      extras: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            quantity:    { type: "number" },
            unit_price:  { type: "number" },
            notes:       { type: "string" },
          },
          required: ["description", "quantity", "unit_price", "notes"],
        },
      },
    },
    required: ["labour", "materials", "extras"],
  },
};

// ── Formatting ────────────────────────────────────────────────────────────────

function formatWorkItems(items: WorkItem[]): string {
  return items
    .map((it, i) => {
      const urgency = it.urgency ? `[${it.urgency}] ` : "";
      const location = it.location ? ` — Location: ${it.location}` : "";
      const source = ` (source: ${it.source})`;
      return `${i + 1}. ${urgency}${it.description}${location}${source}`;
    })
    .join("\n");
}

function siteContextBlock(body: RequestBody): string {
  const parts: string[] = [`Site: ${body.site_name}`];
  if (body.building_type) parts.push(`Building context: ${body.building_type}`);
  if (body.site_postcode) parts.push(`Site postcode: ${body.site_postcode}`);
  return parts.join("\n");
}

// ── Anthropic ──────────────────────────────────────────────────────────────────

async function callClaudeText(apiKey: string, system: string, user: string, maxTokens = 2000): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Claude ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data.content?.find((b: { type: string }) => b.type === "text")?.text;
  if (!text || typeof text !== "string") {
    throw new Error("Claude returned no text content for scope generation");
  }
  return text.trim();
}

async function callClaudeTool(apiKey: string, system: string, user: string, tool: typeof COST_TOOL): Promise<CostEstimate> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Claude ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const data = await res.json();
  const toolUse = data.content?.find((b: { type: string; name?: string }) => b.type === "tool_use" && b.name === tool.name);
  if (!toolUse?.input) {
    throw new Error(`Claude did not return a ${tool.name} tool call`);
  }
  const input = toolUse.input as Partial<CostEstimate>;
  return {
    labour:    Array.isArray(input.labour)    ? input.labour    : [],
    materials: Array.isArray(input.materials) ? input.materials : [],
    extras:    Array.isArray(input.extras)    ? input.extras    : [],
  };
}

// ── Handler ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!body?.site_name || !Array.isArray(body.work_items) || body.work_items.length === 0) {
    return new Response(JSON.stringify({ error: "site_name and a non-empty work_items array are required" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const siteBlock = siteContextBlock(body);
    const itemsBlock = formatWorkItems(body.work_items);

    // 1. Scope generation
    const scopeUser = `${siteBlock}\n\nWork items:\n${itemsBlock}\n\nWrite the scope of works.`;
    const scope_content = await callClaudeText(apiKey, SCOPE_SYSTEM, scopeUser);

    // 2. Cost estimation (sees the scope output)
    const costUser = `${siteBlock}\n\nScope of works:\n${scope_content}\n\nUnderlying work items (for reference):\n${itemsBlock}\n\nEstimate the cost.`;
    const line_items = await callClaudeTool(apiKey, COST_SYSTEM, costUser, COST_TOOL);

    return new Response(
      JSON.stringify({ scope_content, line_items }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("generate-quote-scope-costs error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

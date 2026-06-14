/**
 * quote-from-site-inventory edge function
 *
 * "AI quote from inventory" feature asked for in chat:
 *   Engineer types something like "replace all detectors on Loop 1 and 2".
 *   We pull the site's device inventory, look up candidate prices from the
 *   three pricing tables (same set auto-quote-builder uses for email-driven
 *   quotes), and ask Claude to assemble a labour/materials/extras line-item
 *   set plus a numbered scope of works that ties to the prompt.
 *
 * Returns the SAME envelope shape as generate-quote-scope-costs
 * ({ scope_content, line_items }) so the existing client-side review UX
 * (AIDefectQuoteDialog editor — multi-select, drag-reorder, merge, per-row
 * Improve with AI) drops in with minimal extra wiring. Adds an
 * `interpretation` field so the engineer sees how the model parsed their
 * prompt before reviewing the items.
 *
 * Model: claude-sonnet-4-6 (matches the rest of the quote AI pipeline).
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RequestBody {
  site_id: string;
  prompt: string;            // natural-language ask: "Replace all detectors on Loop 1"
  site_name?: string | null; // optional override; otherwise read from sites.name
}

interface DeviceRow {
  id: string;
  device_type: string;
  loop: string;
  address: string;
  location: string | null;
  status: string | null;
}

interface PriceCandidate {
  description: string;
  unit_cost: number;
  source: "huvo" | "catalog" | "supplier";
  part_number: string | null;
  supplier: string | null;
}

interface CostLine {
  description: string;
  quantity: number;
  unit_price: number;
  notes: string;
  regulation_reference?: string;
}

interface AIResult {
  interpretation: string;
  scope_content: string;
  line_items: {
    labour: CostLine[];
    materials: CostLine[];
    extras: CostLine[];
  };
  labour_estimate: { engineers: number; days: number } | null;
}

// ── Pricing lookup — same set auto-quote-builder uses ─────────────────────────

async function lookupPricesForType(
  sb: SupabaseClient,
  deviceType: string,
): Promise<PriceCandidate[]> {
  const q = deviceType.toLowerCase();
  const [h, c, s] = await Promise.all([
    sb.from("price_list_items")
      .select("part_number,description,short_name,unit_cost,manufacturer")
      .or(`description.ilike.%${q}%,short_name.ilike.%${q}%`)
      .eq("is_active", true)
      .limit(5),
    sb.from("materials_catalog")
      .select("part_number,description,retail_price,supplier_name")
      .ilike("description", `%${q}%`)
      .limit(5),
    sb.from("supplier_products")
      .select("product_code,description,trade_price,supplier_name")
      .ilike("description", `%${q}%`)
      .limit(5),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: PriceCandidate[] = [];
  for (const r of ((h.data ?? []) as Array<Record<string, unknown>>)) {
    rows.push({
      description: String(r.description ?? r.short_name ?? ""),
      unit_cost: Number(r.unit_cost) || 0,
      source: "huvo",
      part_number: (r.part_number as string) ?? null,
      supplier: (r.manufacturer as string) ?? "Huvo",
    });
  }
  for (const r of ((c.data ?? []) as Array<Record<string, unknown>>)) {
    rows.push({
      description: String(r.description ?? ""),
      unit_cost: Number(r.retail_price) || 0,
      source: "catalog",
      part_number: (r.part_number as string) ?? null,
      supplier: (r.supplier_name as string) ?? null,
    });
  }
  for (const r of ((s.data ?? []) as Array<Record<string, unknown>>)) {
    rows.push({
      description: String(r.description ?? ""),
      unit_cost: Number(r.trade_price) || 0,
      source: "supplier",
      part_number: (r.product_code as string) ?? null,
      supplier: (r.supplier_name as string) ?? null,
    });
  }
  // Confidence-rank by shared word count with the device_type term (mirrors
  // auto-quote-builder's heuristic). Cap at 3 per type to keep the prompt
  // tight — Claude picks one and we keep the rest as TBC fallbacks.
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  const scored = rows
    .map((p) => {
      const desc = (p.description ?? "").toLowerCase();
      const matches = words.filter((w) => desc.includes(w)).length;
      return { ...p, confidence: words.length > 0 ? matches / words.length : 0 };
    })
    .sort((a, b) => b.confidence - a.confidence);
  return scored.slice(0, 3);
}

// ── Claude call ──────────────────────────────────────────────────────────────

async function callClaudeJson(
  apiKey: string,
  system: string,
  user: string,
): Promise<AIResult> {
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3500,
      system,
      messages: [{ role: "user", content: user }],
    }),
    // PDF-render path budget — fail fast rather than hold the engineer.
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${errText.slice(0, 500)}`);
  }
  const data = await resp.json();
  const raw = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("")
    .trim();
  // Tolerate ```json fences even though the prompt forbids them.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  return {
    interpretation: typeof parsed.interpretation === "string" ? parsed.interpretation : "",
    scope_content: typeof parsed.scope_content === "string" ? parsed.scope_content : "",
    line_items: {
      labour:    Array.isArray(parsed.line_items?.labour)    ? parsed.line_items.labour    : [],
      materials: Array.isArray(parsed.line_items?.materials) ? parsed.line_items.materials : [],
      extras:    Array.isArray(parsed.line_items?.extras)    ? parsed.line_items.extras    : [],
    },
    labour_estimate: parsed.labour_estimate && typeof parsed.labour_estimate === "object"
      ? {
        engineers: Number(parsed.labour_estimate.engineers) || 1,
        days:      Number(parsed.labour_estimate.days)      || 1,
      }
      : null,
  };
}

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior UK fire-safety estimator preparing a BHO Fire Ltd quotation
from a site's device inventory. The engineer gives you a natural-language ask
("replace all detectors on Loop 1", "swap every sounder on the 2nd floor", etc.)
together with the FULL device inventory and candidate prices per device type.

Your job:

1. INTERPRET the ask — narrow the device list to exactly the devices in scope.
   When the ask is ambiguous ("detectors" — could be optical / heat / multi),
   include EVERY device_type that plausibly matches and let the engineer
   narrow on review. Surface the interpretation back in the response.

2. BUILD line items grouped by device_type + loop. Each row is one device_type
   on one loop, with the count from the inventory and a unit price chosen
   from the price candidates supplied. Prefer the highest-confidence
   candidate from the "huvo" source, then "catalog", then "supplier".
   When no price candidate exists for a type, set unit_price=0 and put
   "Engineer to confirm — no matching price in pricing tables" in notes.

3. ADD a single labour line — "No. {N} qualified fire-safety engineers for
   {D} day(s) on-site". Estimate the days at 25 devices per engineer per
   day for swap work; round up to whole days. Engineers default to 2 for
   safety / efficiency unless the count is < 25 (then 1).

4. WRITE a scope_content markdown numbered list. ONE numbered item per loop
   (or per discrete area when the ask scopes by location). Each item
   describes what will be done at that loop in a single sentence or two —
   no per-device level detail.

NUMBER FORMATTING (house style — non-negotiable):
- Never spell counts as words. "two engineers" must be "No. 2 engineers".
- Counts of devices: "No. 47 optical detectors", "No. 12 manual call points".
- Durations: "1 day", "2 weeks" (no "No." prefix on durations).

OUTPUT — strict JSON only, no markdown fences, no preamble:
{
  "interpretation": "<1-sentence summary of what the engineer asked for>",
  "scope_content": "1. <loop 1 work>\\n2. <loop 2 work>",
  "line_items": {
    "labour":    [{ "description": "No. 2 engineers — 2 days on-site for device swap works", "quantity": 1, "unit_price": <hourly * hours * engineers>, "notes": "..." }],
    "materials": [{ "description": "No. 47 Apollo XP95 optical detectors — Loop 1", "quantity": 47, "unit_price": 32.50, "notes": "" }],
    "extras":    [{ "description": "Access equipment — step ladders / podiums", "quantity": 1, "unit_price": 0, "notes": "Engineer to confirm" }]
  },
  "labour_estimate": { "engineers": 2, "days": 2 }
}`;

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!body.site_id || typeof body.site_id !== "string") {
    return new Response(JSON.stringify({ error: "site_id is required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!body.prompt || typeof body.prompt !== "string" || body.prompt.trim().length < 3) {
    return new Response(JSON.stringify({ error: "prompt is required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Pull the device inventory for this site. Filtering by the prompt's
    //    explicit loop hints saves tokens; ambiguous asks ("all detectors")
    //    still ship the whole inventory and let the model decide.
    const loopHints = Array.from(body.prompt.matchAll(/\bloop\s*(\d{1,3})\b/gi))
      .map((m) => m[1])
      .filter((v, i, a) => a.indexOf(v) === i);
    let devicesQ = sb
      .from("devices")
      .select("id, device_type, loop, address, location, status")
      .eq("site_id", body.site_id);
    if (loopHints.length > 0) devicesQ = devicesQ.in("loop", loopHints);
    const { data: devices, error: devicesErr } = await devicesQ.limit(2000);
    if (devicesErr) throw new Error(`Devices query failed: ${devicesErr.message}`);
    const deviceRows = (devices ?? []) as DeviceRow[];
    if (deviceRows.length === 0) {
      return new Response(JSON.stringify({
        error: loopHints.length > 0
          ? `No devices found on Loop ${loopHints.join(" / ")} for this site.`
          : "No devices found in this site's inventory.",
      }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // 2. Group by device_type, count, then look up prices for the unique
    //    types in bulk. Keeps the prompt small and the lookup queries
    //    proportional to the type variety, not the device count.
    const counts = new Map<string, number>();
    const loopsByType = new Map<string, Set<string>>();
    for (const d of deviceRows) {
      counts.set(d.device_type, (counts.get(d.device_type) ?? 0) + 1);
      const set = loopsByType.get(d.device_type) ?? new Set<string>();
      set.add(d.loop);
      loopsByType.set(d.device_type, set);
    }
    const uniqueTypes = Array.from(counts.keys());
    const priceMap = new Map<string, PriceCandidate[]>();
    await Promise.all(uniqueTypes.map(async (t) => {
      priceMap.set(t, await lookupPricesForType(sb, t));
    }));

    // 3. Resolve site name for the scope context.
    let siteName = body.site_name?.trim() ?? "";
    if (!siteName) {
      const { data: s } = await sb.from("sites").select("name").eq("id", body.site_id).maybeSingle();
      siteName = ((s as { name?: string } | null)?.name) ?? "";
    }

    // 4. Build the user message — structured inventory + structured prices.
    const inventoryBlock = uniqueTypes.map((t) => {
      const loops = Array.from(loopsByType.get(t) ?? []).sort().join(", ");
      return `- ${t}: count=${counts.get(t)}, loops=[${loops}]`;
    }).join("\n");
    const pricingBlock = uniqueTypes.map((t) => {
      const cands = priceMap.get(t) ?? [];
      if (cands.length === 0) return `- ${t}: (no matching price candidates)`;
      return `- ${t}:\n` + cands.map((c) =>
        `    * "${c.description}" — £${c.unit_cost.toFixed(2)} (${c.source}${c.supplier ? `, ${c.supplier}` : ""}${c.part_number ? `, ${c.part_number}` : ""})`
      ).join("\n");
    }).join("\n");

    const userMsg = [
      `Site: ${siteName || "(unknown)"}`,
      `Engineer's ask: ${body.prompt.trim()}`,
      loopHints.length > 0 ? `Pre-filtered to loop(s): ${loopHints.join(", ")}` : "",
      "",
      `Device inventory (already filtered if loop hints were present):`,
      inventoryBlock,
      "",
      `Price candidates per device type:`,
      pricingBlock,
      "",
      `Produce the JSON object specified in the system prompt.`,
    ].filter(Boolean).join("\n");

    const result = await callClaudeJson(apiKey, SYSTEM_PROMPT, userMsg);

    return new Response(
      JSON.stringify({
        interpretation: result.interpretation,
        scope_content: result.scope_content,
        line_items: result.line_items,
        labour_estimate: result.labour_estimate,
        device_count: deviceRows.length,
        unique_types: uniqueTypes.length,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[quote-from-site-inventory] failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

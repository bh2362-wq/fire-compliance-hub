/**
 * lookup-device-price edge function
 *
 * Manual lookup fallback for InventoryQuoteDialog's TBC rows. Engineer
 * types a search query (or we pass the device_type + line description),
 * we hunt across the same three pricing tables auto-quote-builder /
 * quote-from-site-inventory use, plus an optional online search via
 * Claude's server-side web_search tool.
 *
 *   Internal results — broad ILIKE across description / part_number /
 *                      manufacturer / category in all three tables,
 *                      deduped, ranked.
 *   Online results   — web_search via Claude. Lower-confidence: surfaces
 *                      candidate parts + indicative prices the engineer
 *                      can verify before applying.
 *
 * Returns { internal: [...], online: [...] } so the dialog can render
 * a two-column comparison.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

interface RequestBody {
  query: string;
  manufacturer_hint?: string | null; // sites.panel_make_model token, e.g. "Gent"
  include_online?: boolean;          // default true
  max_internal?: number;             // default 20
}

interface InternalResult {
  description: string;
  unit_cost: number;
  source: "huvo" | "catalog" | "supplier";
  part_number: string | null;
  supplier: string | null;
  category: string | null;
  confidence: number;
}

interface OnlineResult {
  description: string;
  indicative_price_gbp: number | null;
  supplier: string | null;
  part_number: string | null;
  source_url: string | null;
  notes: string | null;
}

// Same fire-alarm abbreviation dictionary as quote-from-site-inventory.
// Engineers type "MCP" or "VAD"; pricing tables describe products in
// long form. Without expansion, ILIKE matches miss everything.
const DEVICE_SYNONYMS: Record<string, string[]> = {
  op: ["optical", "smoke"], opt: ["optical", "smoke"],
  optical: ["optical", "smoke"], smoke: ["smoke", "optical"],
  heat: ["heat", "thermal"], ht: ["heat", "thermal"],
  thermal: ["thermal", "heat"],
  multi: ["multi-criteria", "multi-sensor", "multicriteria"],
  mc: ["multi-criteria", "multi-sensor"],
  mcp: ["manual", "call", "point", "break", "glass"],
  cp: ["call", "point", "manual"],
  break: ["break", "glass"], glass: ["break", "glass", "call", "point"],
  call: ["call", "point", "manual"],
  det: ["detector"], detector: ["detector"],
  sounder: ["sounder", "alarm"], sdr: ["sounder"],
  vad: ["visual", "alarm", "device", "beacon"],
  beacon: ["beacon", "visual", "alarm"],
  visual: ["visual", "alarm", "device", "beacon"],
  beam: ["beam", "detector"],
  asp: ["aspirating", "asd"], asd: ["aspirating", "asd"],
  duct: ["duct", "detector"],
  io: ["input", "output", "module", "i/o"],
  "i/o": ["input", "output", "module"],
  zone: ["zone", "monitor", "module"],
  interface: ["interface", "module", "relay"],
  isolator: ["isolator", "loop"],
  base: ["base", "sounder"],
  panel: ["panel", "control"],
  repeater: ["repeater"],
};

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9/\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1);
}

function expandQuery(q: string): string[] {
  const base = tokenize(q);
  const expanded = new Set<string>(base);
  for (const t of base) {
    const synonyms = DEVICE_SYNONYMS[t];
    if (synonyms) for (const w of synonyms) expanded.add(w);
  }
  return Array.from(expanded);
}

async function lookupInternal(
  sb: SupabaseClient,
  query: string,
  manufacturerHint: string | null,
  maxResults: number,
): Promise<InternalResult[]> {
  const tokens = expandQuery(query);
  if (tokens.length === 0) return [];
  const orClause = (cols: string[]) =>
    tokens.flatMap((t) => cols.map((c) => `${c}.ilike.%${t}%`)).join(",");
  const [h, c, s] = await Promise.all([
    sb.from("price_list_items")
      .select("part_number,description,short_name,unit_cost,manufacturer,category")
      .or(orClause(["description", "short_name", "part_number", "manufacturer", "category"]))
      .eq("is_active", true)
      .limit(50),
    sb.from("materials_catalog")
      .select("part_number,description,retail_price,supplier_name,category")
      .or(orClause(["description", "part_number", "category"]))
      .limit(50),
    sb.from("supplier_products")
      .select("product_code,description,trade_price,supplier_name,category")
      .or(orClause(["description", "product_code", "category"]))
      .limit(50),
  ]);
  const rows: InternalResult[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of ((h.data ?? []) as Array<Record<string, unknown>>)) {
    rows.push({
      description: String(r.description ?? r.short_name ?? ""),
      unit_cost: Number(r.unit_cost) || 0,
      source: "huvo",
      part_number: (r.part_number as string) ?? null,
      supplier: (r.manufacturer as string) ?? "Huvo",
      category: (r.category as string) ?? null,
      confidence: 0,
    });
  }
  for (const r of ((c.data ?? []) as Array<Record<string, unknown>>)) {
    rows.push({
      description: String(r.description ?? ""),
      unit_cost: Number(r.retail_price) || 0,
      source: "catalog",
      part_number: (r.part_number as string) ?? null,
      supplier: (r.supplier_name as string) ?? null,
      category: (r.category as string) ?? null,
      confidence: 0,
    });
  }
  for (const r of ((s.data ?? []) as Array<Record<string, unknown>>)) {
    rows.push({
      description: String(r.description ?? ""),
      unit_cost: Number(r.trade_price) || 0,
      source: "supplier",
      part_number: (r.product_code as string) ?? null,
      supplier: (r.supplier_name as string) ?? null,
      category: (r.category as string) ?? null,
      confidence: 0,
    });
  }
  // Score and de-dup.
  const manuHint = manufacturerHint?.toLowerCase().split(/\s+/)[0] ?? null;
  const scored = rows.map((p) => {
    const haystack = `${p.description ?? ""} ${p.supplier ?? ""} ${p.part_number ?? ""} ${p.category ?? ""}`.toLowerCase();
    const overlap = tokens.filter((t) => haystack.includes(t)).length / Math.max(1, tokens.length);
    const manuBonus = manuHint && (p.supplier ?? "").toLowerCase().includes(manuHint) ? 0.25 : 0;
    return { ...p, confidence: Math.min(1, overlap + manuBonus) };
  });
  const seen = new Set<string>();
  const deduped = scored.filter((p) => {
    const key = `${(p.part_number ?? "").toLowerCase()}|${(p.description ?? "").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => b.confidence - a.confidence);
  return deduped.slice(0, maxResults);
}

// Online search via Claude's server-side web_search tool. Asks the model
// to return strict JSON of candidate products + indicative prices. Tool
// version locked to the GA build the rest of the project standardised on.
async function lookupOnline(
  apiKey: string,
  query: string,
  manufacturerHint: string | null,
): Promise<OnlineResult[]> {
  const userMsg =
    `Search the open web for current UK trade prices for: "${query.trim()}"` +
    (manufacturerHint ? ` (favour ${manufacturerHint} products if compatible)` : "") +
    `. Look at UK fire-safety wholesalers (FSE Services, FFE, Discount Fire, AFD, Connections Fire Solutions, Cooke & Mason). Return STRICT JSON only — no markdown fences, no preamble:
{
  "results": [
    {
      "description": "<product name>",
      "indicative_price_gbp": <number, ex-VAT>,
      "supplier": "<supplier name or null>",
      "part_number": "<sku or null>",
      "source_url": "<full URL to the product page or null>",
      "notes": "<short note: e.g. 'lead-time 2-3 days', 'requires base', or null>"
    }
  ]
}
Cap at 6 results. Prices are indicative — flag any that look stale or vary widely across sources in 'notes'.`;
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: userMsg }],
    }),
    // Online lookup is fundamentally slower than internal — give it
    // headroom but still cap so a single bad query can't hold the
    // engineer for a minute.
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic web_search ${resp.status}: ${errText.slice(0, 500)}`);
  }
  const data = await resp.json();
  const raw = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("")
    .trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.results)) return [];
    return parsed.results
      .filter((r: unknown): r is Record<string, unknown> => typeof r === "object" && r !== null)
      .map((r: Record<string, unknown>): OnlineResult => ({
        description: typeof r.description === "string" ? r.description : "",
        indicative_price_gbp: typeof r.indicative_price_gbp === "number" ? r.indicative_price_gbp : null,
        supplier: typeof r.supplier === "string" ? r.supplier : null,
        part_number: typeof r.part_number === "string" ? r.part_number : null,
        source_url: typeof r.source_url === "string" ? r.source_url : null,
        notes: typeof r.notes === "string" ? r.notes : null,
      }))
      .filter((r: OnlineResult) => r.description.trim().length > 0)
      .slice(0, 6);
  } catch {
    // Bad JSON from the model — return empty rather than fail the
    // whole request. Engineer sees "no online results" toast and
    // can refine the query.
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try { body = await req.json() as RequestBody; }
  catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (!body.query || typeof body.query !== "string" || body.query.trim().length < 2) {
    return new Response(JSON.stringify({ error: "query is required (min 2 chars)" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Run both searches in parallel — internal is fast, online is slow
  // (5-30s typical). Don't block the internal results on the online
  // call when the caller opted out.
  const includeOnline = body.include_online !== false;
  const maxInternal = Math.max(1, Math.min(50, body.max_internal ?? 20));
  const internalP = lookupInternal(sb, body.query, body.manufacturer_hint ?? null, maxInternal);
  const onlineP = includeOnline
    ? lookupOnline(apiKey, body.query, body.manufacturer_hint ?? null).catch((err) => {
        console.warn("[lookup-device-price] online lookup failed:", err.message);
        return [] as OnlineResult[];
      })
    : Promise.resolve([] as OnlineResult[]);

  try {
    const [internal, online] = await Promise.all([internalP, onlineP]);
    return new Response(
      JSON.stringify({ internal, online, online_included: includeOnline }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[lookup-device-price] failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

// poll-contracts-finder — pulls OPEN fire-safety tenders from
// Contracts Finder into public.tenders. Dedups by (source, source_id).
//
// Distinct from contracts-finder-ingest, which ingests AWARDED notices
// into the cost_intelligence.market_benchmarks schema for pricing data.
// This one feeds the sales pipeline.
//
// Data: Contracts Finder API v2, Crown copyright, OGL v3.
// https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CF_ENDPOINT = "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json";
const FIRE_CPV = "31625000,31625100,31625200,45312100,50413200,50711000";

const FIRE_KEYWORDS = /\b(fire alarm|fire detection|fire system|smoke detect|fire safety|fire risk|fire compartment|fire door|fire panel|fire stop|sprinkler|wet riser|dry riser|emergency light|emergency lighting|aspirating|\basd\b|voice alarm|voice evacuation|bs ?5839(?: ?l[1-5])?|bs ?5266|gent vigilon|gent compact|notifier|kentec|advanced mx|hochiki|apollo)\b/i;
const EXCLUSION_KEYWORDS = /\b(it support|software licence|software license|fortinet|cyber|hardware refresh|laptop|server|cloud hosting|\btree\b|landscap|grounds maint|catering|cleaning|histopath|laborator|locum|recruit|legal services|consultancy services|training course|stationery|furniture|vehicle|transport|taxi|coach|fleet|legionella|nurse|midwife)\b/i;

function isRelevant(title: string, description: string): boolean {
  const s = `${title ?? ""} ${description ?? ""}`;
  if (EXCLUSION_KEYWORDS.test(s)) return false;
  return FIRE_KEYWORDS.test(s);
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'",
  "&lt;": "<", "&gt;": ">", "&nbsp;": " ",
};
function decodeEntities(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/&(?:amp|quot|#39|apos|lt|gt|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const WINDOW_DAYS = Number(Deno.env.get("TENDER_POLL_WINDOW_DAYS") ?? "60");

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = new Date();
  const fromD = new Date(today);
  fromD.setUTCDate(fromD.getUTCDate() - WINDOW_DAYS);

  let inserted = 0;
  let relevance_skipped = 0;
  let duplicate_skipped = 0;
  let fetched = 0;

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30_000);

    // Contracts Finder API v2: query OPEN notices (currently being procured)
    // with fire-safety CPV codes, within the published-date window.
    // User-Agent is required — CF started returning 403 to anonymous /
    // Deno-default UAs in mid-2026. Identify the app + a contact URL.
    const cfRes = await fetch(CF_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "fire-compliance-hub/1.0 (+https://github.com/bh2362-wq/fire-compliance-hub)",
      },
      body: JSON.stringify({
        searchCriteria: {
          types: ["Contract"],
          statuses: ["Open"],
          publishedFrom: new Date(toIsoDate(fromD)).toISOString(),
          publishedTo: new Date(toIsoDate(today) + "T23:59:59Z").toISOString(),
          cpvCodes: FIRE_CPV,
          valueFrom: 5000,
          valueTo: 10_000_000,
        },
        size: 200,
      }),
      signal: ac.signal,
    }).finally(() => clearTimeout(timer));

    if (!cfRes.ok) {
      const body = await cfRes.text().catch(() => "");
      throw new Error(`Contracts Finder ${cfRes.status}: ${body.slice(0, 300)}`);
    }

    const payload = await cfRes.json();
    const notices: Array<{ item?: Record<string, unknown> }> =
      Array.isArray(payload?.noticeList) ? payload.noticeList : [];
    fetched = notices.length;

    // Collect all source_ids from this batch so we can dedup in one query
    // rather than N round trips.
    const candidates: Array<{
      source_id: string;
      title: string;
      buyer_org: string | null;
      description: string | null;
      url: string;
      value_min: number | null;
      value_max: number | null;
      region: string | null;
      published_at: string | null;
      deadline_at: string | null;
    }> = [];

    for (const n of notices) {
      const item = (n?.item ?? {}) as Record<string, unknown>;
      const ocid = item.id as string | undefined;
      if (!ocid) { relevance_skipped++; continue; }

      const title = decodeEntities(item.title as string | undefined);
      const description = decodeEntities(item.description as string | undefined);

      if (!isRelevant(title, description)) { relevance_skipped++; continue; }

      const buyer = decodeEntities(item.organisationName as string | undefined);
      const valueMin = Number(item.valueLow ?? 0) || null;
      const valueMax = Number(item.valueHigh ?? item.estimatedValue ?? 0) || null;
      const publishedAt = item.publishedDate ? new Date(String(item.publishedDate)).toISOString() : null;
      const deadlineAt = item.deadlineDate ? new Date(String(item.deadlineDate)).toISOString() : null;
      const region = (item.region as string | undefined) ?? null;

      candidates.push({
        source_id: ocid,
        title: title || "Untitled tender",
        buyer_org: buyer || null,
        description: description ? description.slice(0, 4000) : null,
        url: `https://www.contractsfinder.service.gov.uk/Notice/${ocid}`,
        value_min: valueMin,
        value_max: valueMax,
        region,
        published_at: publishedAt,
        deadline_at: deadlineAt,
      });
    }

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ inserted: 0, relevance_skipped, duplicate_skipped, fetched }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // One round trip to find which source_ids we already have.
    const { data: existing } = await supabase
      .from("tenders")
      .select("source_id")
      .eq("source", "contracts_finder")
      .in("source_id", candidates.map((c) => c.source_id));

    const seen = new Set((existing ?? []).map((r: { source_id: string }) => r.source_id));
    const toInsert = candidates
      .filter((c) => !seen.has(c.source_id))
      .map((c) => ({
        source: "contracts_finder",
        source_id: c.source_id,
        title: c.title,
        buyer_org: c.buyer_org,
        description: c.description,
        url: c.url,
        value_min: c.value_min,
        value_max: c.value_max,
        currency: "GBP",
        region: c.region,
        published_at: c.published_at,
        deadline_at: c.deadline_at,
        status: "discovered",
      }));

    duplicate_skipped = candidates.length - toInsert.length;

    if (toInsert.length > 0) {
      const { error: insErr, count } = await supabase
        .from("tenders")
        .insert(toInsert, { count: "exact" });
      if (insErr) throw insErr;
      inserted = count ?? toInsert.length;
    }

    return new Response(JSON.stringify({ inserted, relevance_skipped, duplicate_skipped, fetched }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[poll-contracts-finder] failed", msg);
    return new Response(JSON.stringify({ error: msg, inserted, relevance_skipped, duplicate_skipped, fetched }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

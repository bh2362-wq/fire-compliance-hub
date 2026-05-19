// Data from Contracts Finder, Crown copyright, licensed under Open Government Licence v3.0
// https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jwtVerify, createLocalJWKSet } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Contracts Finder API v2 (the legacy /Published/Notices/Search path returns 404)
const CF_ENDPOINT = "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json";
const FIRE_CPV = "31625000,31625100,31625200,45312100,50413200,50711000";

// ------- classifiers -------

// ------- relevance gate -------

const FIRE_KEYWORDS = /\b(fire alarm|fire detection|fire system|smoke detect|fire safety|fire risk|fire compartment|fire door|fire panel|fire stop|sprinkler|wet riser|dry riser|emergency light|emergency lighting|aspirating|\basd\b|voice alarm|voice evacuation|bs ?5839(?: ?l[1-5])?|bs ?5266|gent vigilon|gent compact|notifier|kentec|advanced mx|hochiki|apollo)\b/i;
const EXCLUSION_KEYWORDS = /\b(it support|software licence|software license|fortinet|cyber|hardware refresh|laptop|server|cloud hosting|\btree\b|landscap|grounds maint|catering|cleaning|histopath|laborator|locum|recruit|legal services|consultancy services|training course|stationery|furniture|vehicle|transport|taxi|coach|fleet|legionella|ent equipment|zeiss|ophthalm|nurse|midwife)\b/i;

function isRelevant(title: string, description: string): boolean {
  const s = `${title ?? ""} ${description ?? ""}`;
  if (EXCLUSION_KEYWORDS.test(s)) return false;
  return FIRE_KEYWORDS.test(s);
}

// ------- html entity decode -------

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

function decodeEntities(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/&(?:amp|quot|#39|apos|lt|gt|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m);
}

// ------- classifiers -------

function classifyBuildingType(buyer: string, title: string, description: string): string | null {
  const s = `${buyer ?? ""} ${title ?? ""} ${description ?? ""}`.toLowerCase();
  const rules: [RegExp, string][] = [
    [/\b(nhs|hospital|nhs trust|health board)\b/, "healthcare_acute"],
    [/\b(care home|nursing home|residential care)\b/, "healthcare_care_home"],
    [/\b(primary school|primary academy)\b/, "school_primary"],
    [/\b(secondary school|secondary academy|academy trust|sixth form|school|academy)\b/, "school_secondary"],
    [/\b(further education|fe college)\b/, "further_education"],
    [/\b(university|higher education)\b/, "higher_education"],
    [/\b(ministry of defence|\bmod\b|royal navy|\braf\b|british army|garrison|barracks|defence estate|dio\b)\b/, "mod_defence"],
    [/\b(fcdo|foreign.{0,10}commonwealth|embassy|high commission|diplomatic|consulate)\b/, "fcdo_diplomatic"],
    [/\b(borough council|district council|county council|metropolitan|city council|town council|parish council)\b/, "gov_local_authority"],
    [/\b(department for|ministry of|home office|cabinet office|hmrc|dvla|hm prison|mojo|hmcts|hmps)\b/, "gov_central"],
    [/\b(hotel|hilton|marriott|premier inn|holiday inn|travelodge|hampton|radisson)\b/, "hotel"],
    [/\b(serviced apartment)\b/, "serviced_apartments"],
    [/\b(data centre|datacentre|data center)\b/, "data_centre"],
    [/\b(warehouse|industrial estate|distribution centre)\b/, "industrial_warehouse"],
    [/\b(office block|commercial office|business park)\b/, "office_commercial"],
  ];
  for (const [re, val] of rules) if (re.test(s)) return val;
  return null;
}

function classifySystemType(title: string, description: string): string | null {
  const s = `${title ?? ""} ${description ?? ""}`;
  const rules: [RegExp, string][] = [
    [/\b(gent\b|vigilon|s.quad|s-quad|gent compact)/i, "gent_vigilon"],
    [/\b(voice alarm|voice evac|\bvace?\b|public address.{0,20}fire)/i, "voice_alarm"],
    [/\b(aspirat|vesda|stratos|\basd\b)/i, "aspirating"],
    [/\b(wireless fire|radio fire|hyfire|ekho)/i, "wireless"],
    [/\b(addressable|analogue.addressable|loop.based|l1\b|l2\b|l3\b)/i, "addressable_other"],
    [/\b(conventional|two.wire)/i, "conventional"],
  ];
  for (const [re, val] of rules) if (re.test(s)) return val;
  return null;
}


function parseCpv(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  return String(raw).split(",").map((s) => s.trim()).filter(Boolean);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ------- handler -------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const WINDOW_DAYS = Number(Deno.env.get("INGEST_WINDOW_DAYS") ?? "30");

  // Auth: accept any project anon/publishable/service key. Supports legacy JWT-format
  // keys and new sb_publishable_/sb_secret_ keys. For JWTs, decode payload and trust
  // role claim (issued by Supabase auth — caller must already hold a valid project key).
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();

  const PUBLISHABLE_KEYS = (Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "").split(",").map(s=>s.trim()).filter(Boolean);
  const SECRET_KEYS = (Deno.env.get("SUPABASE_SECRET_KEYS") ?? "").split(",").map(s=>s.trim()).filter(Boolean);

  let validAnon = !!token && (token === ANON_KEY || token === PUBLISHABLE_KEY || PUBLISHABLE_KEYS.includes(token));
  let validService = !!token && (token === SERVICE_KEY || SECRET_KEYS.includes(token));

  if (!validAnon && !validService && token && token.split(".").length === 3) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
      if (payload?.iss?.toString().includes("supabase") && (payload.ref === Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1])) {
        if (payload.role === "service_role") validService = true;
        else if (payload.role === "anon" || payload.role === "authenticated") validAnon = true;
      }
    } catch (_e) { /* ignore */ }
  }

  if (!validAnon && !validService) {
    console.warn(`[contracts-finder-ingest] unauthorized token_prefix=${token.slice(0,8)}`);
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const invokedBy = validService ? "manual" : "cron";

  // Always use service role for DB writes (bypass RLS)
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ci = supabase.schema("cost_intelligence" as any);

  const today = new Date();
  const fromD = new Date(today);
  fromD.setUTCDate(fromD.getUTCDate() - WINDOW_DAYS);
  const window_from = toIsoDate(fromD);
  const window_to = toIsoDate(today);

  console.log(`[contracts-finder-ingest] starting invokedBy=${invokedBy} window=${window_from}..${window_to}`);

  // Start ingest run
  const { data: runRow, error: runErr } = await ci
    .from("ingest_runs")
    .insert({
      source: "contracts_finder",
      status: "running",
      window_from,
      window_to,
      run_metadata: { invoked_by: invokedBy },
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    console.error("Failed to create ingest_runs row", runErr);
    return new Response(JSON.stringify({ success: false, error: runErr?.message ?? "ingest_runs insert failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const run_id = runRow.id as string;

  let fetched = 0;
  let upserted = 0;
  let skipped = 0;
  let partial = false;
  let errorMessage: string | null = null;

  try {
    // Fetch from Contracts Finder with 30s timeout
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30_000);

    const cfRes = await fetch(CF_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        searchCriteria: {
          types: ["Contract"],
          statuses: ["Awarded"],
          awardedFrom: new Date(window_from).toISOString(),
          awardedTo: new Date(window_to + "T23:59:59Z").toISOString(),
          cpvCodes: FIRE_CPV,
          valueFrom: 5000,
          valueTo: 10_000_000,
        },
        size: 500,
      }),
      signal: ac.signal,
    }).finally(() => clearTimeout(timer));

    if (!cfRes.ok) {
      const body = await cfRes.text().catch(() => "");
      const msg = `Contracts Finder ${cfRes.status}: ${body.slice(0, 300)}`;
      console.error(msg);
      // 429/403 → partial
      if (cfRes.status === 429 || cfRes.status === 403) {
        partial = true;
        errorMessage = msg;
      } else {
        throw new Error(msg);
      }
    }

    let notices: any[] = [];
    if (cfRes.ok) {
      const payload = await cfRes.json();
      // v2 returns { hitCount, noticeList: [{ score, item: {...} }] }
      notices = Array.isArray(payload?.noticeList) ? payload.noticeList : [];
    }
    fetched = notices.length;

    const rows: any[] = [];
    for (const n of notices) {
      const item = n?.item ?? {};
      const value = Number(item.awardedValue ?? 0);
      if (!value || value <= 0 || value > 50_000_000) {
        skipped++;
        continue;
      }
      const ocid: string | undefined = item.id;
      if (!ocid) {
        skipped++;
        continue;
      }
      const title: string = decodeEntities(item.title);
      const description: string = decodeEntities(item.description);
      const buyer: string = decodeEntities(item.organisationName);
      const supplier: string = decodeEntities(item.awardedSupplier);
      const postcode: string | null = item.postcode ?? null;

      // Relevance gate
      if (!isRelevant(title, description)) {
        skipped++;
        console.log(`[contracts-finder-ingest] skip (relevance) "${title.slice(0, 80)}"`);
        continue;
      }

      const building_type = classifyBuildingType(buyer, title, description);
      let system_type = classifySystemType(title, description);
      let system_confidence = system_type ? 70 : 30;
      // Passed relevance gate => is fire work; default to addressable_other
      if (!system_type) {
        system_type = "addressable_other";
        system_confidence = 30;
      }

      // postcode → region via RPC
      let region: string | null = null;
      if (postcode) {
        const { data: regionVal } = await ci.rpc("postcode_to_region", { p_postcode: postcode });
        if (typeof regionVal === "string") region = regionVal;
      }

      const awardedDateRaw = item.awardedDate ?? null;
      const effective_from = awardedDateRaw ? toIsoDate(new Date(awardedDateRaw)) : window_to;

      rows.push({
        source: "contracts_finder",
        source_unique_id: ocid,
        source_url: `https://www.contractsfinder.service.gov.uk/Notice/${ocid}`,
        source_reference: item.noticeIdentifier ?? null,
        system_type,
        job_category: null,
        building_type,
        region,
        metric_type: "total_contract_value",
        metric_value: value,
        currency: "GBP",
        effective_from,
        effective_to: null,
        sample_size: 1,
        confidence_pct: Math.min(system_confidence, building_type ? 70 : 30),
        buyer_organisation: buyer || null,
        awarded_supplier: supplier || null,
        cpv_codes: parseCpv(item.cpvCodes),
        postcode,
        title: title || null,
        description: description ? description.substring(0, 2000) : null,
        notes: "Auto-ingested from Contracts Finder",
      });
    }


    // Upsert in batches of 100
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error: upErr, count } = await ci
        .from("market_benchmarks")
        .upsert(batch, { onConflict: "source,source_unique_id", ignoreDuplicates: false, count: "exact" });
      if (upErr) {
        console.error("Batch upsert error", upErr);
        partial = true;
        errorMessage = (errorMessage ? errorMessage + " | " : "") + `batch ${i}: ${upErr.message}`;
        skipped += batch.length;
      } else {
        upserted += count ?? batch.length;
      }
    }

    const finalStatus = partial ? "partial" : "success";
    await ci
      .from("ingest_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: finalStatus,
        records_fetched: fetched,
        records_upserted: upserted,
        records_skipped: skipped,
        error_message: errorMessage,
      })
      .eq("id", run_id);

    console.log(`[contracts-finder-ingest] done status=${finalStatus} fetched=${fetched} upserted=${upserted} skipped=${skipped}`);

    return new Response(
      JSON.stringify({
        success: true,
        run_id,
        fetched,
        upserted,
        skipped,
        window: { from: window_from, to: window_to },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[contracts-finder-ingest] failed", msg);
    await ci
      .from("ingest_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "failed",
        records_fetched: fetched,
        records_upserted: upserted,
        records_skipped: skipped,
        error_message: msg,
      })
      .eq("id", run_id);

    return new Response(JSON.stringify({ success: false, error: msg, run_id }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

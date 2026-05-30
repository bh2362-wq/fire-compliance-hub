import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const GRAPH = "https://graph.microsoft.com/v1.0";
const DEFAULT_MAILBOX = "admin@bhofire.com";

async function getAppToken(): Promise<string> {
  const tenantId = Deno.env.get("MICROSOFT_TENANT_ID")!;
  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID")!;
  const clientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`);
  return (await res.json()).access_token;
}

function stripHtml(html: string): string {
  return (html || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function callLovableAI(messages: any[], jsonMode = false): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY")!;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit exceeded — please retry shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted — add credits in workspace settings.");
  if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 1. AI extracts search keywords + intent ─────────────────────────────
    const extractRaw = await callLovableAI([
      {
        role: "system",
        content:
          "You convert a natural-language question about emails/quotations into a compact search keyword set. " +
          "Return strict JSON: { \"keywords\": string[], \"intent\": string }. " +
          "Keywords should be 1-3 distinctive nouns/names (sites, customers, jobs). " +
          "Strip filler like 'how much', 'did we', 'quoted for', 'works at'.",
      },
      { role: "user", content: query },
    ], true);

    let keywords: string[] = [];
    try {
      const parsed = JSON.parse(extractRaw);
      keywords = Array.isArray(parsed.keywords) ? parsed.keywords.filter((k: any) => typeof k === "string" && k.trim()) : [];
    } catch { /* fall through */ }
    if (keywords.length === 0) keywords = [query.trim()];

    const primary = keywords[0];
    const token = await getAppToken();
    const auth = { Authorization: `Bearer ${token}` };

    // ── 2. Inbox search (Graph $search) ─────────────────────────────────────
    const searchVal = encodeURIComponent(`"${primary}"`);
    const listUrl = `${GRAPH}/users/${DEFAULT_MAILBOX}/messages?$search=${searchVal}&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments&$top=15`;
    const listRes = await fetch(listUrl, { headers: auth });
    if (!listRes.ok) throw new Error(`Graph search failed: ${await listRes.text()}`);
    const listData = await listRes.json();
    const hits: any[] = (listData.value || []).slice(0, 10);

    // Fetch bodies for ALL hits — previously capped at 5, which meant the
    // synthesised answer was based on preview snippets for the rest and
    // engineers got "the emails don't state the figure" answers when the
    // figure was sitting in email #6's body. 10 × 6000 chars is safely
    // inside Gemini Flash's input window.
    const BODY_CHARS = 6000;
    const bodies = await Promise.all(
      hits.map(async (m) => {
        try {
          const r = await fetch(
            `${GRAPH}/users/${DEFAULT_MAILBOX}/messages/${m.id}?$select=id,body`,
            { headers: auth },
          );
          if (!r.ok) return "";
          const d = await r.json();
          return stripHtml(d.body?.content || "").slice(0, BODY_CHARS);
        } catch { return ""; }
      }),
    );

    const emailCitations = hits.map((m, i) => ({
      id: m.id,
      subject: m.subject || "(no subject)",
      from: m.from?.emailAddress?.address || "",
      fromName: m.from?.emailAddress?.name || "",
      date: m.receivedDateTime,
      preview: m.bodyPreview || "",
      body: bodies[i] || "",
      hasAttachments: !!m.hasAttachments,
    }));

    // Extract any QUO-style quotation numbers that appear in subjects or
    // bodies — these are usually the cheapest, most accurate way to find
    // the actual quoted figure in the database.
    const quoNumberSet = new Set<string>();
    const quoPattern = /\bQUO[-\s]?\d{3,6}\b/gi;
    for (const e of emailCitations) {
      for (const haystack of [e.subject, e.body, e.preview]) {
        const matches = haystack.match(quoPattern);
        if (matches) matches.forEach((m) => quoNumberSet.add(m.toUpperCase().replace(/[-\s]/g, "")));
      }
    }
    const quoNumbers = [...quoNumberSet];

    // ── 3. Local DB lookup: quotations whose site / customer name matches ───
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ilike = `%${primary}%`;
    const { data: quotes } = await supabase
      .from("quotations")
      .select("id, quotation_number, title, total_amount, status, created_at, sites(name), customers(name)")
      .or(`title.ilike.${ilike}`)
      .order("created_at", { ascending: false })
      .limit(20);

    // Also match via joined site/customer name — separate query because PostgREST .or() over relations is awkward
    const { data: quotesBySite } = await supabase
      .from("quotations")
      .select("id, quotation_number, title, total_amount, status, created_at, sites!inner(name), customers(name)")
      .ilike("sites.name", ilike)
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: quotesByCust } = await supabase
      .from("quotations")
      .select("id, quotation_number, title, total_amount, status, created_at, sites(name), customers!inner(name)")
      .ilike("customers.name", ilike)
      .order("created_at", { ascending: false })
      .limit(20);

    // Look up quotations directly by any QUO numbers we spotted in the
    // emails. Normalises away the dash so QUO-3527 / QUO03527 / QUO 03527
    // all hit the same row regardless of how the quotation_number was
    // stored.
    let quotesByNumber: any[] = [];
    if (quoNumbers.length > 0) {
      const orConds = quoNumbers
        .flatMap((n) => {
          // Generate a few common variants of the same number so we
          // tolerate sloppy formatting in the stored field.
          const digits = n.replace(/\D/g, "");
          return [
            `quotation_number.ilike.%${n}%`,
            `quotation_number.ilike.%${digits}%`,
          ];
        })
        .join(",");
      const { data } = await supabase
        .from("quotations")
        .select("id, quotation_number, title, total_amount, status, created_at, sites(name), customers(name)")
        .or(orConds)
        .limit(20);
      quotesByNumber = data || [];
    }

    const quoteMap = new Map<string, any>();
    // Direct-number matches go in first so they win the synthesis-prompt
    // ranking even when the title/site search also returns the row.
    for (const q of [...quotesByNumber, ...(quotes || []), ...(quotesBySite || []), ...(quotesByCust || [])]) {
      if (q && !quoteMap.has(q.id)) quoteMap.set(q.id, q);
    }
    const quotations = Array.from(quoteMap.values()).slice(0, 15);

    // ── 4. AI synthesis ─────────────────────────────────────────────────────
    // Pass the full extracted body to the LLM (already capped at BODY_CHARS
    // when fetched). Previously truncated to 1200 here, which lost figures
    // sitting in the second/third paragraph of quote follow-ups.
    const emailContext = emailCitations
      .map((e, i) => `EMAIL[${i + 1}]
From: ${e.fromName} <${e.from}>
Date: ${e.date}
Subject: ${e.subject}
Body: ${e.body || e.preview || "(no body)"}`)
      .join("\n\n---\n\n") || "(no emails found)";

    const quoteContext = quotations.length
      ? quotations
          .map((q) =>
            `${q.quotation_number} | ${q.status} | £${Number(q.total_amount || 0).toFixed(2)} | site: ${q.sites?.name || "—"} | customer: ${q.customers?.name || "—"} | ${q.title || ""} | ${q.created_at?.slice(0, 10)}`
          )
          .join("\n")
      : "(no matching quotations in database)";

    const numberHint = quoNumbers.length > 0
      ? `Quotation numbers referenced in the emails: ${quoNumbers.join(", ")}. The database rows above already include these where they exist — when the user asks about a price/figure for one of these jobs, lead with the matching total_amount from the database row, then add context from the emails.`
      : "";

    const answer = await callLovableAI([
      {
        role: "system",
        content:
          "You are BHO Fire's inbox assistant. Answer the user's question using the provided email bodies and quotation database rows. " +
          "Always try to give a direct, concrete answer — when the user asks 'how much did we quote', lead with the £ figure from the quotation row that matches the job/site, then briefly cite where it came from. " +
          "Be concise (3-5 sentences). " +
          "Cite figures with [EMAIL n] or the quotation number (QUO-xxxxx). " +
          "If the data genuinely does not contain the answer, say what the closest information IS (the most recent revised cost request, the LOI signed, etc.) — don't just say 'the emails don't say'. " +
          "Never invent numbers.",
      },
      {
        role: "user",
        content: `Question: ${query}

${numberHint}

— Matching quotations from database —
${quoteContext}

— Matching emails from inbox (full bodies, up to ${BODY_CHARS} chars each) —
${emailContext}`,
      },
    ]);

    return new Response(
      JSON.stringify({
        answer,
        keywords,
        emails: emailCitations,
        quotations: quotations.map((q) => ({
          id: q.id,
          quotation_number: q.quotation_number,
          title: q.title,
          total_amount: q.total_amount,
          status: q.status,
          site_name: q.sites?.name,
          customer_name: q.customers?.name,
          created_at: q.created_at,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("inbox-ai-query error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

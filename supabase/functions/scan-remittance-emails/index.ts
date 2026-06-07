// scan-remittance-emails
//
// Sweep recent scanned_emails on the accounts inboxes for anything that
// looks like a remittance advice, then invoke parse-remittance-email for
// each one. Skips emails we've already parsed (dedupe by (message_id,
// mailbox) on remittance_advices).
//
// This is the "Scan now" button + the cron entry point. The actual AI
// extraction lives in parse-remittance-email so this function stays
// cheap to run repeatedly.
//
// Input:  { mailboxes?: string[], hours_back?: number }
//         Defaults: mailboxes = ['accounts@bhofire.com', 'ben@bhofire.com'],
//                   hours_back = 168 (7 days).
// Output: { scanned: number, queued: number, skipped: number,
//           results: [{ scanned_email_id, status, error? }] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_MAILBOXES = ["accounts@bhofire.com", "ben@bhofire.com"];

// Two-tier pre-filter so we don't burn AI credit on every newsletter
// but also don't reject real remittances whose subject lines are
// generic ("Re: Reconcile", "ADI GLOBAL DISTRIBUTION-1701552").
//
//   STRONG_HINTS — definite remittance signals. A subject / body
//                  match on any of these queues the email outright.
//   POSSIBLE_HINTS — weaker signals (just "payment" / "paid" /
//                    "reconcile" anywhere). Queues only if the
//                    haystack ALSO contains a currency amount —
//                    cuts down false positives from "I haven't been
//                    paid yet" supplier chases.
//   KNOWN_PAYER_ADDRESSES — sender allowlist. Every email from these
//                           queues regardless of subject / body.
//
// Claude makes the final is_remittance decision — anything that
// queues but isn't a remittance gets marked 'dismissed' in
// parse-remittance-email and never pollutes the user's queue.
const STRONG_HINTS = [
  /remittance/i,
  /payment\s+advice/i,
  /payment\s+notification/i,
  /payment\s+confirmation/i,
  /payment\s+received/i,
  /payment\s+has\s+been\s+made/i,
  /\bpayment\s+made\s+(by|for|of)/i,
  /funds\s+transferred/i,
  /bibby/i,
  /monthly\s+account\s+statement/i,
  /\bstatement\s+of\s+account/i,
  /paid\s+invoice/i,
  /payment\s+for\s+£/i,
  /credit\s+note/i,
  /factoring/i,
  /allocated\s+to/i,                     // "Payment allocated to invoice …"
];

// Weaker tier — must co-occur with a currency amount.
const POSSIBLE_HINTS = [
  /\breconcile\b/i,                      // "Re: Reconcile" / "Reconcile" — needed an amount nearby
  /\bpayment\b/i,                        // bare "payment"
  /\bpaid\b/i,                           // bare "paid"
  /\bsettled\b/i,                        // "invoice settled"
  /\breceived\b/i,                       // bare "received"
];

// Currency / amount mention — co-required for the POSSIBLE tier.
// Matches £1234, GBP 1234, $1234, etc.
const AMOUNT_PATTERN = /(?:£|gbp|eur|usd|\$)\s*\d/i;

const KNOWN_PAYER_ADDRESSES = [
  "accounts@solarfireservices.co.uk",
  "collectionsuk@rs-components.com",
  "adi-global.com",          // ADI GLOBAL DISTRIBUTION — any address @adi-global.com
  "adiglobaldistribution",   // safety net for variant domains
  // Add more here as you spot recurring payers.
];

function looksLikeRemittance(
  subject: string | null,
  from: string | null,
  bodyPreview: string | null,
): boolean {
  const fromLower = (from ?? "").toLowerCase();
  if (KNOWN_PAYER_ADDRESSES.some((addr) => fromLower.includes(addr))) return true;
  // Body preview catches forwarded remittances where the original
  // subject is buried under "Fw:" / "Fwd:" — the remittance language
  // lives in the body instead.
  const haystack = `${subject ?? ""} ${from ?? ""} ${bodyPreview ?? ""}`;
  if (STRONG_HINTS.some((re) => re.test(haystack))) return true;
  // Possible-tier: need a weak signal AND a currency amount in the
  // same haystack. A "Re: Reconcile" subject alone won't match, but
  // "Re: Reconcile … £4,164" will.
  if (
    POSSIBLE_HINTS.some((re) => re.test(haystack)) &&
    AMOUNT_PATTERN.test(haystack)
  ) {
    return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      mailboxes?: string[];
      hours_back?: number;
    };
    const mailboxes = body.mailboxes && body.mailboxes.length > 0 ? body.mailboxes : DEFAULT_MAILBOXES;
    const hoursBack = body.hours_back ?? 168;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const cutoff = new Date(Date.now() - hoursBack * 3600_000).toISOString();

    // Pull candidate emails from the configured mailboxes. body_preview
    // gives looksLikeRemittance a third haystack — catches forwarded
    // remittances where the subject is just "Fw: …" but the body holds
    // the remittance language.
    //
    // Limit raised 200 → 1000 to match the 30-day default window from
    // the UI button. At ~30 inbound/day across both mailboxes that's
    // ~900 candidates; the previous 200 cap was silently truncating
    // older remittances before they ever hit the heuristic.
    const { data: candidates, error: candidatesErr } = await supabase
      .from("scanned_emails")
      .select("id, message_id, mailbox, subject, from_address, body_preview")
      .in("mailbox", mailboxes)
      .gte("received_at", cutoff)
      .order("received_at", { ascending: false })
      .limit(1000);
    if (candidatesErr) throw new Error(`Failed to list scanned_emails: ${candidatesErr.message}`);

    const heuristicallyRelevant = (candidates ?? []).filter((e) =>
      looksLikeRemittance(e.subject, e.from_address, e.body_preview),
    );

    // Skip ones we've already turned into a healthy remittance_advices row.
    // Rows created before the PDF parser fix have pdf_count=0 and no
    // attachment diagnostics even when the source email had a PDF; allow
    // those non-applied rows through so parse-remittance-email can re-read
    // the attachments instead of permanently hiding them here.
    const messageIds = heuristicallyRelevant.map((e) => e.message_id);
    const { data: existingMatches } = messageIds.length > 0
      ? await supabase
          .from("remittance_advices")
          .select("message_id, status, pdf_count, ai_raw_extract, line_items:remittance_line_items(status)")
          .in("message_id", messageIds)
      : { data: [] };
    const seen = new Set(
      (existingMatches ?? [])
        .filter((r) => {
          const hasDiagnostics = Array.isArray(
            (r.ai_raw_extract as Record<string, unknown> | null)?.attachment_diagnostics,
          );
          const hasAppliedLine = ((r.line_items as Array<{ status?: string }> | null) ?? [])
            .some((line) => line.status === "applied");
          return r.status === "dismissed" || r.status === "failed" || hasAppliedLine
            || (Number(r.pdf_count ?? 0) > 0 || hasDiagnostics);
        })
        .map((r) => r.message_id),
    );

    const toProcess = heuristicallyRelevant.filter((e) => !seen.has(e.message_id));

    // Long-running: invoking parse-remittance-email sequentially across
    // 30 days of mail blows past the 150s edge idle timeout. Kick the
    // work off in the background with limited concurrency and return
    // immediately so the UI can poll remittance_advices for updates.
    const CONCURRENCY = 4;
    const runBatch = async () => {
      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, toProcess.length) }, async () => {
        while (cursor < toProcess.length) {
          const email = toProcess[cursor++];
          try {
            await supabase.functions.invoke("parse-remittance-email", {
              body: { scanned_email_id: email.id },
              headers: { Authorization: authHeader },
            });
          } catch (e) {
            console.error("parse-remittance-email failed", email.id, (e as Error).message);
          }
        }
      });
      await Promise.all(workers);
    };

    // @ts-ignore EdgeRuntime is available in Supabase edge runtime
    if (typeof EdgeRuntime !== "undefined" && toProcess.length > 0) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runBatch());
    }

    return new Response(
      JSON.stringify({
        scanned: candidates?.length ?? 0,
        relevant: heuristicallyRelevant.length,
        already_parsed: seen.size,
        queued: toProcess.length,
        status: "processing",
        message: toProcess.length === 0
          ? "Nothing new to parse."
          : `Parsing ${toProcess.length} email(s) in the background. Refresh in a moment.`,
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

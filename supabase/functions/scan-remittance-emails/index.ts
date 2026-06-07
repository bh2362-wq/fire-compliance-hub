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

// Cheap pre-filter so we don't burn AI credit on every newsletter that
// lands in the accounts inbox. The actual is_remittance decision is made
// by Claude — these are just heuristics for "worth showing to the model".
const REMITTANCE_HINTS = [
  /remittance/i,
  /payment\s+advice/i,
  /payment\s+notification/i,
  /payment\s+received/i,
  /payment\s+confirmation/i,
  /funds\s+transferred/i,
  /bibby/i,
];

function looksLikeRemittance(subject: string | null, from: string | null): boolean {
  const haystack = `${subject ?? ""} ${from ?? ""}`;
  return REMITTANCE_HINTS.some((re) => re.test(haystack));
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

    // Pull candidate emails from the configured mailboxes.
    const { data: candidates, error: candidatesErr } = await supabase
      .from("scanned_emails")
      .select("id, message_id, mailbox, subject, from_address")
      .in("mailbox", mailboxes)
      .gte("received_at", cutoff)
      .order("received_at", { ascending: false })
      .limit(200);
    if (candidatesErr) throw new Error(`Failed to list scanned_emails: ${candidatesErr.message}`);

    const heuristicallyRelevant = (candidates ?? []).filter((e) =>
      looksLikeRemittance(e.subject, e.from_address),
    );

    // Skip ones we've already turned into a remittance_advices row.
    const messageIds = heuristicallyRelevant.map((e) => e.message_id);
    const { data: existingMatches } = messageIds.length > 0
      ? await supabase
          .from("remittance_advices")
          .select("message_id")
          .in("message_id", messageIds)
      : { data: [] };
    const seen = new Set((existingMatches ?? []).map((r) => r.message_id));

    const toProcess = heuristicallyRelevant.filter((e) => !seen.has(e.message_id));

    const results: Array<{ scanned_email_id: string; status: string; error?: string }> = [];
    for (const email of toProcess) {
      try {
        const { data, error } = await supabase.functions.invoke("parse-remittance-email", {
          body: { scanned_email_id: email.id },
          headers: { Authorization: authHeader },
        });
        if (error) {
          results.push({ scanned_email_id: email.id, status: "error", error: error.message });
        } else {
          results.push({
            scanned_email_id: email.id,
            status: (data?.status as string) ?? "queued",
            error: data?.error as string | undefined,
          });
        }
      } catch (e) {
        results.push({ scanned_email_id: email.id, status: "error", error: (e as Error).message });
      }
    }

    // Roll-up so the "Scan now" button can show a useful summary
    // (e.g. "scanned 42, parsed 3, 1 duplicate") rather than just a
    // raw count of dispatched jobs. 'duplicates' counts the
    // content-hash collisions caught by parse-remittance-email.
    const parsedCount    = results.filter((r) => r.status === "parsed").length;
    const reviewCount    = results.filter((r) => r.status === "needs_review").length;
    const dismissedCount = results.filter((r) => r.status === "dismissed").length;
    const duplicateCount = results.filter((r) => r.status === "duplicate").length;
    const failedCount    = results.filter((r) => r.status === "failed" || r.status === "error").length;

    return new Response(
      JSON.stringify({
        scanned: candidates?.length ?? 0,
        relevant: heuristicallyRelevant.length,
        already_parsed: seen.size,
        queued: results.length,
        parsed_count: parsedCount,
        needs_review_count: reviewCount,
        dismissed_count: dismissedCount,
        duplicate_count: duplicateCount,
        failed_count: failedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

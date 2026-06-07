// cron-tick — heartbeat-driven scheduler for the app.
//
// Architecture
//   A GitHub Actions workflow (.github/workflows/cron.yml) calls this
//   endpoint every 15 minutes. On each call:
//
//     1. Read public.cron_state to know when each task last ran.
//     2. For each task in TASKS, decide if it's due based on the task's
//        schedule rule (interval / daily-at-HH / weekly-at-DoW-HH).
//     3. Run the action — either an RPC call (for SQL-only tasks) or
//        a function-to-function invocation of another Edge Function.
//     4. Record last_run_at + status + a small detail blob.
//
//   The endpoint is safe to expose publicly because:
//     • All tasks are throttled by cron_state — calling tick 1000×/sec
//       still only runs each task at its scheduled cadence.
//     • Invoke targets either are themselves idempotent (sync, poll) or
//       are guarded by their own once-per-day write side-effects.
//
//   If a CRON_SECRET env var is set, the X-Cron-Secret header is also
//   verified — opt-in defence in depth for ops who want it.
//
// Adding a new task
//   1. Append an entry to TASKS below.
//   2. Pick a kind: "interval" | "daily" | "weekly".
//   3. Pick an action: { rpc: { name } } for pure-SQL or
//      { invokeFunction: "name", payload?: ... } for HTTP.
//   4. Deploy. cron-tick will pick it up on the next heartbeat.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// ── Task definitions ──────────────────────────────────────────────────────

type IntervalTask = {
  key: string;
  kind: "interval";
  every_minutes: number;
  action: Action;
};

type DailyTask = {
  key: string;
  kind: "daily";
  hour_utc: number;     // 0..23
  action: Action;
};

type WeeklyTask = {
  key: string;
  kind: "weekly";
  day_of_week: number;  // 1 = Monday, 7 = Sunday (ISO)
  hour_utc: number;
  action: Action;
};

type Task = IntervalTask | DailyTask | WeeklyTask;

type Action =
  | { kind: "rpc"; name: string; args?: Record<string, unknown> }
  | { kind: "invoke"; functionName: string; payload?: Record<string, unknown> };

const TASKS: Task[] = [
  {
    key: "reflib_cleanup",
    kind: "interval",
    every_minutes: 60,
    action: { kind: "rpc", name: "reset_stuck_ref_lib_ingests" },
  },
  {
    key: "outlook_pull",
    kind: "interval",
    every_minutes: 30,
    action: { kind: "invoke", functionName: "outlook-sync-pull" },
  },
  {
    key: "mailbox_poll",
    kind: "interval",
    every_minutes: 60,
    action: { kind: "invoke", functionName: "poll-mailbox" },
  },
  {
    // Autopilot for the remittance scanner — runs hourly, picks up
    // the newest emails from each mailbox, auto-dismisses any that
    // match a dismiss rule, and kicks parse-remittance-email in the
    // background for the rest. Combined with the dismiss-rule
    // learning system, this is what gets the accounts queue to
    // drain itself.
    key: "remittance_scan",
    kind: "interval",
    every_minutes: 60,
    action: {
      kind: "invoke",
      functionName: "scan-remittance-emails",
      payload: { hours_back: 168 }, // 7 days for cron (UI button uses 30)
    },
  },
  {
    key: "xero_invoice_sync",
    kind: "interval",
    every_minutes: 240, // every 4h
    action: { kind: "invoke", functionName: "sync-invoice-status" },
  },
  {
    key: "daily_compliance_digest",
    kind: "daily",
    hour_utc: 7,
    action: { kind: "invoke", functionName: "daily-compliance-digest" },
  },
  {
    key: "engineer_reminders",
    kind: "daily",
    hour_utc: 18,
    action: { kind: "invoke", functionName: "send-engineer-reminder" },
  },
  {
    key: "contracts_finder_poll",
    kind: "weekly",
    day_of_week: 1, // Monday
    hour_utc: 9,
    action: { kind: "invoke", functionName: "poll-contracts-finder" },
  },
];

// ── Schedule logic ────────────────────────────────────────────────────────

function isDue(task: Task, now: Date, lastRunAt: Date | null): boolean {
  if (task.kind === "interval") {
    if (!lastRunAt) return true;
    const elapsedMin = (now.getTime() - lastRunAt.getTime()) / 60000;
    return elapsedMin >= task.every_minutes;
  }

  // For daily / weekly we use the boundary "today's scheduled timestamp in UTC".
  // The task is due if we've crossed that boundary AND haven't run since.
  if (task.kind === "daily") {
    const scheduled = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      task.hour_utc, 0, 0, 0,
    ));
    if (now < scheduled) return false;
    if (!lastRunAt) return true;
    return lastRunAt < scheduled;
  }

  if (task.kind === "weekly") {
    // getUTCDay: 0=Sun..6=Sat. Convert ISO 1=Mon..7=Sun.
    const isoDay = ((now.getUTCDay() + 6) % 7) + 1;
    if (isoDay !== task.day_of_week) return false;
    const scheduled = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      task.hour_utc, 0, 0, 0,
    ));
    if (now < scheduled) return false;
    if (!lastRunAt) return true;
    return lastRunAt < scheduled;
  }

  return false;
}

// ── Action execution ──────────────────────────────────────────────────────

async function runAction(
  action: Action,
  sb: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ ok: boolean; detail: Record<string, unknown> }> {
  if (action.kind === "rpc") {
    const { data, error } = await sb.rpc(action.name, action.args ?? {});
    if (error) return { ok: false, detail: { rpc: action.name, error: error.message } };
    return { ok: true, detail: { rpc: action.name, returned: data ?? null } };
  }

  // invoke: function-to-function HTTP call with service-role auth. We
  // pass-through the user's CRON_SECRET header so target functions can
  // verify it if they want to.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const url = `${supabaseUrl}/functions/v1/${action.functionName}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  if (cronSecret) headers["X-Cron-Secret"] = cronSecret;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(action.payload ?? {}),
    });
    const text = await resp.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* leave as text */ }
    if (!resp.ok) {
      return { ok: false, detail: { function: action.functionName, status: resp.status, body: parsed } };
    }
    return { ok: true, detail: { function: action.functionName, status: resp.status, body: parsed } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, detail: { function: action.functionName, error: message } };
  }
}

// ── Entry point ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Optional CRON_SECRET gating. If set, require the header. If unset,
  // the function is callable by anyone — relying on per-task throttling.
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (expectedSecret) {
    const got = req.headers.get("x-cron-secret");
    if (got !== expectedSecret) {
      return new Response(JSON.stringify({ error: "invalid cron secret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();

  // Load current state for all known tasks.
  const taskKeys = TASKS.map((t) => t.key);
  const { data: stateRows, error: stateErr } = await sb
    .from("cron_state")
    .select("task_key, last_run_at")
    .in("task_key", taskKeys);

  if (stateErr) {
    return new Response(JSON.stringify({ error: "cron_state read failed", detail: stateErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stateMap = new Map<string, Date | null>();
  for (const row of stateRows ?? []) {
    stateMap.set(row.task_key as string, row.last_run_at ? new Date(row.last_run_at as string) : null);
  }

  const ran: Array<{ key: string; ok: boolean; detail: Record<string, unknown> }> = [];
  const skipped: string[] = [];

  for (const task of TASKS) {
    const lastRunAt = stateMap.get(task.key) ?? null;
    if (!isDue(task, now, lastRunAt)) {
      skipped.push(task.key);
      continue;
    }
    const result = await runAction(task.action, sb, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    ran.push({ key: task.key, ok: result.ok, detail: result.detail });

    // Upsert state. consecutive_errors increments on failure; resets on success.
    const status = result.ok ? "ok" : "error";
    let consecutiveErrors = 0;
    if (!result.ok) {
      const { data: prev } = await sb
        .from("cron_state")
        .select("consecutive_errors")
        .eq("task_key", task.key)
        .maybeSingle();
      consecutiveErrors = ((prev?.consecutive_errors as number | undefined) ?? 0) + 1;
    }

    await sb.from("cron_state").upsert({
      task_key: task.key,
      last_run_at: now.toISOString(),
      last_run_status: status,
      last_run_detail: result.detail,
      consecutive_errors: consecutiveErrors,
      updated_at: now.toISOString(),
    }, { onConflict: "task_key" });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      now: now.toISOString(),
      ran,
      skipped,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

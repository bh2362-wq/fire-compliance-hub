-- Register scheduled jobs for the fire-compliance-hub.
--
-- Background
--   pg_cron + pg_net have been installed since 20260324 but no jobs were
--   ever registered, so every "scheduled" feature in the app was actually
--   on-demand only. This migration wires the eight jobs identified by the
--   coverage audit.
--
-- One-time setup required after running this migration
--   The HTTP-calling jobs need three database-level settings. They are not
--   inlined here because they contain a secret (the service-role key).
--   Run these once in the Supabase SQL editor with your real values:
--
--     ALTER DATABASE postgres
--       SET app.supabase_url      = 'https://<project>.supabase.co';
--     ALTER DATABASE postgres
--       SET app.service_role_key  = '<service-role-jwt>';
--     ALTER DATABASE postgres
--       SET app.cron_secret       = '<random-hex-string>';
--
--   `cron_call_edge_function()` is forgiving — if any of those settings is
--   missing, it logs a NOTICE and skips the HTTP call instead of erroring,
--   so the migration is safe to run before the settings are populated.

-- ── Extensions (idempotent) ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- ── Helper: call an Edge Function from cron ────────────────────────────
-- pg_cron runs as the postgres role and pg_net writes into the `net`
-- schema, so this wrapper centralises the URL / headers shape and the
-- "settings not configured yet" fallback. Returns the pg_net request_id
-- (or NULL when skipped) so cron history shows whether the call was
-- enqueued.
CREATE OR REPLACE FUNCTION public.cron_call_edge_function(
  fn_name TEXT,
  payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  base_url     TEXT;
  auth_key     TEXT;
  cron_secret  TEXT;
  request_id   BIGINT;
BEGIN
  base_url    := current_setting('app.supabase_url',     true);
  auth_key    := current_setting('app.service_role_key', true);
  cron_secret := current_setting('app.cron_secret',      true);

  IF base_url IS NULL OR base_url = '' OR auth_key IS NULL OR auth_key = '' THEN
    RAISE NOTICE
      'cron_call_edge_function(%): app.supabase_url or app.service_role_key not set, skipping HTTP call.',
      fn_name;
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := base_url || '/functions/v1/' || fn_name,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || auth_key,
      'X-Cron-Secret', COALESCE(cron_secret, ''),
      'Content-Type',  'application/json'
    ),
    body                 := payload,
    timeout_milliseconds := 60000
  )
  INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_call_edge_function(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_call_edge_function(TEXT, JSONB) TO postgres;

-- ── Idempotency: drop any pre-existing schedules with these names ─────
DO $$
DECLARE
  job_name TEXT;
BEGIN
  FOREACH job_name IN ARRAY ARRAY[
    'reflib-cleanup-hourly',
    'xero-invoice-sync-4h',
    'mailbox-poll-hourly',
    'outlook-pull-30min',
    'engineer-reminders-daily-1800',
    'compliance-digest-daily-0700',
    'contracts-finder-poll-weekly',
    'credit-control-auto-reminders-daily-0900'
  ]
  LOOP
    PERFORM cron.unschedule(j.jobid)
    FROM cron.job j
    WHERE j.jobname = job_name;
  END LOOP;
END;
$$;

-- ── Schedule ───────────────────────────────────────────────────────────
-- Notes
--   • Time zone is the database tz (typically UTC on Supabase). Daily
--     "07:00 / 09:00 / 18:00" therefore mean UTC, not London. Adjust the
--     CRON expression if BST handling matters more than the offset.
--   • Spread minute-of-hour offsets so the jobs don't all stampede the
--     top of each hour.

-- 1. Reference-library cleanup — pure SQL, no HTTP needed.
SELECT cron.schedule(
  'reflib-cleanup-hourly',
  '7 * * * *',
  $$ SELECT public.reset_stuck_ref_lib_ingests(); $$
);

-- 2. Daily compliance digest — emails ops a summary of expired / expiring
--    BAFE certs, RAMS due for review, and overdue service visits.
--    Implemented by the daily-compliance-digest Edge Function.
SELECT cron.schedule(
  'compliance-digest-daily-0700',
  '0 7 * * *',
  $$ SELECT public.cron_call_edge_function('daily-compliance-digest'); $$
);

-- 3. Xero invoice status sync — every 4 hours.
SELECT cron.schedule(
  'xero-invoice-sync-4h',
  '0 */4 * * *',
  $$ SELECT public.cron_call_edge_function('sync-invoice-status'); $$
);

-- 4. Mailbox poll — top of every hour at :15 so we don't collide with
--    the reflib-cleanup or compliance-digest jobs.
SELECT cron.schedule(
  'mailbox-poll-hourly',
  '15 * * * *',
  $$ SELECT public.cron_call_edge_function('poll-mailbox'); $$
);

-- 5. Engineer pre-visit reminders — 18:00 daily, briefing for tomorrow.
SELECT cron.schedule(
  'engineer-reminders-daily-1800',
  '0 18 * * *',
  $$ SELECT public.cron_call_edge_function('send-engineer-reminder'); $$
);

-- 6. Contracts Finder poll — weekly, Monday 09:00.
SELECT cron.schedule(
  'contracts-finder-poll-weekly',
  '0 9 * * 1',
  $$ SELECT public.cron_call_edge_function('poll-contracts-finder'); $$
);

-- 7. Outlook calendar pull — every 30 minutes, offset by 5 minutes.
SELECT cron.schedule(
  'outlook-pull-30min',
  '5,35 * * * *',
  $$ SELECT public.cron_call_edge_function('outlook-sync-pull'); $$
);

-- 8. Credit-control auto-reminders — daily 09:00.
--    Scheduled but the target Edge Function (auto-credit-control) does
--    NOT exist yet; this entry is a no-op until that function is built
--    AND the user has signed off on the policy (it sends SMS / voice to
--    clients). cron_call_edge_function will return 404 from net.http_post
--    until then, which is logged but not fatal.
SELECT cron.schedule(
  'credit-control-auto-reminders-daily-0900',
  '0 9 * * *',
  $$ SELECT public.cron_call_edge_function('auto-credit-control'); $$
);

-- ── Sanity check view ──────────────────────────────────────────────────
-- Convenience view for ops to inspect what's scheduled without poking
-- around in the cron schema directly.
CREATE OR REPLACE VIEW public.scheduled_cron_jobs AS
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active,
  database,
  username
FROM cron.job
WHERE jobname IN (
  'reflib-cleanup-hourly',
  'compliance-digest-daily-0700',
  'xero-invoice-sync-4h',
  'mailbox-poll-hourly',
  'engineer-reminders-daily-1800',
  'contracts-finder-poll-weekly',
  'outlook-pull-30min',
  'credit-control-auto-reminders-daily-0900'
)
ORDER BY jobname;

GRANT SELECT ON public.scheduled_cron_jobs TO authenticated;

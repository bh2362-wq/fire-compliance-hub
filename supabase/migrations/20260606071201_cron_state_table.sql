-- cron_state — bookkeeping for the cron-tick Edge Function.
--
-- Background
--   The scheduling pattern in this app is "single public Edge Function
--   pinged on a heartbeat, decides what's due, runs it, records last_run".
--   This table is the persistent record of when each task last ran so
--   the tick function can throttle correctly between heartbeats.
--
--   This is the only persistence the scheduler needs. pg_cron is NOT
--   used here — direct DB access (ALTER DATABASE SET…) isn't available
--   in this deployment, and a GitHub Actions schedule is the
--   external heartbeat that drives cron-tick.

CREATE TABLE IF NOT EXISTS public.cron_state (
  task_key          TEXT PRIMARY KEY,
  last_run_at       TIMESTAMPTZ,
  last_run_status   TEXT,          -- "ok" | "skipped" | "error"
  last_run_detail   JSONB,         -- function-specific summary
  consecutive_errors INT NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cron_state IS
  'Last-run bookkeeping for the cron-tick Edge Function. One row per task_key. '
  'Updated by cron-tick on every successful or errored run; read at the top of '
  'each tick to decide which tasks are due.';

-- The dashboard can surface this for ops visibility ("when did the
-- compliance digest last run?"). Service role bypasses RLS so cron-tick
-- can write regardless of the policy.
ALTER TABLE public.cron_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY cron_state_read_authenticated
  ON public.cron_state
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.cron_state TO authenticated;

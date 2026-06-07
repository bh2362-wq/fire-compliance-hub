-- Recovery migration: ensure public.cron_state exists.
--
-- Why a separate migration when 20260606071201 already creates this table?
--   Because the cron-tick Edge Function is in production returning 500 on
--   every GitHub Actions heartbeat with:
--     {"error":"cron_state read failed",
--      "detail":"Could not find the table 'public.cron_state' in the schema cache"}
--   So the original migration didn't land on this deployment. Re-shipping
--   the schema under a new timestamp forces the deploy pipeline to apply
--   it. The original migration's CREATE TABLE IF NOT EXISTS keeps this
--   safe to layer on if the table did already exist.
--
-- All statements are IDEMPOTENT — re-runs are no-ops.

CREATE TABLE IF NOT EXISTS public.cron_state (
  task_key            TEXT PRIMARY KEY,
  last_run_at         TIMESTAMPTZ,
  last_run_status     TEXT,          -- "ok" | "skipped" | "error"
  last_run_detail     JSONB,         -- function-specific summary
  consecutive_errors  INT NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cron_state IS
  'Last-run bookkeeping for the cron-tick Edge Function. One row per task_key. '
  'Updated by cron-tick on every successful or errored run; read at the top of '
  'each tick to decide which tasks are due.';

ALTER TABLE public.cron_state ENABLE ROW LEVEL SECURITY;

-- Idempotent policy creation — drop-and-recreate so a re-run doesn't
-- error on the existing policy name.
DROP POLICY IF EXISTS cron_state_read_authenticated ON public.cron_state;
CREATE POLICY cron_state_read_authenticated
  ON public.cron_state
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.cron_state TO authenticated;

-- Sanity check: log row count so the deploy log surfaces whether the
-- table was already populated (>0 rows means previous heartbeats DID
-- land — useful diagnostic) or genuinely empty (cron-tick has never
-- successfully written).
DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.cron_state;
  RAISE NOTICE 'cron_state recovery migration applied. existing rows: %', cnt;
END $$;

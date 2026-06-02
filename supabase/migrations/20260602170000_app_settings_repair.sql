-- app_settings repair — the table created in
-- 20260601120000_remittance_advices.sql didn't make it onto every
-- Supabase instance (symptom: the Remittance Settings dialog returns
-- "Could not find the table 'public.app_settings' in the schema
-- cache" when an engineer tries to save the Bibby Xero account code).
--
-- This migration is purely defensive — every statement uses IF NOT
-- EXISTS / DROP IF EXISTS so it's a no-op on instances where the
-- original migration applied cleanly. The trailing NOTIFY tells
-- PostgREST to refresh its schema cache so the table becomes visible
-- to the JS client without waiting for a redeploy.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT 'null'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings read" ON public.app_settings;
CREATE POLICY "app_settings read"
  ON public.app_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "app_settings write" ON public.app_settings;
CREATE POLICY "app_settings write"
  ON public.app_settings FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Nudge PostgREST so the table is visible immediately (otherwise
-- callers can hit a stale schema cache for up to a few minutes).
NOTIFY pgrst, 'reload schema';

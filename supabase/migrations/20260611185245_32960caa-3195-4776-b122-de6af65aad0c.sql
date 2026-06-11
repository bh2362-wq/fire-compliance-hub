-- Re-ship of 20260603120000_quotations_source_ce_report.sql under a
-- UUID-suffixed filename. The original commit didn't apply on Lovable's
-- managed Supabase (engineer hit PGRST204 "Could not find the
-- source_cause_effect_report_id column" when generating an AI Remedial
-- Works Quote). Same flake as the cron_state + approve_qms_document
-- migrations that needed re-shipping — Lovable's runner only picks up
-- the <timestamp>_<uuid>.sql naming convention reliably.
--
-- IF NOT EXISTS guards keep this idempotent if the original migration
-- does eventually land. NOTIFY pgrst forces PostgREST to reload its
-- schema cache so the column is queryable immediately rather than after
-- the next idle reload.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS source_cause_effect_report_id uuid
  REFERENCES public.ce_audibility_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quotations_source_ce_report_idx
  ON public.quotations(source_cause_effect_report_id)
  WHERE source_cause_effect_report_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

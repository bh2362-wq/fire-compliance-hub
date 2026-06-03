-- Backfill report_number for C&E reports already completed without one.
--
-- ce_audibility_reports.report_number was nullable from day one and the
-- wizard never assigned a value, so every C&E row on the Reports list
-- shows up without a #JOB-XXXXX chip even though they're completed
-- compliance documents. From now on the wizard's handleComplete pulls
-- a number from the shared get_next_report_number('JOB') pool. This
-- migration walks the existing completed/locked rows (oldest first,
-- so the numbering reflects when the work happened) and gives each
-- one a number from the same pool.
--
-- Draft rows are deliberately skipped — they get their number on
-- completion, matching service_reports' behaviour.
--
-- Safe to re-run: the WHERE clause excludes anything that already has
-- a number.

DO $$
DECLARE
  rec RECORD;
  new_num text;
BEGIN
  FOR rec IN
    SELECT id
    FROM public.ce_audibility_reports
    WHERE report_number IS NULL
      AND status IN ('completed', 'locked')
    ORDER BY created_at ASC
  LOOP
    new_num := public.get_next_report_number('JOB');
    UPDATE public.ce_audibility_reports
       SET report_number = new_num
     WHERE id = rec.id;
  END LOOP;
END $$;

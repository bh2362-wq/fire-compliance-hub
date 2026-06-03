-- Quote ↔ Cause & Effect reverse link.
--
-- ce_remedials.quotation_id (added in 20260602150000) already lets you
-- ask "which quote was raised from this remedial". This migration adds
-- the inverse: a quote sourced from a C&E report stamps the report's
-- id here, so the quote view can render a "Sourced from C&E report
-- {number}" badge and the email-send flow can optionally attach the
-- source PDF.
--
-- Nullable + ON DELETE SET NULL — quotes raised manually leave it
-- null, and deleting the C&E report shouldn't take the quote with it.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS source_cause_effect_report_id uuid
  REFERENCES public.ce_audibility_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quotations_source_ce_report_idx
  ON public.quotations(source_cause_effect_report_id)
  WHERE source_cause_effect_report_id IS NOT NULL;

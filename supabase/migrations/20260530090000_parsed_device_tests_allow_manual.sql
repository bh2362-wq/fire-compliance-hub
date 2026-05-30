-- parsed_device_tests was created with upload_id UUID NOT NULL because the
-- original capture flow only fed it from CSV / panel-log uploads. The
-- engineer field app and the office-side Devices step both record per-
-- device ticks without a backing file_uploads row, which hits a NOT NULL
-- constraint and surfaces in the wizard as
--   "null value in column 'upload_id' of relation 'parsed_device_tests'
--    violates not-null constraint"
--
-- Drop the NOT NULL so manual ticks (source IN ('engineer_app',
-- 'service_report_capture', 'manual_office')) can save. Uploads still
-- populate upload_id, so the FK reference stays useful for traceability.

ALTER TABLE public.parsed_device_tests
  ALTER COLUMN upload_id DROP NOT NULL;

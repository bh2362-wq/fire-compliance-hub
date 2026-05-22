-- ============================================================================
-- Service Report vNext — Chunk 1: schema + service layer
--
-- Adds the columns and child tables required by the new service-report flow.
-- All changes are additive or backwards-compatible. Existing service_reports
-- rows remain valid; new columns are nullable.
--
-- Two deviations from docs/planning/service-report-execution-brief.md
-- (logged in the Chunk 1 commit message):
--   1. panel_id references site_assets(id), not a non-existent panels(id).
--   2. Severity-vocabulary rename (BS5839Payload.defects[].severity) deferred
--      to Chunk 6 — it is tightly coupled to the PDF generator's colour switch
--      and cannot ship in isolation without regressing the production PDF.
--
-- The visits.visit_type enum swap originally planned here has been REMOVED:
-- production carries visit_type values the new enum did not cover (e.g.
-- 'subcontract'), and the frontend still keys row styling and labels off the
-- old values. Rationalising visit_type is deferred to its own change, with
-- the frontend updated alongside it.
-- ============================================================================

-- ── 1. service_reports: new visit metadata columns ──────────────────────────
ALTER TABLE public.service_reports
  ADD COLUMN arrival_time         timestamptz,
  ADD COLUMN departure_time       timestamptz,
  ADD COLUMN mileage_miles        integer,
  ADD COLUMN arc_connected        boolean,
  ADD COLUMN system_status        text,
  ADD COLUMN isolation_details    text,
  ADD COLUMN client_sign_name     text,
  ADD COLUMN client_sign_position text,
  ADD COLUMN panel_id             uuid REFERENCES public.site_assets(id) ON DELETE SET NULL;

ALTER TABLE public.service_reports
  ADD CONSTRAINT service_reports_system_status_check
  CHECK (system_status IS NULL OR system_status IN
    ('fully_operational','advisory_only','partial_operation','not_operational'));

-- ── 2. service_report_battery_tests: child table for per-panel/PSU tests ────
CREATE TABLE public.service_report_battery_tests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_report_id  uuid NOT NULL REFERENCES public.service_reports(id) ON DELETE CASCADE,
  panel_or_psu_label text NOT NULL,
  install_date       date,
  terminal_voltage_v numeric(4,2),
  charge_current_ma  integer,
  load_test_result   text,
  recommendation     text,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_report_battery_tests
  ADD CONSTRAINT service_report_battery_tests_load_test_check
  CHECK (load_test_result IS NULL OR load_test_result IN ('pass','fail','not_tested'));

ALTER TABLE public.service_report_battery_tests
  ADD CONSTRAINT service_report_battery_tests_recommendation_check
  CHECK (recommendation IS NULL OR recommendation IN ('retain','replace'));

CREATE INDEX idx_service_report_battery_tests_report
  ON public.service_report_battery_tests(service_report_id);

ALTER TABLE public.service_report_battery_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view battery tests"
  ON public.service_report_battery_tests FOR SELECT
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert battery tests"
  ON public.service_report_battery_tests FOR INSERT
  WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update battery tests"
  ON public.service_report_battery_tests FOR UPDATE
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete battery tests"
  ON public.service_report_battery_tests FOR DELETE
  USING (has_elevated_role(auth.uid()));

-- Reuse the project-wide updated_at trigger function if present.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    EXECUTE 'CREATE TRIGGER trg_service_report_battery_tests_updated_at
             BEFORE UPDATE ON public.service_report_battery_tests
             FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;
END$$;

-- ── 3. file_uploads: link photos to defects ─────────────────────────────────
ALTER TABLE public.file_uploads
  ADD COLUMN defect_id uuid REFERENCES public.site_defects(id) ON DELETE SET NULL;

CREATE INDEX idx_file_uploads_defect ON public.file_uploads(defect_id)
  WHERE defect_id IS NOT NULL;

-- ── 4. profiles: stored engineer signature for reuse across visits ──────────
ALTER TABLE public.profiles
  ADD COLUMN engineer_signature text;

COMMENT ON COLUMN public.profiles.engineer_signature IS
  'PNG data URL of the engineer''s stored signature, reused across service visits.';

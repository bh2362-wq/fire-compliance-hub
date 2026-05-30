
CREATE TABLE IF NOT EXISTS public.ce_audibility_reports (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id                 uuid NOT NULL REFERENCES public.service_visits(id) ON DELETE CASCADE,
  site_id                  uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  created_by               uuid REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  report_number            text,
  report_date              date,
  engineer_name            text,
  client_name              text,
  sound_meter_make_model   text,
  sound_meter_serial       text,
  sound_meter_cal_due      date,
  sound_meter_cal_on_file  boolean,
  general_observations     text,
  bs5839_compliant         boolean,
  remedial_timeframe       text,
  next_service_due         date,
  engineer_signature       text,
  client_signature         text,
  client_sign_name         text,
  client_sign_position     text,
  status                   text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','completed','locked')),
  notes                    text,
  UNIQUE (visit_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ce_audibility_reports TO authenticated;
GRANT ALL ON public.ce_audibility_reports TO service_role;

CREATE TABLE IF NOT EXISTS public.ce_output_checks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.ce_audibility_reports(id) ON DELETE CASCADE,
  ordinal         int  NOT NULL,
  function_name   text NOT NULL,
  expected        text,
  actual          text,
  result          text CHECK (result IN ('pass','fail','na')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ce_output_checks TO authenticated;
GRANT ALL ON public.ce_output_checks TO service_role;

CREATE TABLE IF NOT EXISTS public.ce_stage_tests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.ce_audibility_reports(id) ON DELETE CASCADE,
  ordinal         int  NOT NULL,
  stage_name      text NOT NULL,
  areas_activated text,
  delay_time      text,
  result          text CHECK (result IN ('pass','fail','na')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ce_stage_tests TO authenticated;
GRANT ALL ON public.ce_stage_tests TO service_role;

CREATE TABLE IF NOT EXISTS public.ce_audibility_readings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.ce_audibility_reports(id) ON DELETE CASCADE,
  ordinal         int  NOT NULL,
  location        text NOT NULL,
  floor           text,
  ambient_db      numeric(4,1),
  alarm_db        numeric(4,1),
  required_db     numeric(4,1) DEFAULT 65,
  result          text CHECK (result IN ('pass','fail')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ce_audibility_readings TO authenticated;
GRANT ALL ON public.ce_audibility_readings TO service_role;

CREATE TABLE IF NOT EXISTS public.ce_issues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.ce_audibility_reports(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('cause_effect','audibility')),
  description     text,
  location        text,
  measured_db     numeric(4,1),
  required_db     numeric(4,1),
  severity        text CHECK (severity IN ('critical','non_critical')),
  action_required text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ce_issues TO authenticated;
GRANT ALL ON public.ce_issues TO service_role;

CREATE TABLE IF NOT EXISTS public.ce_remedials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.ce_audibility_reports(id) ON DELETE CASCADE,
  priority        text CHECK (priority IN ('urgent','routine')),
  description     text,
  location        text,
  estimated_cost  numeric(10,2),
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ce_remedials TO authenticated;
GRANT ALL ON public.ce_remedials TO service_role;

CREATE INDEX IF NOT EXISTS idx_ce_audrep_visit   ON public.ce_audibility_reports(visit_id);
CREATE INDEX IF NOT EXISTS idx_ce_audrep_site    ON public.ce_audibility_reports(site_id);
CREATE INDEX IF NOT EXISTS idx_ce_output_report  ON public.ce_output_checks(report_id);
CREATE INDEX IF NOT EXISTS idx_ce_stage_report   ON public.ce_stage_tests(report_id);
CREATE INDEX IF NOT EXISTS idx_ce_audread_report ON public.ce_audibility_readings(report_id);
CREATE INDEX IF NOT EXISTS idx_ce_issues_report  ON public.ce_issues(report_id);
CREATE INDEX IF NOT EXISTS idx_ce_remed_report   ON public.ce_remedials(report_id);

DROP TRIGGER IF EXISTS update_ce_audibility_reports_updated_at ON public.ce_audibility_reports;
CREATE TRIGGER update_ce_audibility_reports_updated_at
  BEFORE UPDATE ON public.ce_audibility_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ce_audibility_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_output_checks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_stage_tests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_audibility_readings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_issues               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_remedials            ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ce_audrep_all  ON public.ce_audibility_reports;
DROP POLICY IF EXISTS ce_output_all  ON public.ce_output_checks;
DROP POLICY IF EXISTS ce_stage_all   ON public.ce_stage_tests;
DROP POLICY IF EXISTS ce_audread_all ON public.ce_audibility_readings;
DROP POLICY IF EXISTS ce_issues_all  ON public.ce_issues;
DROP POLICY IF EXISTS ce_remed_all   ON public.ce_remedials;

CREATE POLICY ce_audrep_all   ON public.ce_audibility_reports  FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY ce_output_all   ON public.ce_output_checks       FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY ce_stage_all    ON public.ce_stage_tests         FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY ce_audread_all  ON public.ce_audibility_readings FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY ce_issues_all   ON public.ce_issues              FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY ce_remed_all    ON public.ce_remedials           FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));

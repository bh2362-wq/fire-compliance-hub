-- Cause & Effect + Audibility Test Report
-- ─────────────────────────────────────────────────────────────────────
-- New report type, parallel to service_reports but specific to the
-- annual BS 5839-1:2017 cause-and-effect + full audibility test. One
-- ce_audibility_reports row per visit; child tables hold the variable-
-- length sections (output-function checks, audibility readings, stage
-- tests, issues, remedial work). Devices/zones tested in §3.2 reuse
-- the existing parsed_device_tests table so engineer ticks made in the
-- field surface here too.
--
-- All tables are gated by has_elevated_role(auth.uid()) RLS, matching
-- the pattern used by service_reports and cause_effect_matrices.

CREATE TABLE public.ce_audibility_reports (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id                 uuid NOT NULL REFERENCES public.service_visits(id) ON DELETE CASCADE,
  site_id                  uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  created_by               uuid REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- Header (§ before §1)
  report_number            text,
  report_date              date,
  engineer_name            text,
  client_name              text,

  -- §4.1 Sound level meter (free-text per the chosen scope)
  sound_meter_make_model   text,
  sound_meter_serial       text,
  sound_meter_cal_due      date,
  sound_meter_cal_on_file  boolean,

  -- §5.3 General observations
  general_observations     text,

  -- §7 Compliance statement
  bs5839_compliant         boolean,

  -- §8 Recommendations
  remedial_timeframe       text,
  next_service_due         date,

  -- §9 Signatures (data URLs, mirroring service_reports.engineer_signature etc.)
  engineer_signature       text,
  client_signature         text,
  client_sign_name         text,
  client_sign_position     text,

  status                   text NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','completed','locked')),
  notes                    text,

  UNIQUE (visit_id)
);

-- §3.3 Output Functions Verified
-- One row per function (Alarm Sounders, VADs, Fire Brigade Signal, ARC,
-- Fire Door Releases, HVAC Shutdown, Smoke Control, Lift Homing, EM
-- Locks, …Other). Seeded by the UI on first save.
CREATE TABLE public.ce_output_checks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.ce_audibility_reports(id) ON DELETE CASCADE,
  ordinal         int  NOT NULL,
  function_name   text NOT NULL,
  expected        text,
  actual          text,
  result          text CHECK (result IN ('pass','fail','na')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- §3.4 Stage Testing (optional, 0..N)
CREATE TABLE public.ce_stage_tests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.ce_audibility_reports(id) ON DELETE CASCADE,
  ordinal         int  NOT NULL,
  stage_name      text NOT NULL,
  areas_activated text,
  delay_time      text,
  result          text CHECK (result IN ('pass','fail','na')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- §4.2 Audibility readings
-- required_db defaults to 65 (general areas per BS 5839-1:2017) but the
-- engineer can override per row for sleeping accommodation (75) or
-- "5 dB above ambient" cases.
CREATE TABLE public.ce_audibility_readings (
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

-- §5.1 / §5.2 Issues identified (combined table; `kind` discriminates)
CREATE TABLE public.ce_issues (
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

-- §6 Remedial works required
CREATE TABLE public.ce_remedials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.ce_audibility_reports(id) ON DELETE CASCADE,
  priority        text CHECK (priority IN ('urgent','routine')),
  description     text,
  location        text,
  estimated_cost  numeric(10,2),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ce_audrep_visit   ON public.ce_audibility_reports(visit_id);
CREATE INDEX idx_ce_audrep_site    ON public.ce_audibility_reports(site_id);
CREATE INDEX idx_ce_output_report  ON public.ce_output_checks(report_id);
CREATE INDEX idx_ce_stage_report   ON public.ce_stage_tests(report_id);
CREATE INDEX idx_ce_audread_report ON public.ce_audibility_readings(report_id);
CREATE INDEX idx_ce_issues_report  ON public.ce_issues(report_id);
CREATE INDEX idx_ce_remed_report   ON public.ce_remedials(report_id);

-- updated_at trigger on the top-level report
CREATE TRIGGER update_ce_audibility_reports_updated_at
  BEFORE UPDATE ON public.ce_audibility_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS — same pattern as service_reports / cause_effect_matrices
ALTER TABLE public.ce_audibility_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_output_checks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_stage_tests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_audibility_readings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_issues               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_remedials            ENABLE ROW LEVEL SECURITY;

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

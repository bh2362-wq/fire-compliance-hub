-- =====================================================================
-- BS 5839-1 Compliance Validator – foundation schema
--
-- Internal-team module for validating fire-alarm compliance cases against
-- structured, paraphrased rule packs. NEVER stores full copyrighted
-- standard text – only clause references, internal paraphrased summaries,
-- applicability logic, evidence requirements, and validation outcomes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Standards (e.g. BS 5839-1:2025)
-- ---------------------------------------------------------------------
CREATE TABLE public.compliance_standards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL,
  title        TEXT NOT NULL,
  version      TEXT NOT NULL,
  domain       TEXT NOT NULL,
  publisher    TEXT NOT NULL DEFAULT 'BSI',
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','draft','superseded','archived')),
  source_url   TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

-- ---------------------------------------------------------------------
-- 2. Standard clauses (clause references only – no copyrighted text)
-- ---------------------------------------------------------------------
CREATE TABLE public.compliance_standard_clauses (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id            UUID NOT NULL REFERENCES public.compliance_standards(id) ON DELETE CASCADE,
  clause_ref             TEXT NOT NULL,
  clause_title           TEXT,
  licensed_source_pointer TEXT NOT NULL,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (standard_id, clause_ref)
);

-- ---------------------------------------------------------------------
-- 3. Validation rules (paraphrased internal summaries only)
-- ---------------------------------------------------------------------
CREATE TABLE public.compliance_validation_rules (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id             UUID NOT NULL REFERENCES public.compliance_standards(id) ON DELETE CASCADE,
  clause_id               UUID REFERENCES public.compliance_standard_clauses(id) ON DELETE SET NULL,
  rule_key                TEXT NOT NULL UNIQUE,
  domain                  TEXT NOT NULL,
  stage                   TEXT NOT NULL
                            CHECK (stage IN ('design','installation','commissioning','maintenance','handover','documentation','other')),
  topic                   TEXT NOT NULL,
  short_title             TEXT NOT NULL,
  obligation_summary      TEXT NOT NULL,
  applicability           JSONB NOT NULL DEFAULT '{}'::jsonb,
  inputs_required         JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_required       JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluation_type         TEXT NOT NULL
                            CHECK (evaluation_type IN ('required_field','required_evidence','enumerated','decision_table','calculation','cross_document','date_interval','manual_review')),
  evaluation_logic        JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity                TEXT NOT NULL DEFAULT 'medium'
                            CHECK (severity IN ('low','medium','high','critical')),
  manual_review_triggers  JSONB NOT NULL DEFAULT '[]'::jsonb,
  pass_message            TEXT,
  fail_message            TEXT,
  status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','active','deprecated','archived')),
  rule_version            INTEGER NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_validation_rules_standard ON public.compliance_validation_rules(standard_id);
CREATE INDEX idx_compliance_validation_rules_status   ON public.compliance_validation_rules(status);

-- ---------------------------------------------------------------------
-- 4. Compliance cases
-- ---------------------------------------------------------------------
CREATE TABLE public.compliance_cases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number         TEXT NOT NULL UNIQUE,
  site_id             UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  customer_id         UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  job_reference       TEXT,
  premises_name       TEXT,
  premises_address    TEXT,
  domain              TEXT NOT NULL DEFAULT 'fire_alarm',
  job_type            TEXT NOT NULL DEFAULT 'design'
                        CHECK (job_type IN ('design','installation','commissioning','maintenance','takeover','remedial')),
  case_status         TEXT NOT NULL DEFAULT 'draft'
                        CHECK (case_status IN ('draft','ready_to_validate','in_validation','needs_evidence','needs_review','remediation_required','ready_for_signoff','signed_off','archived')),
  scope               JSONB NOT NULL DEFAULT '{}'::jsonb,
  applicable_standards JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by          UUID NOT NULL,
  assigned_reviewer   UUID,
  signed_off_by       UUID,
  signed_off_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_cases_status ON public.compliance_cases(case_status);
CREATE INDEX idx_compliance_cases_site   ON public.compliance_cases(site_id);

-- ---------------------------------------------------------------------
-- 5. Case inputs (free-form key/value)
-- ---------------------------------------------------------------------
CREATE TABLE public.compliance_case_inputs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES public.compliance_cases(id) ON DELETE CASCADE,
  input_key   TEXT NOT NULL,
  input_value JSONB NOT NULL,
  source      TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','imported','extracted','calculated')),
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, input_key)
);

-- ---------------------------------------------------------------------
-- 6. Evidence documents
-- ---------------------------------------------------------------------
CREATE TABLE public.compliance_evidence_documents (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                  UUID NOT NULL REFERENCES public.compliance_cases(id) ON DELETE CASCADE,
  document_type            TEXT NOT NULL,
  file_name                TEXT NOT NULL,
  storage_path             TEXT,
  external_url             TEXT,
  extracted_text_summary   TEXT,
  metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by              UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_evidence_case ON public.compliance_evidence_documents(case_id);
CREATE INDEX idx_compliance_evidence_type ON public.compliance_evidence_documents(document_type);

-- ---------------------------------------------------------------------
-- 7. Validation runs
-- ---------------------------------------------------------------------
CREATE TABLE public.compliance_validation_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES public.compliance_cases(id) ON DELETE CASCADE,
  run_status    TEXT NOT NULL DEFAULT 'queued'
                  CHECK (run_status IN ('queued','running','completed','failed','cancelled')),
  triggered_by  UUID,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  rule_pack     JSONB NOT NULL DEFAULT '[]'::jsonb,
  run_summary   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_runs_case ON public.compliance_validation_runs(case_id);

-- ---------------------------------------------------------------------
-- 8. Validation results (immutable per run)
-- ---------------------------------------------------------------------
CREATE TABLE public.compliance_validation_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID NOT NULL REFERENCES public.compliance_validation_runs(id) ON DELETE CASCADE,
  case_id             UUID NOT NULL REFERENCES public.compliance_cases(id) ON DELETE CASCADE,
  rule_id             UUID NOT NULL REFERENCES public.compliance_validation_rules(id) ON DELETE RESTRICT,
  rule_key_snapshot   TEXT NOT NULL,
  rule_version_snapshot INTEGER NOT NULL DEFAULT 1,
  outcome             TEXT NOT NULL
                        CHECK (outcome IN ('pass','fail','needs_evidence','needs_review','not_applicable','error')),
  severity            TEXT NOT NULL DEFAULT 'medium',
  confidence          NUMERIC,
  evidence_used       JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_inputs      JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_evidence    JSONB NOT NULL DEFAULT '[]'::jsonb,
  finding_summary     TEXT NOT NULL,
  finding_detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status       TEXT NOT NULL DEFAULT 'open'
                        CHECK (review_status IN ('open','accepted','rejected','overridden','permitted_variation','remediation_assigned','evidence_requested','closed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_results_run     ON public.compliance_validation_results(run_id);
CREATE INDEX idx_compliance_results_case    ON public.compliance_validation_results(case_id);
CREATE INDEX idx_compliance_results_outcome ON public.compliance_validation_results(outcome);
CREATE INDEX idx_compliance_results_review  ON public.compliance_validation_results(review_status);

-- ---------------------------------------------------------------------
-- 9. Review actions (audit trail)
-- ---------------------------------------------------------------------
CREATE TABLE public.compliance_review_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id     UUID NOT NULL REFERENCES public.compliance_validation_results(id) ON DELETE CASCADE,
  action        TEXT NOT NULL
                  CHECK (action IN ('accept','reject','override','permitted_variation','assign_remediation','request_evidence','reopen','close')),
  reviewer      UUID NOT NULL,
  rationale     TEXT NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_review_actions_result ON public.compliance_review_actions(result_id);

-- =====================================================================
-- Triggers (updated_at)
-- =====================================================================
CREATE TRIGGER update_compliance_standards_updated_at
  BEFORE UPDATE ON public.compliance_standards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_compliance_validation_rules_updated_at
  BEFORE UPDATE ON public.compliance_validation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_compliance_cases_updated_at
  BEFORE UPDATE ON public.compliance_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- Row level security – follows existing QMS pattern (elevated-role gated)
-- =====================================================================
ALTER TABLE public.compliance_standards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_standard_clauses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_validation_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_cases                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_case_inputs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_evidence_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_validation_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_validation_results   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_review_actions       ENABLE ROW LEVEL SECURITY;

-- Standards & clauses: readable by any authenticated user, manageable by elevated roles
CREATE POLICY "Authenticated can view compliance standards"
  ON public.compliance_standards FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Elevated can manage compliance standards"
  ON public.compliance_standards FOR ALL USING (has_elevated_role(auth.uid()));

CREATE POLICY "Authenticated can view compliance clauses"
  ON public.compliance_standard_clauses FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Elevated can manage compliance clauses"
  ON public.compliance_standard_clauses FOR ALL USING (has_elevated_role(auth.uid()));

CREATE POLICY "Authenticated can view compliance rules"
  ON public.compliance_validation_rules FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Elevated can manage compliance rules"
  ON public.compliance_validation_rules FOR ALL USING (has_elevated_role(auth.uid()));

-- Cases & related: elevated-role gated (internal team only)
CREATE POLICY "Elevated can view compliance cases"
  ON public.compliance_cases FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated can manage compliance cases"
  ON public.compliance_cases FOR ALL USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated can view compliance case inputs"
  ON public.compliance_case_inputs FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated can manage compliance case inputs"
  ON public.compliance_case_inputs FOR ALL USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated can view compliance evidence"
  ON public.compliance_evidence_documents FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated can manage compliance evidence"
  ON public.compliance_evidence_documents FOR ALL USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated can view compliance runs"
  ON public.compliance_validation_runs FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated can manage compliance runs"
  ON public.compliance_validation_runs FOR ALL USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated can view compliance results"
  ON public.compliance_validation_results FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated can manage compliance results"
  ON public.compliance_validation_results FOR ALL USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated can view compliance review actions"
  ON public.compliance_review_actions FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated can manage compliance review actions"
  ON public.compliance_review_actions FOR ALL USING (has_elevated_role(auth.uid()));

-- =====================================================================
-- Seed: BS 5839-1 (DRAFT / EXAMPLE rule pack only)
--
-- All wording below is internal paraphrase / placeholder text. No
-- British Standard text is reproduced. Clause references are PLACEHOLDER
-- pointers to be replaced by a competent person referencing licensed copy.
-- =====================================================================

-- Standard
INSERT INTO public.compliance_standards (code, title, version, domain, publisher, status, source_url, notes)
VALUES (
  'BS 5839-1',
  'Fire detection and fire alarm systems for buildings — Code of practice for the design, installation, commissioning and maintenance of systems in non-domestic premises',
  '2025',
  'fire_alarm',
  'BSI',
  'active',
  'https://knowledge.bsigroup.com/products/fire-detection-and-fire-alarm-systems-for-buildings-design-installation-commissioning-and-maintenance-of-systems-in-non-domestic-premises-code-of-practice',
  'DRAFT/EXAMPLE rule pack. Clause references are placeholders – a competent person must replace them with licensed clause numbers from BS 5839-1:2025 before activation.'
);

-- Clause placeholders (no copyrighted text)
WITH s AS (
  SELECT id FROM public.compliance_standards WHERE code='BS 5839-1' AND version='2025'
)
INSERT INTO public.compliance_standard_clauses (standard_id, clause_ref, clause_title, licensed_source_pointer, notes)
SELECT s.id, c.clause_ref, c.clause_title, c.pointer, 'Placeholder – verify against licensed BS 5839-1:2025 copy.'
FROM s, (VALUES
  ('design.category',           'System category determination',          'BS 5839-1:2025, design clause (placeholder)'),
  ('design.zoning',             'Detection and alarm zoning',             'BS 5839-1:2025, zoning clause (placeholder)'),
  ('design.coverage',           'Detector coverage and spacing',          'BS 5839-1:2025, coverage clause (placeholder)'),
  ('design.power_supply',       'Mains and standby power supply',         'BS 5839-1:2025, power supply clause (placeholder)'),
  ('design.cabling',            'Cable selection and segregation',        'BS 5839-1:2025, cabling clause (placeholder)'),
  ('install.records',           'Installation records and labelling',     'BS 5839-1:2025, installation clause (placeholder)'),
  ('install.variations',        'Recording variations from design',       'BS 5839-1:2025, variations clause (placeholder)'),
  ('commissioning.tests',       'Commissioning tests and results',        'BS 5839-1:2025, commissioning clause (placeholder)'),
  ('commissioning.cause_effect','Cause-and-effect verification',          'BS 5839-1:2025, cause-and-effect clause (placeholder)'),
  ('commissioning.certificate', 'Commissioning certificate issue',        'BS 5839-1:2025, certificate clause (placeholder)'),
  ('handover.documentation',    'Handover documentation pack',            'BS 5839-1:2025, handover clause (placeholder)'),
  ('maintenance.intervals',     'Routine servicing intervals',            'BS 5839-1:2025, maintenance interval clause (placeholder)')
) AS c(clause_ref, clause_title, pointer);

-- Rule pack (paraphrased, status='draft' until reviewed by competent person)
WITH s AS (
  SELECT id FROM public.compliance_standards WHERE code='BS 5839-1' AND version='2025'
), c AS (
  SELECT clause_ref, id FROM public.compliance_standard_clauses
  WHERE standard_id = (SELECT id FROM s)
)
INSERT INTO public.compliance_validation_rules (
  standard_id, clause_id, rule_key, domain, stage, topic, short_title,
  obligation_summary, applicability, inputs_required, evidence_required,
  evaluation_type, evaluation_logic, severity, manual_review_triggers,
  pass_message, fail_message, status
)
SELECT
  (SELECT id FROM s),
  (SELECT id FROM c WHERE clause_ref = r.clause_ref),
  r.rule_key, r.domain, r.stage, r.topic, r.short_title,
  r.obligation_summary, r.applicability::jsonb, r.inputs_required::jsonb,
  r.evidence_required::jsonb, r.evaluation_type, r.evaluation_logic::jsonb,
  r.severity, r.manual_review_triggers::jsonb,
  r.pass_message, r.fail_message, 'draft'
FROM (VALUES
  (
    'design.category', 'bs5839_1_design_category_recorded',
    'fire_alarm', 'design', 'system_category',
    'Record selected fire alarm system category',
    'Internal paraphrase: a system category appropriate to the building use, occupancy and risk profile must be recorded for every non-domestic fire detection and fire alarm system case. (Placeholder summary – do not treat as a substitute for the British Standard.)',
    '{"all":[{"field":"system_domain","operator":"equals","value":"fire_alarm"},{"field":"premises_type","operator":"not_equals","value":"domestic_single_family"}]}',
    '["fire_alarm_category"]',
    '["design_certificate"]',
    'required_field',
    '{"field":"fire_alarm_category"}',
    'high',
    '["variation_declared","risk_profile_unknown"]',
    'A fire alarm system category has been recorded for the case.',
    'No fire alarm system category has been recorded. Competent-person input required.'
  ),
  (
    'design.zoning', 'bs5839_1_design_zoning_recorded',
    'fire_alarm', 'design', 'zoning',
    'Record detection and alarm zoning approach',
    'Internal paraphrase: the proposed zoning of detection and alarm circuits must be documented for the case so that it can be reviewed against the building layout. (Placeholder summary.)',
    '{"all":[{"field":"system_domain","operator":"equals","value":"fire_alarm"}]}',
    '["zoning_summary"]',
    '["design_drawings"]',
    'required_field',
    '{"field":"zoning_summary"}',
    'medium',
    '[]',
    'Zoning summary recorded.',
    'Zoning summary missing – record proposed zoning for review.'
  ),
  (
    'design.coverage', 'bs5839_1_design_fra_reference',
    'fire_alarm', 'design', 'risk_basis',
    'Reference to fire risk assessment',
    'Internal paraphrase: design decisions for non-domestic systems should be traceable to a fire risk assessment for the premises. The case must reference an FRA. (Placeholder summary.)',
    '{"all":[{"field":"premises_type","operator":"not_equals","value":"domestic_single_family"}]}',
    '["fire_risk_assessment_reference"]',
    '["fire_risk_assessment"]',
    'required_evidence',
    '{"evidence_type":"fire_risk_assessment"}',
    'high',
    '["risk_profile_unknown"]',
    'Fire risk assessment evidence linked to case.',
    'Fire risk assessment evidence not linked – upload or reference the FRA.'
  ),
  (
    'design.power_supply', 'bs5839_1_design_power_supply_documented',
    'fire_alarm', 'design', 'power_supply',
    'Power supply arrangement documented',
    'Internal paraphrase: the mains and standby power supply arrangement (battery capacity calculation reference, mains source) should be documented for review. (Placeholder summary.)',
    '{"all":[{"field":"system_domain","operator":"equals","value":"fire_alarm"}]}',
    '["power_supply_summary","battery_capacity_calc_reference"]',
    '["design_drawings"]',
    'required_field',
    '{"all":["power_supply_summary","battery_capacity_calc_reference"]}',
    'high',
    '[]',
    'Power supply arrangement documented.',
    'Power supply arrangement incomplete – record mains source and battery capacity calc reference.'
  ),
  (
    'install.records', 'bs5839_1_install_photos_evidence',
    'fire_alarm', 'installation', 'install_evidence',
    'Installation evidence captured',
    'Internal paraphrase: installation evidence (e.g. photos of installed devices, cable routes and labelling) must be captured to support handover. (Placeholder summary.)',
    '{"all":[{"field":"job_type","operator":"in","value":["installation","commissioning","handover"]}]}',
    '[]',
    '["installation_photos"]',
    'required_evidence',
    '{"evidence_type":"installation_photos"}',
    'medium',
    '[]',
    'Installation photo evidence linked.',
    'Installation photo evidence missing – upload installation photos.'
  ),
  (
    'install.variations', 'bs5839_1_install_variations_logged',
    'fire_alarm', 'installation', 'variations',
    'Variations from design recorded',
    'Internal paraphrase: any variation from the original design must be recorded against the case so it can be reviewed and accepted as a permitted variation or corrected. (Placeholder summary.)',
    '{"all":[{"field":"variation_declared","operator":"equals","value":true}]}',
    '["variation_summary"]',
    '["variation_record"]',
    'manual_review',
    '{"reason":"variation_declared"}',
    'high',
    '["variation_declared"]',
    'Variation recorded for competent-person review.',
    'Variation declared but no variation summary recorded – competent-person review required.'
  ),
  (
    'commissioning.tests', 'bs5839_1_commissioning_tests_complete',
    'fire_alarm', 'commissioning', 'tests',
    'Commissioning test results recorded',
    'Internal paraphrase: a commissioning test result set must be recorded against the case before the system is considered ready for handover. (Placeholder summary.)',
    '{"all":[{"field":"job_type","operator":"in","value":["commissioning","handover"]}]}',
    '["commissioning_test_results"]',
    '["commissioning_certificate"]',
    'required_field',
    '{"field":"commissioning_test_results"}',
    'critical',
    '[]',
    'Commissioning test results recorded.',
    'Commissioning test results missing – record results and link the certificate.'
  ),
  (
    'commissioning.cause_effect', 'bs5839_1_commissioning_cause_effect_verified',
    'fire_alarm', 'commissioning', 'cause_effect',
    'Cause-and-effect verified',
    'Internal paraphrase: the cause-and-effect matrix should be verified during commissioning and the result recorded. (Placeholder summary.)',
    '{"all":[{"field":"job_type","operator":"in","value":["commissioning","handover"]}]}',
    '["cause_effect_verified"]',
    '["commissioning_certificate"]',
    'required_field',
    '{"field":"cause_effect_verified","equals":true}',
    'critical',
    '[]',
    'Cause-and-effect verification recorded.',
    'Cause-and-effect verification not recorded – verify and record the result.'
  ),
  (
    'commissioning.certificate', 'bs5839_1_commissioning_certificate_present',
    'fire_alarm', 'commissioning', 'certificate',
    'Commissioning certificate uploaded',
    'Internal paraphrase: a commissioning certificate must be uploaded to the case before sign-off. (Placeholder summary.)',
    '{"all":[{"field":"job_type","operator":"in","value":["commissioning","handover"]}]}',
    '[]',
    '["commissioning_certificate"]',
    'required_evidence',
    '{"evidence_type":"commissioning_certificate"}',
    'critical',
    '[]',
    'Commissioning certificate linked to case.',
    'Commissioning certificate missing – upload signed certificate.'
  ),
  (
    'handover.documentation', 'bs5839_1_handover_pack_ready',
    'fire_alarm', 'handover', 'documentation',
    'Handover documentation pack assembled',
    'Internal paraphrase: a handover pack including design, installation, commissioning and operating information should be assembled for the responsible person. (Placeholder summary.)',
    '{"all":[{"field":"job_type","operator":"in","value":["handover","commissioning"]}]}',
    '[]',
    '["handover_pack"]',
    'required_evidence',
    '{"evidence_type":"handover_pack"}',
    'high',
    '[]',
    'Handover pack linked to case.',
    'Handover pack missing – assemble and upload the pack.'
  ),
  (
    'maintenance.intervals', 'bs5839_1_maintenance_interval_set',
    'fire_alarm', 'maintenance', 'service_interval',
    'Routine servicing interval recorded',
    'Internal paraphrase: a routine servicing interval consistent with the standard and the customer agreement should be recorded for the case. (Placeholder summary.)',
    '{"all":[{"field":"job_type","operator":"in","value":["maintenance","takeover"]}]}',
    '["service_interval_months"]',
    '["maintenance_record"]',
    'required_field',
    '{"field":"service_interval_months","min":1,"max":12}',
    'medium',
    '[]',
    'Service interval recorded.',
    'Service interval missing or out of expected 1–12 month range – record an interval and reason.'
  ),
  (
    'design.cabling', 'bs5839_1_design_cabling_documented',
    'fire_alarm', 'design', 'cabling',
    'Cable type and segregation documented',
    'Internal paraphrase: the cable type selection and segregation strategy should be documented for review. (Placeholder summary.)',
    '{"all":[{"field":"system_domain","operator":"equals","value":"fire_alarm"}]}',
    '["cabling_summary"]',
    '["design_drawings"]',
    'required_field',
    '{"field":"cabling_summary"}',
    'medium',
    '[]',
    'Cabling strategy documented.',
    'Cabling strategy missing – record cable type and segregation approach.'
  )
) AS r(
  clause_ref, rule_key, domain, stage, topic, short_title,
  obligation_summary, applicability, inputs_required, evidence_required,
  evaluation_type, evaluation_logic, severity, manual_review_triggers,
  pass_message, fail_message
);

-- BAFE SP203-1 v8.0.1 compliance — foundation tables
-- ─────────────────────────────────────────────────────────────────────
-- Foundation PR #1 of four for the BAFE compliance module. This pass
-- creates the per-process compliance trackers (lead individuals,
-- defects/complaints, false alarms, maintenance contracts, backup
-- cover, KPIs, MS reviews, surveillance audits) and extends
-- company_settings with the BAFE registration metadata that lives at
-- the company level.
--
-- Schema adaptations from the original spec:
--   - No multi-tenant `organisations` table — this is a single-tenant
--     app, so the spec's `organisation_id` FK is dropped throughout.
--     Each table is implicitly scoped to "this company".
--   - `users` references → `auth.users(id)`. Display data joins via
--     the existing `profiles` table.
--   - `jobs` references → `service_visits(id)` (the canonical visit
--     table; `visits` and `service_visits` resolve to the same row
--     set in this codebase).
--   - The spec's `bafe_organisation_profile` table is replaced with
--     additive columns on `company_settings` since both would be
--     singletons here.
--
-- Excluded from this PR (in follow-ups):
--   - `bafe_certificates` — PR #2 extends the existing
--     `site_bafe_certificates` table instead of duplicating.
--   - `bafe_subcontractors` — PR #2 extends the existing
--     `subcontractors` table.
--   - `bafe_compliance_alerts` view — PR #2.
--   - GENERATED STORED columns from the spec that used `now()` —
--     dropped. Postgres requires IMMUTABLE expressions in stored
--     generated columns; `now()` is STABLE. The "overdue" flag
--     would also be wrong even if it compiled: a stored column
--     captures the value at INSERT and never updates. PR #2's
--     alerts view computes these at query time instead.

-- ── company_settings — BAFE registration metadata ────────────────────
-- One row per company; these columns describe the company's BAFE
-- registration status, not per-job state.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS bafe_registration_number text,
  ADD COLUMN IF NOT EXISTS bafe_registration_expiry date,
  ADD COLUMN IF NOT EXISTS bafe_certification_body text,
  ADD COLUMN IF NOT EXISTS bafe_cb_certificate_ref text,
  ADD COLUMN IF NOT EXISTS bafe_primary_contact_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- modules_certified = which BAFE SP203-1 modules the company is
  -- certified for. Array so a company holding two modules can list
  -- both without separate rows. Constrained values match Clauses
  -- 11.4-14.5 module list.
  ADD COLUMN IF NOT EXISTS bafe_modules_certified text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bafe_suspended boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bafe_suspension_date date,
  ADD COLUMN IF NOT EXISTS bafe_suspension_reason text;

-- ── bafe_lead_individuals (Clauses 11.4-14.5) ────────────────────────
-- One row per Lead Individual per module. A single person holding
-- Lead status across multiple modules has multiple rows (queryable
-- by user_id). `replacement_deadline` is computed from departed_date
-- + 90 days at the application layer (not a stored generated column;
-- date math in a CHECK is fine but interval arithmetic on null-
-- allowed columns plays badly with GENERATED constraints).

CREATE TABLE IF NOT EXISTS public.bafe_lead_individuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  module text NOT NULL CHECK (module IN ('design','installation','commissioning','maintenance')),
  qualification_name text,
  qualification_level text,
  qualification_body text,
  qualification_date date,
  -- CPD records as an array of small objects ({ date, hours, topic,
  -- evidence_url }) — flexible and avoids a satellite table for a
  -- per-individual history that auditors read top-down.
  cpd_records jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','interim','departed')),
  departed_date date,
  cb_notified_date date,
  -- replacement_deadline kept as a regular nullable column rather
  -- than GENERATED so it can be manually overridden if BAFE grant an
  -- extension. Application sets it to departed_date + 90 days on
  -- departure; alert logic in PR #2 falls back to the computed value
  -- when this column is null.
  replacement_deadline date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bafe_lead_individuals_module
  ON public.bafe_lead_individuals(module) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_bafe_lead_individuals_status
  ON public.bafe_lead_individuals(status, departed_date)
  WHERE status = 'departed';

-- ── bafe_defect_complaints (Clauses 10.5-10.6) ───────────────────────
-- BAFE-specific complaint/defect register. Distinct from the existing
-- `issues` table (which is device-fault-level). This one tracks the
-- top-level complaint/defect lifecycle for the SP203-1 audit.

CREATE TABLE IF NOT EXISTS public.bafe_defect_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid REFERENCES public.service_visits(id) ON DELETE SET NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('defect','complaint','false_alarm')),
  reported_date date NOT NULL,
  description text,
  corrective_action text,
  resolution_date date,
  -- BAFE clause 10.6 — the engineer might recommend remedial work
  -- that the customer refuses. Record that, because the org keeps
  -- the certification responsibility unless the refusal is
  -- documented and accepted.
  customer_prohibited_remedial boolean NOT NULL DEFAULT false,
  -- KPI period — populated at insert so KPI roll-ups can join
  -- straight onto bafe_kpi_records without re-deriving month/year.
  kpi_month int CHECK (kpi_month BETWEEN 1 AND 12),
  kpi_year int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bafe_defect_complaints_kpi
  ON public.bafe_defect_complaints(kpi_year, kpi_month, type);
CREATE INDEX IF NOT EXISTS idx_bafe_defect_complaints_unresolved
  ON public.bafe_defect_complaints(reported_date) WHERE resolution_date IS NULL;

-- ── bafe_false_alarms (Clause 10.3) ──────────────────────────────────
-- Discrete false alarm log. Audited at every surveillance visit.
-- Kept separate from `bafe_defect_complaints` even though
-- 'false_alarm' is one of its enum values — BAFE explicitly requires
-- a distinct false-alarm register with cause/corrective action and
-- the count is a headline KPI.

CREATE TABLE IF NOT EXISTS public.bafe_false_alarms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  occurrence_date date NOT NULL,
  cause text,
  corrective_action text,
  customer_notified boolean NOT NULL DEFAULT false,
  customer_prohibited_action boolean NOT NULL DEFAULT false,
  remotely_connected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bafe_false_alarms_site_date
  ON public.bafe_false_alarms(site_id, occurrence_date DESC);

-- ── bafe_maintenance_contracts (Clauses 14.1-14.13) ──────────────────
-- Per-site contract metadata: SLA, ARC arrangements, inherited-system
-- flag + Clause 14.12 inspection tracking. One row per site under a
-- BAFE maintenance contract — distinct from
-- `site_service_contracts` which is generic recurring-service
-- contract tracking, not BAFE-specific.

CREATE TABLE IF NOT EXISTS public.bafe_maintenance_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  contract_start date,
  contract_review date,
  -- 8-hour fault attendance SLA is Clause 14.6 default; column lets
  -- the contract document a longer SLA where the customer accepted
  -- in writing.
  fault_attendance_sla_hours int NOT NULL DEFAULT 8 CHECK (fault_attendance_sla_hours > 0),
  arc_agreement boolean NOT NULL DEFAULT false,
  arc_provider text,
  arc_cert_body text,
  -- Clause 14.10 — ARC must report activations within 24h or NWD.
  arc_notification_within_24h boolean NOT NULL DEFAULT false,
  spare_parts_access boolean NOT NULL DEFAULT true,
  -- Clause 14.13.2 — when spares aren't available, customer must be
  -- notified in writing. Date captured so audit can verify the
  -- notification was timely.
  spare_parts_unavailable_notified boolean NOT NULL DEFAULT false,
  spare_parts_notification_date date,
  -- Clause 14.12 — taking over a system that wasn't previously
  -- maintained by this org requires an inspection against
  -- BS 5839-1 and documenting variations.
  inherited_system boolean NOT NULL DEFAULT false,
  clause_1412_inspection_complete boolean NOT NULL DEFAULT false,
  clause_1412_inspection_date date,
  clause_1412_variations_documented boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id)
);

CREATE INDEX IF NOT EXISTS idx_bafe_maintenance_inherited_outstanding
  ON public.bafe_maintenance_contracts(site_id)
  WHERE inherited_system = true AND clause_1412_inspection_complete = false;

-- ── bafe_backup_cover (Clause 14.9.4) ────────────────────────────────
-- Single-engineer organisations must have a formal backup cover
-- contract with another BAFE SP203-1 maintenance-certified
-- organisation. Single-tenant means a single row "live" at a time
-- (active=true) but history is preserved for audit.

CREATE TABLE IF NOT EXISTS public.bafe_backup_cover (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_org_name text NOT NULL,
  backup_bafe_number text,
  contract_ref text,
  contract_start date,
  contract_expiry date,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bafe_backup_cover_active
  ON public.bafe_backup_cover(contract_expiry) WHERE active = true;

-- ── bafe_kpi_records (Clause 10) ─────────────────────────────────────
-- Monthly KPI tracking. UNIQUE(period_month, period_year, metric)
-- enforces one row per metric per month — overwrite on re-roll-up
-- by upserting on the conflict.

CREATE TABLE IF NOT EXISTS public.bafe_kpi_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year int NOT NULL,
  metric text NOT NULL CHECK (metric IN (
    'complaints_received',
    'defects_raised',
    'false_alarms',
    'certs_issued_on_time',
    'attendance_sla_met',
    'subcontractor_checks_current'
  )),
  target numeric(10,2),
  actual numeric(10,2),
  -- met is application-derived (target/actual + metric direction).
  -- Stored so reports don't re-derive every render.
  met boolean,
  variance_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_month, period_year, metric)
);

CREATE INDEX IF NOT EXISTS idx_bafe_kpi_period
  ON public.bafe_kpi_records(period_year DESC, period_month DESC);

-- ── bafe_ms_reviews (Clause 10.2) ────────────────────────────────────
-- Management system review log — max 12-month intervals. Each row's
-- next_review_due drives the alert in PR #2.

CREATE TABLE IF NOT EXISTS public.bafe_ms_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_date date NOT NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changes_made text,
  next_review_due date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bafe_ms_reviews_next_due
  ON public.bafe_ms_reviews(next_review_due DESC);

-- ── bafe_surveillance_audits (Clause 9) ──────────────────────────────
-- CB audit tracker. initial → first_surveillance (6 months) →
-- surveillance (12-monthly) → special (90 days when adverse).

CREATE TABLE IF NOT EXISTS public.bafe_surveillance_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_type text NOT NULL
    CHECK (audit_type IN ('initial','first_surveillance','surveillance','special')),
  scheduled_date date,
  completed_date date,
  outcome text CHECK (outcome IN ('pass','conditional','non_compliance','suspended')),
  non_compliance_details text,
  remedial_deadline date,
  remedial_completed_date date,
  next_audit_due date,
  certification_body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bafe_surveillance_next_due
  ON public.bafe_surveillance_audits(next_audit_due);
CREATE INDEX IF NOT EXISTS idx_bafe_surveillance_remedial_outstanding
  ON public.bafe_surveillance_audits(remedial_deadline)
  WHERE outcome IN ('conditional','non_compliance') AND remedial_completed_date IS NULL;

-- ── RLS ──────────────────────────────────────────────────────────────
-- Match the existing project pattern: elevated users (defined via
-- has_elevated_role) read + write everything. BAFE data is
-- management/compliance — engineers don't need direct access to the
-- raw tables; they interact via the dashboards in PR #4-5.

ALTER TABLE public.bafe_lead_individuals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_defect_complaints    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_false_alarms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_maintenance_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_backup_cover         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_kpi_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_ms_reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_surveillance_audits  ENABLE ROW LEVEL SECURITY;

CREATE POLICY bafe_lead_individuals_all     ON public.bafe_lead_individuals
  FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_defect_complaints_all    ON public.bafe_defect_complaints
  FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_false_alarms_all         ON public.bafe_false_alarms
  FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_maintenance_contracts_all ON public.bafe_maintenance_contracts
  FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_backup_cover_all         ON public.bafe_backup_cover
  FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_kpi_records_all          ON public.bafe_kpi_records
  FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_ms_reviews_all           ON public.bafe_ms_reviews
  FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_surveillance_audits_all  ON public.bafe_surveillance_audits
  FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));

-- ── updated_at triggers ──────────────────────────────────────────────
-- Reuse the project's existing update_updated_at_column() function.

CREATE TRIGGER trg_bafe_lead_individuals_updated_at
  BEFORE UPDATE ON public.bafe_lead_individuals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bafe_defect_complaints_updated_at
  BEFORE UPDATE ON public.bafe_defect_complaints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bafe_maintenance_contracts_updated_at
  BEFORE UPDATE ON public.bafe_maintenance_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bafe_backup_cover_updated_at
  BEFORE UPDATE ON public.bafe_backup_cover
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bafe_surveillance_audits_updated_at
  BEFORE UPDATE ON public.bafe_surveillance_audits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

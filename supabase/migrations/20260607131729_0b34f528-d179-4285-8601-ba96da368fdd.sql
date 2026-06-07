ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS bafe_registration_number text,
  ADD COLUMN IF NOT EXISTS bafe_registration_expiry date,
  ADD COLUMN IF NOT EXISTS bafe_certification_body text,
  ADD COLUMN IF NOT EXISTS bafe_cb_certificate_ref text,
  ADD COLUMN IF NOT EXISTS bafe_primary_contact_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bafe_modules_certified text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bafe_suspended boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bafe_suspension_date date,
  ADD COLUMN IF NOT EXISTS bafe_suspension_reason text;

CREATE TABLE IF NOT EXISTS public.bafe_lead_individuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  module text NOT NULL CHECK (module IN ('design','installation','commissioning','maintenance')),
  qualification_name text,
  qualification_level text,
  qualification_body text,
  qualification_date date,
  cpd_records jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','interim','departed')),
  departed_date date,
  cb_notified_date date,
  replacement_deadline date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bafe_lead_individuals_module ON public.bafe_lead_individuals(module) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_bafe_lead_individuals_status ON public.bafe_lead_individuals(status, departed_date) WHERE status = 'departed';

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
  customer_prohibited_remedial boolean NOT NULL DEFAULT false,
  kpi_month int CHECK (kpi_month BETWEEN 1 AND 12),
  kpi_year int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bafe_defect_complaints_kpi ON public.bafe_defect_complaints(kpi_year, kpi_month, type);
CREATE INDEX IF NOT EXISTS idx_bafe_defect_complaints_unresolved ON public.bafe_defect_complaints(reported_date) WHERE resolution_date IS NULL;

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
CREATE INDEX IF NOT EXISTS idx_bafe_false_alarms_site_date ON public.bafe_false_alarms(site_id, occurrence_date DESC);

CREATE TABLE IF NOT EXISTS public.bafe_maintenance_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  contract_start date,
  contract_review date,
  fault_attendance_sla_hours int NOT NULL DEFAULT 8 CHECK (fault_attendance_sla_hours > 0),
  arc_agreement boolean NOT NULL DEFAULT false,
  arc_provider text,
  arc_cert_body text,
  arc_notification_within_24h boolean NOT NULL DEFAULT false,
  spare_parts_access boolean NOT NULL DEFAULT true,
  spare_parts_unavailable_notified boolean NOT NULL DEFAULT false,
  spare_parts_notification_date date,
  inherited_system boolean NOT NULL DEFAULT false,
  clause_1412_inspection_complete boolean NOT NULL DEFAULT false,
  clause_1412_inspection_date date,
  clause_1412_variations_documented boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id)
);
CREATE INDEX IF NOT EXISTS idx_bafe_maintenance_inherited_outstanding ON public.bafe_maintenance_contracts(site_id) WHERE inherited_system = true AND clause_1412_inspection_complete = false;

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
CREATE INDEX IF NOT EXISTS idx_bafe_backup_cover_active ON public.bafe_backup_cover(contract_expiry) WHERE active = true;

CREATE TABLE IF NOT EXISTS public.bafe_kpi_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year int NOT NULL,
  metric text NOT NULL CHECK (metric IN ('complaints_received','defects_raised','false_alarms','certs_issued_on_time','attendance_sla_met','subcontractor_checks_current')),
  target numeric(10,2),
  actual numeric(10,2),
  met boolean,
  variance_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_month, period_year, metric)
);
CREATE INDEX IF NOT EXISTS idx_bafe_kpi_period ON public.bafe_kpi_records(period_year DESC, period_month DESC);

CREATE TABLE IF NOT EXISTS public.bafe_ms_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_date date NOT NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changes_made text,
  next_review_due date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bafe_ms_reviews_next_due ON public.bafe_ms_reviews(next_review_due DESC);

CREATE TABLE IF NOT EXISTS public.bafe_surveillance_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_type text NOT NULL CHECK (audit_type IN ('initial','first_surveillance','surveillance','special')),
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
CREATE INDEX IF NOT EXISTS idx_bafe_surveillance_next_due ON public.bafe_surveillance_audits(next_audit_due);
CREATE INDEX IF NOT EXISTS idx_bafe_surveillance_remedial_outstanding ON public.bafe_surveillance_audits(remedial_deadline) WHERE outcome IN ('conditional','non_compliance') AND remedial_completed_date IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bafe_lead_individuals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bafe_defect_complaints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bafe_false_alarms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bafe_maintenance_contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bafe_backup_cover TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bafe_kpi_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bafe_ms_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bafe_surveillance_audits TO authenticated;
GRANT ALL ON public.bafe_lead_individuals, public.bafe_defect_complaints, public.bafe_false_alarms, public.bafe_maintenance_contracts, public.bafe_backup_cover, public.bafe_kpi_records, public.bafe_ms_reviews, public.bafe_surveillance_audits TO service_role;

ALTER TABLE public.bafe_lead_individuals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_defect_complaints    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_false_alarms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_maintenance_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_backup_cover         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_kpi_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_ms_reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bafe_surveillance_audits  ENABLE ROW LEVEL SECURITY;

CREATE POLICY bafe_lead_individuals_all     ON public.bafe_lead_individuals     FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_defect_complaints_all    ON public.bafe_defect_complaints    FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_false_alarms_all         ON public.bafe_false_alarms         FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_maintenance_contracts_all ON public.bafe_maintenance_contracts FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_backup_cover_all         ON public.bafe_backup_cover         FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_kpi_records_all          ON public.bafe_kpi_records          FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_ms_reviews_all           ON public.bafe_ms_reviews           FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bafe_surveillance_audits_all  ON public.bafe_surveillance_audits  FOR ALL TO authenticated USING (has_elevated_role(auth.uid())) WITH CHECK (has_elevated_role(auth.uid()));

CREATE TRIGGER trg_bafe_lead_individuals_updated_at BEFORE UPDATE ON public.bafe_lead_individuals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bafe_defect_complaints_updated_at BEFORE UPDATE ON public.bafe_defect_complaints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bafe_maintenance_contracts_updated_at BEFORE UPDATE ON public.bafe_maintenance_contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bafe_backup_cover_updated_at BEFORE UPDATE ON public.bafe_backup_cover FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bafe_surveillance_audits_updated_at BEFORE UPDATE ON public.bafe_surveillance_audits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.site_bafe_certificates
  ADD COLUMN IF NOT EXISTS bafe_cert_type text CHECK (bafe_cert_type IS NULL OR bafe_cert_type IN ('compliance','modular','maintenance','modification')),
  ADD COLUMN IF NOT EXISTS bafe_modules_covered text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS completion_date date,
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_address_snapshot text,
  ADD COLUMN IF NOT EXISTS certification_body text,
  ADD COLUMN IF NOT EXISTS bafe_registered_org_ref text,
  ADD COLUMN IF NOT EXISTS variations_list text,
  ADD COLUMN IF NOT EXISTS bs5839_cert_issued boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retained_copy boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_reason text,
  ADD COLUMN IF NOT EXISTS signed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_site_bafe_certificates_bafe_outstanding ON public.site_bafe_certificates(completion_date) WHERE bafe_cert_type IS NOT NULL AND voided = false;

ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS bafe_registration_number text,
  ADD COLUMN IF NOT EXISTS bafe_modules_held text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bafe_verified_date date,
  ADD COLUMN IF NOT EXISTS bafe_expiry_date date,
  ADD COLUMN IF NOT EXISTS iso17065_equivalent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iso17065_cert_ref text,
  ADD COLUMN IF NOT EXISTS electrical_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS electrical_cert_body text,
  ADD COLUMN IF NOT EXISTS electrical_cert_ref text,
  ADD COLUMN IF NOT EXISTS competency_notes text;
CREATE INDEX IF NOT EXISTS idx_subcontractors_bafe_expiring ON public.subcontractors(bafe_expiry_date) WHERE bafe_expiry_date IS NOT NULL AND status = 'active' AND iso17065_equivalent = false;

CREATE OR REPLACE VIEW public.bafe_compliance_alerts AS
SELECT 'lead_departed_30d'::text AS alert_kind, li.id AS subject_id,
  'Lead Individual departed — notify Certification Body within 30 days'::text AS message,
  li.departed_date + interval '30 days' AS deadline,
  CASE WHEN now() > li.departed_date + interval '30 days' THEN 'overdue'::text ELSE 'upcoming'::text END AS severity,
  jsonb_build_object('lead_name', li.name, 'module', li.module, 'departed_date', li.departed_date) AS detail
FROM public.bafe_lead_individuals li
WHERE li.status = 'departed' AND li.cb_notified_date IS NULL AND li.departed_date IS NOT NULL
UNION ALL
SELECT 'lead_gap_90d', li.id,
  'Lead Individual gap — replacement required within 90 days or suspension',
  COALESCE(li.replacement_deadline, li.departed_date + interval '90 days'),
  CASE WHEN now() > COALESCE(li.replacement_deadline, li.departed_date + interval '90 days') THEN 'overdue' ELSE 'upcoming' END,
  jsonb_build_object('lead_name', li.name, 'module', li.module, 'departed_date', li.departed_date)
FROM public.bafe_lead_individuals li
WHERE li.status = 'departed' AND li.departed_date IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.bafe_lead_individuals r WHERE r.module = li.module AND r.status = 'active')
UNION ALL
SELECT 'no_lead_for_certified', NULL::uuid,
  'Module "' || module || '" listed as certified but no active Lead Individual',
  now()::date, 'overdue', jsonb_build_object('module', module)
FROM (SELECT unnest(bafe_modules_certified) AS module FROM public.company_settings) certified
WHERE NOT EXISTS (SELECT 1 FROM public.bafe_lead_individuals li WHERE li.module = certified.module AND li.status = 'active')
UNION ALL
SELECT 'cert_overdue', c.id,
  'BAFE ' || c.bafe_cert_type || ' certificate overdue — must be issued within 30 days of completion',
  c.completion_date + interval '30 days', 'overdue',
  jsonb_build_object('cert_number', c.certificate_number, 'completion_date', c.completion_date, 'site_id', c.site_id)
FROM public.site_bafe_certificates c
WHERE c.bafe_cert_type IS NOT NULL AND c.voided = false AND c.completion_date IS NOT NULL
  AND c.issued_date IS NULL AND c.completion_date + interval '30 days' < now()
UNION ALL
SELECT 'bs5839_cert_missing', c.id,
  'BS 5839-1 certificate not recorded alongside this BAFE certificate (Clause 16.4)',
  c.issued_date, 'outstanding',
  jsonb_build_object('cert_number', c.certificate_number, 'issued_date', c.issued_date)
FROM public.site_bafe_certificates c
WHERE c.bafe_cert_type IS NOT NULL AND c.voided = false AND c.issued_date IS NOT NULL AND c.bs5839_cert_issued = false
UNION ALL
SELECT 'ms_review_due', r.id, 'Management system review due', r.next_review_due,
  CASE WHEN now() > r.next_review_due THEN 'overdue' ELSE 'upcoming' END,
  jsonb_build_object('next_review_due', r.next_review_due)
FROM (SELECT * FROM public.bafe_ms_reviews ORDER BY review_date DESC LIMIT 1) r
WHERE r.next_review_due < now() + interval '30 days'
UNION ALL
SELECT 'subcontractor_expired', s.id,
  'Sub-contractor BAFE registration expired: ' || s.company_name,
  s.bafe_expiry_date, 'overdue',
  jsonb_build_object('company_name', s.company_name, 'bafe_expiry_date', s.bafe_expiry_date)
FROM public.subcontractors s
WHERE s.status = 'active' AND s.iso17065_equivalent = false AND s.bafe_expiry_date IS NOT NULL AND s.bafe_expiry_date < now()
UNION ALL
SELECT 'subcontractor_expiring', s.id,
  'Sub-contractor BAFE registration expires within 60 days: ' || s.company_name,
  s.bafe_expiry_date, 'upcoming',
  jsonb_build_object('company_name', s.company_name, 'bafe_expiry_date', s.bafe_expiry_date)
FROM public.subcontractors s
WHERE s.status = 'active' AND s.iso17065_equivalent = false AND s.bafe_expiry_date IS NOT NULL
  AND s.bafe_expiry_date >= now() AND s.bafe_expiry_date < now() + interval '60 days'
UNION ALL
SELECT 'backup_cover_expiring', b.id,
  'Maintenance backup cover contract expiring: ' || b.backup_org_name,
  b.contract_expiry,
  CASE WHEN b.contract_expiry < now() THEN 'overdue' ELSE 'upcoming' END,
  jsonb_build_object('backup_org_name', b.backup_org_name, 'contract_expiry', b.contract_expiry)
FROM public.bafe_backup_cover b
WHERE b.active = true AND b.contract_expiry IS NOT NULL AND b.contract_expiry < now() + interval '60 days'
UNION ALL
SELECT 'backup_cover_missing', NULL::uuid,
  'No active maintenance backup cover contract recorded (Clause 14.9.4)',
  now()::date, 'outstanding', '{}'::jsonb
FROM public.company_settings cs
WHERE 'maintenance' = ANY(cs.bafe_modules_certified)
  AND NOT EXISTS (SELECT 1 FROM public.bafe_backup_cover b WHERE b.active = true AND (b.contract_expiry IS NULL OR b.contract_expiry > now()))
UNION ALL
SELECT 'clause_1412_outstanding', m.id,
  'Inherited maintenance system — Clause 14.12 inspection outstanding',
  m.contract_start + interval '30 days', 'outstanding',
  jsonb_build_object('site_id', m.site_id, 'contract_start', m.contract_start)
FROM public.bafe_maintenance_contracts m
WHERE m.inherited_system = true AND m.clause_1412_inspection_complete = false
UNION ALL
SELECT 'surveillance_remedial', a.id,
  'Surveillance audit remedial action past deadline',
  a.remedial_deadline, 'overdue',
  jsonb_build_object('audit_type', a.audit_type, 'completed_date', a.completed_date, 'remedial_deadline', a.remedial_deadline)
FROM public.bafe_surveillance_audits a
WHERE a.outcome IN ('conditional','non_compliance') AND a.remedial_deadline IS NOT NULL
  AND a.remedial_deadline < now() AND a.remedial_completed_date IS NULL
UNION ALL
SELECT 'surveillance_overdue', a.id, 'Next surveillance audit overdue', a.next_audit_due,
  CASE WHEN now() > a.next_audit_due THEN 'overdue' ELSE 'upcoming' END,
  jsonb_build_object('next_audit_due', a.next_audit_due, 'certification_body', a.certification_body)
FROM public.bafe_surveillance_audits a
WHERE a.next_audit_due IS NOT NULL AND a.next_audit_due < now() + interval '30 days'
  AND a.id = (SELECT id FROM public.bafe_surveillance_audits ORDER BY COALESCE(completed_date, scheduled_date) DESC NULLS LAST LIMIT 1);
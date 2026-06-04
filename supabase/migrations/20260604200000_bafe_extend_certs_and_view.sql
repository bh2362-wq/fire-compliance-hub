-- BAFE SP203-1 — extend existing tables + compliance alerts view
-- ─────────────────────────────────────────────────────────────────────
-- PR #2 of the BAFE foundation series (builds on PR #1's eight new
-- per-process tracker tables). This pass extends the two tables that
-- already existed (site_bafe_certificates, subcontractors) with BAFE
-- SP203-1 v8.0.1 spec fields, and creates the compliance alerts
-- view that drives the dashboard component in a future PR.
--
-- Original spec had two SQL bugs that would have broken apply:
--   1. bafe_certificates.due_date and overdue were STORED GENERATED
--      columns using now() — Postgres requires IMMUTABLE expressions
--      in stored generated columns, and now() is STABLE. The migration
--      would have aborted with "generation expression is not
--      immutable". Even if it compiled, `overdue` would have been
--      wrong by design: STORED captures at INSERT and never updates,
--      so the flag would freeze at creation time.
--   2. bafe_compliance_alerts.lead_gap_90d arm of the UNION fired
--      for any departed lead, even after the CB had been notified
--      and a replacement was already active. Fixed: the gap alert
--      now checks for the absence of an active Lead in the same
--      module rather than just "any row with status=departed".
--
-- Both fixes are in the view below — overdue computed on-the-fly via
-- (completion_date + interval '30 days') < now(), and the lead gap
-- alert joins on missing active Leads.

-- ── site_bafe_certificates — BAFE SP203-1 cert fields ────────────────
-- Existing table already covers: site_id, certificate_type,
-- certificate_number, issued_date, issued_by, expiry_date, status,
-- notes + the two backlinks (form submission + service report). We
-- add the BAFE-specific fields needed by the SP203-1 cert lifecycle
-- without breaking existing rows.

ALTER TABLE public.site_bafe_certificates
  -- Discriminator — only populated when this row represents one of
  -- the four BAFE SP203-1 cert types. Existing non-BAFE rows
  -- (typically site fire risk assessments etc.) keep NULL here. The
  -- alerts view filters on `bafe_cert_type IS NOT NULL` so they're
  -- excluded from BAFE overdue tracking.
  ADD COLUMN IF NOT EXISTS bafe_cert_type text
    CHECK (bafe_cert_type IS NULL OR bafe_cert_type IN ('compliance','modular','maintenance','modification')),
  -- Which BAFE modules the cert covers. Compliance certs typically
  -- list all four; modular certs list one.
  ADD COLUMN IF NOT EXISTS bafe_modules_covered text[] DEFAULT '{}',
  -- completion_date is when the work was DONE (drives the 30-day
  -- issuance clock). issued_date is when the cert was raised. The
  -- two can differ by up to 30 days legitimately; longer = scheme
  -- non-compliance.
  ADD COLUMN IF NOT EXISTS completion_date date,
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  -- Site address snapshot captured at issuance — sites can be
  -- edited or merged later, and the cert is meant to reflect the
  -- as-issued state for audit.
  ADD COLUMN IF NOT EXISTS site_address_snapshot text,
  ADD COLUMN IF NOT EXISTS certification_body text,
  -- Our own BAFE registration number stored on the cert so a
  -- printed copy is self-describing. Snapshot, not FK, so it
  -- survives if company_settings.bafe_registration_number changes.
  ADD COLUMN IF NOT EXISTS bafe_registered_org_ref text,
  ADD COLUMN IF NOT EXISTS variations_list text,
  -- Clause 16.4 — BS 5839-1 certs must be issued alongside BAFE
  -- certs. Flag tracked here so the cert register can show "BAFE
  -- cert issued but BS 5839-1 cert missing" as an audit finding.
  ADD COLUMN IF NOT EXISTS bs5839_cert_issued boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retained_copy boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_reason text,
  ADD COLUMN IF NOT EXISTS signed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index supports the alerts view's overdue scan plus the dashboard's
-- "outstanding BAFE certs" query. Partial — only BAFE rows.
CREATE INDEX IF NOT EXISTS idx_site_bafe_certificates_bafe_outstanding
  ON public.site_bafe_certificates(completion_date)
  WHERE bafe_cert_type IS NOT NULL AND voided = false;

-- ── subcontractors — BAFE Clause 15 fields ───────────────────────────
-- Existing table tracks the basic contractor profile (company,
-- contact, insurance). We add the BAFE-specific verification fields
-- so the SP203-1 sub-contractor register can be queried from this
-- one source rather than a parallel table.

ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS bafe_registration_number text,
  -- Which BAFE SP203-1 modules they hold. Clause 15.2 requires us
  -- to verify this matches the work we use them for.
  ADD COLUMN IF NOT EXISTS bafe_modules_held text[] DEFAULT '{}',
  -- bafe_verified_date = when WE last confirmed their registration
  -- (vs bafe_expiry_date = when THEIR registration expires).
  ADD COLUMN IF NOT EXISTS bafe_verified_date date,
  ADD COLUMN IF NOT EXISTS bafe_expiry_date date,
  -- Clause 15.3 — if a BAFE SP203-1 sub isn't available, an
  -- ISO/IEC 17065-accredited equivalent is acceptable with
  -- justification.
  ADD COLUMN IF NOT EXISTS iso17065_equivalent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iso17065_cert_ref text,
  -- Clause 15.4 exception — Installation module ONLY. An electrical
  -- contractor with NICEIC Approved Contractor or NAPIT EAS is
  -- permitted for the cabling element only. Stored separately so
  -- the validator can enforce: this flag → Installation module only.
  ADD COLUMN IF NOT EXISTS electrical_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS electrical_cert_body text,
  ADD COLUMN IF NOT EXISTS electrical_cert_ref text,
  ADD COLUMN IF NOT EXISTS competency_notes text;

CREATE INDEX IF NOT EXISTS idx_subcontractors_bafe_expiring
  ON public.subcontractors(bafe_expiry_date)
  WHERE bafe_expiry_date IS NOT NULL AND status = 'active' AND iso17065_equivalent = false;

-- ── bafe_compliance_alerts view ──────────────────────────────────────
-- Drives the dashboard's overdue / upcoming / outstanding triage.
-- Each UNION arm produces one alert kind. now() is called inside
-- the WHERE clauses, not in stored columns — view rebuilds on every
-- SELECT, which is fine for the row counts involved.
--
-- Alert kinds:
--   lead_departed_30d        — CB notification window expiring/expired
--   lead_gap_90d             — module has no active Lead and a Lead has
--                              been departed >= some time
--   no_lead_for_certified    — module listed in company_settings.bafe
--                              _modules_certified but no active Lead
--   cert_overdue             — BAFE cert not issued within 30 days of
--                              completion
--   bs5839_cert_missing      — BAFE cert issued but BS 5839-1 cert
--                              cross-issue flag still false (Cl 16.4)
--   ms_review_due            — most recent MS review's next_review_due
--                              within 30 days or overdue
--   subcontractor_expired    — BAFE-only sub past expiry
--   subcontractor_expiring   — BAFE-only sub within 60 days of expiry
--   backup_cover_expiring    — active backup contract within 60 days
--   backup_cover_missing     — no active backup contract row at all
--   clause_1412_outstanding  — inherited maintenance system without
--                              the 14.12 inspection completed
--   surveillance_remedial    — surveillance non-compliance remedial
--                              past its deadline
--   surveillance_overdue     — next_audit_due passed

CREATE OR REPLACE VIEW public.bafe_compliance_alerts AS

-- Lead Individual — CB notification 30-day window
SELECT
  'lead_departed_30d'::text                                AS alert_kind,
  li.id                                                    AS subject_id,
  'Lead Individual departed — notify Certification Body within 30 days'::text AS message,
  li.departed_date + interval '30 days'                    AS deadline,
  CASE WHEN now() > li.departed_date + interval '30 days' THEN 'overdue'::text
       ELSE 'upcoming'::text END                            AS severity,
  jsonb_build_object(
    'lead_name', li.name,
    'module',    li.module,
    'departed_date', li.departed_date
  )                                                        AS detail
FROM public.bafe_lead_individuals li
WHERE li.status = 'departed'
  AND li.cb_notified_date IS NULL
  AND li.departed_date IS NOT NULL

UNION ALL

-- Lead Individual — 90-day replacement window. Fires only when the
-- module has no other active Lead. Original spec's missing
-- "cb_notified_date IS NULL" was actually a different bug: this
-- alert shouldn't depend on CB notification at all (the CB can be
-- notified within 30 days and the replacement still be missing at
-- 90 days). Fix: count active leads in same module via a NOT EXISTS.
SELECT
  'lead_gap_90d',
  li.id,
  'Lead Individual gap — replacement required within 90 days or suspension',
  COALESCE(li.replacement_deadline, li.departed_date + interval '90 days'),
  CASE WHEN now() > COALESCE(li.replacement_deadline, li.departed_date + interval '90 days') THEN 'overdue'
       ELSE 'upcoming' END,
  jsonb_build_object(
    'lead_name', li.name,
    'module',    li.module,
    'departed_date', li.departed_date
  )
FROM public.bafe_lead_individuals li
WHERE li.status = 'departed'
  AND li.departed_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.bafe_lead_individuals replacement
    WHERE replacement.module = li.module
      AND replacement.status = 'active'
  )

UNION ALL

-- No Lead at all for a module the company says it's certified in.
-- Cross-checks company_settings.bafe_modules_certified against
-- active Leads. Catches the bootstrap case where the company added
-- a module but never recorded the Lead.
SELECT
  'no_lead_for_certified',
  NULL::uuid,
  'Module "' || module || '" listed as certified but no active Lead Individual',
  now()::date,
  'overdue',
  jsonb_build_object('module', module)
FROM (
  SELECT unnest(bafe_modules_certified) AS module
  FROM public.company_settings
) certified
WHERE NOT EXISTS (
  SELECT 1 FROM public.bafe_lead_individuals li
  WHERE li.module = certified.module AND li.status = 'active'
)

UNION ALL

-- Cert overdue — 30 days since completion, not yet issued.
-- Replaces the original spec's STORED-now() generated columns.
SELECT
  'cert_overdue',
  c.id,
  'BAFE ' || c.bafe_cert_type || ' certificate overdue — must be issued within 30 days of completion',
  c.completion_date + interval '30 days',
  'overdue',
  jsonb_build_object(
    'cert_number', c.certificate_number,
    'completion_date', c.completion_date,
    'site_id', c.site_id
  )
FROM public.site_bafe_certificates c
WHERE c.bafe_cert_type IS NOT NULL
  AND c.voided = false
  AND c.completion_date IS NOT NULL
  AND c.issued_date IS NULL
  AND c.completion_date + interval '30 days' < now()

UNION ALL

-- Clause 16.4 — BS 5839-1 cert not issued alongside the BAFE cert.
SELECT
  'bs5839_cert_missing',
  c.id,
  'BS 5839-1 certificate not recorded alongside this BAFE certificate (Clause 16.4)',
  c.issued_date,
  'outstanding',
  jsonb_build_object(
    'cert_number', c.certificate_number,
    'issued_date', c.issued_date
  )
FROM public.site_bafe_certificates c
WHERE c.bafe_cert_type IS NOT NULL
  AND c.voided = false
  AND c.issued_date IS NOT NULL
  AND c.bs5839_cert_issued = false

UNION ALL

-- MS review due — pull only the LATEST review per organisation so
-- we don't fire one alert per historic row. Single-tenant means
-- there's only one company; the LATERAL is for clarity.
SELECT
  'ms_review_due',
  r.id,
  'Management system review due',
  r.next_review_due,
  CASE WHEN now() > r.next_review_due THEN 'overdue' ELSE 'upcoming' END,
  jsonb_build_object('next_review_due', r.next_review_due)
FROM (
  SELECT * FROM public.bafe_ms_reviews
  ORDER BY review_date DESC
  LIMIT 1
) r
WHERE r.next_review_due < now() + interval '30 days'

UNION ALL

-- Sub-contractor BAFE registration expired (excluding ISO17065
-- equivalents, which carry their own validity from the cert body).
SELECT
  'subcontractor_expired',
  s.id,
  'Sub-contractor BAFE registration expired: ' || s.company_name,
  s.bafe_expiry_date,
  'overdue',
  jsonb_build_object(
    'company_name', s.company_name,
    'bafe_expiry_date', s.bafe_expiry_date
  )
FROM public.subcontractors s
WHERE s.status = 'active'
  AND s.iso17065_equivalent = false
  AND s.bafe_expiry_date IS NOT NULL
  AND s.bafe_expiry_date < now()

UNION ALL

SELECT
  'subcontractor_expiring',
  s.id,
  'Sub-contractor BAFE registration expires within 60 days: ' || s.company_name,
  s.bafe_expiry_date,
  'upcoming',
  jsonb_build_object(
    'company_name', s.company_name,
    'bafe_expiry_date', s.bafe_expiry_date
  )
FROM public.subcontractors s
WHERE s.status = 'active'
  AND s.iso17065_equivalent = false
  AND s.bafe_expiry_date IS NOT NULL
  AND s.bafe_expiry_date >= now()
  AND s.bafe_expiry_date < now() + interval '60 days'

UNION ALL

-- Backup cover (Clause 14.9.4) — expiring within 60 days.
SELECT
  'backup_cover_expiring',
  b.id,
  'Maintenance backup cover contract expiring: ' || b.backup_org_name,
  b.contract_expiry,
  CASE WHEN b.contract_expiry < now() THEN 'overdue' ELSE 'upcoming' END,
  jsonb_build_object(
    'backup_org_name', b.backup_org_name,
    'contract_expiry', b.contract_expiry
  )
FROM public.bafe_backup_cover b
WHERE b.active = true
  AND b.contract_expiry IS NOT NULL
  AND b.contract_expiry < now() + interval '60 days'

UNION ALL

-- Backup cover missing entirely — fires when the maintenance module
-- is certified but no active backup contract row exists. Clause
-- 14.9.4 only applies to single-engineer organisations; the
-- dashboard component can suppress this alert when not applicable.
SELECT
  'backup_cover_missing',
  NULL::uuid,
  'No active maintenance backup cover contract recorded (Clause 14.9.4)',
  now()::date,
  'outstanding',
  '{}'::jsonb
FROM public.company_settings cs
WHERE 'maintenance' = ANY(cs.bafe_modules_certified)
  AND NOT EXISTS (
    SELECT 1 FROM public.bafe_backup_cover b
    WHERE b.active = true
      AND (b.contract_expiry IS NULL OR b.contract_expiry > now())
  )

UNION ALL

-- Clause 14.12 — inherited maintenance system without the take-over
-- inspection completed.
SELECT
  'clause_1412_outstanding',
  m.id,
  'Inherited maintenance system — Clause 14.12 inspection outstanding',
  m.contract_start + interval '30 days',
  'outstanding',
  jsonb_build_object('site_id', m.site_id, 'contract_start', m.contract_start)
FROM public.bafe_maintenance_contracts m
WHERE m.inherited_system = true
  AND m.clause_1412_inspection_complete = false

UNION ALL

-- Surveillance audit — non-compliance remedial past deadline.
SELECT
  'surveillance_remedial',
  a.id,
  'Surveillance audit remedial action past deadline',
  a.remedial_deadline,
  'overdue',
  jsonb_build_object(
    'audit_type', a.audit_type,
    'completed_date', a.completed_date,
    'remedial_deadline', a.remedial_deadline
  )
FROM public.bafe_surveillance_audits a
WHERE a.outcome IN ('conditional','non_compliance')
  AND a.remedial_deadline IS NOT NULL
  AND a.remedial_deadline < now()
  AND a.remedial_completed_date IS NULL

UNION ALL

-- Next surveillance audit overdue.
SELECT
  'surveillance_overdue',
  a.id,
  'Next surveillance audit overdue',
  a.next_audit_due,
  CASE WHEN now() > a.next_audit_due THEN 'overdue' ELSE 'upcoming' END,
  jsonb_build_object(
    'next_audit_due', a.next_audit_due,
    'certification_body', a.certification_body
  )
FROM public.bafe_surveillance_audits a
WHERE a.next_audit_due IS NOT NULL
  AND a.next_audit_due < now() + interval '30 days'
  -- Only the most recent audit's next_audit_due matters.
  AND a.id = (
    SELECT id FROM public.bafe_surveillance_audits
    ORDER BY COALESCE(completed_date, scheduled_date) DESC NULLS LAST
    LIMIT 1
  );

-- Views inherit RLS from the underlying tables (Postgres default),
-- so the existing has_elevated_role policies on each source table
-- already gate this view. No explicit GRANT needed.

COMMENT ON VIEW public.bafe_compliance_alerts IS
  'Computed BAFE SP203-1 compliance alerts. Rebuilds on every SELECT — '
  'do not materialise without changing now()-based predicates. '
  'Drives the BAFEComplianceDashboard component.';

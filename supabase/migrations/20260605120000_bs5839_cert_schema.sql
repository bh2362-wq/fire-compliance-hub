-- BS 5839-1 certificate schema — cert-type extensions, four new tables
-- ─────────────────────────────────────────────────────────────────────
-- Backs the four DOCX templates landed in PR #144 (Installation /
-- Commissioning / Acceptance / Battery Calc). Each cert kind gets a
-- dedicated table for its meaty fields; the parent row lives in
-- site_bafe_certificates so the existing cert register +
-- compliance-alerts view keep working.
--
-- Tables in this migration:
--   bs5839_commissioning_certs        — header (1:1 with parent)
--   bs5839_commissioning_checks       — 33-item §39 checklist (1:33)
--   bs5839_acceptance_certs           — customer-signed handover
--   bs5839_acceptance_trained_persons — up to 4 trained-person slots
--   bs5839_battery_calculations       — one row per panel
--
-- A056 Installation is small enough to live entirely on parent
-- columns — two extensions added at the top.
--
-- service_report_battery_tests (the existing table) is intentionally
-- left alone. It captures battery TEST measurements during routine
-- service visits (terminal voltage, charge current, load test).
-- bs5839_battery_calculations is for COMMISSIONING sizing
-- (standby_current × hours + alarm = subtotal × 1.25 = min capacity)
-- — different purpose, different audit trail. Joining them would
-- conflate two distinct workflows.

-- ── A056 Installation Cert — extensions on site_bafe_certificates ────

ALTER TABLE public.site_bafe_certificates
  -- bs5839_cert_type discriminates which BS 5839-1 cert subtype this
  -- row represents. NULL for non-BS-5839-1 certs (BAFE Compliance,
  -- Modular, etc.) which use the bafe_cert_type column from PR #140.
  ADD COLUMN IF NOT EXISTS bs5839_cert_type text
    CHECK (bs5839_cert_type IS NULL OR bs5839_cert_type IN
      ('installation', 'commissioning', 'acceptance', 'battery_calc')),
  -- A056 fields. The certify block + signature live on the parent
  -- (signed_by, completion_date, issued_date). What's left:
  ADD COLUMN IF NOT EXISTS bs5839_install_category text,
  ADD COLUMN IF NOT EXISTS bs5839_install_extent_of_liability text;

CREATE INDEX IF NOT EXISTS idx_site_bafe_certificates_bs5839_type
  ON public.site_bafe_certificates(bs5839_cert_type)
  WHERE bs5839_cert_type IS NOT NULL AND voided = false;

-- ── A051 Commissioning Cert — header table (1:1 with parent) ─────────
-- One row per commissioning cert. The 33 checklist items live in
-- bs5839_commissioning_checks below.

CREATE TABLE IF NOT EXISTS public.bs5839_commissioning_certs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Parent cert. UNIQUE so the relationship is enforced 1:1.
  cert_id uuid NOT NULL UNIQUE
    REFERENCES public.site_bafe_certificates(id) ON DELETE CASCADE,

  -- Page 1 — Client details (snapshot at issuance; site/customer
  -- may be edited later).
  customer_name        text,
  customer_address     text,
  customer_postcode    text,

  -- Page 1 — System details.
  system_state         text CHECK (system_state IS NULL OR system_state IN ('new', 'modification')),
  extent_of_system     text,
  -- category lives on parent (bs5839_install_category) — installation
  -- and commissioning often share the same category, set once.

  -- Page 1 — System Examinations (the 6 inline checkbox items above
  -- the soak-test field). Stored as booleans so reports can filter
  -- on "any cert with the false-alarm-potential box unticked."
  exam_all_equipment_operates       boolean,
  exam_install_acceptable           boolean,
  exam_inspected_per_39_2c          boolean,
  exam_performs_to_spec             boolean,
  exam_no_false_alarm_potential     boolean,
  exam_documentation_provided       boolean,
  specifier                         text,
  -- soak test period in weeks. NULL when N/A (engineer's call;
  -- typically one week per the standard's recommendation).
  soak_test_weeks                   int CHECK (soak_test_weeks IS NULL OR soak_test_weeks >= 0),
  outstanding_work                  text,
  false_alarm_risks                 text,

  -- Page 1 — Other cert references (links to design / installation
  -- certs by number; not FKs because they may have been issued by a
  -- different organisation).
  design_cert_number       text,
  design_drawings_ref      text,
  installation_cert_number text,
  as_fitted_drawings_ref   text,

  -- Page 3 — Incomplete work tracking.
  incomplete_work_details text,
  incomplete_work_reasons text,
  further_visit_required  text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bs5839_commissioning_certs_cert_id
  ON public.bs5839_commissioning_certs(cert_id);

-- ── 33-item §39 checklist (normalised — one row per item per cert) ──
-- Verbatim from the build_bs5839_templates.py
-- COMMISSIONING_CHECKLIST_ITEMS array. Items are referenced by number
-- only; descriptions are constants in the codebase and the PDF
-- template — no need to denormalise the wording into the DB.

CREATE TABLE IF NOT EXISTS public.bs5839_commissioning_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commissioning_cert_id uuid NOT NULL
    REFERENCES public.bs5839_commissioning_certs(id) ON DELETE CASCADE,
  item_number int NOT NULL CHECK (item_number BETWEEN 1 AND 33),
  response text NOT NULL
    CHECK (response IN ('Y', 'N', 'NA')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(commissioning_cert_id, item_number)
);

CREATE INDEX IF NOT EXISTS idx_bs5839_commissioning_checks_cert
  ON public.bs5839_commissioning_checks(commissioning_cert_id);
-- Targeted index for the "any cert with item X failing" report
-- (typical use case: find every commissioning where item 14 — battery
-- calc — was flagged N).
CREATE INDEX IF NOT EXISTS idx_bs5839_commissioning_checks_fails
  ON public.bs5839_commissioning_checks(item_number, response)
  WHERE response = 'N';

-- ── A038 Acceptance Cert — header table (1:1 with parent) ────────────

CREATE TABLE IF NOT EXISTS public.bs5839_acceptance_certs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_id uuid NOT NULL UNIQUE
    REFERENCES public.site_bafe_certificates(id) ON DELETE CASCADE,

  -- Customer signing block (separate from the cert's signed_by which
  -- is the company-side issuer; the customer signature here is the
  -- acceptance party).
  customer_name        text,
  customer_position    text,
  customer_signature   text,  -- base64 PNG data URL or 'typed:Name'
  customer_organisation text,

  -- Acceptance-specific narrative.
  extent_of_system     text,
  work_required        text,  -- "The following work is required before
                              -- the system can be accepted"

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bs5839_acceptance_certs_cert_id
  ON public.bs5839_acceptance_certs(cert_id);

-- Up to 4 named trained persons per acceptance cert. The A038 form
-- has fixed slots 1-4 because BAFE wants the names captured in a
-- predictable order on the printed cert; we honour that here.

CREATE TABLE IF NOT EXISTS public.bs5839_acceptance_trained_persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acceptance_cert_id uuid NOT NULL
    REFERENCES public.bs5839_acceptance_certs(id) ON DELETE CASCADE,
  slot int NOT NULL CHECK (slot BETWEEN 1 AND 4),
  person_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(acceptance_cert_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_bs5839_acceptance_trained_persons_cert
  ON public.bs5839_acceptance_trained_persons(acceptance_cert_id);

-- ── A058 Battery Calculation (multiple panels per cert) ──────────────
-- One row per panel. The A058 form says "use new sheet for any
-- additional panels" — that's one row per panel in our model.
-- Battery calcs can be standalone (cert_id present, no commissioning
-- link) or part of a commissioning cert (cert_id points at the
-- commissioning cert's parent site_bafe_certificates row).

CREATE TABLE IF NOT EXISTS public.bs5839_battery_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_id uuid NOT NULL
    REFERENCES public.site_bafe_certificates(id) ON DELETE CASCADE,

  -- Panel identification.
  panel_label    text NOT NULL,
  panel_location text,
  loop_count     int CHECK (loop_count IS NULL OR loop_count >= 0),

  -- Calculation inputs. numeric(6,2) gives 4 digits before the
  -- decimal — plenty for fire alarm currents (typically <100 A).
  standby_current_a       numeric(6,3) CHECK (standby_current_a IS NULL OR standby_current_a >= 0),
  standby_hours           int          CHECK (standby_hours IS NULL OR standby_hours > 0),
  alarm_current_a         numeric(6,3) CHECK (alarm_current_a IS NULL OR alarm_current_a >= 0),

  -- Derived values. Stored (not GENERATED) so the engineer's
  -- calculation is preserved verbatim even if rounding conventions
  -- in code change later.
  battery_subtotal_ah     numeric(6,2) CHECK (battery_subtotal_ah IS NULL OR battery_subtotal_ah >= 0),
  min_battery_capacity_ah numeric(6,2) CHECK (min_battery_capacity_ah IS NULL OR min_battery_capacity_ah >= 0),
  design_battery_size_ah  numeric(6,2) CHECK (design_battery_size_ah IS NULL OR design_battery_size_ah > 0),
  installed_battery_size_ah numeric(6,2) CHECK (installed_battery_size_ah IS NULL OR installed_battery_size_ah > 0),

  -- Test attestation block. test_engineer_signature can be a base64
  -- PNG data URL (drawn) or 'typed:Name' (typed) — same convention
  -- as the wizard's other signature capture.
  test_engineer_name      text,
  test_engineer_signature text,
  test_date               date,
  test_meter_model        text,
  test_meter_serial       text,

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bs5839_battery_calculations_cert
  ON public.bs5839_battery_calculations(cert_id);
-- Quick filter for the "any cert where installed < required" report
-- — surfaces under-sized batteries the engineer should have escalated.
CREATE INDEX IF NOT EXISTS idx_bs5839_battery_calculations_undersized
  ON public.bs5839_battery_calculations(cert_id)
  WHERE installed_battery_size_ah IS NOT NULL
    AND min_battery_capacity_ah IS NOT NULL
    AND installed_battery_size_ah < min_battery_capacity_ah;

-- ── RLS — same has_elevated_role gate as the BAFE tables ────────────

ALTER TABLE public.bs5839_commissioning_certs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bs5839_commissioning_checks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bs5839_acceptance_certs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bs5839_acceptance_trained_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bs5839_battery_calculations       ENABLE ROW LEVEL SECURITY;

CREATE POLICY bs5839_commissioning_certs_all
  ON public.bs5839_commissioning_certs FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid()))
  WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bs5839_commissioning_checks_all
  ON public.bs5839_commissioning_checks FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid()))
  WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bs5839_acceptance_certs_all
  ON public.bs5839_acceptance_certs FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid()))
  WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bs5839_acceptance_trained_persons_all
  ON public.bs5839_acceptance_trained_persons FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid()))
  WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY bs5839_battery_calculations_all
  ON public.bs5839_battery_calculations FOR ALL TO authenticated
  USING (has_elevated_role(auth.uid()))
  WITH CHECK (has_elevated_role(auth.uid()));

-- ── updated_at triggers ──────────────────────────────────────────────

CREATE TRIGGER trg_bs5839_commissioning_certs_updated_at
  BEFORE UPDATE ON public.bs5839_commissioning_certs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bs5839_commissioning_checks_updated_at
  BEFORE UPDATE ON public.bs5839_commissioning_checks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bs5839_acceptance_certs_updated_at
  BEFORE UPDATE ON public.bs5839_acceptance_certs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_bs5839_battery_calculations_updated_at
  BEFORE UPDATE ON public.bs5839_battery_calculations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

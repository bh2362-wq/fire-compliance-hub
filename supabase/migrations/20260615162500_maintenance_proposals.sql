-- Maintenance Proposals — greenfield domain
--
-- Adds the data side of the "Maintenance Proposal" document flow asked
-- for in chat (and flagged in docs/planning/template-field-mapping-
-- verified.md §3 as needing a dedicated planning chunk). A Maintenance
-- Proposal is a customer-facing document offering recurring PPM /
-- monitoring services on a site — annual fee, service-visit schedule,
-- SLA tiers, acceptance flow. Distinct from a Quotation (one-off
-- works) and from the BAFE Maintenance Contract panel (audit tracking
-- of in-force contracts).
--
-- V1 covers data capture + acceptance fields. Doc-gen (the renderer
-- + master-maintenance-proposal.docx template) lands as a follow-up
-- once the engineer has a template to plug in.
--
-- Mirrors the quotations table pattern intentionally:
--   - proposal_number sequence + RPC with collision-retry
--   - acceptance_token for the customer-facing /accept-proposal/<token> link
--   - latest_docx_path / latest_pdf_path for cache-first downloads
--     (same contract as PR #232 — cleared on every save / accept / decline)
--   - status enum with CHECK constraint
--   - elevated-role RLS policies via has_elevated_role()
--   - update_updated_at_column trigger

CREATE TABLE IF NOT EXISTS public.maintenance_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_number text NOT NULL UNIQUE,

  -- Relationship
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',

  -- Header
  title text,
  introduction text,                 -- §1 "About this proposal" prose
  scope jsonb,                       -- array of work-area / service-description strings (mirrors quotations.scope)

  -- Pricing
  annual_fee numeric(12, 2),
  payment_terms text,                -- "Annual in advance", "Quarterly", etc.
  vat_rate numeric(5, 2) DEFAULT 20,
  callout_charge numeric(10, 2),
  ooh_callout_charge numeric(10, 2),
  parts_markup_percent numeric(5, 2),

  -- Service config
  service_visits_per_year integer,   -- 4 = quarterly, 2 = bi-annual, etc.
  ppm_interval_months integer,       -- 3, 6, 12
  sla_tier text,                     -- "P1" / "P2" / "P3" (free text — engineers may want their own labels)
  fault_response_hours integer,      -- e.g. 4 for P1
  ooh_response_hours integer,        -- out-of-hours

  -- Validity + acceptance
  valid_until date,
  acceptance_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  client_accepted_at timestamptz,
  accepted_by_name text,
  client_acceptance_signature text,  -- "typed:<name>" or legacy data: PNG
  client_po_number text,
  client_declined_at timestamptz,
  client_decline_reason text,

  -- Render cache (mirrors quotations — PR #232)
  latest_docx_path text,
  latest_pdf_path text,

  -- Audit
  notes text,
  locked_at timestamptz,
  locked_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT maintenance_proposals_status_check CHECK (
    status IN ('draft', 'sent', 'customer_accepted', 'declined', 'expired')
  )
);

CREATE INDEX IF NOT EXISTS idx_maintenance_proposals_customer
  ON public.maintenance_proposals(customer_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_proposals_site
  ON public.maintenance_proposals(site_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_proposals_status
  ON public.maintenance_proposals(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_proposals_acceptance_token
  ON public.maintenance_proposals(acceptance_token);

-- ── Proposal number sequence ──────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.maintenance_proposal_number_seq START 1;

CREATE OR REPLACE FUNCTION public.get_next_maintenance_proposal_number()
  RETURNS text
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
  candidate TEXT;
BEGIN
  -- Collision-retry mirrors get_next_quotation_number (PR-of-yore).
  -- Sequence nextval is gap-tolerant; the loop only matters when an
  -- engineer manually backfills a row with a hand-picked number.
  LOOP
    SELECT nextval('public.maintenance_proposal_number_seq') INTO next_num;
    candidate := 'MP-' || LPAD(next_num::TEXT, 5, '0');
    IF NOT EXISTS (
      SELECT 1 FROM public.maintenance_proposals WHERE proposal_number = candidate
    ) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.maintenance_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Elevated users can view maintenance proposals" ON public.maintenance_proposals;
CREATE POLICY "Elevated users can view maintenance proposals"
  ON public.maintenance_proposals FOR SELECT
  USING (public.has_elevated_role(auth.uid()));

DROP POLICY IF EXISTS "Elevated users can insert maintenance proposals" ON public.maintenance_proposals;
CREATE POLICY "Elevated users can insert maintenance proposals"
  ON public.maintenance_proposals FOR INSERT
  WITH CHECK (public.has_elevated_role(auth.uid()));

DROP POLICY IF EXISTS "Elevated users can update maintenance proposals" ON public.maintenance_proposals;
CREATE POLICY "Elevated users can update maintenance proposals"
  ON public.maintenance_proposals FOR UPDATE
  USING (public.has_elevated_role(auth.uid()));

DROP POLICY IF EXISTS "Elevated users can delete maintenance proposals" ON public.maintenance_proposals;
CREATE POLICY "Elevated users can delete maintenance proposals"
  ON public.maintenance_proposals FOR DELETE
  USING (public.has_elevated_role(auth.uid()));

-- ── Public read-by-token policy (for the customer-facing accept page) ─

DROP POLICY IF EXISTS "Anyone can view a proposal by acceptance_token" ON public.maintenance_proposals;
CREATE POLICY "Anyone can view a proposal by acceptance_token"
  ON public.maintenance_proposals FOR SELECT
  USING (acceptance_token IS NOT NULL);

-- ── updated_at trigger ────────────────────────────────────────────────

DROP TRIGGER IF EXISTS update_maintenance_proposals_updated_at ON public.maintenance_proposals;
CREATE TRIGGER update_maintenance_proposals_updated_at
  BEFORE UPDATE ON public.maintenance_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

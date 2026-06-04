-- Link site_bafe_certificates to service_visits.
-- Backs the BS 5839-1 commissioning wizard (PR C) — engineer launches
-- the wizard from a visit URL and the wizard needs to look up "is
-- there already a commissioning cert for this visit?" without
-- inferring via site_id + date heuristics.
--
-- Additive only — NULLable column. Existing certs without a visit
-- link stay valid (they predate this column or are standalone
-- issuances like BAFE Compliance certs that aren't tied to a single
-- visit).

ALTER TABLE public.site_bafe_certificates
  ADD COLUMN IF NOT EXISTS visit_id uuid
    REFERENCES public.service_visits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_site_bafe_certificates_visit_id
  ON public.site_bafe_certificates(visit_id)
  WHERE visit_id IS NOT NULL;

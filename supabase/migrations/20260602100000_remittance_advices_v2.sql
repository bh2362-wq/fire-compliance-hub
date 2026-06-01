-- Remittance advice v2 — fuzzy matching + manual link support
--
-- v1 (20260601120000) stored a single matched_xero_invoice_id FK to the
-- local xero_invoices cache. That works for invoices we already track
-- per visit, but it falls over for the manual-link flow: the office
-- needs to be able to point at any outstanding Xero invoice, including
-- ones that aren't in our local cache.
--
-- This migration adds:
--   xero_invoice_id     — the actual Xero string ID (load-bearing for
--                         xero-apply-payment). Populated by parse-remittance-email
--                         on a successful match, OR by the manual-link
--                         UI when the office picks an outstanding
--                         invoice from the Xero API directly.
--   matched_contact_name — display-only customer name (kept so the row
--                          still reads sensibly without joining back
--                          through xero_invoices).
--
-- The matched_xero_invoice_id FK stays in place for the local-cache
-- case so JOINs through to status / visit_id still work where useful.

ALTER TABLE public.remittance_line_items
  ADD COLUMN IF NOT EXISTS xero_invoice_id text;

ALTER TABLE public.remittance_line_items
  ADD COLUMN IF NOT EXISTS matched_contact_name text;

CREATE INDEX IF NOT EXISTS remittance_line_items_xero_invoice_id_idx
  ON public.remittance_line_items (xero_invoice_id);

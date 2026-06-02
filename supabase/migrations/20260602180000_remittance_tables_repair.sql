-- Remittance tables repair — same pattern as PR #93's app_settings fix.
-- The original 20260601120000_remittance_advices.sql migration didn't
-- apply on this Supabase instance. PR #93 patched the app_settings
-- table; the SAME migration also created remittance_advices and
-- remittance_line_items. Loading the Remittance page now errors with
-- "Could not find the table 'public.remittance_advices' in the schema
-- cache" because the next set of tables is still missing.
--
-- This migration:
--   1. Creates remittance_advices + remittance_line_items + their
--      indexes + RLS policies, idempotently.
--   2. The FKs to scanned_emails and xero_invoices are added in
--      separate DO blocks so they're skipped (with a NOTICE) when
--      those tables are also missing on the target instance — the
--      core tables still get created and the page becomes usable.
--      The FK constraints can be added later by re-running this
--      migration once the missing dependencies are in place.
--   3. Includes the v2 column additions (xero_invoice_id +
--      matched_contact_name) from 20260602100000 in case that
--      migration also didn't apply.
--   4. NOTIFY pgrst at the end forces an immediate schema cache
--      refresh.

-- ── remittance_advices ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.remittance_advices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_email_id uuid,
  message_id      text NOT NULL,
  mailbox         text NOT NULL,
  from_address    text,
  from_name       text,
  subject         text,
  received_at     timestamptz,
  payment_date    date,
  total_amount    numeric(12, 2),
  currency        text DEFAULT 'GBP',
  payer_name      text,
  ai_raw_extract  jsonb,
  status          text NOT NULL DEFAULT 'parsed'
    CHECK (status IN ('parsed', 'needs_review', 'applied', 'dismissed', 'failed')),
  error_message   text,
  applied_at      timestamptz,
  applied_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remittance_advices_message_mailbox_unique UNIQUE (message_id, mailbox)
);

CREATE INDEX IF NOT EXISTS remittance_advices_status_idx
  ON public.remittance_advices (status, received_at DESC);
CREATE INDEX IF NOT EXISTS remittance_advices_received_at_idx
  ON public.remittance_advices (received_at DESC);

ALTER TABLE public.remittance_advices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "remittance_advices read" ON public.remittance_advices;
CREATE POLICY "remittance_advices read"
  ON public.remittance_advices FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "remittance_advices write" ON public.remittance_advices;
CREATE POLICY "remittance_advices write"
  ON public.remittance_advices FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Conditionally add the FK to scanned_emails if that table exists and
-- the constraint isn't already in place. Logs a NOTICE otherwise so a
-- maintainer can spot the skip in the migration output.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'scanned_emails'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'remittance_advices'
      AND constraint_name = 'remittance_advices_scanned_email_id_fkey'
  ) THEN
    ALTER TABLE public.remittance_advices
      ADD CONSTRAINT remittance_advices_scanned_email_id_fkey
      FOREIGN KEY (scanned_email_id) REFERENCES public.scanned_emails(id) ON DELETE SET NULL;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'scanned_emails'
  ) THEN
    RAISE NOTICE 'Skipping FK remittance_advices.scanned_email_id → scanned_emails(id) — target table not present.';
  END IF;
END $$;

-- ── remittance_line_items ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.remittance_line_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id         uuid NOT NULL REFERENCES public.remittance_advices(id) ON DELETE CASCADE,
  invoice_number        text,
  amount                numeric(12, 2),
  raw_text              text,
  matched_xero_invoice_id uuid,
  match_confidence      text CHECK (match_confidence IN ('exact', 'fuzzy', 'manual', NULL)),
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'skipped', 'failed')),
  xero_payment_id       text,
  error_message         text,
  applied_at            timestamptz,
  applied_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- v2 columns (originally added in 20260602100000_remittance_advices_v2.sql)
ALTER TABLE public.remittance_line_items
  ADD COLUMN IF NOT EXISTS xero_invoice_id text,
  ADD COLUMN IF NOT EXISTS matched_contact_name text;

CREATE INDEX IF NOT EXISTS remittance_line_items_remittance_id_idx
  ON public.remittance_line_items (remittance_id);
CREATE INDEX IF NOT EXISTS remittance_line_items_invoice_number_idx
  ON public.remittance_line_items (invoice_number);
CREATE INDEX IF NOT EXISTS remittance_line_items_xero_invoice_id_idx
  ON public.remittance_line_items (xero_invoice_id);

ALTER TABLE public.remittance_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "remittance_line_items read" ON public.remittance_line_items;
CREATE POLICY "remittance_line_items read"
  ON public.remittance_line_items FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "remittance_line_items write" ON public.remittance_line_items;
CREATE POLICY "remittance_line_items write"
  ON public.remittance_line_items FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Conditionally add the FK to xero_invoices if that target exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'xero_invoices'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'remittance_line_items'
      AND constraint_name = 'remittance_line_items_matched_xero_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.remittance_line_items
      ADD CONSTRAINT remittance_line_items_matched_xero_invoice_id_fkey
      FOREIGN KEY (matched_xero_invoice_id) REFERENCES public.xero_invoices(id) ON DELETE SET NULL;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'xero_invoices'
  ) THEN
    RAISE NOTICE 'Skipping FK remittance_line_items.matched_xero_invoice_id → xero_invoices(id) — target table not present.';
  END IF;
END $$;

-- Force PostgREST to reload so the new tables are visible immediately.
NOTIFY pgrst, 'reload schema';

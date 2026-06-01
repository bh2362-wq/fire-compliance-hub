-- Remittance advice automation
--
-- When a customer (or factoring partner) pays an invoice, they email a
-- remittance advice to ben@bhofire.com or accounts@bhofire.com. These
-- emails already land in `scanned_emails` via the existing poll-mailbox
-- function. This migration adds the tables we need to parse those emails,
-- match each line item to an existing xero_invoices row, and track which
-- payments have been applied to Xero (against the Bibby Factoring bank
-- account).
--
-- Status flow per remittance:
--   parsed       — AI has extracted line items; awaiting office review
--   needs_review — at least one line couldn't be matched to an invoice
--   applied      — all matched lines have had xero-apply-payment called
--   dismissed    — office marked as not-a-remittance (false positive)
--   failed       — parsing or matching errored out (see error_message)

-- Generic key/value app settings — used now for the Bibby Factoring
-- bank-account code, useful for future config (other flags, defaults).
CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT 'null'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings read" ON public.app_settings;
CREATE POLICY "app_settings read"
  ON public.app_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "app_settings write" ON public.app_settings;
CREATE POLICY "app_settings write"
  ON public.app_settings FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Header row per parsed remittance email.
CREATE TABLE IF NOT EXISTS public.remittance_advices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_email_id uuid REFERENCES public.scanned_emails(id) ON DELETE SET NULL,
  -- Duplicate the message_id + mailbox here so we can dedupe even if the
  -- scanned_emails row gets purged.
  message_id      text NOT NULL,
  mailbox         text NOT NULL,
  from_address    text,
  from_name       text,
  subject         text,
  received_at     timestamptz,
  -- Extracted by AI from the email body + any PDF attachment.
  payment_date    date,
  total_amount    numeric(12, 2),
  currency        text DEFAULT 'GBP',
  payer_name      text,
  -- The raw AI output (whole JSON) so we can re-debug a misparse without
  -- re-running the model.
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

-- One row per invoice referenced in a remittance. Multiple invoices per
-- remittance is common (Bibby sends weekly schedules covering several).
CREATE TABLE IF NOT EXISTS public.remittance_line_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id         uuid NOT NULL REFERENCES public.remittance_advices(id) ON DELETE CASCADE,
  invoice_number        text,
  amount                numeric(12, 2),
  raw_text              text,
  -- Once the office (or auto-match) finds an existing xero_invoices row,
  -- we point at it here. NULL = not yet matched.
  matched_xero_invoice_id uuid REFERENCES public.xero_invoices(id) ON DELETE SET NULL,
  match_confidence      text CHECK (match_confidence IN ('exact', 'fuzzy', 'manual', NULL)),
  -- Per-line apply status. A remittance is "applied" only once every line
  -- it cares about is applied or dismissed.
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'skipped', 'failed')),
  xero_payment_id       text,
  error_message         text,
  applied_at            timestamptz,
  applied_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS remittance_line_items_remittance_id_idx
  ON public.remittance_line_items (remittance_id);

CREATE INDEX IF NOT EXISTS remittance_line_items_invoice_number_idx
  ON public.remittance_line_items (invoice_number);

ALTER TABLE public.remittance_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "remittance_line_items read" ON public.remittance_line_items;
CREATE POLICY "remittance_line_items read"
  ON public.remittance_line_items FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "remittance_line_items write" ON public.remittance_line_items;
CREATE POLICY "remittance_line_items write"
  ON public.remittance_line_items FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

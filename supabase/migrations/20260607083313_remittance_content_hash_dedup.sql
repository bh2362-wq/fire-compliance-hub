-- Content-based dedup for remittance_advices, plus pdf_count for
-- visibility into how many PDF attachments the parser fed to Claude.
--
-- Why
--   The existing UNIQUE (message_id, mailbox) constraint prevents
--   re-parsing the same email — but it doesn't catch the same
--   remittance arriving as two separate emails:
--     • Bibby Factoring CCing accounts@ and ben@ (different
--       message_ids per mailbox)
--     • The same remittance landing as a recap on a later date
--     • A PDF-only remittance followed by a text recap
--   These all currently create duplicate remittance_advices rows
--   that have to be manually dismissed. content_hash collapses them.
--
-- pdf_count
--   The parser already pulls PDFs out of Outlook and feeds them to
--   Claude alongside the email body, but there's no visibility into
--   how many actually reached the model on each row. This column
--   exposes that so when the user says "this remittance has data in
--   a PDF that wasn't read" we can tell at a glance whether the PDF
--   was even seen.

ALTER TABLE public.remittance_advices
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS pdf_count integer NOT NULL DEFAULT 0;

-- Partial unique index: only constrains rows that actually carry a
-- hash. Existing rows (historical, hash IS NULL) are unaffected; new
-- inserts that supply a hash get the dedup.
CREATE UNIQUE INDEX IF NOT EXISTS remittance_advices_content_hash_unique
  ON public.remittance_advices (content_hash)
  WHERE content_hash IS NOT NULL;

COMMENT ON COLUMN public.remittance_advices.content_hash IS
  'SHA-256 of (lowercased payer_name + total_amount + payment_date + sorted invoice numbers). '
  'Set by parse-remittance-email so the same remittance arriving via two mailboxes or as a recap '
  'collapses to a single row instead of two duplicate ones.';

COMMENT ON COLUMN public.remittance_advices.pdf_count IS
  'How many PDF attachments the parser sent to Claude for this remittance. '
  '0 means body-only parse; >0 means PDFs were included in the extraction context.';

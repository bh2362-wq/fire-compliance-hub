-- Cross-document email recipient memory.
--
-- customers already has quote_email_recipients / report_email_recipients
-- / invoice_email_recipients / email_recipients — but those are
-- engineer-curated lists in customer admin, not a record of who we
-- actually sent the last document to. Engineers were finding that
-- sending a quote to a new address didn't carry through to the next
-- report or invoice for the same customer; they had to retype it.
--
-- This column captures the most recent recipient list used in ANY
-- email-send dialog (quote, report, RAMS, PO). All dialogs prefer
-- it ahead of the type-specific columns when building the default
-- recipients, so once you've sent to an address it sticks for the
-- next document of any type. Nullable — first-time customers stay
-- on the existing per-type / contact_email fallback chain.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS last_email_recipients text;

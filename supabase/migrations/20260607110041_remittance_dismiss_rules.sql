-- remittance_dismiss_rules
-- ─────────────────────────
-- Learning system for the remittance scanner. When the user clicks
-- "Not a remittance" on a row they can optionally promote that
-- decision into a rule — every future email that matches the rule's
-- {match_kind, match_value} is silently dismissed without burning a
-- Claude call.
--
-- The intent: get the scanner to autopilot. After a few weeks of the
-- user pruning false positives, the rule set covers most newsletter
-- senders, account statements that aren't remittances, etc., and only
-- the real remittances reach the AI.
--
-- match_kind values
--   from_address     — exact match on the sender's email address
--                      (e.g. 'newsletter@brand.com')
--   from_domain      — substring match on the domain after the @
--                      (e.g. 'mailchimp.com' to block any subdomain
--                      from a marketing platform)
--   subject_contains — case-insensitive substring on the subject
--                      (e.g. 'monthly newsletter')
--
-- hit_count + last_hit_at
--   Bumped by scan-remittance-emails every time the rule fires. Lets
--   the user see which rules are doing the heavy lifting and prune
--   ones that haven't matched in months.

CREATE TABLE IF NOT EXISTS public.remittance_dismiss_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_kind            text NOT NULL
    CHECK (match_kind IN ('from_address', 'from_domain', 'subject_contains')),
  match_value           text NOT NULL,
  hit_count             integer NOT NULL DEFAULT 0,
  last_hit_at           timestamptz,
  note                  text,
  source_remittance_id  uuid REFERENCES public.remittance_advices(id) ON DELETE SET NULL,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remittance_dismiss_rules_kind_value_unique UNIQUE (match_kind, match_value)
);

CREATE INDEX IF NOT EXISTS remittance_dismiss_rules_kind_idx
  ON public.remittance_dismiss_rules (match_kind);

ALTER TABLE public.remittance_dismiss_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY remittance_dismiss_rules_read_authenticated
  ON public.remittance_dismiss_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY remittance_dismiss_rules_write_authenticated
  ON public.remittance_dismiss_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.remittance_dismiss_rules IS
  'Auto-dismiss rules for the remittance scanner. Each row says "if an '
  'incoming email matches X, mark it as dismissed without showing it to '
  'Claude or to the user". Populated by the user via the "Not a remittance '
  'and remember sender" action on a remittance card.';

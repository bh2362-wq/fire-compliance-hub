-- Customer-facing portal can now Decline a quote (in addition to
-- Accept). Track the decline timestamp and the optional reason the
-- customer gave so sales can follow up.
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS client_declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_decline_reason text;

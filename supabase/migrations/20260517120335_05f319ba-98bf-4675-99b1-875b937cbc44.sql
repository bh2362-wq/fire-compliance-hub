ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS confirmation_sent_to text,
  ADD COLUMN IF NOT EXISTS confirmation_sent_by uuid;
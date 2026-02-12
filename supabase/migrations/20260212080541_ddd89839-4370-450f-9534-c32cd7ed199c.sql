
-- Add visit acceptance fields
ALTER TABLE public.visits 
  ADD COLUMN IF NOT EXISTS acceptance_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS client_accepted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS accepted_by_name text,
  ADD COLUMN IF NOT EXISTS client_po_number text;

-- Create index on acceptance_token for fast lookup
CREATE INDEX IF NOT EXISTS idx_visits_acceptance_token ON public.visits (acceptance_token) WHERE acceptance_token IS NOT NULL;

-- Allow public (unauthenticated) read of visit summary by token for acceptance page
CREATE POLICY "Public can view visits by acceptance token"
  ON public.visits
  FOR SELECT
  USING (acceptance_token IS NOT NULL AND acceptance_token = acceptance_token);

-- Allow public update for acceptance (only specific fields via edge function with service role)
-- No additional RLS needed since edge function uses service role key

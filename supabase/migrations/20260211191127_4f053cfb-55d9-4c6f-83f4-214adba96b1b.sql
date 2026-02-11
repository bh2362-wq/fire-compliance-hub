
-- Add acceptance tracking columns to quotations
ALTER TABLE public.quotations 
  ADD COLUMN IF NOT EXISTS acceptance_token text UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  ADD COLUMN IF NOT EXISTS accepted_by_name text,
  ADD COLUMN IF NOT EXISTS client_acceptance_signature text,
  ADD COLUMN IF NOT EXISTS client_accepted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS client_po_number text;

-- Create index on acceptance_token for fast lookups
CREATE INDEX IF NOT EXISTS idx_quotations_acceptance_token ON public.quotations(acceptance_token);

-- Allow anonymous users to read quotation summary by token (for public acceptance page)
CREATE POLICY "Anyone can view quotation by acceptance token"
  ON public.quotations
  FOR SELECT
  USING (acceptance_token IS NOT NULL);

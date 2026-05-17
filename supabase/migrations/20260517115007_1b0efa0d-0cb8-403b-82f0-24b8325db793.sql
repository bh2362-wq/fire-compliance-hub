
ALTER TABLE public.rams_documents
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to text[],
  ADD COLUMN IF NOT EXISTS sent_by uuid,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by_name text,
  ADD COLUMN IF NOT EXISTS acceptance_signature text,
  ADD COLUMN IF NOT EXISTS acceptance_token text;

CREATE UNIQUE INDEX IF NOT EXISTS rams_documents_acceptance_token_key
  ON public.rams_documents (acceptance_token)
  WHERE acceptance_token IS NOT NULL;

-- Generate acceptance tokens for any existing rows that lack one
UPDATE public.rams_documents
   SET acceptance_token = encode(gen_random_bytes(24), 'hex')
 WHERE acceptance_token IS NULL;

-- Default future inserts to have a token
ALTER TABLE public.rams_documents
  ALTER COLUMN acceptance_token SET DEFAULT encode(gen_random_bytes(24), 'hex');

-- Public (anon) can read a single RAMS via its token (used by acceptance page)
DROP POLICY IF EXISTS "Public can view RAMS by acceptance token" ON public.rams_documents;
CREATE POLICY "Public can view RAMS by acceptance token"
  ON public.rams_documents
  FOR SELECT
  TO anon, authenticated
  USING (acceptance_token IS NOT NULL);

-- Public (anon) can submit acceptance for a RAMS by token
DROP POLICY IF EXISTS "Public can accept RAMS by acceptance token" ON public.rams_documents;
CREATE POLICY "Public can accept RAMS by acceptance token"
  ON public.rams_documents
  FOR UPDATE
  TO anon, authenticated
  USING (acceptance_token IS NOT NULL)
  WITH CHECK (acceptance_token IS NOT NULL);

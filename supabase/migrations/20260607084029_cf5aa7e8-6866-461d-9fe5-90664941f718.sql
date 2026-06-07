ALTER TABLE public.remittance_advices
  ADD COLUMN IF NOT EXISTS pdf_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS remittance_advices_content_hash_uniq
  ON public.remittance_advices (content_hash)
  WHERE content_hash IS NOT NULL;
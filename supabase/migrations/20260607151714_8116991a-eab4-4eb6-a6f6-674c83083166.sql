ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS director_name text,
  ADD COLUMN IF NOT EXISTS director_role text,
  ADD COLUMN IF NOT EXISTS director_signature_url text;
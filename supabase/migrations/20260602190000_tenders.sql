-- Tendering bolt-on: pipeline tracker, company documents library,
-- and tender pack composition.
--
-- Three tables:
--   tenders              — one row per opportunity. Manual entry, or
--                          auto-imported via the poll-contracts-finder
--                          edge function. Status flow:
--                            discovered → watching → bidding →
--                            submitted → won | lost | dismissed
--   company_documents    — the reusable library: company profile,
--                          accreditations (BAFE/FIA/CHAS/ISO),
--                          insurance certs, sample reports, case
--                          studies, policies.
--   tender_pack_items    — ordered list of documents per tender's
--                          pack. References company_documents OR
--                          carries an ad-hoc URL.
--
-- Plus a tender-assets storage bucket for the actual PDF files.

CREATE TABLE IF NOT EXISTS public.tenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'manual',
  source_id text,
  title text NOT NULL,
  buyer_name text,
  buyer_org text,
  description text,
  url text,
  value_min numeric(14, 2),
  value_max numeric(14, 2),
  currency text DEFAULT 'GBP',
  region text,
  published_at timestamptz,
  deadline_at timestamptz,
  status text NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered', 'watching', 'bidding', 'submitted', 'won', 'lost', 'dismissed')),
  notes text,
  tags text[] DEFAULT '{}',
  discovered_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenders_source_external_unique
  ON public.tenders (source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tenders_status_idx ON public.tenders(status);
CREATE INDEX IF NOT EXISTS tenders_deadline_idx ON public.tenders(deadline_at);

ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenders read" ON public.tenders;
CREATE POLICY "tenders read"
  ON public.tenders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tenders write" ON public.tenders;
CREATE POLICY "tenders write"
  ON public.tenders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL
    CHECK (category IN ('company_profile', 'accreditation', 'insurance', 'sample', 'policy', 'case_study', 'other')),
  description text,
  file_url text,
  file_storage_path text,
  version text,
  expires_at date,
  is_archived boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_documents_category_idx ON public.company_documents(category);

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_docs read" ON public.company_documents;
CREATE POLICY "company_docs read"
  ON public.company_documents FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "company_docs write" ON public.company_documents;
CREATE POLICY "company_docs write"
  ON public.company_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.tender_pack_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  company_document_id uuid REFERENCES public.company_documents(id) ON DELETE SET NULL,
  custom_title text,
  custom_url text,
  sort_order int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tender_pack_items_tender_idx ON public.tender_pack_items(tender_id, sort_order);

ALTER TABLE public.tender_pack_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pack_items read" ON public.tender_pack_items;
CREATE POLICY "pack_items read"
  ON public.tender_pack_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pack_items write" ON public.tender_pack_items;
CREATE POLICY "pack_items write"
  ON public.tender_pack_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage bucket for hosted company documents (PDF files).
INSERT INTO storage.buckets (id, name, public)
VALUES ('tender-assets', 'tender-assets', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "tender_assets_read" ON storage.objects;
CREATE POLICY "tender_assets_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tender-assets');

DROP POLICY IF EXISTS "tender_assets_write" ON storage.objects;
CREATE POLICY "tender_assets_write"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'tender-assets')
  WITH CHECK (bucket_id = 'tender-assets');

-- Also a tender-packs bucket for generated combined PDFs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('tender-packs', 'tender-packs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "tender_packs_read" ON storage.objects;
CREATE POLICY "tender_packs_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tender-packs');

DROP POLICY IF EXISTS "tender_packs_write" ON storage.objects;
CREATE POLICY "tender_packs_write"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'tender-packs')
  WITH CHECK (bucket_id = 'tender-packs');

NOTIFY pgrst, 'reload schema';

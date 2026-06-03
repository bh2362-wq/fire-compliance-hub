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
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenders TO authenticated;
GRANT ALL ON public.tenders TO service_role;

ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenders read" ON public.tenders;
CREATE POLICY "tenders read"
  ON public.tenders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tenders write" ON public.tenders;
CREATE POLICY "tenders write"
  ON public.tenders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS tenders_source_external_unique
  ON public.tenders (source, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tenders_status_idx ON public.tenders(status);
CREATE INDEX IF NOT EXISTS tenders_deadline_idx ON public.tenders(deadline_at);

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_documents TO authenticated;
GRANT ALL ON public.company_documents TO service_role;

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_docs read" ON public.company_documents;
CREATE POLICY "company_docs read"
  ON public.company_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "company_docs write" ON public.company_documents;
CREATE POLICY "company_docs write"
  ON public.company_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS company_documents_category_idx ON public.company_documents(category);

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tender_pack_items TO authenticated;
GRANT ALL ON public.tender_pack_items TO service_role;

ALTER TABLE public.tender_pack_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pack_items read" ON public.tender_pack_items;
CREATE POLICY "pack_items read"
  ON public.tender_pack_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pack_items write" ON public.tender_pack_items;
CREATE POLICY "pack_items write"
  ON public.tender_pack_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS tender_pack_items_tender_idx ON public.tender_pack_items(tender_id, sort_order);

DROP POLICY IF EXISTS "tender_assets_read" ON storage.objects;
CREATE POLICY "tender_assets_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tender-assets');

DROP POLICY IF EXISTS "tender_assets_write" ON storage.objects;
CREATE POLICY "tender_assets_write"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'tender-assets')
  WITH CHECK (bucket_id = 'tender-assets');

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
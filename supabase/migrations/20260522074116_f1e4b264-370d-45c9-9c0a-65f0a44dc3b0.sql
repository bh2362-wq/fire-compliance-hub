CREATE TABLE public.visit_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_visit_id uuid NOT NULL REFERENCES public.service_visits(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  category text NOT NULL CHECK (category IN (
    'pava_record','subcontractor_report','external_certificate','site_survey',
    'risk_assessment','photograph','correspondence','manufacturer_documentation','other')),
  title text NOT NULL,
  description text,
  issued_by text,
  document_date date NOT NULL,
  file_path text NOT NULL,
  file_size_bytes int NOT NULL,
  file_mime_type text NOT NULL,
  file_original_name text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  is_archived boolean NOT NULL DEFAULT false,
  share_with_customer boolean NOT NULL DEFAULT false,
  version_of_id uuid REFERENCES public.visit_documents(id)
);

CREATE INDEX idx_visit_documents_visit    ON public.visit_documents(service_visit_id) WHERE NOT is_archived;
CREATE INDEX idx_visit_documents_customer ON public.visit_documents(customer_id)      WHERE NOT is_archived;
CREATE INDEX idx_visit_documents_site     ON public.visit_documents(site_id)          WHERE NOT is_archived;
CREATE INDEX idx_visit_documents_category ON public.visit_documents(category)         WHERE NOT is_archived;
CREATE INDEX idx_visit_documents_date     ON public.visit_documents(document_date DESC) WHERE NOT is_archived;

ALTER TABLE public.visit_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visit_documents_select" ON public.visit_documents FOR SELECT
USING (
  has_elevated_role(auth.uid())
  OR EXISTS (SELECT 1 FROM public.service_visits v
             WHERE v.id = visit_documents.service_visit_id AND v.engineer_id = auth.uid())
);

CREATE POLICY "visit_documents_insert" ON public.visit_documents FOR INSERT
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    has_elevated_role(auth.uid())
    OR EXISTS (SELECT 1 FROM public.service_visits v
               WHERE v.id = visit_documents.service_visit_id AND v.engineer_id = auth.uid())
  )
);

CREATE POLICY "visit_documents_update" ON public.visit_documents FOR UPDATE
USING (has_elevated_role(auth.uid()) OR uploaded_by = auth.uid());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('visit-documents','visit-documents', false, 26214400,
  ARRAY['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg','image/png','image/heic'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "visit_documents_storage_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'visit-documents'
  AND (
    has_elevated_role(auth.uid())
    OR EXISTS (SELECT 1 FROM public.service_visits v
               WHERE v.id = ((storage.foldername(name))[2])::uuid
               AND v.engineer_id = auth.uid())
  )
);
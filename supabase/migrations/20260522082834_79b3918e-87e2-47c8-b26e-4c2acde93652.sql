-- Allow site-level documents (not tied to a specific visit)
ALTER TABLE public.visit_documents
  ALTER COLUMN service_visit_id DROP NOT NULL;

-- Recreate RLS policies to handle null service_visit_id (site-only docs)
DROP POLICY IF EXISTS visit_documents_select ON public.visit_documents;
DROP POLICY IF EXISTS visit_documents_insert ON public.visit_documents;
DROP POLICY IF EXISTS visit_documents_update ON public.visit_documents;

CREATE POLICY visit_documents_select ON public.visit_documents
FOR SELECT TO authenticated
USING (
  has_elevated_role(auth.uid())
  OR (
    service_visit_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM service_visits v
      WHERE v.id = visit_documents.service_visit_id
        AND v.engineer_id = auth.uid()
    )
  )
);

CREATE POLICY visit_documents_insert ON public.visit_documents
FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    has_elevated_role(auth.uid())
    OR (
      service_visit_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM service_visits v
        WHERE v.id = visit_documents.service_visit_id
          AND v.engineer_id = auth.uid()
      )
    )
  )
);

CREATE POLICY visit_documents_update ON public.visit_documents
FOR UPDATE TO authenticated
USING (
  has_elevated_role(auth.uid())
  OR uploaded_by = auth.uid()
);

-- Update storage policy: paths now use sites/{site_id}/... prefix
DROP POLICY IF EXISTS visit_documents_storage_insert ON storage.objects;

CREATE POLICY visit_documents_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'visit-documents'
  AND (
    has_elevated_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM service_visits v
      WHERE v.site_id = ((storage.foldername(name))[2])::uuid
        AND v.engineer_id = auth.uid()
    )
  )
);

CREATE POLICY visit_documents_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'visit-documents'
  AND (
    has_elevated_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM service_visits v
      WHERE v.site_id = ((storage.foldername(name))[2])::uuid
        AND v.engineer_id = auth.uid()
    )
  )
);
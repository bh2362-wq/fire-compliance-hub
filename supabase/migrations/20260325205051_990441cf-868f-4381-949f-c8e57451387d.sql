
DROP POLICY IF EXISTS "Authenticated users can view document versions" ON public.qms_document_versions;

CREATE POLICY "Authenticated users can view document versions"
ON public.qms_document_versions
FOR SELECT
TO authenticated
USING (true);

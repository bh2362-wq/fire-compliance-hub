DROP POLICY IF EXISTS "quote_assets_admin_insert" ON storage.objects;
CREATE POLICY "quote_assets_admin_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'quote-assets'
  AND public.has_finance_role(auth.uid())
);

DROP POLICY IF EXISTS "quote_assets_admin_update" ON storage.objects;
CREATE POLICY "quote_assets_admin_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'quote-assets'
  AND public.has_finance_role(auth.uid())
)
WITH CHECK (
  bucket_id = 'quote-assets'
  AND public.has_finance_role(auth.uid())
);

DROP POLICY IF EXISTS "quote_assets_admin_delete" ON storage.objects;
CREATE POLICY "quote_assets_admin_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'quote-assets'
  AND public.has_finance_role(auth.uid())
);
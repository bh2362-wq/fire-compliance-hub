DROP POLICY IF EXISTS "tenders write" ON public.tenders;
DROP POLICY IF EXISTS "tenders insert elevated" ON public.tenders;
DROP POLICY IF EXISTS "tenders update elevated" ON public.tenders;
DROP POLICY IF EXISTS "tenders delete elevated" ON public.tenders;
CREATE POLICY "tenders insert elevated"
  ON public.tenders FOR INSERT TO authenticated
  WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "tenders update elevated"
  ON public.tenders FOR UPDATE TO authenticated
  USING (public.has_elevated_role(auth.uid()))
  WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "tenders delete elevated"
  ON public.tenders FOR DELETE TO authenticated
  USING (public.has_elevated_role(auth.uid()));

DROP POLICY IF EXISTS "company_docs write" ON public.company_documents;
DROP POLICY IF EXISTS "company_docs insert elevated" ON public.company_documents;
DROP POLICY IF EXISTS "company_docs update elevated" ON public.company_documents;
DROP POLICY IF EXISTS "company_docs delete elevated" ON public.company_documents;
CREATE POLICY "company_docs insert elevated"
  ON public.company_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "company_docs update elevated"
  ON public.company_documents FOR UPDATE TO authenticated
  USING (public.has_elevated_role(auth.uid()))
  WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "company_docs delete elevated"
  ON public.company_documents FOR DELETE TO authenticated
  USING (public.has_elevated_role(auth.uid()));

DROP POLICY IF EXISTS "pack_items write" ON public.tender_pack_items;
DROP POLICY IF EXISTS "pack_items insert elevated" ON public.tender_pack_items;
DROP POLICY IF EXISTS "pack_items update elevated" ON public.tender_pack_items;
DROP POLICY IF EXISTS "pack_items delete elevated" ON public.tender_pack_items;
CREATE POLICY "pack_items insert elevated"
  ON public.tender_pack_items FOR INSERT TO authenticated
  WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "pack_items update elevated"
  ON public.tender_pack_items FOR UPDATE TO authenticated
  USING (public.has_elevated_role(auth.uid()))
  WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "pack_items delete elevated"
  ON public.tender_pack_items FOR DELETE TO authenticated
  USING (public.has_elevated_role(auth.uid()));

DROP POLICY IF EXISTS "tender_assets_write" ON storage.objects;
DROP POLICY IF EXISTS "tender_assets_insert_elevated" ON storage.objects;
DROP POLICY IF EXISTS "tender_assets_update_elevated" ON storage.objects;
DROP POLICY IF EXISTS "tender_assets_delete_elevated" ON storage.objects;
CREATE POLICY "tender_assets_insert_elevated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tender-assets' AND public.has_elevated_role(auth.uid()));
CREATE POLICY "tender_assets_update_elevated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tender-assets' AND public.has_elevated_role(auth.uid()))
  WITH CHECK (bucket_id = 'tender-assets' AND public.has_elevated_role(auth.uid()));
CREATE POLICY "tender_assets_delete_elevated"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tender-assets' AND public.has_elevated_role(auth.uid()));

DROP POLICY IF EXISTS "tender_packs_write" ON storage.objects;
DROP POLICY IF EXISTS "tender_packs_insert_elevated" ON storage.objects;
DROP POLICY IF EXISTS "tender_packs_update_elevated" ON storage.objects;
DROP POLICY IF EXISTS "tender_packs_delete_elevated" ON storage.objects;
CREATE POLICY "tender_packs_insert_elevated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tender-packs' AND public.has_elevated_role(auth.uid()));
CREATE POLICY "tender_packs_update_elevated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tender-packs' AND public.has_elevated_role(auth.uid()))
  WITH CHECK (bucket_id = 'tender-packs' AND public.has_elevated_role(auth.uid()));
CREATE POLICY "tender_packs_delete_elevated"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tender-packs' AND public.has_elevated_role(auth.uid()));

NOTIFY pgrst, 'reload schema';
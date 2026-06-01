INSERT INTO storage.buckets (id, name, public)
VALUES ('ce-outputs', 'ce-outputs', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'ce_outputs_authenticated_read'
  ) THEN
    CREATE POLICY "ce_outputs_authenticated_read"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'ce-outputs');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'ce_outputs_service_write'
  ) THEN
    CREATE POLICY "ce_outputs_service_write"
      ON storage.objects FOR ALL
      TO service_role
      USING (bucket_id = 'ce-outputs')
      WITH CHECK (bucket_id = 'ce-outputs');
  END IF;
END $$;
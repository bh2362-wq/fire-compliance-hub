-- Storage bucket for the Cause & Effect + Audibility test report
-- DOCX → PDF outputs. Mirrors the quote-outputs setup: private bucket,
-- service-role writes (the edge function uses the service key), and
-- authenticated reads so the client can download via signed URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('ce-outputs', 'ce-outputs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ce_outputs_authenticated_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'ce-outputs');

CREATE POLICY "ce_outputs_service_write"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'ce-outputs')
  WITH CHECK (bucket_id = 'ce-outputs');

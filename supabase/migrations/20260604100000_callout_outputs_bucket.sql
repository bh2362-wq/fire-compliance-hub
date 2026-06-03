-- Storage bucket for the Callout report DOCX → PDF cloud chain.
-- Mirrors the ce-outputs setup exactly so the same edge functions can
-- reuse the convert-quote-pdf bucket override pattern: private bucket,
-- service-role writes (generate-callout-docx uses the service key to
-- upload), authenticated reads so the wizard can download via a
-- signed URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('callout-outputs', 'callout-outputs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "callout_outputs_authenticated_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'callout-outputs');

CREATE POLICY "callout_outputs_service_write"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'callout-outputs')
  WITH CHECK (bucket_id = 'callout-outputs');

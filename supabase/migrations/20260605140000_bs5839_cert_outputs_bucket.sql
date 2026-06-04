-- Storage bucket for BS 5839-1 cert DOCX / PDF outputs.
-- Mirrors the ce-outputs + callout-outputs setup exactly so the
-- existing convert-quote-pdf edge function (which takes a bucket
-- override) can render PDFs from these DOCX files in a follow-on
-- call without any new edge-function plumbing.
--
-- Private bucket, service-role writes (the edge function uses the
-- service key to upload), authenticated reads so the wizard can
-- download via a signed URL.

INSERT INTO storage.buckets (id, name, public)
VALUES ('bs5839-cert-outputs', 'bs5839-cert-outputs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "bs5839_cert_outputs_authenticated_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'bs5839-cert-outputs');

CREATE POLICY "bs5839_cert_outputs_service_write"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'bs5839-cert-outputs')
  WITH CHECK (bucket_id = 'bs5839-cert-outputs');

-- Create quote-assets (public) and quote-outputs (private) buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('quote-assets', 'quote-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('quote-outputs', 'quote-outputs', false)
ON CONFLICT (id) DO NOTHING;

-- Public read for quote-assets
DROP POLICY IF EXISTS "quote_assets_public_read" ON storage.objects;
CREATE POLICY "quote_assets_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'quote-assets');

-- Authenticated read for quote-outputs
DROP POLICY IF EXISTS "quote_outputs_authenticated_read" ON storage.objects;
CREATE POLICY "quote_outputs_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'quote-outputs');

-- Service role full write for quote-outputs
DROP POLICY IF EXISTS "quote_outputs_service_write" ON storage.objects;
CREATE POLICY "quote_outputs_service_write" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'quote-outputs')
  WITH CHECK (bucket_id = 'quote-outputs');
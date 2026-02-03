-- Create storage bucket for work report photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('work-report-photos', 'work-report-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload photos
CREATE POLICY "Authenticated users can upload work report photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'work-report-photos');

-- Allow authenticated users to view photos
CREATE POLICY "Authenticated users can view work report photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'work-report-photos');

-- Allow authenticated users to delete their photos
CREATE POLICY "Authenticated users can delete work report photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'work-report-photos');
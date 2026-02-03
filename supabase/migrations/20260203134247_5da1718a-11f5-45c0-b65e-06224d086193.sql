-- Create QMS attachments storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('qms-attachments', 'qms-attachments', true);

-- Storage policies for QMS attachments
CREATE POLICY "Elevated users can view QMS attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'qms-attachments' AND has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can upload QMS attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'qms-attachments' AND has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update QMS attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'qms-attachments' AND has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete QMS attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'qms-attachments' AND has_elevated_role(auth.uid()));
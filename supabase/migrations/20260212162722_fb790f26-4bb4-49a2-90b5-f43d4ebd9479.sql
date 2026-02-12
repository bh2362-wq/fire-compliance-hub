-- Fix: Make QMS attachments and work-report-photos buckets private
UPDATE storage.buckets SET public = false WHERE id = 'qms-attachments';
UPDATE storage.buckets SET public = false WHERE id = 'work-report-photos';
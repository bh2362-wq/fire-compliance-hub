-- Add invoiced column to service_reports table
ALTER TABLE public.service_reports 
ADD COLUMN invoiced boolean DEFAULT false;
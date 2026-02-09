-- Add sharepoint_folder to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sharepoint_folder text;

-- Add sharepoint columns to service_reports
ALTER TABLE public.service_reports ADD COLUMN IF NOT EXISTS sharepoint_folder text;
ALTER TABLE public.service_reports ADD COLUMN IF NOT EXISTS sharepoint_url text;

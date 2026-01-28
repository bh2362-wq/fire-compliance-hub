-- Add frequency column to site_service_contracts
ALTER TABLE public.site_service_contracts
ADD COLUMN frequency text DEFAULT '3m';
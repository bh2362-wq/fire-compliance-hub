
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS sharepoint_url text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sharepoint_url text;

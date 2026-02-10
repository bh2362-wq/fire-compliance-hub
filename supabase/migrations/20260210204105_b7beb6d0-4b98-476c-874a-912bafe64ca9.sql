-- Add SharePoint columns to quotations table
ALTER TABLE public.quotations 
ADD COLUMN IF NOT EXISTS sharepoint_folder text,
ADD COLUMN IF NOT EXISTS sharepoint_url text;
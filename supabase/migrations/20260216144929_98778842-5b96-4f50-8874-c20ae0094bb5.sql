
-- Add site_specific_hazards and site_access_notes to rams_templates
ALTER TABLE public.rams_templates
ADD COLUMN site_specific_hazards text,
ADD COLUMN site_access_notes text;

-- Create site_assets table for managing assets directly on sites
CREATE TABLE public.site_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL, -- 'fire_panel', 'asd', 'emergency_lighting', etc.
  item_name TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  location TEXT,
  zones_count INTEGER,
  loops_count INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_assets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Elevated users can view site assets"
ON public.site_assets
FOR SELECT
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert site assets"
ON public.site_assets
FOR INSERT
WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update site assets"
ON public.site_assets
FOR UPDATE
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete site assets"
ON public.site_assets
FOR DELETE
USING (has_elevated_role(auth.uid()));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_site_assets_updated_at
BEFORE UPDATE ON public.site_assets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_site_assets_site_id ON public.site_assets(site_id);
CREATE INDEX idx_site_assets_asset_type ON public.site_assets(asset_type);
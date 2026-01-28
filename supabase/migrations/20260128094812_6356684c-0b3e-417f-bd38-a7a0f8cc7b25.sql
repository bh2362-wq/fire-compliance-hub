-- Create contract_assets table for tracking equipment per service contract
CREATE TABLE public.contract_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id uuid NOT NULL REFERENCES public.site_service_contracts(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  item_type text,
  manufacturer text,
  model text,
  loops_count integer,
  zones_count integer,
  location text,
  serial_number text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contract_assets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Elevated users can view contract assets"
  ON public.contract_assets FOR SELECT
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert contract assets"
  ON public.contract_assets FOR INSERT
  WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update contract assets"
  ON public.contract_assets FOR UPDATE
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete contract assets"
  ON public.contract_assets FOR DELETE
  USING (has_elevated_role(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_contract_assets_updated_at
  BEFORE UPDATE ON public.contract_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
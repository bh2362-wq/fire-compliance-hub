-- Create table for site service contracts/packages
CREATE TABLE public.site_service_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL, -- quarterly_service, annual_inspection, emergency, remedial
  description TEXT,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  included_visits INTEGER DEFAULT 0, -- number of visits included in contract per year
  contract_start DATE,
  contract_end DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(site_id, service_type)
);

-- Enable RLS
ALTER TABLE public.site_service_contracts ENABLE ROW LEVEL SECURITY;

-- RLS policies for elevated users
CREATE POLICY "Elevated users can view service contracts"
  ON public.site_service_contracts
  FOR SELECT
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert service contracts"
  ON public.site_service_contracts
  FOR INSERT
  WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update service contracts"
  ON public.site_service_contracts
  FOR UPDATE
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete service contracts"
  ON public.site_service_contracts
  FOR DELETE
  USING (has_elevated_role(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_site_service_contracts_updated_at
  BEFORE UPDATE ON public.site_service_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
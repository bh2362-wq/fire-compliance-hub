-- Create company_settings table for organization-wide configuration
CREATE TABLE public.company_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Company Profile
  company_name TEXT NOT NULL,
  company_logo_url TEXT,
  address TEXT,
  city TEXT,
  postcode TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  registration_number TEXT,
  vat_number TEXT,
  
  -- Report Branding
  report_logo_url TEXT,
  report_footer_text TEXT,
  default_engineer_signature TEXT,
  
  -- Default Settings
  default_payment_terms INTEGER DEFAULT 30,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_sort_code TEXT,
  bank_account_number TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Only authenticated users with elevated roles can view company settings
CREATE POLICY "Authenticated users can view company settings"
ON public.company_settings
FOR SELECT
TO authenticated
USING (true);

-- Only owners/admins can modify company settings
CREATE POLICY "Owners and admins can insert company settings"
ON public.company_settings
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_elevated_role(auth.uid())
);

CREATE POLICY "Owners and admins can update company settings"
ON public.company_settings
FOR UPDATE
TO authenticated
USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Owners and admins can delete company settings"
ON public.company_settings
FOR DELETE
TO authenticated
USING (public.has_elevated_role(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_company_settings_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create default_service_types table for configurable service types
CREATE TABLE public.default_service_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_price NUMERIC(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.default_service_types ENABLE ROW LEVEL SECURITY;

-- Policies for service types
CREATE POLICY "Authenticated users can view service types"
ON public.default_service_types
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Owners and admins can manage service types"
ON public.default_service_types
FOR ALL
TO authenticated
USING (public.has_elevated_role(auth.uid()));

-- Insert default service types
INSERT INTO public.default_service_types (name, description, default_price, sort_order) VALUES
('Fire Alarm Service', 'Annual fire alarm system service and testing', 150.00, 1),
('Emergency Lighting Test', '3-hour duration test of emergency lighting', 100.00, 2),
('Fire Extinguisher Service', 'Annual service and inspection of fire extinguishers', 75.00, 3),
('Fire Risk Assessment', 'Comprehensive fire risk assessment', 250.00, 4),
('Smoke/Heat Detector Test', 'Individual detector testing and maintenance', 50.00, 5),
('Callout/Repair', 'Emergency callout and repair work', 85.00, 6);

-- Trigger for updated_at on service types
CREATE TRIGGER update_service_types_updated_at
BEFORE UPDATE ON public.default_service_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
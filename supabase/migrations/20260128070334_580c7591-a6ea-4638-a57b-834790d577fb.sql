-- Create customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  city TEXT,
  postcode TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for customers
CREATE POLICY "Elevated users can view customers" 
ON public.customers 
FOR SELECT 
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert customers" 
ON public.customers 
FOR INSERT 
WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update customers" 
ON public.customers 
FOR UPDATE 
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete customers" 
ON public.customers 
FOR DELETE 
USING (has_elevated_role(auth.uid()));

-- Add customer_id to sites table
ALTER TABLE public.sites 
ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_sites_customer_id ON public.sites(customer_id);

-- Add trigger for updated_at on customers
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
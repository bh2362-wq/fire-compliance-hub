-- Create table to store Xero OAuth tokens
CREATE TABLE public.xero_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tenant_id TEXT NOT NULL,
  tenant_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

-- Enable RLS
ALTER TABLE public.xero_connections ENABLE ROW LEVEL SECURITY;

-- Users can only view their own connections
CREATE POLICY "Users can view own xero connections"
ON public.xero_connections
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own connections
CREATE POLICY "Users can insert own xero connections"
ON public.xero_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own connections
CREATE POLICY "Users can update own xero connections"
ON public.xero_connections
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own connections
CREATE POLICY "Users can delete own xero connections"
ON public.xero_connections
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_xero_connections_updated_at
BEFORE UPDATE ON public.xero_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create table to track invoices created
CREATE TABLE public.xero_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES public.visits(id),
  xero_invoice_id TEXT NOT NULL,
  xero_invoice_number TEXT,
  contact_id TEXT NOT NULL,
  contact_name TEXT,
  total_amount NUMERIC(10,2),
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.xero_invoices ENABLE ROW LEVEL SECURITY;

-- Elevated users can view invoices
CREATE POLICY "Elevated users can view xero invoices"
ON public.xero_invoices
FOR SELECT
USING (has_elevated_role(auth.uid()));

-- Elevated users can insert invoices
CREATE POLICY "Elevated users can insert xero invoices"
ON public.xero_invoices
FOR INSERT
WITH CHECK (has_elevated_role(auth.uid()));
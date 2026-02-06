
-- Create table to cache Companies House credit check results
CREATE TABLE public.credit_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  company_number TEXT NOT NULL,
  company_name TEXT,
  company_status TEXT,
  company_type TEXT,
  date_of_creation TEXT,
  registered_address JSONB,
  sic_codes TEXT[],
  accounts_overdue BOOLEAN DEFAULT false,
  accounts_next_due TEXT,
  accounts_last_made_up TEXT,
  confirmation_statement_overdue BOOLEAN DEFAULT false,
  confirmation_statement_next_due TEXT,
  has_charges BOOLEAN DEFAULT false,
  has_insolvency_history BOOLEAN DEFAULT false,
  officers JSONB DEFAULT '[]'::jsonb,
  filing_history JSONB DEFAULT '[]'::jsonb,
  risk_level TEXT DEFAULT 'unknown',
  risk_factors JSONB DEFAULT '[]'::jsonb,
  raw_data JSONB,
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  checked_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_checks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Elevated users can view credit checks"
  ON public.credit_checks FOR SELECT
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert credit checks"
  ON public.credit_checks FOR INSERT
  WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update credit checks"
  ON public.credit_checks FOR UPDATE
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete credit checks"
  ON public.credit_checks FOR DELETE
  USING (has_elevated_role(auth.uid()));

-- Timestamp trigger
CREATE TRIGGER update_credit_checks_updated_at
  BEFORE UPDATE ON public.credit_checks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups by customer
CREATE INDEX idx_credit_checks_customer_id ON public.credit_checks(customer_id);
CREATE INDEX idx_credit_checks_company_number ON public.credit_checks(company_number);

-- Add company_number to customers table for linking
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company_number TEXT;

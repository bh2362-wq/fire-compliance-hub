-- Create quotations table
CREATE TABLE public.quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_number TEXT NOT NULL UNIQUE,
  report_id UUID REFERENCES public.service_reports(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT,
  summary TEXT,
  total_amount NUMERIC DEFAULT 0,
  valid_until DATE,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quotation line items table
CREATE TABLE public.quotation_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  regulation_reference TEXT,
  priority TEXT DEFAULT 'medium',
  source_type TEXT,
  source_section TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC DEFAULT 0,
  total_price NUMERIC DEFAULT 0,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sequence for quotation numbers
CREATE SEQUENCE IF NOT EXISTS public.quotation_number_seq START WITH 1;

-- Add quotation number generator to existing function
CREATE OR REPLACE FUNCTION public.get_next_quotation_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT nextval('public.quotation_number_seq') INTO next_num;
  RETURN 'QUO-' || LPAD(next_num::TEXT, 5, '0');
END;
$$;

-- Enable RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_line_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for quotations
CREATE POLICY "Elevated users can view quotations"
ON public.quotations FOR SELECT
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert quotations"
ON public.quotations FOR INSERT
WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update quotations"
ON public.quotations FOR UPDATE
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete quotations"
ON public.quotations FOR DELETE
USING (has_elevated_role(auth.uid()));

-- RLS policies for quotation line items
CREATE POLICY "Elevated users can view quotation line items"
ON public.quotation_line_items FOR SELECT
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert quotation line items"
ON public.quotation_line_items FOR INSERT
WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update quotation line items"
ON public.quotation_line_items FOR UPDATE
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete quotation line items"
ON public.quotation_line_items FOR DELETE
USING (has_elevated_role(auth.uid()));

-- Add updated_at triggers
CREATE TRIGGER update_quotations_updated_at
BEFORE UPDATE ON public.quotations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quotation_line_items_updated_at
BEFORE UPDATE ON public.quotation_line_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
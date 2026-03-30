
CREATE TABLE public.subcontractors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  postcode TEXT,
  specializations TEXT[] DEFAULT '{}',
  insurance_expiry DATE,
  insurance_document_url TEXT,
  day_rate NUMERIC,
  hourly_rate NUMERIC,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view subcontractors" ON public.subcontractors FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can insert subcontractors" ON public.subcontractors FOR INSERT WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can update subcontractors" ON public.subcontractors FOR UPDATE USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can delete subcontractors" ON public.subcontractors FOR DELETE USING (has_elevated_role(auth.uid()));

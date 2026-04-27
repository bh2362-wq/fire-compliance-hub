-- Sequence for unique certificate references
CREATE SEQUENCE IF NOT EXISTS public.smart_form_cert_seq START 1;

-- Smart Form Submissions table (beta forms framework)
CREATE TABLE public.smart_form_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_type TEXT NOT NULL DEFAULT 'bs5839_inspection_servicing',
  certificate_reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | completed | signed
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  visit_id UUID,
  customer_id UUID,
  site_id UUID,
  job_number TEXT,
  engineer_id UUID,
  completed_at TIMESTAMP WITH TIME ZONE,
  pdf_url TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_sfs_visit ON public.smart_form_submissions(visit_id);
CREATE INDEX idx_sfs_customer ON public.smart_form_submissions(customer_id);
CREATE INDEX idx_sfs_site ON public.smart_form_submissions(site_id);
CREATE INDEX idx_sfs_status ON public.smart_form_submissions(status);
CREATE INDEX idx_sfs_form_type ON public.smart_form_submissions(form_type);

ALTER TABLE public.smart_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view smart form submissions"
ON public.smart_form_submissions FOR SELECT
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert smart form submissions"
ON public.smart_form_submissions FOR INSERT
WITH CHECK (has_elevated_role(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Elevated users can update smart form submissions"
ON public.smart_form_submissions FOR UPDATE
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete smart form submissions"
ON public.smart_form_submissions FOR DELETE
USING (has_elevated_role(auth.uid()));

-- Auto-update updated_at
CREATE TRIGGER update_smart_form_submissions_updated_at
BEFORE UPDATE ON public.smart_form_submissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate unique certificate reference
CREATE OR REPLACE FUNCTION public.get_next_smart_form_cert_ref(p_form_type TEXT DEFAULT 'bs5839_inspection_servicing')
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
  prefix TEXT;
BEGIN
  prefix := CASE p_form_type
    WHEN 'bs5839_inspection_servicing' THEN 'BS5839-IS'
    ELSE 'CERT'
  END;
  SELECT nextval('public.smart_form_cert_seq') INTO next_num;
  RETURN prefix || '-' || to_char(now(), 'YYYY') || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$$;
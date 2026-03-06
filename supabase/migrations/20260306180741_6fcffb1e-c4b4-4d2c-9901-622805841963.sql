
-- Storage bucket for customer form template PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('customer-form-templates', 'customer-form-templates', false);

-- Customer form templates table
CREATE TABLE public.customer_form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  form_code TEXT NOT NULL,
  description TEXT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  template_pdf_path TEXT,
  field_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  page_count INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view form templates" ON public.customer_form_templates
  FOR SELECT USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage form templates" ON public.customer_form_templates
  FOR ALL USING (has_elevated_role(auth.uid()));

-- Customer form submissions table
CREATE TABLE public.customer_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.customer_form_templates(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  signatures JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view form submissions" ON public.customer_form_submissions
  FOR SELECT USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage form submissions" ON public.customer_form_submissions
  FOR ALL USING (has_elevated_role(auth.uid()));

-- Storage policies for customer-form-templates bucket
CREATE POLICY "Elevated users can upload form templates" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'customer-form-templates' AND has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can view form template files" ON storage.objects
  FOR SELECT USING (bucket_id = 'customer-form-templates' AND has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete form template files" ON storage.objects
  FOR DELETE USING (bucket_id = 'customer-form-templates' AND has_elevated_role(auth.uid()));

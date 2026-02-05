-- Create email templates table for storing reusable templates
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  greeting_template TEXT NOT NULL DEFAULT 'Dear {{customer_name}},',
  body_template TEXT NOT NULL,
  signoff_template TEXT NOT NULL DEFAULT 'Kind regards,',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  template_type TEXT NOT NULL DEFAULT 'report',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Elevated users can view email templates"
ON public.email_templates
FOR SELECT
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert email templates"
ON public.email_templates
FOR INSERT
WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update email templates"
ON public.email_templates
FOR UPDATE
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete email templates"
ON public.email_templates
FOR DELETE
USING (has_elevated_role(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
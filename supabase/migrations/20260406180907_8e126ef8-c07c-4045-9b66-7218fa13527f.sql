
-- Create sequences for BAFE certificate numbers
CREATE SEQUENCE IF NOT EXISTS public.bafe_design_number_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.bafe_install_number_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.bafe_commission_number_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.bafe_maintenance_number_seq START WITH 1;

-- Create the site_bafe_certificates table
CREATE TABLE public.site_bafe_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  certificate_type text NOT NULL,
  certificate_number text NOT NULL,
  issued_date date NOT NULL,
  issued_by uuid NOT NULL,
  expiry_date date,
  linked_form_submission_id uuid REFERENCES public.customer_form_submissions(id) ON DELETE SET NULL,
  linked_report_id uuid REFERENCES public.service_reports(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'valid',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, certificate_type, certificate_number)
);

-- Enable RLS
ALTER TABLE public.site_bafe_certificates ENABLE ROW LEVEL SECURITY;

-- RLS policies for elevated roles
CREATE POLICY "Elevated users can view BAFE certificates"
  ON public.site_bafe_certificates FOR SELECT TO authenticated
  USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can create BAFE certificates"
  ON public.site_bafe_certificates FOR INSERT TO authenticated
  WITH CHECK (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update BAFE certificates"
  ON public.site_bafe_certificates FOR UPDATE TO authenticated
  USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete BAFE certificates"
  ON public.site_bafe_certificates FOR DELETE TO authenticated
  USING (public.has_elevated_role(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_site_bafe_certificates_updated_at
  BEFORE UPDATE ON public.site_bafe_certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update get_next_qms_number to support BAFE prefixes
CREATE OR REPLACE FUNCTION public.get_next_qms_number(prefix text)
  RETURNS text
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
BEGIN
  CASE prefix
    WHEN 'NCR' THEN SELECT nextval('public.ncr_number_seq') INTO next_num;
    WHEN 'CAPA' THEN SELECT nextval('public.capa_number_seq') INTO next_num;
    WHEN 'RISK' THEN SELECT nextval('public.risk_number_seq') INTO next_num;
    WHEN 'AUD' THEN SELECT nextval('public.audit_number_seq') INTO next_num;
    WHEN 'MR' THEN SELECT nextval('public.review_number_seq') INTO next_num;
    WHEN 'FB' THEN SELECT nextval('public.feedback_number_seq') INTO next_num;
    WHEN 'DOC' THEN SELECT nextval('public.document_number_seq') INTO next_num;
    WHEN 'RAMS' THEN SELECT nextval('public.rams_number_seq') INTO next_num;
    WHEN 'BAFE-D' THEN SELECT nextval('public.bafe_design_number_seq') INTO next_num;
    WHEN 'BAFE-I' THEN SELECT nextval('public.bafe_install_number_seq') INTO next_num;
    WHEN 'BAFE-C' THEN SELECT nextval('public.bafe_commission_number_seq') INTO next_num;
    WHEN 'BAFE-M' THEN SELECT nextval('public.bafe_maintenance_number_seq') INTO next_num;
    ELSE RAISE EXCEPTION 'Unknown prefix: %', prefix;
  END CASE;
  
  RETURN prefix || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$function$;

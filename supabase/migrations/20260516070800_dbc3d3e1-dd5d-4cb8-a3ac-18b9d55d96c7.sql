CREATE OR REPLACE FUNCTION public.get_next_smart_form_cert_ref(p_form_type text DEFAULT 'bs5839_inspection_servicing'::text)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
  prefix TEXT;
BEGIN
  -- Unified numbering:
  --   * All certificate-style smart forms (servicing, modifications, commissioning,
  --     installation, EL, ASD, DR, declination, etc.) use the CERT-YYYY-00000 prefix.
  --   * Callout / general work reports live in the service_reports table and use the
  --     job_number directly as their reference, so they do not call this function.
  prefix := 'CERT';
  SELECT nextval('public.smart_form_cert_seq') INTO next_num;
  RETURN prefix || '-' || to_char(now(), 'YYYY') || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$function$;
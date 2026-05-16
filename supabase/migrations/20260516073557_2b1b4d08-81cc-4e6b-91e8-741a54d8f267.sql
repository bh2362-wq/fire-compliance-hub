CREATE OR REPLACE FUNCTION public.get_next_smart_form_cert_ref(p_form_type text DEFAULT 'bs5839_inspection_servicing'::text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
BEGIN
  -- BS5839 Inspection & Servicing uses the PPM-FA-NNNNN format (planned preventative
  -- maintenance / fire alarm). All other certificate-style smart forms continue using
  -- the unified CERT-YYYY-NNNNN format. Callout / general work reports live in
  -- service_reports and don't call this function.
  IF p_form_type = 'bs5839_inspection_servicing' THEN
    SELECT nextval('public.smart_form_cert_seq') INTO next_num;
    RETURN 'PPM-FA-' || LPAD(next_num::TEXT, 5, '0');
  END IF;

  SELECT nextval('public.smart_form_cert_seq') INTO next_num;
  RETURN 'CERT-' || to_char(now(), 'YYYY') || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$function$;

-- Bump the sequence so new PPM-FA numbers continue past existing rows.
SELECT setval(
  'public.smart_form_cert_seq',
  GREATEST(
    (SELECT COALESCE(MAX(
        NULLIF(regexp_replace(certificate_reference, '^.*-', ''), '')::INTEGER
      ), 0)
     FROM public.smart_form_submissions),
    nextval('public.smart_form_cert_seq')
  ),
  true
);
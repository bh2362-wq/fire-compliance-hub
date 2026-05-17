CREATE OR REPLACE FUNCTION public.get_next_smart_form_cert_ref(p_form_type text DEFAULT 'bs5839_inspection_servicing'::text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
  recycled TEXT;
BEGIN
  SELECT certificate_reference INTO recycled
  FROM public.recycled_smart_form_cert_refs
  WHERE form_type = p_form_type
  ORDER BY certificate_reference ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF recycled IS NOT NULL THEN
    DELETE FROM public.recycled_smart_form_cert_refs WHERE certificate_reference = recycled;
    RETURN recycled;
  END IF;

  SELECT nextval('public.smart_form_cert_seq') INTO next_num;
  RETURN 'JOB-' || LPAD(next_num::TEXT, 5, '0');
END;
$function$;
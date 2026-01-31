-- Drop and recreate the sequence starting at 372
DROP SEQUENCE IF EXISTS public.report_number_seq;
CREATE SEQUENCE public.report_number_seq START WITH 372;

-- Update the function to format with leading zeros (5 digits)
CREATE OR REPLACE FUNCTION public.get_next_report_number(report_type text DEFAULT 'JOB'::text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
  prefix TEXT;
BEGIN
  -- Get the next value from the sequence
  SELECT nextval('public.report_number_seq') INTO next_num;
  
  -- Set prefix based on report type
  IF report_type = 'CERT' THEN
    prefix := 'CERT-';
  ELSE
    prefix := 'JOB-';
  END IF;
  
  -- Return with 5-digit zero-padded number
  RETURN prefix || LPAD(next_num::TEXT, 5, '0');
END;
$function$;
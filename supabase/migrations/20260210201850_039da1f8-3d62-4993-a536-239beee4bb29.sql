-- Add labour_cost column to quotation_line_items
ALTER TABLE public.quotation_line_items ADD COLUMN labour_cost numeric DEFAULT 0;

-- Fix: update get_next_quotation_number to handle duplicates gracefully
CREATE OR REPLACE FUNCTION public.get_next_quotation_number()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
  candidate TEXT;
BEGIN
  LOOP
    SELECT nextval('public.quotation_number_seq') INTO next_num;
    candidate := 'QUO-' || LPAD(next_num::TEXT, 5, '0');
    -- Check if this number already exists
    IF NOT EXISTS (SELECT 1 FROM public.quotations WHERE quotation_number = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$function$;
-- Create table to track recycled/available report numbers
CREATE TABLE public.recycled_report_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_number text NOT NULL UNIQUE,
  report_type text NOT NULL DEFAULT 'JOB',
  recycled_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.recycled_report_numbers ENABLE ROW LEVEL SECURITY;

-- Only elevated users can manage recycled numbers
CREATE POLICY "Elevated users can manage recycled numbers"
  ON public.recycled_report_numbers
  FOR ALL
  USING (has_elevated_role(auth.uid()));

-- Update the get_next_report_number function to check recycled numbers first
CREATE OR REPLACE FUNCTION public.get_next_report_number(report_type text DEFAULT 'JOB'::text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
  prefix TEXT;
  recycled_num TEXT;
BEGIN
  -- Set prefix based on report type
  IF report_type = 'CERT' THEN
    prefix := 'CERT-';
  ELSE
    prefix := 'JOB-';
  END IF;
  
  -- First check for recycled numbers of this type
  SELECT report_number INTO recycled_num
  FROM public.recycled_report_numbers
  WHERE recycled_report_numbers.report_type = get_next_report_number.report_type
  ORDER BY recycled_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF recycled_num IS NOT NULL THEN
    -- Remove from recycled pool and return it
    DELETE FROM public.recycled_report_numbers WHERE report_number = recycled_num;
    RETURN recycled_num;
  END IF;
  
  -- No recycled numbers available, get next from sequence
  SELECT nextval('public.report_number_seq') INTO next_num;
  
  -- Return with 5-digit zero-padded number
  RETURN prefix || LPAD(next_num::TEXT, 5, '0');
END;
$function$;
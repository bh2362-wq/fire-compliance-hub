-- Create a sequence for report numbers starting at 12440
CREATE SEQUENCE IF NOT EXISTS public.report_number_seq START WITH 12440;

-- Create a function to get the next report number with a prefix
CREATE OR REPLACE FUNCTION public.get_next_report_number(report_type TEXT DEFAULT 'JOB')
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
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
  
  RETURN prefix || next_num::TEXT;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_next_report_number(TEXT) TO authenticated;
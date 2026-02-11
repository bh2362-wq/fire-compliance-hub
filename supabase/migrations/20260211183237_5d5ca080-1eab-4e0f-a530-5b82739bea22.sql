
-- Create recycled quotation numbers table
CREATE TABLE public.recycled_quotation_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_number text NOT NULL UNIQUE,
  recycled_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.recycled_quotation_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can manage recycled quotation numbers"
ON public.recycled_quotation_numbers FOR ALL
USING (has_elevated_role(auth.uid()));

-- Function to recycle quotation number on delete
CREATE OR REPLACE FUNCTION public.recycle_quotation_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.quotation_number IS NOT NULL AND OLD.quotation_number != '' THEN
    INSERT INTO public.recycled_quotation_numbers (quotation_number)
    VALUES (OLD.quotation_number)
    ON CONFLICT (quotation_number) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$;

-- Trigger on quotation delete
CREATE TRIGGER recycle_quotation_number_on_delete
BEFORE DELETE ON public.quotations
FOR EACH ROW
EXECUTE FUNCTION public.recycle_quotation_number();

-- Update get_next_quotation_number to use recycled numbers first (lowest number)
CREATE OR REPLACE FUNCTION public.get_next_quotation_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
  candidate TEXT;
  recycled TEXT;
BEGIN
  -- Check for recycled numbers first, pick the lowest one
  SELECT quotation_number INTO recycled
  FROM public.recycled_quotation_numbers
  ORDER BY quotation_number ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF recycled IS NOT NULL THEN
    DELETE FROM public.recycled_quotation_numbers WHERE quotation_number = recycled;
    RETURN recycled;
  END IF;

  -- No recycled numbers, use sequence
  LOOP
    SELECT nextval('public.quotation_number_seq') INTO next_num;
    candidate := 'QUO-' || LPAD(next_num::TEXT, 5, '0');
    IF NOT EXISTS (SELECT 1 FROM public.quotations WHERE quotation_number = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;

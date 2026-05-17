UPDATE public.profiles SET full_name = 'Ben Holden' WHERE user_id = '4f9583bb-3a21-4d8f-a558-73f886fa1532';

CREATE OR REPLACE FUNCTION public.normalize_ben_holden_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.full_name IS NOT NULL AND lower(trim(NEW.full_name)) = 'ben holden' THEN
    NEW.full_name := 'Ben Holden';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_ben_holden_name_trigger ON public.profiles;
CREATE TRIGGER normalize_ben_holden_name_trigger
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_ben_holden_name();
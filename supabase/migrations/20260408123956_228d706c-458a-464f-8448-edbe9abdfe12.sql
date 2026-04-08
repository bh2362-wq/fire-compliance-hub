
-- Create a sequence for job numbers
CREATE SEQUENCE IF NOT EXISTS public.visits_job_number_seq START WITH 1;

-- Add job_number column
ALTER TABLE public.visits ADD COLUMN job_number text UNIQUE;

-- Create function to auto-assign job number on insert
CREATE OR REPLACE FUNCTION public.assign_visit_job_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_number IS NULL THEN
    NEW.job_number := 'JOB-' || LPAD(nextval('public.visits_job_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger
CREATE TRIGGER trg_assign_visit_job_number
BEFORE INSERT ON public.visits
FOR EACH ROW
EXECUTE FUNCTION public.assign_visit_job_number();

-- Backfill existing visits ordered by created_at
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.visits WHERE job_number IS NULL ORDER BY created_at ASC
  LOOP
    UPDATE public.visits SET job_number = 'JOB-' || LPAD(nextval('public.visits_job_number_seq')::text, 5, '0') WHERE id = r.id;
  END LOOP;
END $$;

-- Update the visit_type check constraint to include biannual_service
ALTER TABLE public.visits DROP CONSTRAINT visits_visit_type_check;

ALTER TABLE public.visits ADD CONSTRAINT visits_visit_type_check 
CHECK (visit_type = ANY (ARRAY['quarterly_service'::text, 'biannual_service'::text, 'annual_inspection'::text, 'emergency'::text, 'remedial'::text]));
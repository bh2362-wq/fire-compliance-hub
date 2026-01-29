-- Drop the existing check constraint and add a new one with supply_only
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_visit_type_check;

ALTER TABLE public.visits ADD CONSTRAINT visits_visit_type_check 
CHECK (visit_type IN ('quarterly_service', 'biannual_service', 'annual_inspection', 'emergency', 'remedial', 'supply_only'));
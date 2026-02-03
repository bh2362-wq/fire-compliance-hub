-- Drop the existing check constraint and add a new one that includes 'invoiced'
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_status_check;

ALTER TABLE public.visits ADD CONSTRAINT visits_status_check 
CHECK (status IN ('in_progress', 'completed', 'pending_review', 'invoiced'));
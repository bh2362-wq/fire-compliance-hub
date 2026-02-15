
-- Drop old constraint and add new one with additional statuses
ALTER TABLE public.visits DROP CONSTRAINT visits_status_check;
ALTER TABLE public.visits ADD CONSTRAINT visits_status_check CHECK (status = ANY (ARRAY[
  'scheduled'::text, 'confirmed'::text, 'in_progress'::text, 'completed'::text, 
  'pending_review'::text, 'invoiced'::text, 'cancelled'::text,
  'on_hold'::text, 'awaiting_parts'::text, 'further_works_required'::text, 'quote_needed'::text
]));

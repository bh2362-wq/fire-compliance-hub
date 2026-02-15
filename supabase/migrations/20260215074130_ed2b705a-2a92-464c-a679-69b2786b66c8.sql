
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_status_check;
ALTER TABLE public.visits ADD CONSTRAINT visits_status_check CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'pending_review', 'invoiced', 'confirmed', 'on_hold', 'awaiting_parts', 'further_works_required', 'quote_needed', 'awaiting_po'));

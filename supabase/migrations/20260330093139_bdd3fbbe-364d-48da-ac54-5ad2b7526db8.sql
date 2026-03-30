
-- Add client_po_file_url to visits if not exists
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS client_po_file_url TEXT;

-- Update visits status check to include awaiting_scheduling
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_status_check;
ALTER TABLE public.visits ADD CONSTRAINT visits_status_check CHECK (status IN (
  'scheduled', 'in_progress', 'completed', 'cancelled', 'pending_review',
  'invoiced', 'confirmed', 'on_hold', 'awaiting_parts', 'further_works_required',
  'quote_needed', 'awaiting_po', 'awaiting_scheduling'
));

-- Add visit_type 'subcontract' option
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_visit_type_check;
ALTER TABLE public.visits ADD CONSTRAINT visits_visit_type_check CHECK (visit_type IN (
  'quarterly_service', 'biannual_service', 'annual_inspection', 'emergency', 'remedial', 'supply_only', 'subcontract'
));

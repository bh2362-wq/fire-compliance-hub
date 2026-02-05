-- Add po_number to quotations for tracking
ALTER TABLE public.quotations 
ADD COLUMN po_number text DEFAULT NULL;

-- Add quotation_id to visits for linking remedial visits to accepted quotes
ALTER TABLE public.visits 
ADD COLUMN quotation_id uuid DEFAULT NULL REFERENCES public.quotations(id) ON DELETE SET NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.quotations.po_number IS 'Customer PO number when quotation is accepted';
COMMENT ON COLUMN public.visits.quotation_id IS 'Link to quotation for remedial visits created from accepted quotes';
-- Add item_name column to quotation_line_items for parts/materials
ALTER TABLE public.quotation_line_items 
ADD COLUMN item_name text NULL;

-- Add parent_id column to support sub-items (hierarchical line items)
ALTER TABLE public.quotation_line_items 
ADD COLUMN parent_id uuid NULL REFERENCES public.quotation_line_items(id) ON DELETE CASCADE;

-- Add an index for faster parent lookups
CREATE INDEX idx_quotation_line_items_parent_id ON public.quotation_line_items(parent_id);
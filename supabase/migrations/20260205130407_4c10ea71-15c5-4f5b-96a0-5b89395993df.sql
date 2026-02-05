-- Add locked_at column to quotations table
ALTER TABLE public.quotations 
ADD COLUMN locked_at timestamp with time zone DEFAULT NULL;

-- Add locked_by column to track who locked it
ALTER TABLE public.quotations 
ADD COLUMN locked_by uuid DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.quotations.locked_at IS 'Timestamp when quotation was locked (after email or download)';
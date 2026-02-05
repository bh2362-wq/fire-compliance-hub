-- Add terms column to quotations table
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS terms TEXT;

-- Add vat_rate column to quotations table  
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 20;
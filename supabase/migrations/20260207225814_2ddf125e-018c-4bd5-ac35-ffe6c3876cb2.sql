
-- Add invoiced tracking fields to service_reports
ALTER TABLE public.service_reports 
ADD COLUMN IF NOT EXISTS invoiced boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS xero_invoice_number text DEFAULT NULL;

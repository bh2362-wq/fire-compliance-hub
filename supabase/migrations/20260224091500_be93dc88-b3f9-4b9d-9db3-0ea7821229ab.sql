ALTER TABLE public.customers 
  ADD COLUMN IF NOT EXISTS invoice_email_recipients text,
  ADD COLUMN IF NOT EXISTS quote_email_recipients text,
  ADD COLUMN IF NOT EXISTS report_email_recipients text;
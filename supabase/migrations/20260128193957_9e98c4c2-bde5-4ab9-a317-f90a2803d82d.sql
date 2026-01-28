-- Add xero_contact_id column to customers table for Xero sync
ALTER TABLE public.customers ADD COLUMN xero_contact_id text;

-- Add index for faster lookups by xero_contact_id
CREATE INDEX idx_customers_xero_contact_id ON public.customers(xero_contact_id);

-- Add comment for documentation
COMMENT ON COLUMN public.customers.xero_contact_id IS 'Links to the ContactID in Xero for invoice tracking';
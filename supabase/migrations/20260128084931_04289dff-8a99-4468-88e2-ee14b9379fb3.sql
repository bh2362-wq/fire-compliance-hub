-- Add PO Number column to site_service_contracts
ALTER TABLE public.site_service_contracts
ADD COLUMN po_number text;
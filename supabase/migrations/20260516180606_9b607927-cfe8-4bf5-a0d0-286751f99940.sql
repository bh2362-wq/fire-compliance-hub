DROP INDEX IF EXISTS public.supplier_products_supplier_code_unique;

UPDATE public.supplier_products SET supplier_name = 'Unknown' WHERE supplier_name IS NULL;

ALTER TABLE public.supplier_products
  ALTER COLUMN supplier_name SET DEFAULT 'Unknown',
  ALTER COLUMN supplier_name SET NOT NULL;

ALTER TABLE public.supplier_products
  ADD CONSTRAINT supplier_products_supplier_code_unique UNIQUE (supplier_name, product_code);
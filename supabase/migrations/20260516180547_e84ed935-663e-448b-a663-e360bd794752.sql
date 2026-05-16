DELETE FROM public.supplier_products a
USING public.supplier_products b
WHERE a.id < b.id
  AND COALESCE(a.supplier_name,'') = COALESCE(b.supplier_name,'')
  AND a.product_code = b.product_code;

CREATE UNIQUE INDEX IF NOT EXISTS supplier_products_supplier_code_unique
  ON public.supplier_products ((COALESCE(supplier_name, '')), product_code);
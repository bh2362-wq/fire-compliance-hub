
-- Supplier product catalog table
CREATE TABLE public.supplier_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_name text NOT NULL DEFAULT 'Huvo',
  product_code text NOT NULL,
  description text NOT NULL,
  trade_price numeric NOT NULL DEFAULT 0,
  category text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast search
CREATE INDEX idx_supplier_products_code ON public.supplier_products (product_code);
CREATE INDEX idx_supplier_products_search ON public.supplier_products USING gin (to_tsvector('english', description || ' ' || product_code));

ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view supplier products" ON public.supplier_products FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can insert supplier products" ON public.supplier_products FOR INSERT WITH CHECK (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can update supplier products" ON public.supplier_products FOR UPDATE USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can delete supplier products" ON public.supplier_products FOR DELETE USING (has_elevated_role(auth.uid()));

CREATE TRIGGER update_supplier_products_updated_at BEFORE UPDATE ON public.supplier_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.materials_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  part_number TEXT NOT NULL,
  description TEXT NOT NULL,
  retail_price NUMERIC DEFAULT 0,
  category TEXT,
  supplier_name TEXT,
  source TEXT DEFAULT 'manual',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_materials_catalog_part_number ON public.materials_catalog (part_number);
CREATE INDEX idx_materials_catalog_search ON public.materials_catalog USING gin (to_tsvector('english', part_number || ' ' || description));

ALTER TABLE public.materials_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view materials catalog"
  ON public.materials_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert materials catalog"
  ON public.materials_catalog FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update materials catalog"
  ON public.materials_catalog FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete materials catalog"
  ON public.materials_catalog FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_materials_catalog_updated_at
  BEFORE UPDATE ON public.materials_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

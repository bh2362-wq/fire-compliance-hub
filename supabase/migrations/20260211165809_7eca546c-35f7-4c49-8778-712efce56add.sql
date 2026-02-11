
-- Create visit requirements table for materials/tools/equipment tags
CREATE TABLE public.visit_requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'materials', -- materials, tools, equipment, other
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  notes TEXT,
  is_confirmed BOOLEAN DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.visit_requirements ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Elevated users can view visit requirements"
ON public.visit_requirements FOR SELECT
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert visit requirements"
ON public.visit_requirements FOR INSERT
WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update visit requirements"
ON public.visit_requirements FOR UPDATE
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete visit requirements"
ON public.visit_requirements FOR DELETE
USING (has_elevated_role(auth.uid()));

-- Timestamp trigger
CREATE TRIGGER update_visit_requirements_updated_at
BEFORE UPDATE ON public.visit_requirements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_visit_requirements_visit_id ON public.visit_requirements(visit_id);

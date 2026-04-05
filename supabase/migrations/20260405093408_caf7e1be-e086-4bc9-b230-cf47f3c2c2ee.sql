
-- Create storage bucket for visit attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('visit-attachments', 'visit-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for visit-attachments bucket
CREATE POLICY "Authenticated users can read visit attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'visit-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Elevated users can upload visit attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'visit-attachments' AND has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update visit attachments"
ON storage.objects FOR UPDATE
USING (bucket_id = 'visit-attachments' AND has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete visit attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'visit-attachments' AND has_elevated_role(auth.uid()));

-- Create subcontractor sheets table
CREATE TABLE public.visit_subcontractor_sheets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  storage_path TEXT NOT NULL,
  description TEXT,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.visit_subcontractor_sheets ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Elevated users can view subcontractor sheets"
ON public.visit_subcontractor_sheets FOR SELECT
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert subcontractor sheets"
ON public.visit_subcontractor_sheets FOR INSERT
WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update subcontractor sheets"
ON public.visit_subcontractor_sheets FOR UPDATE
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete subcontractor sheets"
ON public.visit_subcontractor_sheets FOR DELETE
USING (has_elevated_role(auth.uid()));

-- Index for fast lookups by visit
CREATE INDEX idx_visit_subcontractor_sheets_visit_id ON public.visit_subcontractor_sheets(visit_id);

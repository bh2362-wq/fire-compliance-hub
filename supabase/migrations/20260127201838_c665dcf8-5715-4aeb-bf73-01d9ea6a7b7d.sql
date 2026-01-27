-- Create service reports table for BS5839:2025 compliant service documentation
CREATE TABLE public.service_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Report metadata
  report_number TEXT,
  engineer_name TEXT,
  engineer_signature TEXT,
  client_name TEXT,
  client_signature TEXT,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  next_service_due DATE,
  
  -- System information
  panel_manufacturer TEXT,
  panel_model TEXT,
  panel_location TEXT,
  system_type TEXT, -- L1, L2, L3, L4, L5, M, P1, P2
  zones_count INTEGER,
  devices_count INTEGER,
  
  -- BS5839 Quarterly/Routine Checklist (JSON for flexibility)
  checklist JSONB NOT NULL DEFAULT '{}',
  
  -- Summary
  system_condition TEXT, -- satisfactory, requires_attention, unsatisfactory
  defects_found TEXT,
  recommendations TEXT,
  work_carried_out TEXT,
  parts_used TEXT,
  notes TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'signed'))
);

-- Enable RLS
ALTER TABLE public.service_reports ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Elevated users can view service reports"
  ON public.service_reports FOR SELECT
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert service reports"
  ON public.service_reports FOR INSERT
  WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update service reports"
  ON public.service_reports FOR UPDATE
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete service reports"
  ON public.service_reports FOR DELETE
  USING (has_elevated_role(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_service_reports_updated_at
  BEFORE UPDATE ON public.service_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_service_reports_visit_id ON public.service_reports(visit_id);
CREATE INDEX idx_service_reports_site_id ON public.service_reports(site_id);
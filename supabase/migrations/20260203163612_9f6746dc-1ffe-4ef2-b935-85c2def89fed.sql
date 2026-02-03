-- Create sequence for RAMS numbering
CREATE SEQUENCE IF NOT EXISTS public.rams_number_seq START WITH 1;

-- Update the get_next_qms_number function to include RAMS prefix
CREATE OR REPLACE FUNCTION public.get_next_qms_number(prefix text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
BEGIN
  CASE prefix
    WHEN 'NCR' THEN SELECT nextval('public.ncr_number_seq') INTO next_num;
    WHEN 'CAPA' THEN SELECT nextval('public.capa_number_seq') INTO next_num;
    WHEN 'RISK' THEN SELECT nextval('public.risk_number_seq') INTO next_num;
    WHEN 'AUD' THEN SELECT nextval('public.audit_number_seq') INTO next_num;
    WHEN 'MR' THEN SELECT nextval('public.review_number_seq') INTO next_num;
    WHEN 'FB' THEN SELECT nextval('public.feedback_number_seq') INTO next_num;
    WHEN 'DOC' THEN SELECT nextval('public.document_number_seq') INTO next_num;
    WHEN 'RAMS' THEN SELECT nextval('public.rams_number_seq') INTO next_num;
    ELSE RAISE EXCEPTION 'Unknown prefix: %', prefix;
  END CASE;
  
  RETURN prefix || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$function$;

-- RAMS Templates table (master templates for common service types)
CREATE TABLE public.rams_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  service_type TEXT, -- Links to default_service_types
  hazards JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {hazard, risk_level, control_measures, residual_risk}
  method_statements JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {step_number, description, responsible_person}
  ppe_requirements TEXT[] DEFAULT '{}',
  emergency_procedures TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RAMS Documents table (actual RAMS linked to sites/visits/contracts)
CREATE TABLE public.rams_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rams_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  template_id UUID REFERENCES public.rams_templates(id),
  site_id UUID REFERENCES public.sites(id),
  visit_id UUID REFERENCES public.visits(id),
  contract_id UUID REFERENCES public.site_service_contracts(id),
  
  -- Document content (can override template)
  hazards JSONB NOT NULL DEFAULT '[]'::jsonb,
  method_statements JSONB NOT NULL DEFAULT '[]'::jsonb,
  ppe_requirements TEXT[] DEFAULT '{}',
  emergency_procedures TEXT,
  
  -- Site-specific details
  site_specific_hazards TEXT,
  site_access_notes TEXT,
  
  -- Status and versioning
  status TEXT NOT NULL DEFAULT 'draft', -- draft, pending_approval, approved, superseded, archived
  version INTEGER NOT NULL DEFAULT 1,
  parent_version_id UUID REFERENCES public.rams_documents(id),
  
  -- Approval workflow
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  review_date DATE,
  
  -- Signatures
  preparer_signature TEXT,
  preparer_signed_at TIMESTAMPTZ,
  reviewer_signature TEXT,
  reviewer_signed_at TIMESTAMPTZ,
  client_signature TEXT,
  client_signed_at TIMESTAMPTZ,
  client_name TEXT,
  
  -- Metadata
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RAMS version history for tracking changes
CREATE TABLE public.rams_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rams_document_id UUID NOT NULL REFERENCES public.rams_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  changes_summary TEXT,
  document_snapshot JSONB NOT NULL, -- Full copy of document at this version
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rams_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rams_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rams_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rams_templates
CREATE POLICY "Elevated users can view RAMS templates" 
ON public.rams_templates FOR SELECT 
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage RAMS templates" 
ON public.rams_templates FOR ALL 
USING (has_elevated_role(auth.uid()));

-- RLS Policies for rams_documents
CREATE POLICY "Elevated users can view RAMS documents" 
ON public.rams_documents FOR SELECT 
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage RAMS documents" 
ON public.rams_documents FOR ALL 
USING (has_elevated_role(auth.uid()));

-- RLS Policies for rams_versions
CREATE POLICY "Elevated users can view RAMS versions" 
ON public.rams_versions FOR SELECT 
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage RAMS versions" 
ON public.rams_versions FOR ALL 
USING (has_elevated_role(auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_rams_templates_updated_at
BEFORE UPDATE ON public.rams_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rams_documents_updated_at
BEFORE UPDATE ON public.rams_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Extend app_role enum with new QMS roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'apprentice';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'office';

-- ============================================
-- QMS DOCUMENTS & VERSION CONTROL
-- ============================================

-- Document categories for organization
CREATE TABLE public.qms_document_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Core documents table
CREATE TABLE public.qms_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.qms_document_categories(id) ON DELETE SET NULL,
  document_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  current_version INTEGER DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'obsolete')),
  review_frequency_months INTEGER DEFAULT 12,
  next_review_date DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Document versions for full history
CREATE TABLE public.qms_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.qms_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  changes_summary TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, version_number)
);

-- Approval workflow for documents
CREATE TABLE public.qms_document_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id UUID NOT NULL REFERENCES public.qms_document_versions(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comments TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Acknowledgements for document read receipts
CREATE TABLE public.qms_document_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id UUID NOT NULL REFERENCES public.qms_document_versions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_version_id, user_id)
);

-- ============================================
-- NON-CONFORMANCE REPORTS (NCRs)
-- ============================================

CREATE TABLE public.qms_ncrs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ncr_number TEXT NOT NULL UNIQUE,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('internal_audit', 'external_audit', 'customer_complaint', 'site_visit', 'management_review', 'other')),
  severity TEXT NOT NULL DEFAULT 'minor' CHECK (severity IN ('observation', 'minor', 'major', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigation', 'action_required', 'verification', 'closed')),
  root_cause TEXT,
  immediate_action TEXT,
  raised_by UUID NOT NULL,
  assigned_to UUID,
  due_date DATE,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- CORRECTIVE AND PREVENTIVE ACTIONS (CAPAs)
-- ============================================

CREATE TABLE public.qms_capas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capa_number TEXT NOT NULL UNIQUE,
  ncr_id UUID REFERENCES public.qms_ncrs(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('corrective', 'preventive')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  action_plan TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'verification', 'closed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to UUID,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  verification_required BOOLEAN DEFAULT true,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  effectiveness_review TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- RISK REGISTER
-- ============================================

CREATE TABLE public.qms_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_number TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('operational', 'financial', 'compliance', 'safety', 'environmental', 'reputational', 'other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  likelihood INTEGER NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
  risk_score INTEGER GENERATED ALWAYS AS (likelihood * impact) STORED,
  current_controls TEXT,
  additional_controls TEXT,
  residual_likelihood INTEGER CHECK (residual_likelihood BETWEEN 1 AND 5),
  residual_impact INTEGER CHECK (residual_impact BETWEEN 1 AND 5),
  residual_score INTEGER GENERATED ALWAYS AS (COALESCE(residual_likelihood, likelihood) * COALESCE(residual_impact, impact)) STORED,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'mitigated', 'accepted', 'closed')),
  owner_id UUID,
  review_date DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- TRAINING & COMPETENCE
-- ============================================

CREATE TABLE public.qms_training_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  validity_months INTEGER,
  is_mandatory BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.qms_training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  training_type_id UUID NOT NULL REFERENCES public.qms_training_types(id) ON DELETE CASCADE,
  completion_date DATE NOT NULL,
  expiry_date DATE,
  certificate_url TEXT,
  certificate_number TEXT,
  trainer TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'expiring_soon', 'expired', 'renewed')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INTERNAL AUDITS
-- ============================================

CREATE TABLE public.qms_audit_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  checklist JSONB NOT NULL DEFAULT '[]',
  iso_clauses TEXT[],
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.qms_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_number TEXT NOT NULL UNIQUE,
  template_id UUID REFERENCES public.qms_audit_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  audit_type TEXT NOT NULL CHECK (audit_type IN ('internal', 'external', 'supplier')),
  scope TEXT,
  scheduled_date DATE NOT NULL,
  completed_date DATE,
  lead_auditor_id UUID,
  auditee_department TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  findings JSONB DEFAULT '[]',
  summary TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- MANAGEMENT REVIEWS
-- ============================================

CREATE TABLE public.qms_management_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_number TEXT NOT NULL UNIQUE,
  review_date DATE NOT NULL,
  attendees TEXT[],
  agenda JSONB DEFAULT '[]',
  kpi_data JSONB DEFAULT '{}',
  decisions JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  minutes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed')),
  next_review_date DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- CUSTOMER FEEDBACK & COMPLAINTS
-- ============================================

CREATE TABLE public.qms_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('complaint', 'positive', 'suggestion', 'enquiry')),
  channel TEXT CHECK (channel IN ('phone', 'email', 'in_person', 'website', 'social_media', 'other')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  resolution TEXT,
  ncr_id UUID REFERENCES public.qms_ncrs(id) ON DELETE SET NULL,
  assigned_to UUID,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  satisfaction_rating INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- ATTACHMENTS (universal for all QMS items)
-- ============================================

CREATE TABLE public.qms_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('ncr', 'capa', 'audit', 'feedback', 'training', 'risk', 'management_review')),
  entity_id UUID NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  description TEXT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- ENHANCED ACTIVITY LOG (extending audit_logs)
-- ============================================

-- Add index for better query performance on audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ============================================
-- SEQUENCES FOR NUMBERING
-- ============================================

CREATE SEQUENCE IF NOT EXISTS public.ncr_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.capa_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.risk_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.audit_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.review_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.feedback_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.document_number_seq START 1;

-- ============================================
-- HELPER FUNCTIONS FOR AUTO-NUMBERING
-- ============================================

CREATE OR REPLACE FUNCTION public.get_next_qms_number(prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
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
    ELSE RAISE EXCEPTION 'Unknown prefix: %', prefix;
  END CASE;
  
  RETURN prefix || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$$;

-- ============================================
-- TRIGGERS FOR updated_at
-- ============================================

CREATE TRIGGER update_qms_documents_updated_at BEFORE UPDATE ON public.qms_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qms_document_approvals_updated_at BEFORE UPDATE ON public.qms_document_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qms_ncrs_updated_at BEFORE UPDATE ON public.qms_ncrs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qms_capas_updated_at BEFORE UPDATE ON public.qms_capas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qms_risks_updated_at BEFORE UPDATE ON public.qms_risks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qms_training_types_updated_at BEFORE UPDATE ON public.qms_training_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qms_training_records_updated_at BEFORE UPDATE ON public.qms_training_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qms_audit_templates_updated_at BEFORE UPDATE ON public.qms_audit_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qms_audits_updated_at BEFORE UPDATE ON public.qms_audits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qms_management_reviews_updated_at BEFORE UPDATE ON public.qms_management_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qms_feedback_updated_at BEFORE UPDATE ON public.qms_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qms_document_categories_updated_at BEFORE UPDATE ON public.qms_document_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ENABLE RLS ON ALL QMS TABLES
-- ============================================

ALTER TABLE public.qms_document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_document_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_document_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_ncrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_capas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_training_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_audit_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_management_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qms_attachments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - Using has_elevated_role for admin access
-- ============================================

-- Document Categories
CREATE POLICY "Authenticated users can view document categories" ON public.qms_document_categories FOR SELECT USING (true);
CREATE POLICY "Elevated users can manage document categories" ON public.qms_document_categories FOR ALL USING (has_elevated_role(auth.uid()));

-- Documents
CREATE POLICY "Authenticated users can view approved documents" ON public.qms_documents FOR SELECT USING (status = 'approved' OR has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can manage documents" ON public.qms_documents FOR ALL USING (has_elevated_role(auth.uid()));

-- Document Versions
CREATE POLICY "Authenticated users can view document versions" ON public.qms_document_versions FOR SELECT USING (true);
CREATE POLICY "Elevated users can manage document versions" ON public.qms_document_versions FOR ALL USING (has_elevated_role(auth.uid()));

-- Document Approvals
CREATE POLICY "Users can view their own approvals" ON public.qms_document_approvals FOR SELECT USING (approver_id = auth.uid() OR has_elevated_role(auth.uid()));
CREATE POLICY "Users can update their own approvals" ON public.qms_document_approvals FOR UPDATE USING (approver_id = auth.uid());
CREATE POLICY "Elevated users can manage approvals" ON public.qms_document_approvals FOR ALL USING (has_elevated_role(auth.uid()));

-- Document Acknowledgements
CREATE POLICY "Users can view acknowledgements" ON public.qms_document_acknowledgements FOR SELECT USING (true);
CREATE POLICY "Users can insert their own acknowledgements" ON public.qms_document_acknowledgements FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Elevated users can manage acknowledgements" ON public.qms_document_acknowledgements FOR ALL USING (has_elevated_role(auth.uid()));

-- NCRs
CREATE POLICY "Elevated users can view NCRs" ON public.qms_ncrs FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can manage NCRs" ON public.qms_ncrs FOR ALL USING (has_elevated_role(auth.uid()));

-- CAPAs
CREATE POLICY "Elevated users can view CAPAs" ON public.qms_capas FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can manage CAPAs" ON public.qms_capas FOR ALL USING (has_elevated_role(auth.uid()));

-- Risks
CREATE POLICY "Elevated users can view risks" ON public.qms_risks FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can manage risks" ON public.qms_risks FOR ALL USING (has_elevated_role(auth.uid()));

-- Training Types
CREATE POLICY "Authenticated users can view training types" ON public.qms_training_types FOR SELECT USING (true);
CREATE POLICY "Elevated users can manage training types" ON public.qms_training_types FOR ALL USING (has_elevated_role(auth.uid()));

-- Training Records
CREATE POLICY "Users can view their own training records" ON public.qms_training_records FOR SELECT USING (user_id = auth.uid() OR has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can manage training records" ON public.qms_training_records FOR ALL USING (has_elevated_role(auth.uid()));

-- Audit Templates
CREATE POLICY "Elevated users can view audit templates" ON public.qms_audit_templates FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can manage audit templates" ON public.qms_audit_templates FOR ALL USING (has_elevated_role(auth.uid()));

-- Audits
CREATE POLICY "Elevated users can view audits" ON public.qms_audits FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can manage audits" ON public.qms_audits FOR ALL USING (has_elevated_role(auth.uid()));

-- Management Reviews
CREATE POLICY "Elevated users can view management reviews" ON public.qms_management_reviews FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can manage management reviews" ON public.qms_management_reviews FOR ALL USING (has_elevated_role(auth.uid()));

-- Feedback
CREATE POLICY "Elevated users can view feedback" ON public.qms_feedback FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can manage feedback" ON public.qms_feedback FOR ALL USING (has_elevated_role(auth.uid()));

-- Attachments
CREATE POLICY "Elevated users can view attachments" ON public.qms_attachments FOR SELECT USING (has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users can manage attachments" ON public.qms_attachments FOR ALL USING (has_elevated_role(auth.uid()));

-- ============================================
-- SEED DEFAULT DOCUMENT CATEGORIES
-- ============================================

INSERT INTO public.qms_document_categories (name, description, sort_order) VALUES
  ('Quality Manual', 'Top-level QMS documentation', 1),
  ('Procedures', 'Standard operating procedures', 2),
  ('Work Instructions', 'Detailed task-level instructions', 3),
  ('Forms & Templates', 'Controlled forms and templates', 4),
  ('Policies', 'Company policies', 5),
  ('External Documents', 'Standards, regulations, customer specs', 6);

-- ============================================
-- SEED DEFAULT TRAINING TYPES
-- ============================================

INSERT INTO public.qms_training_types (name, description, validity_months, is_mandatory, sort_order) VALUES
  ('Fire Alarm Systems (BS 5839)', 'British Standard fire detection and alarm systems', 36, true, 1),
  ('Aspirating Smoke Detection', 'ASD system installation and maintenance', 36, false, 2),
  ('Health & Safety Induction', 'Company H&S induction training', 12, true, 3),
  ('Manual Handling', 'Safe manual handling techniques', 36, true, 4),
  ('Working at Height', 'Safe working at height procedures', 36, false, 5),
  ('First Aid at Work', 'Emergency first aid certification', 36, false, 6),
  ('ISO 9001 Awareness', 'Quality management system awareness', 24, true, 7),
  ('ECS/CSCS Card', 'Electrotechnical Certification Scheme', 60, true, 8);

-- GDPR consent tracking
CREATE TABLE public.gdpr_consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  consent_type TEXT NOT NULL,
  consented BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  user_agent TEXT,
  consented_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  withdrawn_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.gdpr_consent_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own consent" ON public.gdpr_consent_records
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own consent" ON public.gdpr_consent_records
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own consent" ON public.gdpr_consent_records
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins can view all consent" ON public.gdpr_consent_records
  FOR SELECT TO authenticated USING (has_finance_role(auth.uid()));

-- Subject Access Requests
CREATE TABLE public.data_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'export',
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  processed_by UUID,
  processed_at TIMESTAMP WITH TIME ZONE,
  export_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.data_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own requests" ON public.data_access_requests
  FOR SELECT TO authenticated USING (requested_by = auth.uid());

CREATE POLICY "Users can insert own requests" ON public.data_access_requests
  FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Admins can manage all requests" ON public.data_access_requests
  FOR ALL TO authenticated USING (has_finance_role(auth.uid()));

-- Data retention policies
CREATE TABLE public.data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL UNIQUE,
  retention_days INTEGER NOT NULL DEFAULT 2555,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_purge_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.data_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage retention policies" ON public.data_retention_policies
  FOR ALL TO authenticated USING (has_finance_role(auth.uid()));

CREATE POLICY "Authenticated can view retention policies" ON public.data_retention_policies
  FOR SELECT TO authenticated USING (true);

-- Seed default retention policies
INSERT INTO public.data_retention_policies (table_name, retention_days, description) VALUES
  ('audit_logs', 2555, 'Audit trail records (7 years for compliance)'),
  ('email_logs', 1095, 'Email communication logs (3 years)'),
  ('service_reports', 2555, 'Service reports (7 years for fire safety compliance)'),
  ('file_uploads', 1825, 'Uploaded files and documents (5 years)'),
  ('credit_checks', 365, 'Credit check results (1 year)'),
  ('payment_history', 2555, 'Payment records (7 years for financial compliance)');

-- Session activity log for security
CREATE TABLE public.session_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.session_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions" ON public.session_activity_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own sessions" ON public.session_activity_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all sessions" ON public.session_activity_log
  FOR SELECT TO authenticated USING (has_finance_role(auth.uid()));

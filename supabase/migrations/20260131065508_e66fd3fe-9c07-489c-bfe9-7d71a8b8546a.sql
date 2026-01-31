-- Create audit log table for tracking significant actions
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Elevated users can view audit logs
CREATE POLICY "Elevated users can view audit logs"
ON public.audit_logs
FOR SELECT
USING (has_elevated_role(auth.uid()));

-- Elevated users can insert audit logs
CREATE POLICY "Elevated users can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (has_elevated_role(auth.uid()));

-- Create index for common queries
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- Table to store shareable customer intelligence reports
CREATE TABLE public.customer_intelligence_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_intelligence_reports ENABLE ROW LEVEL SECURITY;

-- Elevated users can manage reports
CREATE POLICY "Elevated users can manage intelligence reports"
ON public.customer_intelligence_reports
FOR ALL
USING (has_elevated_role(auth.uid()));

-- Public read access via share token (for shared links)
CREATE POLICY "Anyone can view active shared reports via token"
ON public.customer_intelligence_reports
FOR SELECT
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Index for fast token lookup
CREATE INDEX idx_intelligence_reports_token ON public.customer_intelligence_reports(share_token);
CREATE INDEX idx_intelligence_reports_customer ON public.customer_intelligence_reports(customer_id);

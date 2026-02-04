-- Add default email recipients field to customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS email_recipients text;

-- Create email log table
CREATE TABLE public.email_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  report_id uuid REFERENCES public.service_reports(id) ON DELETE SET NULL,
  recipients text[] NOT NULL,
  subject text NOT NULL,
  email_type text NOT NULL DEFAULT 'report',
  resend_id text,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  delivered_at timestamp with time zone,
  opened_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add comment for email_recipients column
COMMENT ON COLUMN public.customers.email_recipients IS 'Comma-separated list of default email recipients for reports';

-- Enable RLS on email_logs
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for email_logs
CREATE POLICY "Elevated users can view email logs"
ON public.email_logs
FOR SELECT
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert email logs"
ON public.email_logs
FOR INSERT
WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update email logs"
ON public.email_logs
FOR UPDATE
USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete email logs"
ON public.email_logs
FOR DELETE
USING (has_elevated_role(auth.uid()));

-- Create index for faster lookups
CREATE INDEX idx_email_logs_customer_id ON public.email_logs(customer_id);
CREATE INDEX idx_email_logs_status ON public.email_logs(status);
CREATE INDEX idx_email_logs_sent_at ON public.email_logs(sent_at DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_email_logs_updated_at
BEFORE UPDATE ON public.email_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
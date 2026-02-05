-- Credit Control System Tables

-- Chase schedule templates (Standard: 7, 14, 21, 30 days)
CREATE TABLE public.credit_control_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Chase steps within a schedule
CREATE TABLE public.credit_control_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.credit_control_schedules(id) ON DELETE CASCADE,
  days_overdue INTEGER NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'call')),
  template_type TEXT NOT NULL CHECK (template_type IN ('reminder', 'warning', 'final_notice', 'escalation')),
  subject_template TEXT,
  message_template TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Customer exclusions from automated chasing
CREATE TABLE public.credit_control_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  xero_invoice_id TEXT,
  reason TEXT,
  excluded_by UUID NOT NULL,
  excluded_until TIMESTAMP WITH TIME ZONE,
  is_permanent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT customer_or_invoice CHECK (customer_id IS NOT NULL OR xero_invoice_id IS NOT NULL)
);

-- Chase reminder history/log
CREATE TABLE public.credit_control_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  xero_invoice_id TEXT NOT NULL,
  xero_invoice_number TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'call')),
  step_id UUID REFERENCES public.credit_control_steps(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'answered', 'no_answer', 'voicemail')),
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  response_received_at TIMESTAMP WITH TIME ZONE,
  response_notes TEXT,
  error_message TEXT,
  external_id TEXT,
  amount_due NUMERIC,
  days_overdue INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Payment history for analytics (synced from Xero)
CREATE TABLE public.payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  xero_contact_id TEXT,
  xero_invoice_id TEXT NOT NULL,
  xero_invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  payment_date DATE,
  invoice_amount NUMERIC NOT NULL,
  payment_amount NUMERIC NOT NULL,
  days_to_pay INTEGER,
  was_overdue BOOLEAN DEFAULT false,
  days_overdue INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_control_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_control_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_control_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_control_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for credit_control_schedules
CREATE POLICY "Elevated users can view schedules" ON public.credit_control_schedules
  FOR SELECT USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage schedules" ON public.credit_control_schedules
  FOR ALL USING (has_elevated_role(auth.uid()));

-- RLS Policies for credit_control_steps
CREATE POLICY "Elevated users can view steps" ON public.credit_control_steps
  FOR SELECT USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage steps" ON public.credit_control_steps
  FOR ALL USING (has_elevated_role(auth.uid()));

-- RLS Policies for credit_control_exclusions
CREATE POLICY "Elevated users can view exclusions" ON public.credit_control_exclusions
  FOR SELECT USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage exclusions" ON public.credit_control_exclusions
  FOR ALL USING (has_elevated_role(auth.uid()));

-- RLS Policies for credit_control_reminders
CREATE POLICY "Elevated users can view reminders" ON public.credit_control_reminders
  FOR SELECT USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage reminders" ON public.credit_control_reminders
  FOR ALL USING (has_elevated_role(auth.uid()));

-- RLS Policies for payment_history
CREATE POLICY "Elevated users can view payment history" ON public.payment_history
  FOR SELECT USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage payment history" ON public.payment_history
  FOR ALL USING (has_elevated_role(auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_credit_control_schedules_updated_at
  BEFORE UPDATE ON public.credit_control_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credit_control_steps_updated_at
  BEFORE UPDATE ON public.credit_control_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credit_control_exclusions_updated_at
  BEFORE UPDATE ON public.credit_control_exclusions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credit_control_reminders_updated_at
  BEFORE UPDATE ON public.credit_control_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_credit_control_reminders_customer ON public.credit_control_reminders(customer_id);
CREATE INDEX idx_credit_control_reminders_invoice ON public.credit_control_reminders(xero_invoice_id);
CREATE INDEX idx_credit_control_reminders_scheduled ON public.credit_control_reminders(scheduled_at);
CREATE INDEX idx_credit_control_reminders_status ON public.credit_control_reminders(status);
CREATE INDEX idx_credit_control_exclusions_customer ON public.credit_control_exclusions(customer_id);
CREATE INDEX idx_payment_history_customer ON public.payment_history(customer_id);
CREATE INDEX idx_payment_history_xero_contact ON public.payment_history(xero_contact_id);
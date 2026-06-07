
CREATE TABLE public.remittance_advices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_email_id UUID REFERENCES public.scanned_emails(id) ON DELETE SET NULL,
  message_id TEXT NOT NULL,
  mailbox TEXT NOT NULL,
  from_address TEXT,
  from_name TEXT,
  subject TEXT,
  received_at TIMESTAMPTZ,
  payment_date DATE,
  total_amount NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'GBP',
  payer_name TEXT,
  ai_raw_extract JSONB,
  status TEXT NOT NULL DEFAULT 'parsed' CHECK (status IN ('parsed','needs_review','applied','dismissed','failed')),
  error_message TEXT,
  applied_at TIMESTAMPTZ,
  applied_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, mailbox)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remittance_advices TO authenticated;
GRANT ALL ON public.remittance_advices TO service_role;

ALTER TABLE public.remittance_advices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can manage remittance advices"
  ON public.remittance_advices FOR ALL
  TO authenticated
  USING (public.has_finance_role(auth.uid()))
  WITH CHECK (public.has_finance_role(auth.uid()));

CREATE TRIGGER update_remittance_advices_updated_at
  BEFORE UPDATE ON public.remittance_advices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.remittance_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id UUID NOT NULL REFERENCES public.remittance_advices(id) ON DELETE CASCADE,
  invoice_number TEXT,
  amount NUMERIC(14,2),
  raw_text TEXT,
  matched_xero_invoice_id UUID REFERENCES public.xero_invoices(id) ON DELETE SET NULL,
  xero_invoice_id TEXT,
  matched_contact_name TEXT,
  match_confidence TEXT CHECK (match_confidence IN ('exact','fuzzy','manual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','skipped','failed')),
  xero_payment_id TEXT,
  error_message TEXT,
  applied_at TIMESTAMPTZ,
  applied_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remittance_line_items TO authenticated;
GRANT ALL ON public.remittance_line_items TO service_role;

ALTER TABLE public.remittance_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can manage remittance line items"
  ON public.remittance_line_items FOR ALL
  TO authenticated
  USING (public.has_finance_role(auth.uid()))
  WITH CHECK (public.has_finance_role(auth.uid()));

CREATE TRIGGER update_remittance_line_items_updated_at
  BEFORE UPDATE ON public.remittance_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_remittance_advices_status ON public.remittance_advices(status);
CREATE INDEX idx_remittance_advices_received_at ON public.remittance_advices(received_at DESC);
CREATE INDEX idx_remittance_line_items_remittance ON public.remittance_line_items(remittance_id);

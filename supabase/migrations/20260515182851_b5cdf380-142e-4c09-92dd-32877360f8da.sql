
CREATE TABLE public.customer_email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  form_label text,
  recipient_email text,
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_email_drafts_customer ON public.customer_email_drafts(customer_id);
CREATE INDEX idx_customer_email_drafts_status ON public.customer_email_drafts(status);

ALTER TABLE public.customer_email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view drafts"
  ON public.customer_email_drafts FOR SELECT
  USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert drafts"
  ON public.customer_email_drafts FOR INSERT
  WITH CHECK (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can update drafts"
  ON public.customer_email_drafts FOR UPDATE
  USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Finance users can delete drafts"
  ON public.customer_email_drafts FOR DELETE
  USING (public.has_finance_role(auth.uid()));

CREATE TRIGGER trg_customer_email_drafts_updated_at
  BEFORE UPDATE ON public.customer_email_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.email_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_email_id text,
  source_subject text,
  source_from text,
  source_received_at timestamptz,
  source_preview text,
  intent_type text NOT NULL CHECK (intent_type IN ('visit','callout','quote','meeting','reminder','issue','note')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  title text NOT NULL,
  summary text,
  suggested_date date,
  suggested_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','actioned','dismissed','snoozed')),
  actioned_entity_type text,
  actioned_entity_id uuid,
  snooze_until timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_action_items_status ON public.email_action_items(status);
CREATE INDEX idx_email_action_items_priority ON public.email_action_items(priority) WHERE status = 'pending';
CREATE INDEX idx_email_action_items_intent ON public.email_action_items(intent_type);
CREATE INDEX idx_email_action_items_created_at ON public.email_action_items(created_at DESC);
CREATE INDEX idx_email_action_items_source_email ON public.email_action_items(source_email_id);

ALTER TABLE public.email_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users view email action items"
ON public.email_action_items FOR SELECT
USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users insert email action items"
ON public.email_action_items FOR INSERT
WITH CHECK (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users update email action items"
ON public.email_action_items FOR UPDATE
USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users delete email action items"
ON public.email_action_items FOR DELETE
USING (public.has_elevated_role(auth.uid()));

CREATE TRIGGER update_email_action_items_updated_at
BEFORE UPDATE ON public.email_action_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
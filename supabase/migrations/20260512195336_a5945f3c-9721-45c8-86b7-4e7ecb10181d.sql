
CREATE TABLE public.scanned_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mailbox TEXT NOT NULL,
  message_id TEXT NOT NULL,
  subject TEXT,
  from_address TEXT,
  from_name TEXT,
  to_recipients JSONB,
  received_at TIMESTAMPTZ,
  body_preview TEXT,
  has_attachments BOOLEAN DEFAULT false,
  is_read BOOLEAN DEFAULT false,
  importance TEXT,
  raw JSONB,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scanned_emails_unique_msg UNIQUE (mailbox, message_id)
);

CREATE INDEX idx_scanned_emails_mailbox_received ON public.scanned_emails (mailbox, received_at DESC);
CREATE INDEX idx_scanned_emails_from ON public.scanned_emails (from_address);

ALTER TABLE public.scanned_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view scanned emails"
  ON public.scanned_emails FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert scanned emails"
  ON public.scanned_emails FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update scanned emails"
  ON public.scanned_emails FOR UPDATE
  TO authenticated
  USING (true);

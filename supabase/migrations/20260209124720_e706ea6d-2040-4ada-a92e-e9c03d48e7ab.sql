
-- Add SharePoint folder path to sites table
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS sharepoint_folder text;

-- Create table to store Microsoft OAuth tokens (company-wide, like Xero)
CREATE TABLE public.microsoft_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_type text DEFAULT 'Bearer',
  expires_at timestamp with time zone NOT NULL,
  scope text,
  connected_by uuid NOT NULL,
  connected_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.microsoft_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance users can view microsoft tokens"
  ON public.microsoft_tokens FOR SELECT
  USING (has_finance_role(auth.uid()));

CREATE POLICY "Finance users can manage microsoft tokens"
  ON public.microsoft_tokens FOR ALL
  USING (has_finance_role(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_microsoft_tokens_updated_at
  BEFORE UPDATE ON public.microsoft_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

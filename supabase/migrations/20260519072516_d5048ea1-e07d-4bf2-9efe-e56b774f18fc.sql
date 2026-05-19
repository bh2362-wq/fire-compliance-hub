
CREATE TABLE IF NOT EXISTS public.ai_assists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  assist_type text NOT NULL,
  input_text text,
  output_text text,
  use_reference_library boolean NOT NULL DEFAULT false,
  grounding jsonb,
  hallucinated_clauses jsonb,
  custom_instructions text,
  model text,
  latency_ms integer,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_assists_user_id_idx ON public.ai_assists(user_id);
CREATE INDEX IF NOT EXISTS ai_assists_type_idx ON public.ai_assists(assist_type);
CREATE INDEX IF NOT EXISTS ai_assists_created_at_idx ON public.ai_assists(created_at DESC);

ALTER TABLE public.ai_assists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_assists"
  ON public.ai_assists FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_finance_role(auth.uid()));

-- inserts are performed by edge functions using service role; no insert policy needed

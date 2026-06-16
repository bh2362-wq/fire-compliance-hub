-- ════════════════════════════════════════════════════════════════════
-- Bid Writing System
-- Tender / ITT response workspace: a bid holds many scored questions, each
-- with an AI-assisted answer. bid_generations is the AI audit trail
-- (mirrors scope_generations for quotations).
-- ════════════════════════════════════════════════════════════════════

-- Reference sequence (mirrors visits_job_number_seq)
CREATE SEQUENCE IF NOT EXISTS public.bid_reference_seq START WITH 1;

-- ── bids ──────────────────────────────────────────────────────────────
CREATE TABLE public.bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_reference text UNIQUE,
  title text NOT NULL,
  buyer_name text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  portal_name text,
  submission_deadline timestamptz,
  estimated_value numeric,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_progress','submitted','won','lost','withdrawn')),
  summary text,
  outcome_notes text,
  sharepoint_url text,
  sharepoint_folder text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bids_status ON public.bids(status);
CREATE INDEX idx_bids_customer ON public.bids(customer_id);
CREATE INDEX idx_bids_deadline ON public.bids(submission_deadline);
CREATE INDEX idx_bids_created_at ON public.bids(created_at DESC);

-- ── bid_questions ───────────────────────────────────────────────────────
CREATE TABLE public.bid_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id uuid NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  section text,
  question_ref text,
  question_text text NOT NULL,
  guidance text,
  word_limit integer,
  char_limit integer,
  weighting numeric,
  answer text,
  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo','drafted','reviewed','final')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bid_questions_bid ON public.bid_questions(bid_id);
CREATE INDEX idx_bid_questions_order ON public.bid_questions(bid_id, sort_order);

-- ── bid_generations (AI audit trail) ────────────────────────────────────
CREATE TABLE public.bid_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id uuid REFERENCES public.bids(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.bid_questions(id) ON DELETE CASCADE,
  mode text NOT NULL,
  instruction text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  output text,
  model text,
  tokens_input integer,
  tokens_output integer,
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bid_generations_bid ON public.bid_generations(bid_id);
CREATE INDEX idx_bid_generations_question ON public.bid_generations(question_id);

-- ── Auto-assign bid_reference (mirrors assign_visit_job_number) ─────────
CREATE OR REPLACE FUNCTION public.assign_bid_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.bid_reference IS NULL THEN
    NEW.bid_reference := 'BID-' || LPAD(nextval('public.bid_reference_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_assign_bid_reference
BEFORE INSERT ON public.bids
FOR EACH ROW EXECUTE FUNCTION public.assign_bid_reference();

-- ── updated_at triggers ─────────────────────────────────────────────────
CREATE TRIGGER update_bids_updated_at
BEFORE UPDATE ON public.bids
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bid_questions_updated_at
BEFORE UPDATE ON public.bid_questions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS (elevated users only, matching email_action_items) ──────────────
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users view bids"
  ON public.bids FOR SELECT USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users insert bids"
  ON public.bids FOR INSERT WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users update bids"
  ON public.bids FOR UPDATE USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users delete bids"
  ON public.bids FOR DELETE USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users view bid questions"
  ON public.bid_questions FOR SELECT USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users insert bid questions"
  ON public.bid_questions FOR INSERT WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users update bid questions"
  ON public.bid_questions FOR UPDATE USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users delete bid questions"
  ON public.bid_questions FOR DELETE USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users view bid generations"
  ON public.bid_generations FOR SELECT USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users insert bid generations"
  ON public.bid_generations FOR INSERT WITH CHECK (public.has_elevated_role(auth.uid()));

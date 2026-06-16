-- ════════════════════════════════════════════════════════════════════
-- Bid pack ingestion & AI analysis
-- Uploaded tender documents per bid + the structured AI analysis that
-- reads them and auto-extracts the scored questions.
-- ════════════════════════════════════════════════════════════════════

-- ── bid_documents: the uploaded tender pack ─────────────────────────────
CREATE TABLE public.bid_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id uuid NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text,
  doc_type text NOT NULL DEFAULT 'other'
    CHECK (doc_type IN ('itt','specification','contract','pricing','sq','social_value','tor','drawing','other')),
  extracted_text text,
  page_count integer,
  char_count integer,
  status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','extracted','scanned','failed')),
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bid_documents_bid ON public.bid_documents(bid_id);

CREATE TRIGGER update_bid_documents_updated_at
BEFORE UPDATE ON public.bid_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bid_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users view bid documents"
  ON public.bid_documents FOR SELECT USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users insert bid documents"
  ON public.bid_documents FOR INSERT WITH CHECK (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users update bid documents"
  ON public.bid_documents FOR UPDATE USING (public.has_elevated_role(auth.uid()));
CREATE POLICY "Elevated users delete bid documents"
  ON public.bid_documents FOR DELETE USING (public.has_elevated_role(auth.uid()));

-- ── bids: AI analysis output ────────────────────────────────────────────
ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS analysis jsonb;
ALTER TABLE public.bids ADD COLUMN IF NOT EXISTS analysed_at timestamptz;

-- ── bid_questions: mark AI-extracted rows ───────────────────────────────
ALTER TABLE public.bid_questions ADD COLUMN IF NOT EXISTS auto_extracted boolean NOT NULL DEFAULT false;

-- ── Storage bucket for uploaded tender packs ────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('bid-documents', 'bid-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "bid_documents_read" ON storage.objects;
CREATE POLICY "bid_documents_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bid-documents');

DROP POLICY IF EXISTS "bid_documents_write" ON storage.objects;
CREATE POLICY "bid_documents_write"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'bid-documents')
  WITH CHECK (bucket_id = 'bid-documents');

NOTIFY pgrst, 'reload schema';

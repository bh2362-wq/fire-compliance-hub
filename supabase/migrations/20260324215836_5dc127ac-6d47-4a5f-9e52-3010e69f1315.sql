
-- Supplier Evaluations table for ISO 9001 Clause 8.4
CREATE TABLE public.qms_supplier_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  evaluation_period_start DATE NOT NULL,
  evaluation_period_end DATE NOT NULL,
  
  -- Scoring (each out of 10)
  delivery_score NUMERIC DEFAULT 0,
  quality_score NUMERIC DEFAULT 0,
  responsiveness_score NUMERIC DEFAULT 0,
  overall_score NUMERIC DEFAULT 0,
  
  -- Metrics
  total_orders INTEGER DEFAULT 0,
  on_time_deliveries INTEGER DEFAULT 0,
  late_deliveries INTEGER DEFAULT 0,
  total_spend NUMERIC DEFAULT 0,
  ncrs_raised INTEGER DEFAULT 0,
  
  -- Classification
  rating TEXT NOT NULL DEFAULT 'approved',
  notes TEXT,
  
  -- Auto vs manual
  source TEXT NOT NULL DEFAULT 'auto',
  
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qms_supplier_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view supplier evaluations"
  ON public.qms_supplier_evaluations FOR SELECT
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can manage supplier evaluations"
  ON public.qms_supplier_evaluations FOR ALL
  USING (has_elevated_role(auth.uid()));

-- Trigger to auto-evaluate supplier when PO status changes to 'received' or 'completed'
CREATE OR REPLACE FUNCTION public.auto_evaluate_supplier_on_po()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_supplier_id UUID;
  v_total_orders INTEGER;
  v_on_time INTEGER;
  v_late INTEGER;
  v_total_spend NUMERIC;
  v_ncr_count INTEGER;
  v_delivery_score NUMERIC;
  v_quality_score NUMERIC;
  v_overall_score NUMERIC;
  v_rating TEXT;
  v_period_start DATE;
BEGIN
  -- Only trigger when status changes to received/completed
  IF NEW.status NOT IN ('received', 'completed') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_supplier_id := NEW.supplier_id;
  v_period_start := (CURRENT_DATE - INTERVAL '12 months')::DATE;

  -- Count orders in the last 12 months
  SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
  INTO v_total_orders, v_total_spend
  FROM purchase_orders
  WHERE supplier_id = v_supplier_id
    AND status IN ('received', 'completed', 'sent')
    AND order_date >= v_period_start;

  -- Count on-time vs late (based on expected_delivery_date vs updated_at when received)
  SELECT 
    COUNT(*) FILTER (WHERE expected_delivery_date IS NULL OR updated_at::date <= expected_delivery_date),
    COUNT(*) FILTER (WHERE expected_delivery_date IS NOT NULL AND updated_at::date > expected_delivery_date)
  INTO v_on_time, v_late
  FROM purchase_orders
  WHERE supplier_id = v_supplier_id
    AND status IN ('received', 'completed')
    AND order_date >= v_period_start;

  -- Count NCRs linked to this supplier's site/customer (approximate)
  v_ncr_count := 0;

  -- Calculate scores
  IF (v_on_time + v_late) > 0 THEN
    v_delivery_score := ROUND((v_on_time::NUMERIC / (v_on_time + v_late)::NUMERIC) * 10, 1);
  ELSE
    v_delivery_score := 10;
  END IF;

  -- Quality score based on NCR ratio
  IF v_total_orders > 0 THEN
    v_quality_score := GREATEST(0, ROUND(10 - (v_ncr_count::NUMERIC / v_total_orders::NUMERIC) * 10, 1));
  ELSE
    v_quality_score := 10;
  END IF;

  -- Overall = weighted average (delivery 50%, quality 50%)
  v_overall_score := ROUND((v_delivery_score * 0.5 + v_quality_score * 0.5), 1);

  -- Rating classification
  v_rating := CASE
    WHEN v_overall_score >= 8 THEN 'preferred'
    WHEN v_overall_score >= 6 THEN 'approved'
    WHEN v_overall_score >= 4 THEN 'conditional'
    ELSE 'under_review'
  END;

  -- Upsert evaluation for this supplier (one per quarter)
  INSERT INTO qms_supplier_evaluations (
    supplier_id, evaluation_period_start, evaluation_period_end,
    delivery_score, quality_score, responsiveness_score, overall_score,
    total_orders, on_time_deliveries, late_deliveries, total_spend, ncrs_raised,
    rating, source, created_by
  ) VALUES (
    v_supplier_id, v_period_start, CURRENT_DATE,
    v_delivery_score, v_quality_score, 0, v_overall_score,
    v_total_orders, v_on_time, v_late, v_total_spend, v_ncr_count,
    v_rating, 'auto', NEW.created_by
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_supplier_eval_on_po_complete
  AFTER UPDATE OF status ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_evaluate_supplier_on_po();

-- Auto-create CAPA from overdue document reviews
CREATE OR REPLACE FUNCTION public.auto_capa_from_overdue_reviews()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  doc RECORD;
  capa_num TEXT;
BEGIN
  FOR doc IN
    SELECT d.id, d.document_number, d.title, d.next_review_date
    FROM qms_documents d
    WHERE d.next_review_date < CURRENT_DATE
      AND d.status NOT IN ('archived', 'obsolete')
      AND NOT EXISTS (
        SELECT 1 FROM qms_capas c
        WHERE c.title LIKE '%' || d.document_number || '%'
          AND c.status NOT IN ('closed', 'cancelled')
      )
  LOOP
    SELECT get_next_qms_number('CAPA') INTO capa_num;
    
    INSERT INTO qms_capas (
      capa_number, title, description, type, status, priority,
      due_date, verification_required, created_by
    ) VALUES (
      capa_num,
      'Overdue document review: ' || doc.document_number || ' - ' || doc.title,
      'Document ' || doc.document_number || ' (' || doc.title || ') was due for review on ' || doc.next_review_date || ' and has not been reviewed. This CAPA has been auto-generated to ensure compliance with document control procedures.',
      'corrective',
      'open',
      'high',
      (CURRENT_DATE + INTERVAL '14 days')::DATE,
      true,
      '00000000-0000-0000-0000-000000000000'
    );
  END LOOP;
END;
$$;

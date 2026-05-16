-- 1. Recycled pool
CREATE TABLE IF NOT EXISTS public.recycled_smart_form_cert_refs (
  certificate_reference TEXT PRIMARY KEY,
  form_type TEXT NOT NULL,
  recycled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recycled_smart_form_cert_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Elevated users can view recycled cert refs"
  ON public.recycled_smart_form_cert_refs FOR SELECT
  USING (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can insert recycled cert refs"
  ON public.recycled_smart_form_cert_refs FOR INSERT
  WITH CHECK (has_elevated_role(auth.uid()));

CREATE POLICY "Elevated users can delete recycled cert refs"
  ON public.recycled_smart_form_cert_refs FOR DELETE
  USING (has_elevated_role(auth.uid()));

-- 2. Trigger to recycle on delete
CREATE OR REPLACE FUNCTION public.recycle_smart_form_cert_ref()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.certificate_reference IS NOT NULL AND OLD.certificate_reference <> '' THEN
    INSERT INTO public.recycled_smart_form_cert_refs (certificate_reference, form_type)
    VALUES (OLD.certificate_reference, OLD.form_type)
    ON CONFLICT (certificate_reference) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_recycle_smart_form_cert_ref ON public.smart_form_submissions;
CREATE TRIGGER trg_recycle_smart_form_cert_ref
BEFORE DELETE ON public.smart_form_submissions
FOR EACH ROW
EXECUTE FUNCTION public.recycle_smart_form_cert_ref();

-- 3. Update generator to consume recycled numbers first (per form type)
CREATE OR REPLACE FUNCTION public.get_next_smart_form_cert_ref(p_form_type text DEFAULT 'bs5839_inspection_servicing'::text)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
  recycled TEXT;
BEGIN
  -- Reuse lowest recycled reference for this form type
  SELECT certificate_reference INTO recycled
  FROM public.recycled_smart_form_cert_refs
  WHERE form_type = p_form_type
  ORDER BY certificate_reference ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF recycled IS NOT NULL THEN
    DELETE FROM public.recycled_smart_form_cert_refs WHERE certificate_reference = recycled;
    RETURN recycled;
  END IF;

  IF p_form_type = 'bs5839_inspection_servicing' THEN
    SELECT nextval('public.smart_form_cert_seq') INTO next_num;
    RETURN 'PPM-FA-' || LPAD(next_num::TEXT, 5, '0');
  END IF;

  SELECT nextval('public.smart_form_cert_seq') INTO next_num;
  RETURN 'CERT-' || to_char(now(), 'YYYY') || '-' || LPAD(next_num::TEXT, 5, '0');
END;
$$;
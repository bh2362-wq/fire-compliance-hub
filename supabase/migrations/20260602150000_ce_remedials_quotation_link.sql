-- Backlink ce_remedials → quotations so the "Generate quote from C&E
-- remedials" flow can mark which quote each remedial was rolled into.
-- Mirrors the existing site_defects.quotation_id pattern.
ALTER TABLE public.ce_remedials
  ADD COLUMN IF NOT EXISTS quotation_id uuid
  REFERENCES public.quotations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ce_remedials_quotation_id_idx
  ON public.ce_remedials(quotation_id);

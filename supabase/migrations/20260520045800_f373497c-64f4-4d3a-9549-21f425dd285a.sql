-- Part A: Section grouping + merge tracking on quotation_line_items
ALTER TABLE public.quotation_line_items
  ADD COLUMN IF NOT EXISTS is_section boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS merged_from jsonb,
  ADD COLUMN IF NOT EXISTS show_section_subtotals boolean;

-- show_section_subtotals is quote-level; store on quotations
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS show_section_subtotals boolean NOT NULL DEFAULT false;

-- Drop the per-row column we mistakenly added above (keep quote-level only)
ALTER TABLE public.quotation_line_items DROP COLUMN IF EXISTS show_section_subtotals;

-- Guard: section rows must not carry pricing; force zero on insert/update
CREATE OR REPLACE FUNCTION public.enforce_section_row_zero_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_section = true THEN
    NEW.quantity := 0;
    NEW.unit_price := 0;
    NEW.total_price := 0;
    NEW.cost_price := 0;
    NEW.labour_cost := 0;
    NEW.markup_percent := 0;
    NEW.labour_included := false;
    IF NEW.title IS NULL OR length(trim(NEW.title)) = 0 THEN
      NEW.title := COALESCE(NULLIF(trim(NEW.description), ''), 'Section');
    END IF;
    -- mirror title into description so legacy readers still see something sensible
    NEW.description := NEW.title;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qli_section_zero_pricing ON public.quotation_line_items;
CREATE TRIGGER trg_qli_section_zero_pricing
  BEFORE INSERT OR UPDATE ON public.quotation_line_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_section_row_zero_pricing();

CREATE INDEX IF NOT EXISTS idx_quotation_line_items_is_section
  ON public.quotation_line_items (quotation_id, is_section, sort_order);
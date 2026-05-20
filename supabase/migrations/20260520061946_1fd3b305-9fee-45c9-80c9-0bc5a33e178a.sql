-- Quote scope/cost separation — phase 1 (schema)
-- Builds on 20260520045800 which added is_section/title/merged_from to
-- quotation_line_items and show_section_subtotals to quotations.
--
-- This migration adds:
--   1. quotations.scope_content (markdown narrative, separate from existing
--      JSON `scope` column which the legacy DOCX renderer still consumes)
--   2. v_quotation_priceable_items view — single source of truth for
--      totalling queries; filters out section rows
--   3. A column comment on merged_from documenting the snapshot shape
--      the application enforces (DB stores arbitrary JSON, but app code
--      writes only this shape)

-- 1. Scope narrative column ---------------------------------------------------
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS scope_content text;

COMMENT ON COLUMN public.quotations.scope_content IS
  'Markdown-formatted scope of works narrative. Authored by the AI scope-generation call and editable by the user before the quote is finalised. Separate from the legacy `scope` JSON column (string[]) which the older DOCX renderer consumes.';

-- 2. Priceable items view -----------------------------------------------------
-- All quote totalling queries should read from this view, not from the base
-- table, so section rows can never be accidentally summed into a total.
-- security_invoker=true makes the view run with the caller's permissions so
-- the base table's RLS policies still apply (default would be the view
-- owner's permissions, which would bypass RLS).
CREATE OR REPLACE VIEW public.v_quotation_priceable_items
  WITH (security_invoker = true) AS
SELECT
  id,
  quotation_id,
  parent_id,
  description,
  item_name,
  regulation_reference,
  priority,
  source_type,
  source_section,
  quantity,
  unit_price,
  cost_price,
  labour_cost,
  markup_percent,
  labour_included,
  total_price,
  notes,
  merged_from,
  sort_order,
  created_at,
  updated_at
FROM public.quotation_line_items
WHERE is_section = false;

COMMENT ON VIEW public.v_quotation_priceable_items IS
  'Priceable rows only — excludes section header rows (is_section = true). Use this view for any sum/total/aggregate query so section rows can never contaminate totals.';

-- The view inherits RLS via the underlying table (Postgres views run with
-- the querying user''s permissions by default and the base table has RLS
-- enabled with elevated-user policies).

-- 3. Document the merged_from snapshot shape ---------------------------------
COMMENT ON COLUMN public.quotation_line_items.merged_from IS
  'Pre-merge snapshots of rows combined into this row. Application writes a JSON array of objects with shape: {id, description, quantity, unit_price, sort_order, cost_price, labour_cost}. NULL when the row has never participated in a merge.';

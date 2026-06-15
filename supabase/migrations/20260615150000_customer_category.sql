-- Customer category — distinguishes BHO Fire's direct customers (where the
-- customer IS the end client of the work) from main contractors we sub-
-- contract for (Mitie, Bouygues, etc. — they own the contract but the
-- work happens on someone else's site). Asked for in chat:
--
--   "we need a way to organise the customer sites we manage under bho
--    fire, and then the site which we are contractors for other companies"
--
-- Set on the customer row (not the site) since the relationship is per-
-- customer in practice — Mitie's 20 schools are all sub-contract, our
-- direct customers' single-or-several sites are all direct. Lets the
-- Sites and Customers list pages filter / group cleanly. NULL means
-- "not categorised yet" — engineer can backfill from the customer form.
--
-- Values:
--   direct          — BHO Fire works directly for this customer
--   main_contractor — BHO Fire sub-contracts for this customer; the actual
--                     end-site belongs to a third party (school, hospital, etc.)

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS category text;

-- Constrain to the two known values when set (NULL still allowed for the
-- "not yet categorised" state).
ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_category_check;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_category_check
    CHECK (category IS NULL OR category IN ('direct', 'main_contractor'));

-- Lightweight index so the Sites / Customers list-page filters don't
-- table-scan when growing the customer book. category is low-cardinality
-- (2 values + null) but the filter is one of the most common queries.
CREATE INDEX IF NOT EXISTS idx_customers_category
  ON public.customers (category)
  WHERE category IS NOT NULL;

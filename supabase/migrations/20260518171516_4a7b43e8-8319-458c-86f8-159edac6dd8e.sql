-- 1 & 4: Extend market_benchmarks
ALTER TABLE cost_intelligence.market_benchmarks
  ADD COLUMN IF NOT EXISTS source_unique_id   text,
  ADD COLUMN IF NOT EXISTS buyer_organisation text,
  ADD COLUMN IF NOT EXISTS awarded_supplier   text,
  ADD COLUMN IF NOT EXISTS cpv_codes          text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS postcode           text,
  ADD COLUMN IF NOT EXISTS title              text,
  ADD COLUMN IF NOT EXISTS description        text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_market_benchmarks_source
  ON cost_intelligence.market_benchmarks (source, source_unique_id)
  WHERE source_unique_id IS NOT NULL;

-- 2: ingest_runs
CREATE TABLE IF NOT EXISTS cost_intelligence.ingest_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text NOT NULL,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  status            text CHECK (status IN ('running','success','partial','failed')),
  records_fetched   integer DEFAULT 0,
  records_upserted  integer DEFAULT 0,
  records_skipped   integer DEFAULT 0,
  window_from       date,
  window_to         date,
  error_message     text,
  run_metadata      jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_source_started
  ON cost_intelligence.ingest_runs (source, started_at DESC);

-- 3: RLS
ALTER TABLE cost_intelligence.ingest_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view ingest runs" ON cost_intelligence.ingest_runs;
CREATE POLICY "Authenticated can view ingest runs"
  ON cost_intelligence.ingest_runs
  FOR SELECT
  TO authenticated
  USING (true);

-- 5: postcode_to_region
CREATE OR REPLACE FUNCTION cost_intelligence.postcode_to_region(p_postcode text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_postcode IS NULL THEN NULL
    WHEN UPPER(TRIM(p_postcode)) ~ '^(EC|WC|W1|SW1|N1|SE1|NW1|E1|E14)' THEN 'london_central'
    WHEN UPPER(TRIM(p_postcode)) ~ '^(BR|CR|DA|EN|HA|IG|KT|RM|SM|TW|UB|WD)' THEN 'london_outer'
    WHEN UPPER(TRIM(p_postcode)) ~ '^(BN|CT|GU|ME|OX|PO|RG|RH|SL|SO|TN)'  THEN 'south_east'
    WHEN UPPER(TRIM(p_postcode)) ~ '^(BA|BH|BS|DT|EX|GL|PL|SN|SP|TA|TQ|TR)' THEN 'south_west'
    WHEN UPPER(TRIM(p_postcode)) ~ '^(AL|CB|CM|CO|HP|IP|LU|MK|NR|PE|SG|SS)' THEN 'east_england'
    WHEN UPPER(TRIM(p_postcode)) ~ '^(B|CV|DE|DY|HR|LE|LN|NG|NN|ST|TF|WR|WS|WV)' THEN 'midlands'
    WHEN UPPER(TRIM(p_postcode)) ~ '^(BB|BD|BL|CA|CH|CW|DH|DL|DN|FY|HD|HG|HU|HX|L|LA|LS|M|NE|OL|PR|S|SK|SR|TS|WA|WF|WN|YO)' THEN 'north'
    WHEN UPPER(TRIM(p_postcode)) ~ '^(CF|LD|LL|NP|SA|SY)' THEN 'wales'
    WHEN UPPER(TRIM(p_postcode)) ~ '^(AB|DD|DG|EH|FK|G|HS|IV|KA|KW|KY|ML|PA|PH|TD|ZE)' THEN 'scotland'
    WHEN UPPER(TRIM(p_postcode)) ~ '^BT' THEN 'northern_ireland'
    ELSE NULL
  END;
$$;

-- 6: get_market_context
CREATE OR REPLACE FUNCTION cost_intelligence.get_market_context(
  p_system_type      text,
  p_building_type    text,
  p_region           text DEFAULT NULL,
  p_lookback_months  integer DEFAULT 24
)
RETURNS TABLE (
  sample_size       integer,
  median_value      numeric,
  p25_value         numeric,
  p75_value         numeric,
  recent_count_12mo integer,
  top_buyers        jsonb
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = cost_intelligence, public
AS $$
#variable_conflict use_column
DECLARE
  v_cutoff date := (now() - (p_lookback_months || ' months')::interval)::date;
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT mb.*
    FROM cost_intelligence.market_benchmarks mb
    WHERE mb.source = 'contracts_finder'
      AND mb.metric_type = 'total_contract_value'
      AND mb.system_type = p_system_type
      AND mb.building_type = p_building_type
      AND (p_region IS NULL OR mb.region = p_region)
      AND mb.effective_from >= v_cutoff
  ),
  stats AS (
    SELECT
      COUNT(*)::integer                                                                  AS sample_size,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY metric_value)::numeric                AS median_value,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY metric_value)::numeric                AS p25_value,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY metric_value)::numeric                AS p75_value,
      COUNT(*) FILTER (WHERE effective_from >= (now() - interval '12 months')::date)::integer AS recent_count_12mo
    FROM filtered
  ),
  buyers AS (
    SELECT
      buyer_organisation       AS name,
      COUNT(*)::integer        AS cnt,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY metric_value)::numeric AS median_value
    FROM filtered
    WHERE buyer_organisation IS NOT NULL
    GROUP BY buyer_organisation
    ORDER BY cnt DESC
    LIMIT 5
  ),
  top AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('name', name, 'count', cnt, 'median_value', median_value)),
      '[]'::jsonb
    ) AS top_buyers
    FROM buyers
  )
  SELECT
    s.sample_size,
    s.median_value,
    s.p25_value,
    s.p75_value,
    s.recent_count_12mo,
    t.top_buyers
  FROM stats s, top t;
END;
$$;

-- 7: grant
GRANT EXECUTE ON FUNCTION cost_intelligence.get_market_context(text, text, text, integer) TO authenticated;
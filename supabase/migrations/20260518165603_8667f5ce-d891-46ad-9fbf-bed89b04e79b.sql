
-- 1. Schema
CREATE SCHEMA IF NOT EXISTS cost_intelligence;

-- 5a. Trigger function for updated_at
CREATE OR REPLACE FUNCTION cost_intelligence.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, cost_intelligence
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 2. job_classifications
CREATE TABLE cost_intelligence.job_classifications (
  job_id uuid PRIMARY KEY REFERENCES public.visits(id) ON DELETE CASCADE,
  system_type text NOT NULL CHECK (system_type IN ('gent_vigilon','gent_squad','gent_compact','conventional','aspirating','addressable_other','hybrid','voice_alarm','wireless')),
  job_category text NOT NULL CHECK (job_category IN ('new_install','system_upgrade','system_takeover','extension','reactive_remedial','planned_maintenance','design_only','commissioning_only','cause_and_effect','certification')),
  building_type text NOT NULL CHECK (building_type IN ('hotel','serviced_apartments','school_primary','school_secondary','further_education','higher_education','healthcare_acute','healthcare_care_home','office_commercial','retail','industrial_warehouse','residential_hmo','residential_block','gov_central','gov_local_authority','mod_defence','fcdo_diplomatic','data_centre','leisure_hospitality','transport','other')),
  loop_count integer DEFAULT 0,
  device_count_total integer DEFAULT 0,
  device_count_detectors integer DEFAULT 0,
  device_count_sounders integer DEFAULT 0,
  device_count_mcps integer DEFAULT 0,
  device_count_asd integer DEFAULT 0,
  device_count_interfaces integer DEFAULT 0,
  device_count_beam integer DEFAULT 0,
  device_count_other integer DEFAULT 0,
  panel_count integer DEFAULT 1,
  repeater_count integer DEFAULT 0,
  gia_sqm numeric(10,2),
  floor_count integer,
  region text CHECK (region IN ('london_central','london_outer','south_east','south_west','east_england','midlands','north','wales','scotland','northern_ireland','overseas')),
  materials_cost numeric(12,2),
  labour_hours numeric(10,2),
  labour_cost numeric(12,2),
  subcontract_cost numeric(12,2),
  plant_access_cost numeric(12,2),
  out_of_hours_premium numeric(12,2) DEFAULT 0,
  quoted_total numeric(12,2),
  invoiced_total numeric(12,2),
  variation_total numeric(12,2) DEFAULT 0,
  achieved_margin_pct numeric(5,2),
  bid_outcome text CHECK (bid_outcome IN ('won','lost','pending','withdrawn','no_bid','awarded_no_pricing')),
  competitor_count integer,
  winning_competitor_price numeric(12,2),
  lost_reason text,
  bs5839_category text CHECK (bs5839_category IN ('L1','L2','L3','L4','L5','M','P1','P2','combined')),
  requires_security_clearance boolean DEFAULT false,
  requires_certification boolean DEFAULT false,
  scope_summary text,
  classified_at timestamptz DEFAULT now(),
  classified_by uuid REFERENCES auth.users(id),
  classification_confidence text CHECK (classification_confidence IN ('high','medium','low')) DEFAULT 'high',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3a. market_benchmarks
CREATE TABLE cost_intelligence.market_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('spons','bcis','rics','industry_report','manufacturer_list','internal_estimate','tender_intel','published_framework','other')),
  source_reference text,
  source_url text,
  system_type text CHECK (system_type IN ('gent_vigilon','gent_squad','gent_compact','conventional','aspirating','addressable_other','hybrid','voice_alarm','wireless')),
  job_category text CHECK (job_category IN ('new_install','system_upgrade','system_takeover','extension','reactive_remedial','planned_maintenance','design_only','commissioning_only','cause_and_effect','certification')),
  building_type text CHECK (building_type IN ('hotel','serviced_apartments','school_primary','school_secondary','further_education','higher_education','healthcare_acute','healthcare_care_home','office_commercial','retail','industrial_warehouse','residential_hmo','residential_block','gov_central','gov_local_authority','mod_defence','fcdo_diplomatic','data_centre','leisure_hospitality','transport','other')),
  region text CHECK (region IN ('london_central','london_outer','south_east','south_west','east_england','midlands','north','wales','scotland','northern_ireland','overseas')),
  metric_type text NOT NULL CHECK (metric_type IN ('cost_per_device','cost_per_loop','cost_per_sqm','labour_hour_rate','material_list_price','total_contract_value','maintenance_per_device_per_year')),
  metric_value numeric(14,4) NOT NULL,
  currency text DEFAULT 'GBP',
  effective_from date,
  effective_to date,
  sample_size integer,
  confidence_pct numeric(5,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3b. pricing_recommendations
CREATE TABLE cost_intelligence.pricing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid,
  job_id uuid REFERENCES public.visits(id) ON DELETE CASCADE,
  scope_input jsonb,
  comparable_job_ids uuid[],
  market_benchmark_ids uuid[],
  recommended_low numeric(12,2),
  recommended_target numeric(12,2),
  recommended_high numeric(12,2),
  recommended_margin_pct numeric(5,2),
  confidence_score numeric(5,2),
  win_probability_pct numeric(5,2),
  risk_flags jsonb DEFAULT '[]'::jsonb,
  narrative text,
  model_version text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id)
);

-- 3c. quote_outcomes
CREATE TABLE cost_intelligence.quote_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid REFERENCES cost_intelligence.pricing_recommendations(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.visits(id) ON DELETE CASCADE,
  final_quoted_price numeric(12,2),
  outcome text CHECK (outcome IN ('won','lost','withdrawn','pending','no_response')),
  lost_to_competitor text,
  competitor_price numeric(12,2),
  lost_reason text,
  final_invoiced numeric(12,2),
  final_margin_pct numeric(5,2),
  estimating_variance_pct numeric(5,2),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id)
);

-- 4. Indexes
CREATE INDEX idx_jc_system_building ON cost_intelligence.job_classifications (system_type, building_type);
CREATE INDEX idx_jc_job_category ON cost_intelligence.job_classifications (job_category);
CREATE INDEX idx_jc_device_total ON cost_intelligence.job_classifications (device_count_total);
CREATE INDEX idx_jc_loop_count ON cost_intelligence.job_classifications (loop_count);
CREATE INDEX idx_jc_region ON cost_intelligence.job_classifications (region);
CREATE INDEX idx_jc_bid_outcome ON cost_intelligence.job_classifications (bid_outcome);
CREATE INDEX idx_jc_created_at_desc ON cost_intelligence.job_classifications (created_at DESC);

CREATE INDEX idx_mb_lookup ON cost_intelligence.market_benchmarks (system_type, building_type, metric_type, effective_from DESC);

CREATE INDEX idx_pr_job_id ON cost_intelligence.pricing_recommendations (job_id);
CREATE INDEX idx_pr_quote_id ON cost_intelligence.pricing_recommendations (quote_id);
CREATE INDEX idx_qo_job_id ON cost_intelligence.quote_outcomes (job_id);
CREATE INDEX idx_qo_recommendation_id ON cost_intelligence.quote_outcomes (recommendation_id);

-- 5b. Attach triggers
CREATE TRIGGER trg_jc_updated_at BEFORE UPDATE ON cost_intelligence.job_classifications
  FOR EACH ROW EXECUTE FUNCTION cost_intelligence.tg_set_updated_at();
CREATE TRIGGER trg_mb_updated_at BEFORE UPDATE ON cost_intelligence.market_benchmarks
  FOR EACH ROW EXECUTE FUNCTION cost_intelligence.tg_set_updated_at();

-- 6. RLS
ALTER TABLE cost_intelligence.job_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_intelligence.market_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_intelligence.pricing_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_intelligence.quote_outcomes ENABLE ROW LEVEL SECURITY;

-- market_benchmarks: any authenticated user can read
CREATE POLICY mb_select_auth ON cost_intelligence.market_benchmarks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY mb_write_auth ON cost_intelligence.market_benchmarks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- job_classifications: gated via parent visit
CREATE POLICY jc_select ON cost_intelligence.job_classifications
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id));
CREATE POLICY jc_insert ON cost_intelligence.job_classifications
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id));
CREATE POLICY jc_update ON cost_intelligence.job_classifications
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id));
CREATE POLICY jc_delete ON cost_intelligence.job_classifications
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id));

-- pricing_recommendations: gated via parent visit
CREATE POLICY pr_select ON cost_intelligence.pricing_recommendations
  FOR SELECT TO authenticated
  USING (job_id IS NULL OR EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id));
CREATE POLICY pr_insert ON cost_intelligence.pricing_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (job_id IS NULL OR EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id));
CREATE POLICY pr_update ON cost_intelligence.pricing_recommendations
  FOR UPDATE TO authenticated
  USING (job_id IS NULL OR EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id))
  WITH CHECK (job_id IS NULL OR EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id));
CREATE POLICY pr_delete ON cost_intelligence.pricing_recommendations
  FOR DELETE TO authenticated
  USING (job_id IS NULL OR EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id));

-- quote_outcomes: gated via parent visit
CREATE POLICY qo_select ON cost_intelligence.quote_outcomes
  FOR SELECT TO authenticated
  USING (job_id IS NULL OR EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id));
CREATE POLICY qo_insert ON cost_intelligence.quote_outcomes
  FOR INSERT TO authenticated
  WITH CHECK (job_id IS NULL OR EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id));
CREATE POLICY qo_update ON cost_intelligence.quote_outcomes
  FOR UPDATE TO authenticated
  USING (job_id IS NULL OR EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id))
  WITH CHECK (job_id IS NULL OR EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id));
CREATE POLICY qo_delete ON cost_intelligence.quote_outcomes
  FOR DELETE TO authenticated
  USING (job_id IS NULL OR EXISTS (SELECT 1 FROM public.visits j WHERE j.id = job_id));

-- 7. Grants
GRANT USAGE ON SCHEMA cost_intelligence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cost_intelligence TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA cost_intelligence
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA cost_intelligence
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- 8. find_comparable_jobs RPC
CREATE OR REPLACE FUNCTION cost_intelligence.find_comparable_jobs(
  p_system_type text,
  p_building_type text,
  p_job_category text DEFAULT NULL,
  p_device_count integer DEFAULT NULL,
  p_loop_count integer DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_bs5839_category text DEFAULT NULL,
  p_lookback_years integer DEFAULT 3,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  job_id uuid,
  job_reference text,
  client_name text,
  classified_at timestamptz,
  system_type text,
  job_category text,
  building_type text,
  region text,
  loop_count integer,
  device_count_total integer,
  gia_sqm numeric,
  quoted_total numeric,
  invoiced_total numeric,
  achieved_margin_pct numeric,
  bid_outcome text,
  cost_per_device numeric,
  cost_per_loop numeric,
  cost_per_sqm numeric,
  similarity_score numeric,
  scope_summary text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, cost_intelligence
AS $$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      jc.job_id,
      COALESCE(v.job_number, v.id::text) AS job_reference,
      COALESCE(c.name, s.name, '') AS client_name,
      jc.classified_at,
      jc.system_type,
      jc.job_category,
      jc.building_type,
      jc.region,
      jc.loop_count,
      jc.device_count_total,
      jc.gia_sqm,
      jc.quoted_total,
      jc.invoiced_total,
      jc.achieved_margin_pct,
      jc.bid_outcome,
      CASE WHEN jc.device_count_total > 0 THEN ROUND(jc.quoted_total / jc.device_count_total, 2) END AS cost_per_device,
      CASE WHEN jc.loop_count > 0 THEN ROUND(jc.quoted_total / jc.loop_count, 2) END AS cost_per_loop,
      CASE WHEN jc.gia_sqm > 0 THEN ROUND(jc.quoted_total / jc.gia_sqm, 2) END AS cost_per_sqm,
      jc.scope_summary,
      (
        -- System type
        CASE
          WHEN jc.system_type = p_system_type THEN 40
          WHEN jc.system_type LIKE 'gent_%' AND p_system_type LIKE 'gent_%' THEN 28
          WHEN (jc.system_type IN ('addressable_other','hybrid') AND p_system_type IN ('addressable_other','hybrid','gent_vigilon','gent_squad','gent_compact'))
            OR (p_system_type IN ('addressable_other','hybrid') AND jc.system_type IN ('gent_vigilon','gent_squad','gent_compact')) THEN 18
          ELSE 0
        END
        -- Building type
        + CASE
            WHEN jc.building_type = p_building_type THEN 20
            WHEN jc.building_type IN ('school_primary','school_secondary','further_education','higher_education')
              AND p_building_type IN ('school_primary','school_secondary','further_education','higher_education') THEN 13
            WHEN jc.building_type IN ('hotel','serviced_apartments','leisure_hospitality')
              AND p_building_type IN ('hotel','serviced_apartments','leisure_hospitality') THEN 15
            WHEN jc.building_type IN ('gov_central','gov_local_authority','mod_defence','fcdo_diplomatic')
              AND p_building_type IN ('gov_central','gov_local_authority','mod_defence','fcdo_diplomatic') THEN 14
            WHEN jc.building_type IN ('healthcare_acute','healthcare_care_home')
              AND p_building_type IN ('healthcare_acute','healthcare_care_home') THEN 12
            ELSE 0
          END
        -- Job category
        + CASE
            WHEN p_job_category IS NULL THEN 8
            WHEN jc.job_category = p_job_category THEN 15
            WHEN jc.job_category IN ('new_install','system_upgrade','extension')
              AND p_job_category IN ('new_install','system_upgrade','extension') THEN 8
            ELSE 0
          END
        -- Device count
        + CASE
            WHEN p_device_count IS NULL THEN 5
            WHEN jc.device_count_total IS NULL OR jc.device_count_total = 0 THEN 0
            ELSE GREATEST(0, 15 - (ABS(jc.device_count_total - p_device_count)::numeric / GREATEST(p_device_count,1) * 10))
          END
        -- Loop count
        + CASE
            WHEN p_loop_count IS NULL OR jc.loop_count IS NULL THEN 0
            WHEN jc.loop_count = p_loop_count THEN 5
            WHEN ABS(jc.loop_count - p_loop_count) <= 1 THEN 3
            ELSE 0
          END
        -- Region
        + CASE
            WHEN p_region IS NULL OR jc.region IS NULL THEN 0
            WHEN jc.region = p_region THEN 3
            WHEN jc.region LIKE 'london_%' AND p_region LIKE 'london_%' THEN 2
            ELSE 0
          END
        -- BS 5839
        + CASE
            WHEN p_bs5839_category IS NOT NULL AND jc.bs5839_category = p_bs5839_category THEN 2
            ELSE 0
          END
        -- Recency boost
        + CASE
            WHEN jc.classified_at >= now() - interval '12 months' THEN 5
            WHEN jc.classified_at >= now() - interval '24 months' THEN 2
            ELSE 0
          END
      )::numeric AS similarity_score
    FROM cost_intelligence.job_classifications jc
    JOIN public.visits v ON v.id = jc.job_id
    LEFT JOIN public.sites s ON s.id = v.site_id
    LEFT JOIN public.customers c ON c.id = s.customer_id
    WHERE jc.classified_at >= now() - (p_lookback_years || ' years')::interval
      AND jc.quoted_total > 0
      AND (jc.achieved_margin_pct IS NULL OR jc.achieved_margin_pct >= -50)
  )
  SELECT * FROM scored
  WHERE similarity_score >= 20
  ORDER BY similarity_score DESC, classified_at DESC
  LIMIT p_limit;
END;
$$;

-- 9. comparable_jobs_stats RPC
CREATE OR REPLACE FUNCTION cost_intelligence.comparable_jobs_stats(
  p_system_type text,
  p_building_type text,
  p_job_category text DEFAULT NULL,
  p_device_count integer DEFAULT NULL,
  p_loop_count integer DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_bs5839_category text DEFAULT NULL,
  p_lookback_years integer DEFAULT 3,
  p_pool_size integer DEFAULT 20
)
RETURNS TABLE (
  sample_size integer,
  median_cost_per_device numeric,
  p25_cost_per_device numeric,
  p75_cost_per_device numeric,
  median_cost_per_loop numeric,
  median_cost_per_sqm numeric,
  median_margin_pct numeric,
  median_quoted_total numeric,
  p25_quoted_total numeric,
  p75_quoted_total numeric,
  recommended_low numeric,
  recommended_target numeric,
  recommended_high numeric,
  win_rate_pct numeric,
  jobs_won integer,
  jobs_lost integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, cost_intelligence
AS $$
DECLARE
  v_p25_cpd numeric;
  v_med_cpd numeric;
  v_p75_cpd numeric;
  v_p25_qt numeric;
  v_med_qt numeric;
  v_p75_qt numeric;
BEGIN
  RETURN QUERY
  WITH pool AS (
    SELECT * FROM cost_intelligence.find_comparable_jobs(
      p_system_type, p_building_type, p_job_category,
      p_device_count, p_loop_count, p_region, p_bs5839_category,
      p_lookback_years, p_pool_size
    )
  ),
  aggs AS (
    SELECT
      COUNT(*)::integer AS sample_size,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY cost_per_device) AS med_cpd,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY cost_per_device) AS p25_cpd,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY cost_per_device) AS p75_cpd,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY cost_per_loop) AS med_cpl,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY cost_per_sqm) AS med_cps,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY achieved_margin_pct) AS med_margin,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY quoted_total) AS med_qt,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY quoted_total) AS p25_qt,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY quoted_total) AS p75_qt,
      COUNT(*) FILTER (WHERE bid_outcome = 'won')::integer AS won,
      COUNT(*) FILTER (WHERE bid_outcome = 'lost')::integer AS lost
    FROM pool
  )
  SELECT
    a.sample_size,
    ROUND(a.med_cpd::numeric, 2),
    ROUND(a.p25_cpd::numeric, 2),
    ROUND(a.p75_cpd::numeric, 2),
    ROUND(a.med_cpl::numeric, 2),
    ROUND(a.med_cps::numeric, 2),
    ROUND(a.med_margin::numeric, 2),
    ROUND(a.med_qt::numeric, 2),
    ROUND(a.p25_qt::numeric, 2),
    ROUND(a.p75_qt::numeric, 2),
    CASE
      WHEN p_device_count IS NOT NULL AND a.p25_cpd IS NOT NULL
        THEN ROUND((a.p25_cpd * p_device_count)::numeric, 2)
      ELSE ROUND(a.p25_qt::numeric, 2)
    END AS recommended_low,
    CASE
      WHEN p_device_count IS NOT NULL AND a.med_cpd IS NOT NULL
        THEN ROUND((a.med_cpd * p_device_count)::numeric, 2)
      ELSE ROUND(a.med_qt::numeric, 2)
    END AS recommended_target,
    CASE
      WHEN p_device_count IS NOT NULL AND a.p75_cpd IS NOT NULL
        THEN ROUND((a.p75_cpd * p_device_count)::numeric, 2)
      ELSE ROUND(a.p75_qt::numeric, 2)
    END AS recommended_high,
    CASE
      WHEN (a.won + a.lost) > 0 THEN ROUND(a.won::numeric / (a.won + a.lost)::numeric * 100, 2)
      ELSE NULL
    END AS win_rate_pct,
    a.won,
    a.lost
  FROM aggs a;
END;
$$;

-- 10. Grant EXECUTE
GRANT EXECUTE ON FUNCTION cost_intelligence.find_comparable_jobs(text,text,text,integer,integer,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION cost_intelligence.comparable_jobs_stats(text,text,text,integer,integer,text,text,integer,integer) TO authenticated;

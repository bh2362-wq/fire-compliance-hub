
CREATE SCHEMA IF NOT EXISTS cost_intelligence_v2;

-- Enums
DO $$ BEGIN
  CREATE TYPE cost_intelligence_v2.job_category AS ENUM (
    'install','service','remedial','design','commissioning','takeover','emergency','project','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cost_intelligence_v2.system_type AS ENUM (
    'fire_alarm','emergency_lighting','sprinkler','suppression','aov','disabled_refuge','nurse_call','door_entry','cctv','intruder','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cost_intelligence_v2.panel_make AS ENUM (
    'gent','advanced','kentec','c_tec','morley','notifier','hochiki','apollo','fike','menvier','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cost_intelligence_v2.building_type AS ENUM (
    'office','retail','industrial','warehouse','residential','hmo','care_home','school','hospital','hotel','public','mixed_use','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cost_intelligence_v2.complexity AS ENUM ('low','medium','high','very_high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cost_intelligence_v2.bid_outcome AS ENUM ('won','lost','pending','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- job_classifications
CREATE TABLE cost_intelligence_v2.job_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  job_category cost_intelligence_v2.job_category NOT NULL,
  system_type cost_intelligence_v2.system_type NOT NULL,
  panel_make cost_intelligence_v2.panel_make,
  building_type cost_intelligence_v2.building_type,
  region TEXT,
  postcode_area TEXT,
  device_count_band TEXT,
  device_count INT,
  complexity cost_intelligence_v2.complexity DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quotation_id)
);

CREATE INDEX idx_civ2_class_quot ON cost_intelligence_v2.job_classifications(quotation_id);
CREATE INDEX idx_civ2_class_scope ON cost_intelligence_v2.job_classifications(job_category, system_type, building_type);

-- job_costs
CREATE TABLE cost_intelligence_v2.job_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  materials_cost NUMERIC(12,2) DEFAULT 0,
  labour_cost NUMERIC(12,2) DEFAULT 0,
  subcontractor_cost NUMERIC(12,2) DEFAULT 0,
  travel_cost NUMERIC(12,2) DEFAULT 0,
  other_cost NUMERIC(12,2) DEFAULT 0,
  total_cost NUMERIC(12,2) GENERATED ALWAYS AS (
    COALESCE(materials_cost,0)+COALESCE(labour_cost,0)+COALESCE(subcontractor_cost,0)+COALESCE(travel_cost,0)+COALESCE(other_cost,0)
  ) STORED,
  labour_hours NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quotation_id)
);
CREATE INDEX idx_civ2_costs_quot ON cost_intelligence_v2.job_costs(quotation_id);

-- bid_outcomes
CREATE TABLE cost_intelligence_v2.bid_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  quoted_price NUMERIC(12,2) NOT NULL,
  outcome cost_intelligence_v2.bid_outcome NOT NULL DEFAULT 'pending',
  margin_percent NUMERIC(6,2),
  competitor_prices NUMERIC(12,2)[],
  notes TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quotation_id)
);
CREATE INDEX idx_civ2_bid_quot ON cost_intelligence_v2.bid_outcomes(quotation_id);
CREATE INDEX idx_civ2_bid_outcome ON cost_intelligence_v2.bid_outcomes(outcome);

-- updated_at triggers
CREATE TRIGGER trg_civ2_class_upd BEFORE UPDATE ON cost_intelligence_v2.job_classifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_civ2_costs_upd BEFORE UPDATE ON cost_intelligence_v2.job_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_civ2_bid_upd BEFORE UPDATE ON cost_intelligence_v2.bid_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE cost_intelligence_v2.job_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_intelligence_v2.job_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_intelligence_v2.bid_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY civ2_class_all ON cost_intelligence_v2.job_classifications
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id));

CREATE POLICY civ2_costs_all ON cost_intelligence_v2.job_costs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id));

CREATE POLICY civ2_bid_all ON cost_intelligence_v2.bid_outcomes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quotation_id));

-- Expose schema to PostgREST
GRANT USAGE ON SCHEMA cost_intelligence_v2 TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA cost_intelligence_v2 TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA cost_intelligence_v2 TO anon, authenticated, service_role;

-- RPCs (in public so PostgREST exposes them by default)
CREATE OR REPLACE FUNCTION public.civ2_find_comparable_jobs(
  p_job_category TEXT,
  p_system_type TEXT,
  p_panel_make TEXT DEFAULT NULL,
  p_building_type TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL,
  p_device_count INT DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  quotation_id UUID,
  quotation_number TEXT,
  job_category TEXT,
  system_type TEXT,
  panel_make TEXT,
  building_type TEXT,
  region TEXT,
  device_count INT,
  complexity TEXT,
  total_cost NUMERIC,
  quoted_price NUMERIC,
  margin_percent NUMERIC,
  outcome TEXT,
  decided_at TIMESTAMPTZ,
  similarity_score NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, cost_intelligence_v2
AS $$
  SELECT
    c.quotation_id,
    q.quotation_number,
    c.job_category::TEXT,
    c.system_type::TEXT,
    c.panel_make::TEXT,
    c.building_type::TEXT,
    c.region,
    c.device_count,
    c.complexity::TEXT,
    jc.total_cost,
    bo.quoted_price,
    bo.margin_percent,
    bo.outcome::TEXT,
    bo.decided_at,
    (
      (CASE WHEN c.job_category::TEXT = p_job_category THEN 30 ELSE 0 END) +
      (CASE WHEN c.system_type::TEXT = p_system_type THEN 25 ELSE 0 END) +
      (CASE WHEN p_panel_make IS NOT NULL AND c.panel_make::TEXT = p_panel_make THEN 15 ELSE 0 END) +
      (CASE WHEN p_building_type IS NOT NULL AND c.building_type::TEXT = p_building_type THEN 10 ELSE 0 END) +
      (CASE WHEN p_region IS NOT NULL AND c.region = p_region THEN 10 ELSE 0 END) +
      (CASE WHEN p_device_count IS NOT NULL AND c.device_count IS NOT NULL
            THEN GREATEST(0, 10 - LEAST(10, ABS(c.device_count - p_device_count)::NUMERIC / NULLIF(p_device_count,0) * 10))
            ELSE 0 END)
    )::NUMERIC AS similarity_score
  FROM cost_intelligence_v2.job_classifications c
  JOIN public.quotations q ON q.id = c.quotation_id
  LEFT JOIN cost_intelligence_v2.job_costs jc ON jc.quotation_id = c.quotation_id
  LEFT JOIN cost_intelligence_v2.bid_outcomes bo ON bo.quotation_id = c.quotation_id
  WHERE c.job_category::TEXT = p_job_category
    AND c.system_type::TEXT = p_system_type
  ORDER BY similarity_score DESC, bo.decided_at DESC NULLS LAST
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.civ2_benchmark_summary(
  p_job_category TEXT,
  p_system_type TEXT,
  p_panel_make TEXT DEFAULT NULL,
  p_building_type TEXT DEFAULT NULL,
  p_region TEXT DEFAULT NULL
)
RETURNS TABLE (
  sample_size INT,
  win_rate NUMERIC,
  avg_quoted_price NUMERIC,
  median_quoted_price NUMERIC,
  p25_quoted_price NUMERIC,
  p75_quoted_price NUMERIC,
  avg_total_cost NUMERIC,
  avg_margin_percent NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, cost_intelligence_v2
AS $$
  WITH s AS (
    SELECT bo.quoted_price, bo.outcome, bo.margin_percent, jc.total_cost
    FROM cost_intelligence_v2.job_classifications c
    LEFT JOIN cost_intelligence_v2.bid_outcomes bo ON bo.quotation_id = c.quotation_id
    LEFT JOIN cost_intelligence_v2.job_costs jc ON jc.quotation_id = c.quotation_id
    WHERE c.job_category::TEXT = p_job_category
      AND c.system_type::TEXT = p_system_type
      AND (p_panel_make IS NULL OR c.panel_make::TEXT = p_panel_make)
      AND (p_building_type IS NULL OR c.building_type::TEXT = p_building_type)
      AND (p_region IS NULL OR c.region = p_region)
  )
  SELECT
    COUNT(*)::INT,
    (COUNT(*) FILTER (WHERE outcome::TEXT = 'won'))::NUMERIC
      / NULLIF(COUNT(*) FILTER (WHERE outcome::TEXT IN ('won','lost')),0),
    AVG(quoted_price),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY quoted_price),
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY quoted_price),
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY quoted_price),
    AVG(total_cost),
    AVG(margin_percent)
  FROM s;
$$;

GRANT EXECUTE ON FUNCTION public.civ2_find_comparable_jobs(TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.civ2_benchmark_summary(TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

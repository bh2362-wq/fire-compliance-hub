
ALTER TABLE cost_intelligence.pricing_recommendations
  ADD COLUMN IF NOT EXISTS hallucination_detected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fabricated_references text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS outcome_misattributions text[] NOT NULL DEFAULT '{}';

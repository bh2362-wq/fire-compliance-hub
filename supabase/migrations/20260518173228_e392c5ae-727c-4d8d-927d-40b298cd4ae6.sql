
DROP INDEX IF EXISTS cost_intelligence.uq_market_benchmarks_source;
CREATE UNIQUE INDEX uq_market_benchmarks_source
  ON cost_intelligence.market_benchmarks(source, source_unique_id);


ALTER TABLE cost_intelligence.market_benchmarks DROP CONSTRAINT market_benchmarks_source_check;
ALTER TABLE cost_intelligence.market_benchmarks ADD CONSTRAINT market_benchmarks_source_check
  CHECK (source = ANY (ARRAY['spons','bcis','rics','industry_report','manufacturer_list','internal_estimate','tender_intel','published_framework','contracts_finder','other']));

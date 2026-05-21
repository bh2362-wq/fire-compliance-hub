// FireLogbook :: Cost Intelligence v2 :: hook
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  Civ2ScopeInput,
  Civ2Comparable,
  Civ2BenchmarkSummary,
  Civ2PriceRecommendation,
} from '@/types/cost-intelligence-v2';

function buildRecommendation(
  summary: Civ2BenchmarkSummary | null,
  comps: Civ2Comparable[],
): Civ2PriceRecommendation | null {
  if (!summary || !summary.sample_size) return null;

  const suggested =
    summary.median_quoted_price ?? summary.avg_quoted_price ?? null;
  const floor = summary.p25_quoted_price ?? null;
  const ceiling = summary.p75_quoted_price ?? null;

  const confidence: Civ2PriceRecommendation['confidence'] =
    summary.sample_size >= 10 ? 'high'
    : summary.sample_size >= 4 ? 'medium'
    : 'low';

  const winRatePct = summary.win_rate != null
    ? Math.round(summary.win_rate * 100)
    : null;

  const rationale = [
    `Based on ${summary.sample_size} comparable ${comps.length === 1 ? 'job' : 'jobs'}.`,
    winRatePct != null ? `Historic win rate ${winRatePct}%.` : null,
    summary.avg_margin_percent != null
      ? `Avg margin ${summary.avg_margin_percent.toFixed(1)}%.`
      : null,
  ].filter(Boolean).join(' ');

  return { suggested_price: suggested, floor, ceiling, confidence, rationale };
}

export function useCostIntelligenceV2(scope: Civ2ScopeInput | null) {
  const enabled = !!scope?.job_category && !!scope?.system_type;

  const query = useQuery({
    enabled,
    queryKey: ['civ2', scope],
    queryFn: async () => {
      if (!scope) throw new Error('scope required');

      const [{ data: comps, error: e1 }, { data: sum, error: e2 }] =
        await Promise.all([
          (supabase.rpc as any)('civ2_find_comparable_jobs', {
            p_job_category: scope.job_category,
            p_system_type: scope.system_type,
            p_panel_make: scope.panel_make ?? null,
            p_building_type: scope.building_type ?? null,
            p_region: scope.region ?? null,
            p_device_count: scope.device_count ?? null,
            p_limit: 20,
          }),
          (supabase.rpc as any)('civ2_benchmark_summary', {
            p_job_category: scope.job_category,
            p_system_type: scope.system_type,
            p_panel_make: scope.panel_make ?? null,
            p_building_type: scope.building_type ?? null,
            p_region: scope.region ?? null,
          }),
        ]);

      if (e1) throw e1;
      if (e2) throw e2;

      const comparables = (comps ?? []) as Civ2Comparable[];
      const summary = (Array.isArray(sum) ? sum[0] : sum) as Civ2BenchmarkSummary | null;

      return { comparables, summary };
    },
  });

  const recommendation = query.data
    ? buildRecommendation(query.data.summary, query.data.comparables)
    : null;

  return {
    comparables: query.data?.comparables ?? [],
    summary: query.data?.summary ?? null,
    recommendation,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: () => query.refetch(),
  };
}

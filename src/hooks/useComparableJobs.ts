import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  QuoteScope,
  ComparableJob,
  ComparableJobsStats,
} from '@/types/cost-intelligence';

interface UseComparableJobsOptions {
  debounceMs?: number;
  enabled?: boolean;
}

interface UseComparableJobsResult {
  jobs: ComparableJob[];
  stats: ComparableJobsStats | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useComparableJobs(
  scope: QuoteScope | null,
  options: UseComparableJobsOptions = {},
): UseComparableJobsResult {
  const { debounceMs = 300, enabled = true } = options;
  const [jobs, setJobs] = useState<ComparableJob[]>([]);
  const [stats, setStats] = useState<ComparableJobsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled || !scope || !scope.systemType || !scope.buildingType) {
      setJobs([]);
      setStats(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      const params = {
        p_system_type: scope.systemType,
        p_building_type: scope.buildingType,
        p_job_category: scope.jobCategory ?? null,
        p_device_count: scope.deviceCount ?? null,
        p_loop_count: scope.loopCount ?? null,
        p_region: scope.region ?? null,
        p_bs5839_category: scope.bs5839Category ?? null,
        p_lookback_years: scope.lookbackYears ?? 3,
      };

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ci = (supabase as any).schema('cost_intelligence');

        const [jobsRes, statsRes] = await Promise.all([
          ci.rpc('find_comparable_jobs', {
            ...params,
            p_limit: scope.limit ?? 10,
          }),
          ci.rpc('comparable_jobs_stats', {
            ...params,
            p_pool_size: 20,
          }),
        ]);

        if (cancelled) return;

        if (jobsRes.error) throw jobsRes.error;
        if (statsRes.error) throw statsRes.error;

        setJobs((jobsRes.data ?? []) as ComparableJob[]);
        const statsRows = (statsRes.data ?? []) as ComparableJobsStats[];
        setStats(statsRows[0] ?? null);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load comparables';
        setError(msg);
        setJobs([]);
        setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    enabled,
    debounceMs,
    tick,
    scope?.systemType,
    scope?.buildingType,
    scope?.jobCategory,
    scope?.deviceCount,
    scope?.loopCount,
    scope?.region,
    scope?.bs5839Category,
    scope?.giaSqm,
    scope?.lookbackYears,
    scope?.limit,
  ]);

  return { jobs, stats, loading, error, refresh };
}

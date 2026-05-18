import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { QuoteScope, MarketContext } from '@/types/cost-intelligence';

interface UseMarketContextResult {
  context: MarketContext | null;
  loading: boolean;
  error: string | null;
}

export function useMarketContext(
  scope: QuoteScope | null,
  options: { debounceMs?: number; lookbackMonths?: number; enabled?: boolean } = {},
): UseMarketContextResult {
  const { debounceMs = 300, lookbackMonths = 24, enabled = true } = options;
  const [context, setContext] = useState<MarketContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !scope || !scope.systemType || !scope.buildingType) {
      setContext(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ci = (supabase as any).schema('cost_intelligence');
        const { data, error: rpcErr } = await ci.rpc('get_market_context', {
          p_system_type: scope.systemType,
          p_building_type: scope.buildingType,
          p_region: scope.region ?? null,
          p_lookback_months: lookbackMonths,
        });
        if (cancelled) return;
        if (rpcErr) throw rpcErr;
        const row = Array.isArray(data) ? data[0] : data;
        setContext((row ?? null) as MarketContext | null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load market context');
        setContext(null);
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
    lookbackMonths,
    scope?.systemType,
    scope?.buildingType,
    scope?.region,
  ]);

  return { context, loading, error };
}

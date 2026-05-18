import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  PricingAssessmentResult,
  QuoteScope,
} from '@/types/cost-intelligence';

interface Options {
  currentQuoteTotal?: number;
  quoteId?: string;
  visitId?: string;
}

interface UsePricingNarrativeReturn {
  assessment: PricingAssessmentResult | null;
  loading: boolean;
  error: string | null;
  generate: () => Promise<void>;
  scopeChangedSinceLastGeneration: boolean;
  cooldownSecondsRemaining: number;
}

const COOLDOWN_SECONDS = 3;

function scopeKey(scope: QuoteScope | null): string {
  if (!scope) return '';
  return JSON.stringify({
    systemType: scope.systemType,
    buildingType: scope.buildingType,
    jobCategory: scope.jobCategory ?? null,
    deviceCount: scope.deviceCount ?? null,
    loopCount: scope.loopCount ?? null,
    region: scope.region ?? null,
    bs5839Category: scope.bs5839Category ?? null,
    giaSqm: scope.giaSqm ?? null,
  });
}

export function usePricingNarrative(
  scope: QuoteScope | null,
  options: Options = {},
): UsePricingNarrativeReturn {
  const { currentQuoteTotal, quoteId, visitId } = options;

  const [assessment, setAssessment] = useState<PricingAssessmentResult | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScopeKey, setLastScopeKey] = useState<string>('');
  const [cooldownSecondsRemaining, setCooldownSecondsRemaining] = useState(0);

  // Tick down cooldown
  useEffect(() => {
    if (cooldownSecondsRemaining <= 0) return;
    const t = setTimeout(
      () => setCooldownSecondsRemaining((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearTimeout(t);
  }, [cooldownSecondsRemaining]);

  const currentScopeKey = scopeKey(scope);
  const scopeChangedSinceLastGeneration =
    lastScopeKey !== '' && lastScopeKey !== currentScopeKey;

  const inFlight = useRef(false);

  const generate = useCallback(async () => {
    if (!scope || !scope.systemType || !scope.buildingType) return;
    if (cooldownSecondsRemaining > 0) return;
    if (inFlight.current) return;

    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'generate-pricing-narrative',
        {
          body: {
            scope,
            currentQuoteTotal,
            quoteId,
            visitId,
          },
        },
      );

      if (invokeError) throw new Error(invokeError.message);
      if (!data) throw new Error('Empty response from function');
      if (data.success === false) {
        throw new Error(data.error || data.detail || 'Unknown function error');
      }

      // Two shapes: full assessment, or insufficient_data short-circuit.
      if (data.reason === 'insufficient_data') {
        setAssessment({
          recommendation_id: null,
          narrative: null,
          reason: 'insufficient_data',
          flags: [],
          win_probability: null,
          suggested_margin: null,
          confidence: 0,
        });
      } else {
        setAssessment(data as PricingAssessmentResult);
      }
      setLastScopeKey(currentScopeKey);
      setCooldownSecondsRemaining(COOLDOWN_SECONDS);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [
    scope,
    currentScopeKey,
    cooldownSecondsRemaining,
    currentQuoteTotal,
    quoteId,
    visitId,
  ]);

  return {
    assessment,
    loading,
    error,
    generate,
    scopeChangedSinceLastGeneration,
    cooldownSecondsRemaining,
  };
}

// FireLogbook :: Cost Intelligence v2 :: panel
import { useCostIntelligenceV2 } from '@/hooks/useCostIntelligenceV2';
import type { Civ2ScopeInput, Civ2Outcome } from '@/types/cost-intelligence-v2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

function OutcomeBadge({ outcome }: { outcome: Civ2Outcome | null }) {
  if (!outcome) return <Badge variant="outline">—</Badge>;
  const variant =
    outcome === 'won' ? 'default'
    : outcome === 'lost' ? 'destructive'
    : 'secondary';
  return <Badge variant={variant as any}>{outcome}</Badge>;
}

export function CostIntelligencePanelV2({ scope }: { scope: Civ2ScopeInput | null }) {
  const { comparables, summary, recommendation, isLoading, isError, error } =
    useCostIntelligenceV2(scope);

  if (!scope) {
    return (
      <Card>
        <CardHeader><CardTitle>Cost Intelligence</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Select job category and system type to see benchmarks.
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader><CardTitle>Cost Intelligence</CardTitle></CardHeader>
        <CardContent className="text-sm text-destructive">
          Couldn&apos;t load: {error?.message ?? 'unknown error'}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Cost Intelligence</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!summary || !summary.sample_size) {
    return (
      <Card>
        <CardHeader><CardTitle>Cost Intelligence</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No comparable jobs yet for this scope.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Cost Intelligence</span>
          <Badge variant="outline">{summary.sample_size} comparables</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {recommendation && (
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Suggested price</div>
              <Badge variant="secondary">{recommendation.confidence}</Badge>
            </div>
            <div className="text-2xl font-semibold text-primary">
              {fmt(recommendation.suggested_price)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Range {fmt(recommendation.floor)} – {fmt(recommendation.ceiling)}
            </div>
            <div className="text-xs mt-2">{recommendation.rationale}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><div className="text-muted-foreground">Avg quoted</div><div className="font-medium">{fmt(summary.avg_quoted_price)}</div></div>
          <div><div className="text-muted-foreground">Median</div><div className="font-medium">{fmt(summary.median_quoted_price)}</div></div>
          <div><div className="text-muted-foreground">Avg cost</div><div className="font-medium">{fmt(summary.avg_total_cost)}</div></div>
          <div><div className="text-muted-foreground">Avg margin</div><div className="font-medium">{summary.avg_margin_percent != null ? `${summary.avg_margin_percent.toFixed(1)}%` : '—'}</div></div>
        </div>

        <div>
          <div className="text-xs font-medium mb-2">Recent comparables</div>
          <div className="space-y-1">
            {comparables.slice(0, 6).map((c) => (
              <div key={c.quotation_id} className="flex items-center justify-between text-xs border-b py-1">
                <div className="truncate">
                  <span className="font-medium">{c.quotation_number ?? c.quotation_id.slice(0, 8)}</span>
                  <span className="text-muted-foreground ml-2">{c.building_type ?? '—'} · {c.region ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{fmt(c.quoted_price)}</span>
                  <OutcomeBadge outcome={c.outcome} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

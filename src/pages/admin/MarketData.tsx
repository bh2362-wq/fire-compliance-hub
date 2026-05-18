import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { IngestRun } from '@/types/cost-intelligence';

interface Summary {
  totalBenchmarks: number;
  bySource: Array<{ source: string; count: number }>;
  lastIngestAt: string | null;
}

export default function MarketDataAdmin() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<IngestRun[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Admin role check
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAllowed(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      const roles = (data ?? []).map((r) => r.role);
      setAllowed(roles.some((r) => r === 'admin' || r === 'owner'));
    })();
  }, [user, authLoading]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ci = (supabase as any).schema('cost_intelligence');
      const [{ data: runRows }, { data: benchmarkRows, count: totalCount }] = await Promise.all([
        ci
          .from('ingest_runs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(20),
        ci
          .from('market_benchmarks')
          .select('source', { count: 'exact' }),
      ]);

      setRuns((runRows ?? []) as IngestRun[]);

      const sourceMap = new Map<string, number>();
      (benchmarkRows ?? []).forEach((r: { source: string }) => {
        sourceMap.set(r.source, (sourceMap.get(r.source) ?? 0) + 1);
      });
      const bySource = Array.from(sourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      setSummary({
        totalBenchmarks: totalCount ?? 0,
        bySource,
        lastIngestAt: (runRows?.[0] as IngestRun | undefined)?.started_at ?? null,
      });
    } catch (e) {
      toast({
        title: 'Failed to load market data',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (allowed) loadData();
  }, [allowed, loadData]);

  const triggerNow = async () => {
    setTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('contracts-finder-ingest', {
        body: {},
      });
      if (error) throw error;
      toast({
        title: 'Ingest triggered',
        description: data?.success
          ? `Fetched ${data.fetched}, upserted ${data.upserted}, skipped ${data.skipped}`
          : 'Run started',
      });
      await loadData();
    } catch (e) {
      toast({
        title: 'Ingest failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setTriggering(false);
    }
  };

  if (authLoading || allowed === null) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!allowed) return <Navigate to="/dashboard" replace />;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Market data</h1>
          <p className="text-sm text-muted-foreground">
            Monitor scheduled ingestion of external benchmarks.
          </p>
        </div>
        <Button onClick={triggerNow} disabled={triggering}>
          {triggering ? 'Running…' : 'Run now'}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Total benchmarks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {summary?.totalBenchmarks.toLocaleString() ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              By source
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {summary?.bySource.length
              ? summary.bySource.map((s) => (
                  <div key={s.source} className="flex justify-between">
                    <span className="truncate pr-2">{s.source}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {s.count.toLocaleString()}
                    </span>
                  </div>
                ))
              : <span className="text-muted-foreground">No data</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
              Most recent ingest
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {summary?.lastIngestAt
                ? `${formatDistanceToNow(new Date(summary.lastIngestAt))} ago`
                : 'Never'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent ingest runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Started</th>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Window</th>
                  <th className="px-3 py-2 text-right font-medium">Fetched</th>
                  <th className="px-3 py-2 text-right font-medium">Upserted</th>
                  <th className="px-3 py-2 text-right font-medium">Skipped</th>
                  <th className="px-3 py-2 text-left font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && runs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                      No runs yet.
                    </td>
                  </tr>
                )}
                {runs.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDistanceToNow(new Date(r.started_at))} ago
                    </td>
                    <td className="px-3 py-2">{r.source}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {r.window_from} → {r.window_to}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.records_fetched ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.records_upserted ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.records_skipped ?? 0}</td>
                    <td className="px-3 py-2 max-w-xs">
                      {r.error_message ? (
                        <button
                          type="button"
                          onClick={() => setExpanded((p) => ({ ...p, [r.id]: !p[r.id] }))}
                          className="text-left text-xs text-rose-600 hover:underline"
                        >
                          {expanded[r.id]
                            ? r.error_message
                            : r.error_message.slice(0, 60) + (r.error_message.length > 60 ? '…' : '')}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: IngestRun['status'] }) {
  const styles: Record<string, string> = {
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    partial: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    failed: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    running: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  };
  const key = status ?? 'running';
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold ${
        styles[key] ?? 'bg-zinc-100 text-zinc-700'
      }`}
    >
      {key}
    </span>
  );
}

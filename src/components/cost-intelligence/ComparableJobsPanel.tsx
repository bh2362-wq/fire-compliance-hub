import { useState } from 'react';
import { useComparableJobs } from '@/hooks/useComparableJobs';
import { useMarketContext } from '@/hooks/useMarketContext';
import type { MarketContext } from '@/types/cost-intelligence';
import {
  BUILDING_TYPE_LABELS,
  SYSTEM_TYPE_LABELS,
  JOB_CATEGORY_LABELS,
  REGION_LABELS,
  BID_OUTCOME_LABELS,
  type QuoteScope,
  type ComparableJob,
  type ComparableJobsStats,
} from '@/types/cost-intelligence';

interface ComparableJobsPanelProps {
  scope: QuoteScope | null;
  currentQuoteTotal?: number;
  onSelectJob?: (jobId: string) => void;
  className?: string;
}

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});
const gbpPrecise = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short' });
const pct = (n: number | null | undefined, digits = 1) =>
  n == null ? '—' : `${n.toFixed(digits)}%`;

export function ComparableJobsPanel({
  scope,
  currentQuoteTotal,
  onSelectJob,
  className,
}: ComparableJobsPanelProps) {
  const { jobs, stats, loading, error } = useComparableJobs(scope);
  const { context: market } = useMarketContext(scope);

  const hasScope = !!(scope && scope.systemType && scope.buildingType);

  return (
    <aside
      className={[
        'flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4',
        'dark:border-zinc-800 dark:bg-zinc-950',
        className ?? '',
      ].join(' ')}
    >
      <Header scope={scope} loading={loading} count={jobs.length} />

      {!hasScope && <EmptyState />}

      {hasScope && error && <ErrorState message={error} />}

      {hasScope && !error && loading && jobs.length === 0 && <LoadingState />}

      {hasScope && !error && stats && stats.sample_size > 0 && (
        <RecommendationBand stats={stats} currentQuoteTotal={currentQuoteTotal} />
      )}

      {hasScope && market && market.sample_size > 0 && (
        <MarketContextSection context={market} />
      )}

      {hasScope && !error && jobs.length > 0 && (
        <ComparablesList jobs={jobs} onSelectJob={onSelectJob} />
      )}

      <Footer lookbackYears={scope?.lookbackYears ?? 3} />
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header({
  scope,
  loading,
  count,
}: {
  scope: QuoteScope | null;
  loading: boolean;
  count: number;
}) {
  const subtitle =
    scope && scope.systemType && scope.buildingType
      ? `${SYSTEM_TYPE_LABELS[scope.systemType]} · ${BUILDING_TYPE_LABELS[scope.buildingType]}`
      : 'Awaiting scope';

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-md bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
          <FlameIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
            Cost intelligence
          </div>
          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {subtitle}
          </div>
        </div>
      </div>
      <div className="shrink-0">
        {loading ? (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
            Loading
          </span>
        ) : (
          <span className="inline-flex h-6 items-center rounded-full bg-orange-100 px-2.5 text-[11px] font-semibold tabular-nums text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
            {count} comparable{count === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-200 px-4 py-10 text-center dark:border-zinc-800">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-950/40">
        <FlameIcon className="h-5 w-5" />
      </span>
      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Pick system & building type
      </div>
      <p className="max-w-xs text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Select the system type and building type on the quote to see comparable
        historical jobs and a recommended price band.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
      <div className="mb-0.5 font-semibold">Couldn't load comparables</div>
      <div className="opacity-90">{message}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900"
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recommendation band                                                 */
/* ------------------------------------------------------------------ */

function RecommendationBand({
  stats,
  currentQuoteTotal,
}: {
  stats: ComparableJobsStats;
  currentQuoteTotal?: number;
}) {
  const winRate = stats.win_rate_pct;
  const lo = stats.recommended_low ?? 0;
  const hi = stats.recommended_high ?? 0;

  let placement: { tone: 'emerald' | 'amber' | 'rose'; label: string } | null = null;
  if (currentQuoteTotal != null && lo > 0 && hi > 0) {
    if (currentQuoteTotal >= lo && currentQuoteTotal <= hi) {
      placement = { tone: 'emerald', label: 'Inside band' };
    } else if (currentQuoteTotal < lo) {
      placement = { tone: 'amber', label: 'Below band · margin risk' };
    } else {
      placement = { tone: 'rose', label: 'Above band · win-rate risk' };
    }
  }

  const placementTone =
    placement?.tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
      : placement?.tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300'
        : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300';

  return (
    <section className="flex flex-col gap-2.5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Recommended price band
        </h3>
        <div className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
          Win rate <span className="font-semibold text-zinc-700 dark:text-zinc-200">{pct(winRate, 0)}</span>{' '}
          <span className="opacity-70">
            ({stats.jobs_won}W / {stats.jobs_lost}L)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <BandStat label="Low (P25)" value={stats.recommended_low} />
        <BandStat label="Target (P50)" value={stats.recommended_target} highlight />
        <BandStat label="High (P75)" value={stats.recommended_high} />
      </div>

      {placement && currentQuoteTotal != null && (
        <div
          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-[11px] font-medium ${placementTone}`}
        >
          <span>
            Current quote{' '}
            <span className="font-semibold tabular-nums">
              {gbp.format(currentQuoteTotal)}
            </span>
          </span>
          <span>{placement.label}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 pt-1">
        <UnitStat label="£/device" value={stats.median_cost_per_device} />
        <UnitStat label="£/loop" value={stats.median_cost_per_loop} />
        <UnitStat label="Margin" value={stats.median_margin_pct} suffix="%" />
      </div>
    </section>
  );
}

function BandStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        'flex flex-col gap-0.5 rounded-lg border px-3 py-2',
        highlight
          ? 'border-orange-300 bg-orange-50 dark:border-orange-800/70 dark:bg-orange-950/40'
          : 'border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/60',
      ].join(' ')}
    >
      <span
        className={[
          'text-[10px] font-medium uppercase tracking-wide',
          highlight
            ? 'text-orange-700 dark:text-orange-300'
            : 'text-zinc-500 dark:text-zinc-400',
        ].join(' ')}
      >
        {label}
      </span>
      <span
        className={[
          'tabular-nums',
          highlight
            ? 'text-base font-bold text-orange-700 dark:text-orange-200'
            : 'text-sm font-semibold text-zinc-900 dark:text-zinc-100',
        ].join(' ')}
      >
        {value == null ? '—' : gbp.format(value)}
      </span>
    </div>
  );
}

function UnitStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span className="text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
        {value == null
          ? '—'
          : suffix === '%'
            ? `${value.toFixed(1)}%`
            : gbpPrecise.format(value)}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Comparables list                                                    */
/* ------------------------------------------------------------------ */

function ComparablesList({
  jobs,
  onSelectJob,
}: {
  jobs: ComparableJob[];
  onSelectJob?: (jobId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Closest matches
      </h3>
      <ul className="flex flex-col gap-2">
        {jobs.map((j) => (
          <li key={j.job_id}>
            <button
              type="button"
              onClick={() => onSelectJob?.(j.job_id)}
              className="group w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-orange-300 hover:bg-orange-50/40 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-orange-700/70 dark:hover:bg-orange-950/20"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {j.job_reference ?? 'Job'}{' '}
                    {j.client_name && (
                      <span className="font-normal text-zinc-500 dark:text-zinc-400">
                        · {j.client_name}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                    {BUILDING_TYPE_LABELS[j.building_type]} ·{' '}
                    {JOB_CATEGORY_LABELS[j.job_category]}
                    {j.region ? ` · ${REGION_LABELS[j.region]}` : ''} ·{' '}
                    {dateFmt.format(new Date(j.classified_at))}
                  </div>
                </div>
                <SimilarityBadge score={j.similarity_score} />
              </div>

              <div className="mt-2 grid grid-cols-4 gap-2">
                <Metric label="Quoted" emphasis>
                  {j.quoted_total == null ? '—' : gbp.format(j.quoted_total)}
                </Metric>
                <Metric label="Devices">
                  {j.device_count_total ?? '—'}
                </Metric>
                <Metric label="£/dev">
                  {j.cost_per_device == null ? '—' : gbpPrecise.format(j.cost_per_device)}
                </Metric>
                <Metric label="Margin" margin={j.achieved_margin_pct}>
                  {pct(j.achieved_margin_pct)}
                </Metric>
              </div>

              <div className="mt-2">
                <OutcomePill outcome={j.bid_outcome} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Metric({
  label,
  children,
  emphasis,
  margin,
}: {
  label: string;
  children: React.ReactNode;
  emphasis?: boolean;
  margin?: number | null;
}) {
  let tone = 'text-zinc-800 dark:text-zinc-200';
  if (margin != null) {
    if (margin > 25) tone = 'text-emerald-700 dark:text-emerald-400';
    else if (margin < 10) tone = 'text-rose-700 dark:text-rose-400';
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span
        className={[
          'tabular-nums',
          emphasis ? 'text-xs font-bold' : 'text-xs font-semibold',
          tone,
        ].join(' ')}
      >
        {children}
      </span>
    </div>
  );
}

function SimilarityBadge({ score }: { score: number }) {
  const rounded = Math.round(score);
  const tone =
    score >= 80
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
      : score >= 60
        ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300'
        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400';
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-semibold tabular-nums ${tone}`}
    >
      {rounded}
    </span>
  );
}

function OutcomePill({ outcome }: { outcome: ComparableJob['bid_outcome'] }) {
  if (!outcome) return null;
  const tone =
    outcome === 'won'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
      : outcome === 'lost'
        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400';
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {BID_OUTCOME_LABELS[outcome]}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

function Footer({ lookbackYears }: { lookbackYears: number }) {
  return (
    <div className="mt-auto pt-1 text-[10px] text-zinc-400 dark:text-zinc-600">
      Lookback {lookbackYears}y · Internal benchmarks only · v0.1
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Market context (external)                                           */
/* ------------------------------------------------------------------ */

function MarketContextSection({ context }: { context: MarketContext }) {
  const [showInfo, setShowInfo] = useState(false);
  const fmt = (n: number | null) => (n == null ? '—' : gbp.format(n));

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
              UK market context
            </span>
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              onMouseEnter={() => setShowInfo(true)}
              onMouseLeave={() => setShowInfo(false)}
              className="grid h-3.5 w-3.5 place-items-center rounded-full border border-blue-300 text-[9px] font-bold text-blue-600 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
              aria-label="About market context"
            >
              i
            </button>
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Public sector awards · last 24 months
          </div>
        </div>
      </div>

      {showInfo && (
        <div className="mb-2 rounded border border-blue-200 bg-white p-2 text-[11px] leading-snug text-zinc-700 dark:border-blue-900/50 dark:bg-zinc-900 dark:text-zinc-300">
          Public sector contract awards for fire alarm work, classified by CPV code and buyer
          profile. Useful for gov/MoD/NHS tender benchmarking. Not directly comparable to private
          sector pricing — main contractor margins typically apply.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <MarketStat label="P25" value={fmt(context.p25_value)} />
        <MarketStat label="Median" value={fmt(context.median_value)} emphasis />
        <MarketStat label="P75" value={fmt(context.p75_value)} />
      </div>

      <div className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">
        Based on <span className="font-semibold tabular-nums">{context.sample_size}</span> awarded
        contract{context.sample_size === 1 ? '' : 's'} ·{' '}
        <span className="tabular-nums">{context.recent_count_12mo}</span> in last 12 months
      </div>

      {context.top_buyers?.length > 0 && (
        <div className="mt-2 border-t border-blue-200/60 pt-2 dark:border-blue-900/40">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Active buyers in this segment
          </div>
          <ul className="mt-1 space-y-0.5">
            {context.top_buyers.slice(0, 3).map((b) => (
              <li
                key={b.name}
                className="flex items-center justify-between text-[11px] text-zinc-700 dark:text-zinc-300"
              >
                <span className="truncate pr-2">{b.name}</span>
                <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-500">
                  {b.count} award{b.count === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-600">
        Source: UK Contracts Finder · OGL v3.0
      </div>
    </section>
  );
}

function MarketStat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded border border-blue-200/60 bg-white p-2 dark:border-blue-900/40 dark:bg-zinc-900">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div
        className={[
          'tabular-nums',
          emphasis
            ? 'text-sm font-semibold text-blue-700 dark:text-blue-300'
            : 'text-xs font-medium text-zinc-800 dark:text-zinc-200',
        ].join(' ')}
      >
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline flame icon                                                   */
/* ------------------------------------------------------------------ */

function FlameIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}

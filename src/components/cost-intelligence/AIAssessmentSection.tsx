import { useEffect, useState } from 'react';
import { Sparkles, AlertTriangle, RefreshCw } from 'lucide-react';
import { usePricingNarrative } from '@/hooks/usePricingNarrative';
import {
  isPricingAssessment,
  type PricingAssessment,
  type QuoteScope,
  type RiskFlag,
} from '@/types/cost-intelligence';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AIAssessmentSectionProps {
  scope: QuoteScope | null;
  currentQuoteTotal?: number;
  quoteId?: string;
  visitId?: string;
}

const LOADING_STEPS = [
  { delay: 0, label: 'Analysing comparables and market context…' },
  { delay: 2000, label: 'Claude is reasoning about win probability' },
  { delay: 4000, label: 'Generating risk flags' },
];

export function AIAssessmentSection({
  scope,
  currentQuoteTotal,
  quoteId,
  visitId,
}: AIAssessmentSectionProps) {
  const {
    assessment,
    loading,
    error,
    generate,
    scopeChangedSinceLastGeneration,
    cooldownSecondsRemaining,
  } = usePricingNarrative(scope, { currentQuoteTotal, quoteId, visitId });

  const hasMinScope = !!(scope?.systemType && scope?.buildingType);
  const isInsufficient =
    assessment !== null && !isPricingAssessment(assessment);
  const validAssessment =
    assessment && isPricingAssessment(assessment) ? assessment : null;

  return (
    <section
      aria-label="AI pricing assessment"
      className="flex flex-col gap-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/20"
    >
      <Header />

      {/* ERROR state */}
      {error && (
        <ErrorBox
          message={error}
          onRetry={generate}
          cooldown={cooldownSecondsRemaining}
        />
      )}

      {/* LOADING */}
      {loading && <LoadingState />}

      {/* INSUFFICIENT DATA */}
      {!loading && isInsufficient && (
        <InsufficientDataBox
          onRetry={generate}
          cooldown={cooldownSecondsRemaining}
        />
      )}

      {/* RESULT */}
      {!loading && validAssessment && (
        <ResultView
          assessment={validAssessment}
          onRegenerate={generate}
          cooldown={cooldownSecondsRemaining}
          scopeChanged={scopeChangedSinceLastGeneration}
        />
      )}

      {/* EMPTY / READY */}
      {!loading && !assessment && !error && (
        <ReadyState hasMinScope={hasMinScope} onGenerate={generate} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header() {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-7 w-7 place-items-center rounded-md bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
          AI assessment
        </div>
        <div className="text-xs text-zinc-600 dark:text-zinc-400">
          Synthesis of comparables + market data
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ready                                                               */
/* ------------------------------------------------------------------ */

function ReadyState({
  hasMinScope,
  onGenerate,
}: {
  hasMinScope: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        Generates a narrative, risk flags, win probability and margin target.
        Uses Claude Sonnet 4.5. Takes ~5 seconds, costs ~£0.02 per assessment.
      </p>
      <button
        type="button"
        disabled={!hasMinScope}
        onClick={onGenerate}
        className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-md bg-indigo-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Generate assessment
      </button>
      {!hasMinScope && (
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Set system type and building type to enable
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

function LoadingState() {
  const [stepIdx, setStepIdx] = useState(0);
  useEffect(() => {
    setStepIdx(0);
    const timers = LOADING_STEPS.map((s, i) =>
      setTimeout(() => setStepIdx(i), s.delay),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
        <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
          {LOADING_STEPS[0].label}
        </span>
      </div>
      {stepIdx >= 1 && (
        <span className="pl-4 text-[11px] text-zinc-500 dark:text-zinc-400">
          {LOADING_STEPS[1].label}
        </span>
      )}
      {stepIdx >= 2 && (
        <span className="pl-4 text-[11px] text-zinc-500 dark:text-zinc-400">
          {LOADING_STEPS[2].label}
        </span>
      )}
      <div className="mt-1 flex flex-col gap-1.5 opacity-40">
        <div className="h-12 animate-pulse rounded-md bg-indigo-100 dark:bg-indigo-900/40" />
        <div className="h-20 animate-pulse rounded-md bg-indigo-100 dark:bg-indigo-900/40" />
        <div className="h-16 animate-pulse rounded-md bg-indigo-100 dark:bg-indigo-900/40" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Insufficient data                                                   */
/* ------------------------------------------------------------------ */

function InsufficientDataBox({
  onRetry,
  cooldown,
}: {
  onRetry: () => void;
  cooldown: number;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
      <div className="font-medium">Not enough comparable data yet.</div>
      <p className="mt-1 leading-relaxed text-zinc-600 dark:text-zinc-400">
        To enable AI assessment for this scope, ensure at least 3–5 jobs are
        classified matching this system type + building type, with quoted
        totals populated.
      </p>
      <button
        type="button"
        disabled={cooldown > 0}
        onClick={onRetry}
        className="mt-2 text-[11px] font-medium text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 dark:text-indigo-300"
      >
        {cooldown > 0 ? `Try again in ${cooldown}s` : 'Try anyway'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Error                                                               */
/* ------------------------------------------------------------------ */

function ErrorBox({
  message,
  onRetry,
  cooldown,
}: {
  message: string;
  onRetry: () => void;
  cooldown: number;
}) {
  return (
    <div className="rounded-md border border-rose-300 bg-rose-100 p-3 dark:border-rose-900/60 dark:bg-rose-950/40">
      <div className="text-xs font-semibold text-rose-800 dark:text-rose-200">
        Couldn't generate assessment
      </div>
      <div className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">
        {message}
      </div>
      <button
        type="button"
        disabled={cooldown > 0}
        onClick={onRetry}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
      >
        <RefreshCw className="h-3 w-3" />
        {cooldown > 0 ? `Try again in ${cooldown}s` : 'Try again'}
      </button>
      <p className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400">
        Errors are logged. If this persists, check Edge Function logs.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Result view                                                         */
/* ------------------------------------------------------------------ */

function ResultView({
  assessment,
  onRegenerate,
  cooldown,
  scopeChanged,
}: {
  assessment: PricingAssessment;
  onRegenerate: () => void;
  cooldown: number;
  scopeChanged: boolean;
}) {
  const paragraphs = (assessment.narrative ?? '')
    .split(/\n\n+/)
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      <StatRow assessment={assessment} />

      <div className="border-l-2 border-indigo-300 pl-4 py-2 dark:border-indigo-700">
        {paragraphs.map((p, i) => (
          <p
            key={i}
            className={`text-[12.5px] leading-relaxed text-zinc-700 dark:text-zinc-300 ${
              i > 0 ? 'mt-2' : ''
            }`}
          >
            {p}
          </p>
        ))}
      </div>

      {assessment.risk_flags.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Risk flags
          </h4>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {assessment.risk_flags.map((f, i) => (
              <FlagRow key={i} flag={f} />
            ))}
          </div>
        </div>
      )}

      {assessment.caveats && assessment.caveats.length > 0 && (
        <p className="text-[11px] italic text-zinc-500 dark:text-zinc-400">
          Note: {assessment.caveats.join(' · ')}
        </p>
      )}

      {assessment.hallucination_detected && (
        <HallucinationWarning assessment={assessment} />
      )}

      <FooterRow
        assessment={assessment}
        onRegenerate={onRegenerate}
        cooldown={cooldown}
        scopeChanged={scopeChanged}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat row                                                            */
/* ------------------------------------------------------------------ */

function StatRow({ assessment }: { assessment: PricingAssessment }) {
  const win = assessment.win_probability_pct;
  const winTone =
    win == null
      ? 'text-zinc-500'
      : win >= 60
        ? 'text-emerald-600 dark:text-emerald-400'
        : win >= 40
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-rose-600 dark:text-rose-400';

  const confidence = Math.max(0, Math.min(100, assessment.confidence_score));

  return (
    <div className="grid grid-cols-3 gap-2">
      <BigStat
        value={win == null ? '—' : `${Math.round(win)}%`}
        label="Win probability"
        valueClass={winTone}
      />
      <BigStat
        value={
          assessment.suggested_margin_pct == null
            ? '—'
            : `${Math.round(assessment.suggested_margin_pct)}%`
        }
        label="Suggested margin"
        valueClass="text-zinc-800 dark:text-zinc-100"
      />
      <div className="flex flex-col gap-1 rounded-md border border-indigo-100 bg-white p-2.5 dark:border-indigo-900/40 dark:bg-zinc-950/40">
        <div className="flex items-center gap-2">
          <div
            className="h-2 flex-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50"
            role="progressbar"
            aria-valuenow={confidence}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Confidence"
          >
            <div
              className="h-2 rounded-full bg-indigo-400 dark:bg-indigo-500"
              style={{ width: `${confidence}%` }}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
            {Math.round(confidence)}
          </span>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Confidence
        </span>
        <span className="text-[10px] text-zinc-500 dark:text-zinc-500">
          ({assessment.based_on.comparable_count} comparables,{' '}
          {assessment.based_on.market_context_count} market refs)
        </span>
      </div>
    </div>
  );
}

function BigStat({
  value,
  label,
  valueClass,
}: {
  value: string;
  label: string;
  valueClass: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-indigo-100 bg-white p-2.5 dark:border-indigo-900/40 dark:bg-zinc-950/40">
      <span className={`text-2xl font-bold leading-none tabular-nums ${valueClass}`}>
        {value}
      </span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Risk flag row                                                       */
/* ------------------------------------------------------------------ */

function FlagRow({ flag }: { flag: RiskFlag }) {
  const sev = flag.severity;
  const sevClass =
    sev === 'high'
      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
      : sev === 'medium'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
        : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
  const sevLabel = sev === 'high' ? 'HIGH' : sev === 'medium' ? 'MED' : 'LOW';

  return (
    <div className="flex items-start gap-3 py-2">
      <span
        className={`inline-flex h-5 w-14 shrink-0 items-center justify-center rounded text-[10px] font-bold uppercase tracking-wider ${sevClass}`}
      >
        {sevLabel}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {flag.category}
        </div>
        <div className="text-[12px] leading-snug text-zinc-700 dark:text-zinc-300">
          {flag.flag}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hallucination warning                                               */
/* ------------------------------------------------------------------ */

function HallucinationWarning({
  assessment,
}: {
  assessment: PricingAssessment;
}) {
  const fab = assessment.fabricated_references ?? [];
  const mis = assessment.outcome_misattributions ?? [];
  return (
    <div className="flex items-start gap-2 rounded border border-rose-200 bg-rose-50 p-2 dark:border-rose-900/60 dark:bg-rose-950/30">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
      <div className="text-[11px] leading-snug text-rose-800 dark:text-rose-200">
        AI flagged for review
        {fab.length > 0 && (
          <>
            {' '}
            — fabricated references: <span className="font-mono">{fab.join(', ')}</span>
          </>
        )}
        {mis.length > 0 && (
          <>
            {' '}
            · outcome misattributions:{' '}
            <span className="font-mono">{mis.join('; ')}</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Footer row                                                          */
/* ------------------------------------------------------------------ */

function FooterRow({
  assessment,
  onRegenerate,
  cooldown,
  scopeChanged,
}: {
  assessment: PricingAssessment;
  onRegenerate: () => void;
  cooldown: number;
  scopeChanged: boolean;
}) {
  const generatedAt = assessment.generated_at
    ? formatRelative(new Date(assessment.generated_at))
    : 'just now';

  return (
    <div className="flex items-center justify-between pt-1">
      <span className="text-[10px] text-zinc-500 dark:text-zinc-500">
        Generated {generatedAt} · Model:{' '}
        {assessment.model_version ?? 'claude-sonnet-4-5'}
      </span>
      <div className="flex items-center gap-2">
        {scopeChanged && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label="Scope changed"
                  className="inline-block h-2 w-2 rounded-full bg-amber-500"
                />
              </TooltipTrigger>
              <TooltipContent>
                Scope changed since last assessment — regenerate for fresh analysis
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <button
          type="button"
          disabled={cooldown > 0}
          onClick={onRegenerate}
          className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-indigo-900/50 dark:bg-zinc-950 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
        >
          <RefreshCw className="h-3 w-3" />
          {cooldown > 0 ? `Regenerate in ${cooldown}s` : 'Regenerate'}
        </button>
      </div>
    </div>
  );
}

function formatRelative(d: Date): string {
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

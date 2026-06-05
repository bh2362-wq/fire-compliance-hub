import { LucideIcon, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

// Technical-tool KPI card — replaces the icon-chip-in-tinted-box
// pattern (the shadcn-dashboard cliché) with:
//
//   - A 2px top accent strip in a category colour. Reads like a
//     dashboard widget header rather than a marketing card.
//   - Inline small icon next to the eyebrow — scanability without
//     the icon-chip box
//   - Solid `bg-card`, no gradient washes
//   - Tighter typography, denser block
//
// `iconTint` / `iconInk` are accepted for API compatibility with
// callers from the previous design but are no longer used (the icon
// is now monochrome, sized to match the eyebrow).

interface KPICardProps {
  title: string;
  value: string | number;
  trend?: number[];
  deltaPercent?: number | null;
  goodDirection?: "up" | "down";
  subtitle?: string;
  icon: LucideIcon;
  iconTint?: string;        // deprecated — kept for caller compat
  iconInk?: string;         // deprecated — kept for caller compat
  accent?: "default" | "primary" | "danger" | "warning" | "success";
  href?: string;
}

// Top accent strip colour per tone. Default leans on the new
// slate-blue secondary so neutral KPIs still get a hint of structure.
const ACCENT_STRIP: Record<NonNullable<KPICardProps["accent"]>, string> = {
  default: "bg-secondary",
  primary: "bg-primary",
  danger:  "bg-destructive",
  warning: "bg-warning",
  success: "bg-success",
};

export function KPICard({
  title,
  value,
  trend,
  deltaPercent,
  goodDirection = "up",
  subtitle,
  icon: Icon,
  accent = "default",
  href,
}: KPICardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => href && navigate(href)}
      className={cn(
        "relative overflow-hidden rounded-md border border-border bg-card p-4 transition-all duration-150",
        href && "cursor-pointer hover:border-foreground/25 hover:shadow-sm",
      )}
    >
      {/* Top accent strip */}
      <div className={cn("absolute inset-x-0 top-0 h-[2px]", ACCENT_STRIP[accent])} />

      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <p className="text-[10px] font-bold uppercase tracking-[0.14em]">
          {title}
        </p>
      </div>

      <div className="mt-3 flex items-end gap-3 justify-between">
        <p
          className="text-[2rem] leading-none font-bold text-foreground tracking-tight"
          style={{ letterSpacing: "-0.03em" }}
        >
          {value}
        </p>
        {trend && trend.length > 1 && (
          <Sparkline values={trend} accent={accent} />
        )}
      </div>

      <div className="flex items-center gap-2 mt-2 min-h-[18px]">
        {deltaPercent != null && (
          <DeltaChip
            percent={deltaPercent}
            goodDirection={goodDirection}
          />
        )}
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// ── Sparkline ──────────────────────────────────────────────────────

const SPARK_WIDTH = 72;
const SPARK_HEIGHT = 28;

function Sparkline({
  values,
  accent,
}: {
  values: number[];
  accent: NonNullable<KPICardProps["accent"]>;
}) {
  const max = Math.max(...values, 1);
  const stroke = accent === "primary" ? "stroke-primary"
    : accent === "danger" ? "stroke-destructive"
    : accent === "warning" ? "stroke-warning"
    : accent === "success" ? "stroke-success"
    : "stroke-secondary";
  // Use bars rather than a path — looks more deliberate at this size
  // and reads as a "count per day" intuitively.
  const barWidth = SPARK_WIDTH / values.length;
  return (
    <svg
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      className="shrink-0"
      role="img"
      aria-label={`${values.length}-point trend`}
    >
      {values.map((v, i) => {
        const h = (v / max) * SPARK_HEIGHT;
        return (
          <rect
            key={i}
            x={i * barWidth + 1}
            y={SPARK_HEIGHT - h}
            width={Math.max(barWidth - 2, 1)}
            height={Math.max(h, 1)}
            className={cn(stroke, "fill-current opacity-60")}
            rx={0.5}
          />
        );
      })}
    </svg>
  );
}

// ── Delta chip ─────────────────────────────────────────────────────

function DeltaChip({
  percent,
  goodDirection,
}: {
  percent: number;
  goodDirection: "up" | "down";
}) {
  const isZero = Math.abs(percent) < 0.5;
  const isUp = percent > 0;
  const isGood = isZero
    ? null
    : (isUp && goodDirection === "up") || (!isUp && goodDirection === "down");
  const Icon = isZero ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  const tone = isZero
    ? "bg-muted text-muted-foreground"
    : isGood
      ? "bg-success/10 text-success"
      : "bg-destructive/10 text-destructive";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        tone,
      )}
    >
      <Icon className="w-3 h-3" />
      {isZero ? "0%" : `${isUp ? "+" : ""}${percent.toFixed(0)}%`}
    </span>
  );
}

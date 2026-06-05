import { LucideIcon, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

// Enhanced version of StatsCard with optional inline sparkline + a
// week-over-week delta chip. Use this for KPIs where we have a real
// time series; fall back to StatsCard for static numbers. The
// sparkline is a tiny inline SVG — no recharts overhead — so it
// composes cleanly inside the existing grid without layout shift.

interface KPICardProps {
  title: string;
  value: string | number;
  // Optional 14-30 point series for the sparkline. Latest value last.
  trend?: number[];
  // Optional week-over-week percentage delta. Positive numbers
  // render with up-arrow + (default) green; flip `goodDirection` to
  // 'down' for metrics where lower is better (e.g. overdue invoices).
  deltaPercent?: number | null;
  goodDirection?: "up" | "down";
  // Subtitle line below the value — same role as StatsCard.change.
  subtitle?: string;
  icon: LucideIcon;
  iconTint?: string;        // Tailwind bg class for icon wrapper
  iconInk?: string;         // Tailwind text class for icon colour
  accent?: "default" | "primary" | "danger" | "warning" | "success";
  href?: string;
}

const ACCENT_STYLES: Record<NonNullable<KPICardProps["accent"]>, string> = {
  default: "bg-card border-border",
  primary: "bg-gradient-to-br from-primary/8 via-primary/4 to-card border-primary/25",
  danger:  "bg-gradient-to-br from-destructive/8 via-destructive/4 to-card border-destructive/25",
  warning: "bg-gradient-to-br from-warning/8 via-warning/4 to-card border-warning/25",
  success: "bg-gradient-to-br from-success/8 via-success/4 to-card border-success/25",
};

export function KPICard({
  title,
  value,
  trend,
  deltaPercent,
  goodDirection = "up",
  subtitle,
  icon: Icon,
  iconTint = "bg-primary/10",
  iconInk = "text-primary",
  accent = "default",
  href,
}: KPICardProps) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => href && navigate(href)}
      className={cn(
        "rounded-xl border p-5 transition-all duration-200 relative overflow-hidden",
        ACCENT_STYLES[accent],
        href && "cursor-pointer hover:shadow-md hover:scale-[1.01]",
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", iconTint)}>
          <Icon className={cn(iconInk)} style={{ width: 18, height: 18 }} />
        </div>
      </div>

      <div className="flex items-end gap-3 justify-between">
        <p
          className="text-3xl font-bold text-foreground tracking-tight"
          style={{ letterSpacing: "-0.025em" }}
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
    : "stroke-foreground/60";
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

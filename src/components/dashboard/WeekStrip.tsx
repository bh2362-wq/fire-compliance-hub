import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, addDays, startOfDay, isToday, isWeekend } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// Horizontal 7-day calendar strip. Replaces "scroll to find today's
// visits in TodaySchedule" with a glanceable week view — engineer
// taps a day to jump to that day's filtered visits list.
//
// Each day shows:
//   - Day-of-week initial (M T W T F S S)
//   - Date number
//   - Visit count badge
//   - Visual treatment: today highlighted, weekends faded, empty days
//     subdued, busy days emphasised
//
// Prev / Next chevrons step the visible window by 7 days so the
// engineer can look ahead without leaving the dashboard.

interface DayCell {
  date: Date;
  isoDate: string;
  count: number;
}

export function WeekStrip() {
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(0);
  const [days, setDays] = useState<DayCell[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const start = startOfDay(addDays(new Date(), weekOffset * 7));
        const cells: DayCell[] = Array.from({ length: 7 }, (_, i) => {
          const d = addDays(start, i);
          return { date: d, isoDate: format(d, "yyyy-MM-dd"), count: 0 };
        });

        const { data } = await supabase
          .from("service_visits")
          .select("visit_date")
          .in("visit_date", cells.map((c) => c.isoDate));
        if (cancelled) return;

        const counts = new Map<string, number>();
        for (const row of (data ?? []) as { visit_date: string }[]) {
          counts.set(row.visit_date, (counts.get(row.visit_date) ?? 0) + 1);
        }
        for (const c of cells) c.count = counts.get(c.isoDate) ?? 0;
        setDays(cells);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [weekOffset]);

  const handleDayClick = (cell: DayCell) => {
    // The visits list already supports a ?date= query param for
    // single-day filtering. Pre-existing route — no need to change
    // anything on that side.
    navigate(`/dashboard/visits?date=${cell.isoDate}`);
  };

  // Max count in the visible week → drives bar-fill intensity per
  // day, so the strip reads with relative density rather than absolute.
  const maxCount = Math.max(1, ...days.map((d) => d.count));

  return (
    <section className="rounded-xl border bg-card p-4">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">
            {weekOffset === 0
              ? "This week"
              : weekOffset === 1
                ? "Next week"
                : weekOffset === -1
                  ? "Last week"
                  : `${weekOffset > 0 ? "+" : ""}${weekOffset} weeks`}
          </h3>
          {days.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {format(days[0].date, "d MMM")} – {format(days[6].date, "d MMM")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Next week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((cell) => (
          <DayCellTile
            key={cell.isoDate}
            cell={cell}
            maxCount={maxCount}
            loading={loading}
            onClick={() => handleDayClick(cell)}
          />
        ))}
      </div>
    </section>
  );
}

function DayCellTile({
  cell,
  maxCount,
  loading,
  onClick,
}: {
  cell: DayCell;
  maxCount: number;
  loading: boolean;
  onClick: () => void;
}) {
  const today = isToday(cell.date);
  const weekend = isWeekend(cell.date);
  const intensity = cell.count / maxCount;

  // Bar height as a percent of the cell, so busier days visually
  // tower over quiet ones without needing the absolute number to
  // dominate.
  const barHeight = cell.count === 0 ? 0 : Math.max(20, intensity * 100);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative rounded-lg p-2 text-left transition-all overflow-hidden group",
        today
          ? "bg-primary/10 border border-primary/40 hover:bg-primary/15"
          : "border border-transparent hover:border-border hover:bg-muted/40",
      )}
    >
      {/* Density bar — visualises load without needing the count number
          to dominate the cell. */}
      {cell.count > 0 && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 transition-all duration-500",
            today ? "bg-primary/20" : "bg-muted/60",
          )}
          style={{ height: `${barHeight}%` }}
        />
      )}

      <div className="relative">
        <p
          className={cn(
            "text-[10px] font-bold uppercase tracking-wider",
            today
              ? "text-primary"
              : weekend
                ? "text-muted-foreground/50"
                : "text-muted-foreground",
          )}
        >
          {format(cell.date, "EEE")}
        </p>
        <p
          className={cn(
            "text-lg font-bold mt-0.5",
            today ? "text-primary" : weekend ? "text-muted-foreground/60" : "text-foreground",
          )}
        >
          {format(cell.date, "d")}
        </p>
        {!loading && (
          <p
            className={cn(
              "text-[10px] mt-0.5",
              cell.count === 0
                ? "text-muted-foreground/50"
                : today
                  ? "text-primary font-semibold"
                  : "text-foreground/80 font-medium",
            )}
          >
            {cell.count === 0 ? "—" : `${cell.count} ${cell.count === 1 ? "visit" : "visits"}`}
          </p>
        )}
      </div>
    </button>
  );
}

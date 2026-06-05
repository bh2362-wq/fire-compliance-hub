import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import { Calendar, Plus, Siren, Wrench, FilePen, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// Hero strip at the top of the dashboard. Replaces the plain
// "Welcome back" header with a richer panel:
//
//   - Personalised greeting + the full date (engineers checking on a
//     phone tend to lose track of which day it is mid-week)
//   - Today's visit count with a one-click chip per type
//     (callout / remedial / service) so the most urgent items are
//     glanceable without scrolling to TodaySchedule
//   - "Tomorrow" preview when today is wrapping up
//   - Primary CTA (New Visit) lives here so the engineer doesn't
//     hunt for it
//
// Uses a subtle BHO-orange gradient so it reads as a branded surface
// rather than a Lovable default card.

interface TodayVisit {
  id: string;
  visit_type: string | null;
  status: string | null;
  visit_date: string;
}

const VISIT_TYPE_ICONS: Record<string, typeof Siren> = {
  callout: Siren,
  emergency: Siren, // legacy alias
  remedial: Wrench,
};

export function DashboardHero() {
  const navigate = useNavigate();
  const [todayVisits, setTodayVisits] = useState<TodayVisit[]>([]);
  const [tomorrowVisits, setTomorrowVisits] = useState<TodayVisit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const today = format(new Date(), "yyyy-MM-dd");
        const tomorrow = format(
          new Date(Date.now() + 86_400_000),
          "yyyy-MM-dd",
        );
        const { data } = await supabase
          .from("service_visits")
          .select("id, visit_type, status, visit_date")
          .in("visit_date", [today, tomorrow]);
        if (cancelled) return;
        const rows = (data ?? []) as TodayVisit[];
        setTodayVisits(rows.filter((v) => isToday(new Date(v.visit_date))));
        setTomorrowVisits(rows.filter((v) => isTomorrow(new Date(v.visit_date))));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const todayCount = todayVisits.length;
  const tomorrowCount = tomorrowVisits.length;

  // Group today's visits by type for the chip row.
  const grouped: Record<string, number> = {};
  for (const v of todayVisits) {
    const k = v.visit_type ?? "other";
    grouped[k] = (grouped[k] ?? 0) + 1;
  }

  const greeting = pickGreeting();

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-card p-5 sm:p-7">
      {/* Decorative corner — barely there but breaks the flat-card feel */}
      <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {greeting}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {format(new Date(), "EEEE")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(), "d MMMM yyyy")}
          </p>
        </div>

        <Button
          size="lg"
          onClick={() => navigate("/dashboard/visits")}
          className="md:self-end shadow-md hover:shadow-lg"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Visit
        </Button>
      </div>

      {/* Today/Tomorrow snapshot row */}
      <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SnapshotCard
          label="Today"
          icon={<Calendar className="w-4 h-4" />}
          loading={loading}
          count={todayCount}
          empty="No visits scheduled"
          chips={Object.entries(grouped).map(([type, n]) => ({
            type,
            count: n,
          }))}
          onView={() => navigate("/dashboard/visits")}
        />
        <SnapshotCard
          label="Tomorrow"
          icon={<Calendar className="w-4 h-4" />}
          loading={loading}
          count={tomorrowCount}
          empty="Open day — schedule something"
          chips={[]}
          onView={() => navigate("/dashboard/visits")}
          subdued
        />
      </div>
    </div>
  );
}

function SnapshotCard({
  label,
  icon,
  loading,
  count,
  empty,
  chips,
  onView,
  subdued = false,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  count: number;
  empty: string;
  chips: { type: string; count: number }[];
  onView: () => void;
  subdued?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card/70 backdrop-blur-sm p-4",
        subdued && "opacity-90",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("text-muted-foreground")}>{icon}</span>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
        </div>
        <button
          onClick={onView}
          className="text-xs font-semibold text-primary inline-flex items-center gap-0.5 hover:gap-1 transition-all"
        >
          View <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="flex items-baseline gap-2 mt-2">
        <p className="text-3xl font-bold">
          {loading ? "—" : count}
        </p>
        <p className="text-sm text-muted-foreground">
          {count === 1 ? "visit" : "visits"}
        </p>
      </div>

      {!loading && count === 0 && (
        <p className="text-xs text-muted-foreground mt-1.5">{empty}</p>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {chips.map((chip) => {
            const Icon = VISIT_TYPE_ICONS[chip.type] ?? FilePen;
            return (
              <span
                key={chip.type}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium"
              >
                <Icon className="w-3 h-3" />
                {chip.count} {chip.type.replace(/_/g, " ")}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function pickGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

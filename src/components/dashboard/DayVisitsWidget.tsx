import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Calendar, CalendarDays, MapPin,
  User, Clock, Siren, Wrench, FilePen, ArrowRight,
} from "lucide-react";
import {
  format, addDays, isToday, isTomorrow, isYesterday, startOfDay,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Day-navigable visit list — replaces the older "Today's Schedule"
// widget. Joblogic-style: one widget that shows the visits for a single
// date, with left/right arrows to jump days. Tapping a visit drops the
// engineer onto that visit's detail page.

interface DayVisit {
  id: string;
  visit_date: string;
  appointment_time: string | null;
  status: string | null;
  visit_type: string | null;
  notes: string | null;
  site: { id: string; name: string | null; address: string | null } | null;
  engineer: { full_name: string | null } | null;
}

const VISIT_ICON: Record<string, typeof Siren> = {
  callout: Siren,
  emergency: Siren,
  remedial: Wrench,
};

const STATUS_TONE: Record<string, string> = {
  scheduled:      "bg-secondary/10 text-secondary border-secondary/20",
  in_progress:    "bg-warning/10 text-warning border-warning/20",
  pending_review: "bg-warning/10 text-warning border-warning/20",
  completed:      "bg-success/10 text-success border-success/20",
  cancelled:      "bg-muted text-muted-foreground border-border",
  no_show:        "bg-destructive/10 text-destructive border-destructive/25",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled:      "Scheduled",
  in_progress:    "In progress",
  pending_review: "Pending review",
  completed:      "Completed",
  cancelled:      "Cancelled",
  no_show:        "No show",
};

function dateLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE d MMM");
}

export function DayVisitsWidget() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [visits, setVisits] = useState<DayVisit[]>([]);
  const [loading, setLoading] = useState(true);

  const iso = useMemo(() => format(selectedDate, "yyyy-MM-dd"), [selectedDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("service_visits")
        .select(
          "id, visit_date, appointment_time, status, visit_type, notes, " +
          "site:sites(id, name, address), engineer:profiles!service_visits_engineer_id_fkey(full_name)",
        )
        .eq("visit_date", iso)
        .order("appointment_time", { ascending: true, nullsFirst: false });
      if (cancelled) return;
      setVisits((data ?? []) as unknown as DayVisit[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [iso]);

  const today = startOfDay(new Date());
  const onToday = format(selectedDate, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");

  return (
    <div className="section-card">
      {/* Header — title + day navigator */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-secondary/10 flex items-center justify-center">
            <CalendarDays className="w-4 h-4 text-secondary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Diary</h3>
            <p className="text-xs text-muted-foreground">Visits for {dateLabel(selectedDate)}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-2"
            onClick={() => setSelectedDate((d) => addDays(d, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant={onToday ? "secondary" : "outline"}
            size="sm"
            className="h-9 px-3 text-xs font-semibold"
            onClick={() => setSelectedDate(today)}
            disabled={onToday}
          >
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-2"
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            aria-label="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Date pill row — tappable day shortcuts */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-thin">
        {[-2, -1, 0, 1, 2, 3, 4].map((offset) => {
          const d = addDays(today, offset);
          const isSelected = format(d, "yyyy-MM-dd") === iso;
          return (
            <button
              key={offset}
              onClick={() => setSelectedDate(d)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all",
                isSelected
                  ? "bg-secondary text-secondary-foreground border-secondary"
                  : "bg-card text-muted-foreground border-border hover:border-foreground/25",
              )}
            >
              {dateLabel(d)}
            </button>
          );
        })}
      </div>

      {/* Visit list */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-md border border-border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : visits.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No visits scheduled for {dateLabel(selectedDate)}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visits.map((v) => {
            const Icon = VISIT_ICON[v.visit_type ?? ""] ?? FilePen;
            const tone = STATUS_TONE[v.status ?? "scheduled"] ?? STATUS_TONE.scheduled;
            const statusLabel = STATUS_LABEL[v.status ?? "scheduled"] ?? v.status;
            return (
              <button
                key={v.id}
                onClick={() => navigate(`/dashboard/visits?visitId=${v.id}`)}
                className="w-full text-left rounded-md border border-border bg-card p-3 hover:border-foreground/25 hover:shadow-sm transition-all active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-foreground/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p className="font-semibold text-foreground text-sm truncate">
                        {v.site?.name ?? "Unknown site"}
                      </p>
                      {v.appointment_time && (
                        <span className="text-xs font-semibold text-muted-foreground inline-flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" />
                          {v.appointment_time.slice(0, 5)}
                        </span>
                      )}
                    </div>
                    {v.site?.address && (
                      <p className="text-xs text-muted-foreground truncate inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {v.site.address}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={cn("text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border", tone)}>
                        {statusLabel}
                      </span>
                      {v.engineer?.full_name && (
                        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                          <User className="w-3 h-3" /> {v.engineer.full_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground self-center shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

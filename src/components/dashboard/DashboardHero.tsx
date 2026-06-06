import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

// Hero strip at the top of the dashboard.
//
// Visual reading: a deep slate-blue block — deliberately *not* the
// peach-orange gradient that's the Lovable / shadcn-dashboard cliché.
// Slate gives the orange "New Visit" CTA something high-contrast to
// pop off, and keeps the brand-orange role exclusive to actions.
//
// Content:
//   - Personalised greeting + full date
//   - Primary CTA (New Visit)
//
// The previous Today/Tomorrow snapshot row was removed —
// DayVisitsWidget below shows the same data plus day navigation, so
// the snapshot was redundant noise.

export function DashboardHero() {
  const navigate = useNavigate();
  const greeting = pickGreeting();

  return (
    <div className="relative overflow-hidden rounded-lg bg-secondary text-secondary-foreground p-5 sm:p-7">
      {/* A barely-there light wash in the corner — adds depth on solid
          slate without reading as a gradient hero. */}
      <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/[0.04] pointer-events-none" />

      <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[12px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
            {greeting}
          </p>
          <h1 className="text-3xl sm:text-3xl font-bold tracking-tight text-white">
            {format(new Date(), "EEEE")}
          </h1>
          <p className="text-base sm:text-sm text-white/70">
            {format(new Date(), "d MMMM yyyy")}
          </p>
        </div>

        <Button
          size="lg"
          onClick={() => navigate("/dashboard/visits")}
          className="md:self-end shadow-md hover:shadow-lg h-12 sm:h-11 text-base sm:text-sm w-full md:w-auto"
        >
          <Plus className="w-5 h-5 sm:w-4 sm:h-4 mr-1.5" />
          New Visit
        </Button>
      </div>
    </div>
  );
}

function pickGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

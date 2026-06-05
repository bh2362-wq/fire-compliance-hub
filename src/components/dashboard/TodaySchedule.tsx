import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, ChevronRight, Loader2 } from "lucide-react";

interface TodayAppointment {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  status: string;
  site_name: string;
  visit_type: string | null;
}

const statusColors: Record<string, string> = {
  scheduled: "bg-secondary/10 text-secondary border-secondary/20",
  confirmed: "bg-success/10 text-success border-success/20",
  in_progress: "bg-warning/10 text-warning border-warning/20",
  completed: "bg-success/10 text-success border-success/20",
};

const TodaySchedule = () => {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<TodayAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchToday = async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("appointments")
        .select("id, title, start_time, end_time, status, visit_type, sites(name)")
        .eq("appointment_date", today)
        .order("start_time", { ascending: true });

      if (data) {
        setAppointments(
          data.map((a: any) => ({
            id: a.id,
            title: a.title,
            start_time: a.start_time,
            end_time: a.end_time,
            status: a.status,
            site_name: a.sites?.name || "Unknown",
            visit_type: a.visit_type,
          }))
        );
      }
      setLoading(false);
    };
    fetchToday();
  }, []);

  const formatTime = (time: string) => {
    const [h, m] = time.split(":");
    const hour = parseInt(h);
    return `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? "PM" : "AM"}`;
  };

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Today's Schedule</h3>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Today's Schedule</h3>
          <p className="text-sm text-muted-foreground">
            {appointments.length === 0
              ? "No appointments today"
              : `${appointments.length} appointment${appointments.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-accent"
          onClick={() => navigate("/dashboard/schedule")}
        >
          Full diary
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {appointments.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No appointments scheduled for today</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {appointments.map((apt) => (
            <div
              key={apt.id}
              className="p-3 px-5 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => navigate("/dashboard/schedule")}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-foreground text-sm">{apt.title}</span>
                <Badge
                  variant="outline"
                  className={statusColors[apt.status] || "bg-muted text-muted-foreground"}
                >
                  {apt.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTime(apt.start_time)}
                  {apt.end_time && ` – ${formatTime(apt.end_time)}`}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {apt.site_name}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TodaySchedule;

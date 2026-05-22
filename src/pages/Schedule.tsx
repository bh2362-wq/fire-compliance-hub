import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { CalendarHeader, CalendarView } from "@/components/schedule/CalendarHeader";
import { DayView } from "@/components/schedule/DayView";
import { WeekView } from "@/components/schedule/WeekView";
import { MonthView } from "@/components/schedule/MonthView";
import { AppointmentFormDialog } from "@/components/schedule/AppointmentFormDialog";
import { Appointment, fetchAppointments, updateAppointment } from "@/services/appointmentService";
import { useToast } from "@/hooks/use-toast";
import {
  addDays, addWeeks, addMonths, subDays, subWeeks, subMonths,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, format,
} from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalendarSync } from "@/hooks/useCalendarSync";

const Schedule = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedEngineerId, setSelectedEngineerId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ title?: string; notes?: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useCalendarSync();

  // Consume prefill params handed over by the email scanner's "Schedule"
  // action (?title=&date=&notes=) and open the new-appointment form filled
  // in. Params are cleared so a refresh doesn't re-open the dialog.
  useEffect(() => {
    const title = searchParams.get("title");
    const date = searchParams.get("date");
    const notes = searchParams.get("notes");
    if (!title && !date && !notes) return;

    setSelectedAppointment(null);
    if (date) {
      const parsed = new Date(date);
      if (!isNaN(parsed.getTime())) {
        setSelectedDate(parsed);
        setCurrentDate(parsed);
      }
    }
    setPrefill({ title: title || undefined, notes: notes || undefined });
    setDialogOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const dateRange = useMemo(() => {
    let start: Date;
    let end: Date;
    switch (view) {
      case "day":
        start = currentDate;
        end = currentDate;
        break;
      case "week":
        start = startOfWeek(currentDate, { weekStartsOn: 1 });
        end   = endOfWeek(currentDate,   { weekStartsOn: 1 });
        break;
      default:
        start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
        end   = endOfWeek(endOfMonth(currentDate),     { weekStartsOn: 1 });
    }
    return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
  }, [currentDate, view]);

  const { data: allAppointments = [], isLoading, refetch } = useQuery({
    queryKey: ["appointments", dateRange.start, dateRange.end],
    queryFn:  () => fetchAppointments(dateRange.start, dateRange.end),
    refetchOnMount: "always",
  });

  const appointments = useMemo(() => {
    if (!selectedEngineerId) return allAppointments;
    return allAppointments.filter((apt) => apt.engineer_id === selectedEngineerId);
  }, [allAppointments, selectedEngineerId]);

  const handleNavigate = (direction: "prev" | "next" | "today") => {
    if (direction === "today") { setCurrentDate(new Date()); return; }
    const isPrev = direction === "prev";
    switch (view) {
      case "day":   setCurrentDate(isPrev ? subDays(currentDate, 1)   : addDays(currentDate, 1));   break;
      case "week":  setCurrentDate(isPrev ? subWeeks(currentDate, 1)  : addWeeks(currentDate, 1));  break;
      default:      setCurrentDate(isPrev ? subMonths(currentDate, 1) : addMonths(currentDate, 1)); break;
    }
  };

  const handleAppointmentClick = (apt: Appointment) => {
    setSelectedAppointment(apt);
    setSelectedDate(undefined);
    setDialogOpen(true);
  };

  const handleAddAppointment = () => {
    setSelectedAppointment(null);
    setSelectedDate(new Date());
    setDialogOpen(true);
  };

  const handleDayClick = (date: Date) => {
    if (view === "month") { setCurrentDate(date); setView("day"); }
  };

  const handleAppointmentDrop = useCallback(async (appointmentId: string, newDate: string) => {
    try {
      await updateAppointment(appointmentId, { appointment_date: newDate });
      toast({ title: "Job moved", description: `Moved to ${format(new Date(newDate + "T12:00:00"), "EEE, MMM d yyyy")}` });
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
    } catch {
      toast({ title: "Error", description: "Failed to move job", variant: "destructive" });
    }
  }, [queryClient, toast]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h2 className="page-title">Schedule</h2>
          <p className="page-subtitle">Engineer diary and job calendar</p>
        </div>

        <div className="h-[calc(100vh-12rem)] flex flex-col">
          <CalendarHeader
            currentDate={currentDate}
            view={view}
            onViewChange={setView}
            onNavigate={handleNavigate}
            onAddAppointment={handleAddAppointment}
            selectedEngineerId={selectedEngineerId}
            onEngineerChange={setSelectedEngineerId}
          />

          <div className="flex-1 mt-4 overflow-hidden bg-card rounded-xl border border-border">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <>
                {view === "day"   && <DayView   currentDate={currentDate} appointments={appointments} onAppointmentClick={handleAppointmentClick} />}
                {view === "week"  && <WeekView  currentDate={currentDate} appointments={appointments} onAppointmentClick={handleAppointmentClick} />}
                {view === "month" && <MonthView currentDate={currentDate} appointments={appointments} onAppointmentClick={handleAppointmentClick} onDayClick={handleDayClick} onAppointmentDrop={handleAppointmentDrop} />}
              </>
            )}
          </div>
        </div>
      </div>

      <AppointmentFormDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setPrefill(null);
        }}
        appointment={selectedAppointment}
        defaultDate={selectedDate || currentDate}
        defaultTitle={prefill?.title}
        defaultNotes={prefill?.notes}
        onSuccess={refetch}
      />
    </DashboardLayout>
  );
};

export default Schedule;

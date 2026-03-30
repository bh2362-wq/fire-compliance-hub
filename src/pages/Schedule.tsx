import { useState, useMemo, useCallback } from "react";
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
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
} from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalendarSync } from "@/hooks/useCalendarSync";

const Schedule = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedEngineerId, setSelectedEngineerId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Auto-sync: ensure all open visits have calendar entries
  useCalendarSync();

  // Calculate date range for fetching
  const dateRange = useMemo(() => {
    let start: Date;
    let end: Date;

    switch (view) {
      case 'day':
        start = currentDate;
        end = currentDate;
        break;
      case 'week':
        start = startOfWeek(currentDate, { weekStartsOn: 1 });
        end = endOfWeek(currentDate, { weekStartsOn: 1 });
        break;
      case 'month':
      default:
        start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
        end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
        break;
    }

    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
    };
  }, [currentDate, view]);

  const {
    data: allAppointments = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['appointments', dateRange.start, dateRange.end],
    queryFn: () => fetchAppointments(dateRange.start, dateRange.end),
    refetchOnMount: 'always',
  });

  // Filter by selected engineer for diary view
  const appointments = useMemo(() => {
    if (!selectedEngineerId) return allAppointments;
    return allAppointments.filter(apt => apt.engineer_id === selectedEngineerId);
  }, [allAppointments, selectedEngineerId]);

  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }

    const isPrev = direction === 'prev';

    switch (view) {
      case 'day':
        setCurrentDate(isPrev ? subDays(currentDate, 1) : addDays(currentDate, 1));
        break;
      case 'week':
        setCurrentDate(isPrev ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
        break;
      case 'month':
        setCurrentDate(isPrev ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
        break;
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
    if (view === 'month') {
      setCurrentDate(date);
      setView('day');
    }
  };

  const handleDialogSuccess = () => {
    refetch();
  };

  const handleAppointmentDrop = useCallback(async (appointmentId: string, newDate: string) => {
    try {
      await updateAppointment(appointmentId, { appointment_date: newDate });
      toast({ title: "Job moved", description: `Moved to ${format(new Date(newDate + 'T12:00:00'), "EEE, MMM d yyyy")}` });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    } catch (err) {
      console.error("Failed to move appointment:", err);
      toast({ title: "Error", description: "Failed to move job", variant: "destructive" });
    }
  }, [queryClient, toast]);

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-8rem)] flex flex-col">
        <CalendarHeader
          currentDate={currentDate}
          view={view}
          onViewChange={setView}
          onNavigate={handleNavigate}
          onAddAppointment={handleAddAppointment}
        />

        <div className="flex-1 mt-4 overflow-hidden bg-card rounded-lg border border-border">
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              {view === 'day' && (
                <DayView
                  currentDate={currentDate}
                  appointments={appointments}
                  onAppointmentClick={handleAppointmentClick}
                />
              )}
              {view === 'week' && (
                <WeekView
                  currentDate={currentDate}
                  appointments={appointments}
                  onAppointmentClick={handleAppointmentClick}
                />
              )}
              {view === 'month' && (
                <MonthView
                  currentDate={currentDate}
                  appointments={appointments}
                  onAppointmentClick={handleAppointmentClick}
                  onDayClick={handleDayClick}
                  onAppointmentDrop={handleAppointmentDrop}
                />
              )}
            </>
          )}
        </div>
      </div>

      <AppointmentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={selectedAppointment}
        defaultDate={selectedDate || currentDate}
        onSuccess={handleDialogSuccess}
      />
    </DashboardLayout>
  );
};

export default Schedule;

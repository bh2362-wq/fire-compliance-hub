import { useState, useCallback, DragEvent } from "react";
import { Appointment } from "@/services/appointmentService";
import { AppointmentCard } from "./AppointmentCard";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { cn } from "@/lib/utils";

interface MonthViewProps {
  currentDate: Date;
  appointments: Appointment[];
  onAppointmentClick: (appointment: Appointment) => void;
  onDayClick?: (date: Date) => void;
  onAppointmentDrop?: (appointmentId: string, newDate: string) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthView({
  currentDate,
  appointments,
  onAppointmentClick,
  onDayClick,
  onAppointmentDrop,
}: MonthViewProps) {
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let day = calendarStart;
  while (day <= calendarEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const getAppointmentsForDay = (d: Date) => {
    return appointments.filter((apt) =>
      isSameDay(new Date(apt.appointment_date), d)
    );
  };

  const handleDragStart = useCallback((e: DragEvent, apt: Appointment) => {
    e.stopPropagation();
    e.dataTransfer.setData("appointment-id", apt.id);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(dateStr);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  const handleDrop = useCallback((e: DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(null);
    const appointmentId = e.dataTransfer.getData("appointment-id");
    if (appointmentId && onAppointmentDrop) {
      onAppointmentDrop(appointmentId, dateStr);
    }
  }, [onAppointmentDrop]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="h-10 flex items-center justify-center text-sm font-medium text-muted-foreground"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-auto">
        {days.map((d) => {
          const dayAppointments = getAppointmentsForDay(d);
          const isCurrentMonth = isSameMonth(d, currentDate);
          const today = isToday(d);
          const dateStr = format(d, 'yyyy-MM-dd');
          const isDragOver = dragOverDate === dateStr;

          return (
            <div
              key={d.toISOString()}
              className={cn(
                "min-h-[100px] border-b border-r border-border p-1 overflow-hidden transition-colors",
                !isCurrentMonth && "bg-muted/30",
                today && "bg-primary/5",
                isDragOver && "bg-primary/15 ring-2 ring-primary/30 ring-inset"
              )}
              onClick={() => onDayClick?.(d)}
              onDragOver={(e) => handleDragOver(e, dateStr)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, dateStr)}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "text-sm",
                    today && "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center",
                    !isCurrentMonth && "text-muted-foreground"
                  )}
                >
                  {format(d, 'd')}
                </span>
                {dayAppointments.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {dayAppointments.length}
                  </span>
                )}
              </div>

              <div className="space-y-0.5">
                {dayAppointments.slice(0, 3).map((apt) => (
                  <div
                    key={apt.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, apt)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                    <AppointmentCard
                      appointment={apt}
                      compact
                      onClick={() => onAppointmentClick(apt)}
                    />
                  </div>
                ))}
                {dayAppointments.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1">
                    +{dayAppointments.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

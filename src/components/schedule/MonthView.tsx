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
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthView({
  currentDate,
  appointments,
  onAppointmentClick,
  onDayClick,
}: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  // Build array of all days to display
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

          return (
            <div
              key={d.toISOString()}
              className={cn(
                "min-h-[100px] border-b border-r border-border p-1 overflow-hidden",
                !isCurrentMonth && "bg-muted/30",
                today && "bg-primary/5"
              )}
              onClick={() => onDayClick?.(d)}
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
                  <AppointmentCard
                    key={apt.id}
                    appointment={apt}
                    compact
                    onClick={() => onAppointmentClick(apt)}
                  />
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

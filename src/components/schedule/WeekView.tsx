import { Appointment } from "@/services/appointmentService";
import { AppointmentCard } from "./AppointmentCard";
import {
  format,
  startOfWeek,
  addDays,
  isToday,
  isWithinInterval,
  parseISO,
} from "date-fns";
import { cn } from "@/lib/utils";

interface WeekViewProps {
  currentDate: Date;
  appointments: Appointment[];
  onAppointmentClick: (appointment: Appointment) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 6am to 8pm

export function WeekView({ currentDate, appointments, onAppointmentClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getAppointmentsForDayHour = (day: Date, hour: number) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return appointments.filter((apt) => {
      // Check if this appointment covers this day
      let coversDay = false;
      if (apt.end_date && apt.end_date > apt.appointment_date) {
        coversDay = isWithinInterval(day, {
          start: parseISO(apt.appointment_date),
          end: parseISO(apt.end_date),
        });
      } else {
        coversDay = apt.appointment_date === dayStr;
      }
      if (!coversDay) return false;

      try {
        const startHour = parseInt(apt.start_time.split(':')[0], 10);
        // For multi-day appointments, show at the start hour on the first day,
        // and at the top (first working hour) on subsequent days
        if (apt.end_date && apt.end_date > apt.appointment_date && apt.appointment_date !== dayStr) {
          return hour === 6; // Show at top of day for continuation days
        }
        return startHour === hour;
      } catch {
        return false;
      }
    });
  };

  return (
    <div className="flex-1 overflow-auto">
      {/* Header row with day names */}
      <div className="grid grid-cols-[80px_repeat(7,1fr)] sticky top-0 bg-card z-10 border-b border-border">
        <div className="h-12" /> {/* Empty corner */}
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              "h-12 flex flex-col items-center justify-center border-l border-border",
              isToday(day) && "bg-primary/10"
            )}
          >
            <span className="text-xs text-muted-foreground">{format(day, 'EEE')}</span>
            <span
              className={cn(
                "text-sm font-medium",
                isToday(day) && "text-primary"
              )}
            >
              {format(day, 'd')}
            </span>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-[80px_repeat(7,1fr)]">
        {HOURS.map((hour) => (
          <div key={hour} className="contents">
            {/* Time label */}
            <div className="h-16 border-b border-border px-2 py-1 text-xs text-muted-foreground text-right pr-3">
              {format(new Date().setHours(hour, 0), 'HH:mm')}
            </div>

            {/* Day cells */}
            {days.map((day) => {
              const hourAppointments = getAppointmentsForDayHour(day, hour);
              const dayStr = format(day, 'yyyy-MM-dd');

              return (
                <div
                  key={`${day.toISOString()}-${hour}`}
                  className={cn(
                    "h-16 border-b border-l border-border p-0.5 overflow-hidden",
                    isToday(day) && "bg-primary/5"
                  )}
                >
                  {hourAppointments.slice(0, 2).map((apt) => {
                    const isMultiDay = apt.end_date && apt.end_date > apt.appointment_date;
                    const isContinuation = isMultiDay && apt.appointment_date !== dayStr;
                    return (
                      <AppointmentCard
                        key={apt.id}
                        appointment={apt}
                        compact
                        onClick={() => onAppointmentClick(apt)}
                      />
                    );
                  })}
                  {hourAppointments.length > 2 && (
                    <div className="text-[10px] text-muted-foreground pl-1">
                      +{hourAppointments.length - 2} more
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

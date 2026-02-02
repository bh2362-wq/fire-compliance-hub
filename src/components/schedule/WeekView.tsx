import { Appointment } from "@/services/appointmentService";
import { AppointmentCard } from "./AppointmentCard";
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  isToday,
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
    return appointments.filter((apt) => {
      if (!isSameDay(new Date(apt.appointment_date), day)) return false;
      try {
        const startHour = parseInt(apt.start_time.split(':')[0], 10);
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

              return (
                <div
                  key={`${day.toISOString()}-${hour}`}
                  className={cn(
                    "h-16 border-b border-l border-border p-0.5 overflow-hidden",
                    isToday(day) && "bg-primary/5"
                  )}
                >
                  {hourAppointments.slice(0, 2).map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      appointment={apt}
                      compact
                      onClick={() => onAppointmentClick(apt)}
                    />
                  ))}
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

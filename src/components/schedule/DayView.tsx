import { Appointment } from "@/services/appointmentService";
import { AppointmentCard } from "./AppointmentCard";
import { format, isWithinInterval, parseISO } from "date-fns";

interface DayViewProps {
  currentDate: Date;
  appointments: Appointment[];
  onAppointmentClick: (appointment: Appointment) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DayView({ currentDate, appointments, onAppointmentClick }: DayViewProps) {
  const currentDayStr = format(currentDate, 'yyyy-MM-dd');
  
  // Include multi-day appointments that span this day
  const dayAppointments = appointments.filter((apt) => {
    if (apt.end_date && apt.end_date > apt.appointment_date) {
      return isWithinInterval(currentDate, {
        start: parseISO(apt.appointment_date),
        end: parseISO(apt.end_date),
      });
    }
    return apt.appointment_date === currentDayStr;
  });

  const getAppointmentsForHour = (hour: number) => {
    return dayAppointments.filter((apt) => {
      try {
        const startHour = parseInt(apt.start_time.split(':')[0], 10);
        // Multi-day continuation days: show at 9am
        if (apt.end_date && apt.end_date > apt.appointment_date && apt.appointment_date !== currentDayStr) {
          return hour === 9;
        }
        return startHour === hour;
      } catch {
        return false;
      }
    });
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-[80px_1fr] gap-0">
        {HOURS.map((hour) => {
          const hourAppointments = getAppointmentsForHour(hour);
          const formattedHour = format(new Date().setHours(hour, 0), 'HH:mm');

          return (
            <div key={hour} className="contents">
              {/* Time label */}
              <div className="h-20 border-b border-border px-2 py-1 text-xs text-muted-foreground text-right pr-3">
                {formattedHour}
              </div>

              {/* Appointments slot */}
              <div className="h-20 border-b border-l border-border p-1 space-y-1 overflow-hidden">
                {hourAppointments.map((apt) => (
                  <AppointmentCard
                    key={apt.id}
                    appointment={apt}
                    onClick={() => onAppointmentClick(apt)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

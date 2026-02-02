import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Appointment, APPOINTMENT_STATUS_COLORS, APPOINTMENT_STATUS_LABELS } from "@/services/appointmentService";
import { Clock, MapPin, User } from "lucide-react";
import { format, parse } from "date-fns";

interface AppointmentCardProps {
  appointment: Appointment;
  compact?: boolean;
  onClick?: () => void;
}

export function AppointmentCard({ appointment, compact = false, onClick }: AppointmentCardProps) {
  const statusColor = APPOINTMENT_STATUS_COLORS[appointment.status] || 'bg-gray-500';
  const statusLabel = APPOINTMENT_STATUS_LABELS[appointment.status] || appointment.status;

  const formatTime = (time: string) => {
    try {
      const parsed = parse(time, 'HH:mm:ss', new Date());
      return format(parsed, 'HH:mm');
    } catch {
      return time;
    }
  };

  if (compact) {
    return (
      <div
        className={cn(
          "text-xs p-1 rounded cursor-pointer truncate text-white",
          statusColor,
          "hover:opacity-90 transition-opacity"
        )}
        onClick={onClick}
        title={`${appointment.title} - ${appointment.site?.name}`}
      >
        <span className="font-medium">{formatTime(appointment.start_time)}</span>
        {' '}
        {appointment.title}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "p-3 rounded-lg border border-border bg-card hover:shadow-md transition-shadow cursor-pointer",
        "border-l-4",
        `border-l-${statusColor.replace('bg-', '')}`
      )}
      style={{ borderLeftColor: getStatusHexColor(appointment.status) }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-foreground line-clamp-1">{appointment.title}</h4>
        <Badge variant="secondary" className={cn("text-white text-[10px] shrink-0", statusColor)}>
          {statusLabel}
        </Badge>
      </div>

      <div className="space-y-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>
            {formatTime(appointment.start_time)}
            {appointment.end_time && ` - ${formatTime(appointment.end_time)}`}
          </span>
        </div>

        {appointment.site && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">{appointment.site.name}</span>
          </div>
        )}

        {appointment.engineer && (
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            <span className="truncate">
              {appointment.engineer.full_name || appointment.engineer.email || 'Unassigned'}
            </span>
          </div>
        )}

        {appointment.customer && (
          <div className="text-xs text-muted-foreground/70">
            Customer: {appointment.customer.name}
          </div>
        )}
      </div>

      {appointment.visit_type && (
        <div className="mt-2">
          <Badge variant="outline" className="text-[10px]">
            {appointment.visit_type.replace(/_/g, ' ')}
          </Badge>
        </div>
      )}
    </div>
  );
}

function getStatusHexColor(status: string): string {
  const colors: Record<string, string> = {
    scheduled: '#3b82f6',
    confirmed: '#10b981',
    in_progress: '#f59e0b',
    completed: '#16a34a',
    cancelled: '#ef4444',
  };
  return colors[status] || '#6b7280';
}

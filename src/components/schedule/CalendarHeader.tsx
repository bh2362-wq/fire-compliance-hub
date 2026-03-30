import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus } from "lucide-react";
import { format } from "date-fns";
import { EngineerDiaryFilter } from "./EngineerDiaryFilter";

export type CalendarView = 'day' | 'week' | 'month';

interface CalendarHeaderProps {
  currentDate: Date;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onAddAppointment: () => void;
  selectedEngineerId?: string | null;
  onEngineerChange?: (engineerId: string | null) => void;
}

export function CalendarHeader({
  currentDate,
  view,
  onViewChange,
  onNavigate,
  onAddAppointment,
  selectedEngineerId,
  onEngineerChange,
}: CalendarHeaderProps) {
  const getTitle = () => {
    switch (view) {
      case 'day':
        return format(currentDate, 'EEEE, MMMM d, yyyy');
      case 'week':
        return format(currentDate, 'MMMM yyyy');
      case 'month':
        return format(currentDate, 'MMMM yyyy');
      default:
        return '';
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onNavigate('prev')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('today')}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onNavigate('next')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h2 className="text-xl font-semibold text-foreground">{getTitle()}</h2>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {onEngineerChange && (
          <EngineerDiaryFilter
            selectedEngineerId={selectedEngineerId ?? null}
            onEngineerChange={onEngineerChange}
          />
        )}
        <div className="flex items-center border border-border rounded-lg overflow-hidden">
          <Button
            variant={view === 'day' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none"
            onClick={() => onViewChange('day')}
          >
            Day
          </Button>
          <Button
            variant={view === 'week' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none border-x border-border"
            onClick={() => onViewChange('week')}
          >
            Week
          </Button>
          <Button
            variant={view === 'month' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none"
            onClick={() => onViewChange('month')}
          >
            Month
          </Button>
        </div>
        <Button variant="hero" size="sm" onClick={onAddAppointment}>
          <Plus className="h-4 w-4 mr-1" />
          New Appointment
        </Button>
      </div>
    </div>
  );
}

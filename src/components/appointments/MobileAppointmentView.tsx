
import { useState, useMemo } from 'react';
import { Appointment, BusinessHours } from "@/shared/types";
import { format, parseISO, isToday, isPast, isSameDay, isSameMonth, addDays, subDays, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, eachDayOfInterval } from 'date-fns';
// ⚡ Native groupBy - avoids lodash dependency (not installed in prod)
const groupBy = <T,>(arr: T[], key: keyof T): Record<string, T[]> =>
  arr.reduce((acc, item) => {
    const group = String(item[key]);
    (acc[group] = acc[group] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
import { Plus, ChevronLeft, ChevronRight, Search, Calendar } from 'lucide-react';

import { MobileAppointmentCard } from './MobileAppointmentCard';
import { DayCalendarView } from './DayCalendarView';
import type { ScheduleResource } from '@/components/schedule/CurbeeScheduleBoard';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { getAppointmentStatusStyle } from './statusStyles';

type ViewMode = 'list' | 'calendar' | 'month';
type FilterMode = 'all' | 'today' | 'confirmed' | 'completed' | 'cancelled' | 'upcoming';

interface MobileAppointmentViewProps {
  appointments: Appointment[];
  businessHours: BusinessHours;
  onSelectAppointment: (appointment: Appointment) => void;
  onAddAppointment: (date?: Date) => void;
  onEditAppointment: (appointment: Appointment) => void;
  onDateChange: (date: Date) => void;
  currentDate: Date;
  onCompleteAppointment?: (appointment: Appointment) => void;
  onStatusChange?: (appointment: Appointment, status: string) => void;
  /** Optional external control of view mode (for unified desktop/mobile usage) */
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  scheduleResources?: ScheduleResource[];
}

const FilterPill = ({ label, isActive, onClick }: { label: string, isActive: boolean, onClick: () => void }) => (
  <Button
    variant={isActive ? 'default' : 'outline'}
    size="sm"
    className={`rounded-md h-8 px-4 text-sm transition-all ${isActive ? 'bg-primary text-primary-foreground shadow' : 'bg-card/60 text-muted-foreground border-border/30 hover:bg-muted/30'}`}
    onClick={onClick}
  >
    {label}
  </Button>
);

export const MobileAppointmentView = ({
  appointments,
  onSelectAppointment,
  onAddAppointment,
  onEditAppointment,
  businessHours,
  onDateChange,
  currentDate,
  onCompleteAppointment,
  onStatusChange,
  viewMode: externalViewMode,
  onViewModeChange,
  scheduleResources,
}: MobileAppointmentViewProps) => {
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('list');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  // Use external viewMode if provided, otherwise use internal state
  const viewMode = externalViewMode ?? internalViewMode;
  const setViewMode = (mode: ViewMode) => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  const filteredAppointments = useMemo(() => {
    const items = [...appointments];
    switch (filterMode) {
      case 'today':
        return items.filter(a => isToday(parseISO(a.scheduled_date)));
      case 'confirmed':
        return items.filter(a => a.status === 'confirmed');
      case 'completed':
        return items.filter(a => a.status === 'completed');
      case 'cancelled':
        return items.filter(a => a.status === 'cancelled');
      case 'upcoming': {
        const now = new Date();
        const sevenDaysOut = addDays(now, 7);

        return items
          .map((apt) => ({
            appointment: apt,
            when: new Date(`${apt.scheduled_date}T${apt.scheduled_time || '00:00'}`),
          }))
          .filter(({ when }) => !Number.isNaN(when.getTime()) && when >= now && when <= sevenDaysOut)
          .sort((a, b) => a.when.getTime() - b.when.getTime())
          .map(({ appointment }) => appointment);
      }
      default:
        // "All" shows every appointment
        return items;
    }
  }, [appointments, filterMode]);
  
  const groupedAppointments = useMemo(() => {
    const sorted = filteredAppointments.sort((a, b) => 
      parseISO(`${a.scheduled_date}T${a.scheduled_time}`).getTime() - 
      parseISO(`${b.scheduled_date}T${b.scheduled_time}`).getTime()
    );
    return groupBy(sorted, 'scheduled_date');
  }, [filteredAppointments]);

  const sortedGroupKeys = useMemo(() => {
     const keys = Object.keys(groupedAppointments);
     keys.sort((a, b) => {
         const dateA = parseISO(a);
         const dateB = parseISO(b);
         const aIsPast = isPast(dateA) && !isToday(dateA);
         const bIsPast = isPast(dateB) && !isToday(dateB);

         if (aIsPast && !bIsPast) return 1;
         if (!aIsPast && bIsPast) return -1;

         // Both are in the future (or today)
         if (!aIsPast && !bIsPast) {
             return dateA.getTime() - dateB.getTime();
         }

         // Both are in the past
         return dateB.getTime() - dateA.getTime();
     });
     return keys;
  }, [groupedAppointments]);

  const renderAppointmentList = () => {
    const dayColors = [
      'border-red-400', 'border-sky-400', 'border-green-400', 'border-yellow-400', 'border-indigo-400', 'border-purple-400', 'border-pink-400',
    ];
    const dayBgColors = [
      'bg-red-400/10', 'bg-sky-400/10', 'bg-green-400/10', 'bg-yellow-400/10', 'bg-indigo-400/10', 'bg-purple-400/10', 'bg-pink-400/10',
    ];

    return (
      <ScrollArea className="h-[calc(100vh-220px)]">
        <div className="p-4 space-y-6">
          {sortedGroupKeys.length > 0 ? (
            sortedGroupKeys.map(date => {
              const dayOfMonth = parseInt(format(parseISO(date), 'd'));
              const colorClass = dayColors[dayOfMonth % dayColors.length];
              const bgColorClass = dayBgColors[dayOfMonth % dayBgColors.length];

              return (
                <div key={date} className={`p-4 rounded-lg ${bgColorClass} border-l-4 ${colorClass}`}>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold tracking-wide text-card-foreground">
                      {format(parseISO(date), "EEEE, MMM d")}
                    </h3>
                    <span className="text-sm text-muted-foreground">
                      {groupedAppointments[date].length} Appointments
                    </span>
                  </div>
                  <div className="space-y-4">
                    {groupedAppointments[date].map((app: Appointment) => (
                      <MobileAppointmentCard
                        key={app.id}
                        appointment={app}
                        onClick={onSelectAppointment}
                        onComplete={onCompleteAppointment}
                        onStatusChange={onStatusChange}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-20">
              <p className="text-muted-foreground">No appointments found for this filter.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    );
  };
  
   const renderCalendar = () => (
     <DayCalendarView
       appointments={appointments}
       currentDate={currentDate}
       onAppointmentClick={onSelectAppointment}
       onTimeSlotClick={onAddAppointment}
       onDateChange={onDateChange}
       businessHours={businessHours}
       resources={scheduleResources}
     />
   );

   const renderMonthView = () => {
     const monthStart = startOfMonth(currentDate);
     const monthEnd = endOfMonth(currentDate);
     const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
     const calendarDays = eachDayOfInterval({ start: calendarStart, end: endOfMonth(currentDate) });
     // Extend to fill complete weeks
     const totalDays = Math.ceil(calendarDays.length / 7) * 7;
     while (calendarDays.length < totalDays) {
       calendarDays.push(addDays(calendarDays[calendarDays.length - 1], 1));
     }

     const getAppointmentsForDay = (date: Date) => {
       const dateStr = format(date, "yyyy-MM-dd");
       return appointments.filter(a => a.scheduled_date === dateStr);
     };

     return (
       <div className="flex flex-col h-full">
         <div className="flex items-center justify-between p-4 border-b border-border/50">
           <Button variant="ghost" size="icon" onClick={() => onDateChange(subMonths(currentDate, 1))}>
             <ChevronLeft />
           </Button>
           <h2 className="text-lg font-semibold">{format(currentDate, "MMMM yyyy")}</h2>
           <Button variant="ghost" size="icon" onClick={() => onDateChange(addMonths(currentDate, 1))}>
             <ChevronRight />
           </Button>
         </div>
         <div className="grid grid-cols-7 border-b border-border/50">
           {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
             <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
               {day}
             </div>
           ))}
         </div>
         <ScrollArea className="flex-1">
           <div className="grid grid-cols-7">
             {calendarDays.map(day => {
               const dayAppts = getAppointmentsForDay(day);
               const isCurrentMonth = isSameMonth(day, currentDate);
               const isDayToday = isSameDay(day, new Date());

               return (
                 <div
                   key={day.toISOString()}
                   className={cn(
                     "min-h-[80px] p-1 border-b border-r border-border/30 cursor-pointer hover:bg-muted/30 transition-colors",
                     !isCurrentMonth && "opacity-40 bg-muted/10",
                     isDayToday && "ring-2 ring-primary ring-inset"
                   )}
                   onClick={() => {
                     onDateChange(day);
                     if (onViewModeChange) onViewModeChange('calendar');
                   }}
                 >
                   <div className={cn(
                     "text-xs font-medium mb-1",
                     isDayToday && "text-primary font-bold"
                   )}>
                     {format(day, "d")}
                   </div>
                   <div className="space-y-0.5">
                     {dayAppts.slice(0, 2).map(a => (
                      (() => {
                        const statusStyle = getAppointmentStatusStyle(a.status);
                        return (
                       <div
                         key={a.id}
                         className={cn(
                           "text-[10px] leading-tight px-1 py-0.5 rounded truncate",
                           statusStyle.chipClass
                         )}
                         onClick={(e) => {
                           e.stopPropagation();
                           onSelectAppointment(a);
                         }}
                       >
                         {a.scheduled_time?.slice(0, 5)} {a.title}
                       </div>
                        );
                      })()
                     ))}
                     {dayAppts.length > 2 && (
                       <Badge variant="secondary" className="text-[9px] h-4 px-1">
                         +{dayAppts.length - 2}
                       </Badge>
                     )}
                   </div>
                 </div>
               );
             })}
           </div>
         </ScrollArea>
       </div>
     );
   };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Main Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 bg-card/20 backdrop-blur-sm">
        <h1 className="text-2xl font-bold">Appointments</h1>
        <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost"><Search className="w-5 h-5"/></Button>
            <Button size="icon" onClick={() => onAddAppointment()} className="rounded-md">
              <Plus />
            </Button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="p-2 bg-card/20">
        <div className="grid grid-cols-3 gap-2 p-1 rounded-md bg-muted/30 border border-border/30">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            onClick={() => setViewMode('list')}
            className="rounded-md"
          >
            List
          </Button>
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'ghost'}
            onClick={() => setViewMode('calendar')}
            className="rounded-md"
          >
            Day
          </Button>
          <Button
            variant={viewMode === 'month' ? 'default' : 'ghost'}
            onClick={() => setViewMode('month')}
            className="rounded-md"
          >
            <Calendar className="h-4 w-4 mr-1" />
            Month
          </Button>
        </div>
      </div>
      
      {viewMode === 'list' && (
        <div className="p-2 border-b border-border/50">
            <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex gap-2 pb-2 items-center">
                  {(['today', 'confirmed', 'completed', 'cancelled', 'upcoming', 'all'] as FilterMode[]).map(filter => (
                    <FilterPill
                      key={filter}
                      label={filter === 'upcoming' ? 'Upcoming' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                      isActive={filterMode === filter}
                      onClick={() => setFilterMode(filter)}
                    />
                  ))}
                </div>
            </ScrollArea>
        </div>
      )}

      <div className="flex-1">
        {viewMode === 'list' ? renderAppointmentList() : viewMode === 'month' ? renderMonthView() : renderCalendar()}
      </div>
    </div>
  );
};

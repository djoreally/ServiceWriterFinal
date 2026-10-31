import { useState, useMemo } from 'react';
import { Appointment, BusinessHours } from "@/shared/types";
import { format, isToday, isPast, isSameDay, isSameMonth, addDays, addMonths, subMonths, addWeeks, subWeeks, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
// ⚡ Native groupBy - avoids lodash dependency (not installed in prod)
const groupBy = <T,>(arr: T[], key: keyof T): Record<string, T[]> =>
  arr.reduce((acc, item) => {
    const group = String(item[key]);
    (acc[group] = acc[group] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';

import { JobRow } from './JobRow';
import type { ScheduleResource } from '@/components/schedule/CurbeeScheduleBoard';
import { Button } from '@/components/ui/button';
import { ViewSegmentedControl } from '@/components/ui/ViewSegmentedControl';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { resolveStatusChip, statusToneClasses } from '@/lib/status-tone';
import { combineDateAndTime, formatDateLabel } from '@/lib/datetime';

type ViewMode = 'today' | 'week' | 'month';
type FilterMode = 'all' | 'confirmed' | 'completed' | 'cancelled';

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

/**
 * Status filter chip (design system §3.1): selected = navy fill, white
 * text; unselected = white with a hairline border. One row, always visible,
 * and it filters EVERY view (the old build only filtered Today).
 */
const FilterChip = ({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) => (
  <button
    type="button"
    aria-pressed={isActive}
    onClick={onClick}
    className={cn(
      'h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors',
      isActive
        ? 'border-navy bg-navy text-primary-foreground'
        : 'border-border bg-card text-muted-foreground hover:text-foreground',
    )}
  >
    {label}
  </button>
);

export const MobileAppointmentView = ({
  appointments,
  onSelectAppointment,
  onAddAppointment,
  onDateChange,
  currentDate,
  onCompleteAppointment,
  onStatusChange,
  viewMode: externalViewMode,
  onViewModeChange,
}: MobileAppointmentViewProps) => {
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('today');
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

  const matchesFilter = (a: Appointment) => filterMode === 'all' || a.status === filterMode;

  // The list-shaped views are date-scoped by the switcher: Today shows
  // today's appointments, Week shows the week containing currentDate.
  // The status filter applies inside BOTH (it previously applied to Today
  // only, so Week silently ignored it). Month renders its own grid and
  // applies the same filter per day.
  const listAppointments = useMemo(() => {
    if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
      return appointments.filter(a => {
        const date = combineDateAndTime(a.scheduled_date, null);
        return date !== null && date >= weekStart && date <= weekEnd && matchesFilter(a);
      });
    }
    return appointments.filter(a => {
      const date = combineDateAndTime(a.scheduled_date, null);
      return date ? isToday(date) && matchesFilter(a) : false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, viewMode, filterMode, currentDate]);

  const groupedAppointments = useMemo(() => {
    const sorted = [...listAppointments].sort((a, b) => {
      const aTime = combineDateAndTime(a.scheduled_date, a.scheduled_time)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = combineDateAndTime(b.scheduled_date, b.scheduled_time)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
    return groupBy(sorted, 'scheduled_date');
  }, [listAppointments]);

  const sortedGroupKeys = useMemo(() => {
     const keys = Object.keys(groupedAppointments);
     keys.sort((a, b) => {
         const dateA = combineDateAndTime(a, null);
         const dateB = combineDateAndTime(b, null);
         if (!dateA || !dateB) return dateA ? -1 : dateB ? 1 : 0;
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

  const renderAppointmentList = (emptyMessage = "No appointments found for this filter.") => {
    return (
      <div className="pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+1rem)] md:max-h-[calc(100dvh-220px)] md:overflow-y-auto md:pb-4">
        <div className="space-y-6 p-4">
          {sortedGroupKeys.length > 0 ? (
            sortedGroupKeys.map(date => {
              const parsedDate = combineDateAndTime(date, null);
              if (!parsedDate) return null;
              const count = groupedAppointments[date].length;

              return (
                <section key={date}>
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-base font-bold text-foreground">
                      {isToday(parsedDate) ? 'Today · ' : ''}{formatDateLabel(parsedDate, "EEE, MMM d", "Date unavailable")}
                    </h3>
                    <span className="text-sm text-muted-foreground">
                      {count} {count === 1 ? 'appointment' : 'appointments'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {groupedAppointments[date].map((app: Appointment) => (
                      <JobRow
                        key={app.id}
                        appointment={app}
                        onClick={onSelectAppointment}
                        onComplete={onCompleteAppointment}
                        onStatusChange={onStatusChange}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          ) : (
            <div className="py-20 text-center">
              <p className="text-muted-foreground">{emptyMessage}</p>
            </div>
          )}
        </div>
      </div>
    );
  };

   const renderWeekView = () => {
     const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
     const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
     const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
     return (
       <div className="flex h-full flex-col">
         <div className="flex items-center justify-between border-b border-border p-4">
           <Button variant="ghost" size="icon" onClick={() => onDateChange(subWeeks(currentDate, 1))} aria-label="Previous week">
             <ChevronLeft />
           </Button>
           <h2 className="font-display text-lg font-bold">
             {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
           </h2>
           <Button variant="ghost" size="icon" onClick={() => onDateChange(addWeeks(currentDate, 1))} aria-label="Next week">
             <ChevronRight />
           </Button>
         </div>
         <div className="grid grid-cols-7 gap-1 border-b border-border px-3 py-2">
           {weekDays.map(day => {
             const selected = isSameDay(day, currentDate);
             const today = isToday(day);
             return (
               <button
                 key={day.toISOString()}
                 type="button"
                 onClick={() => onDateChange(day)}
                 aria-pressed={selected}
                 className={cn(
                   'flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs font-semibold transition-colors',
                   selected ? 'bg-primary-action text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                   !selected && today && 'text-primary ring-1 ring-inset ring-primary',
                 )}
               >
                 <span>{format(day, "EEE")[0]}</span>
                 <span className="font-display text-sm font-bold">{format(day, "d")}</span>
               </button>
             );
           })}
         </div>
         <div className="flex-1 overflow-y-auto">
           {renderAppointmentList("No appointments this week.")}
         </div>
       </div>
     );
   };

   const renderMonthView = () => {
     const monthStart = startOfMonth(currentDate);
     const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
     const calendarDays = eachDayOfInterval({ start: calendarStart, end: endOfMonth(currentDate) });
     // Extend to fill complete weeks
     const totalDays = Math.ceil(calendarDays.length / 7) * 7;
     while (calendarDays.length < totalDays) {
       calendarDays.push(addDays(calendarDays[calendarDays.length - 1], 1));
     }

     const getAppointmentsForDay = (date: Date) => {
       const dateStr = format(date, "yyyy-MM-dd");
       return appointments.filter(a => a.scheduled_date === dateStr && matchesFilter(a));
     };

     return (
       <div className="flex h-full flex-col">
         <div className="flex items-center justify-between border-b border-border p-4">
           <Button variant="ghost" size="icon" onClick={() => onDateChange(subMonths(currentDate, 1))} aria-label="Previous month">
             <ChevronLeft />
           </Button>
           <h2 className="font-display text-lg font-bold">{format(currentDate, "MMMM yyyy")}</h2>
           <Button variant="ghost" size="icon" onClick={() => onDateChange(addMonths(currentDate, 1))} aria-label="Next month">
             <ChevronRight />
           </Button>
         </div>
         <div className="grid grid-cols-7 border-b border-border">
           {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
             <div key={day} className="py-2 text-center text-xs font-semibold text-muted-foreground">
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
                     "min-h-20 cursor-pointer border-b border-r border-border/50 p-1 transition-colors hover:bg-secondary/60",
                     !isCurrentMonth && "bg-secondary/40 opacity-40",
                     isDayToday && "ring-2 ring-inset ring-primary"
                   )}
                   onClick={() => {
                     onDateChange(day);
                     setViewMode('week');
                   }}
                 >
                   <div className={cn(
                     "mb-1 text-xs font-medium",
                     isDayToday && "font-bold text-primary"
                   )}>
                     {format(day, "d")}
                   </div>
                   <div className="space-y-0.5">
                     {dayAppts.slice(0, 2).map(a => {
                       const chip = resolveStatusChip(a);
                       const name = a.customer?.name || a.guest_name || 'Appointment';
                       return (
                         <div
                           key={a.id}
                           className={cn(
                             "truncate rounded px-1 py-0.5 text-[11px] font-medium leading-tight",
                             statusToneClasses(chip.tone).chip
                           )}
                           onClick={(e) => {
                             e.stopPropagation();
                             onSelectAppointment(a);
                           }}
                         >
                           {a.scheduled_time?.slice(0, 5)} {name}
                         </div>
                       );
                     })}
                     {dayAppts.length > 2 && (
                       <span className="inline-block rounded bg-secondary px-1 text-[11px] font-semibold text-muted-foreground">
                         +{dayAppts.length - 2} more
                       </span>
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
    <div className="flex h-full flex-col bg-background">
      {/* View switcher + add — the page H1 lives in the app TopHeader; no duplicate header here. */}
      <div className="flex shrink-0 items-center gap-2 p-2">
        <div className="min-w-0 flex-1">
          <ViewSegmentedControl
            label="Appointment view"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "today", label: "Today" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]}
          />
        </div>
        <Button size="icon" onClick={() => onAddAppointment()} className="shrink-0" aria-label="Add appointment">
          <Plus />
        </Button>
      </div>

      <div className="shrink-0 border-b border-border px-2 pb-2">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex items-center gap-2 pb-1">
            {(['all', 'confirmed', 'completed', 'cancelled'] as FilterMode[]).map(filter => (
              <FilterChip
                key={filter}
                label={filter.charAt(0).toUpperCase() + filter.slice(1)}
                isActive={filterMode === filter}
                onClick={() => setFilterMode(filter)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1">
        {viewMode === 'today' ? renderAppointmentList() : viewMode === 'month' ? renderMonthView() : renderWeekView()}
      </div>
    </div>
  );
};

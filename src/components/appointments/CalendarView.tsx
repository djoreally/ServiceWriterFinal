import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  List,
  LayoutGrid,
  CalendarX,
  AlertTriangle,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
} from "date-fns";
import { getSemanticStatus } from "@/lib/semantic-status";
import { WeekView, type WeekEvent } from "@/components/calendar/week-view";

/** Tailwind palette -> hex for the week-view color stripe. */
const PALETTE_HEX: Record<string, string> = {
  blue: "#3b82f6",
  cyan: "#06b6d4",
  indigo: "#6366f1",
  amber: "#f59e0b",
  orange: "#f97316",
  yellow: "#eab308",
  emerald: "#10b981",
  green: "#22c55e",
  red: "#ef4444",
  gray: "#6b7280",
};

export interface CalendarAppointment {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  customer?: { name: string } | null;
  vehicle?: { make: string; model: string; year: number } | null;
  service_catalog_id?: string | null;
  service_catalog?: { name: string } | null;
}

interface CalendarViewProps {
  appointments: CalendarAppointment[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onAppointmentClick: (appointment: CalendarAppointment) => void;
  onDrop: (appointmentId: string, newDate: string, newTime: string) => void;
  onSlotClick: (date: Date, time: string) => void;
  businessHours: {
    opening_time: string;
    closing_time: string;
    working_days: string[];
  };
  /** Optional: render the loading state instead of the grid. */
  isLoading?: boolean;
  /** Optional: render the error state. Pair with onRetry. */
  error?: string | null;
  /** Optional: retry handler for the error state. */
  onRetry?: () => void;
}

type ViewMode = "day" | "week" | "month";

/** "08:30" + 90 -> "10:00". Presentation helper over existing fields. */
function endTime(startHHMM: string, durationMinutes: number): string {
  const [h, m] = startHHMM.split(":").map(Number);
  const total = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0) + (durationMinutes || 0);
  const endH = Math.floor(total / 60) % 24;
  const endM = total % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

/** 450 -> "7 h 30 m", 45 -> "45 m". */
function formatBooked(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

const VIEW_MODES: { mode: ViewMode; label: string; icon: typeof List }[] = [
  { mode: "day", label: "Day", icon: List },
  { mode: "week", label: "Week", icon: LayoutGrid },
  { mode: "month", label: "Month", icon: CalendarIcon },
];

export const CalendarView = ({
  appointments,
  currentDate,
  onDateChange,
  onAppointmentClick,
  onDrop,
  onSlotClick,
  businessHours,
  isLoading = false,
  error = null,
  onRetry,
}: CalendarViewProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [draggedAppointment, setDraggedAppointment] = useState<string | null>(null);

  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    const [openHour] = businessHours.opening_time.split(":").map(Number);
    const [closeHour] = businessHours.closing_time.split(":").map(Number);

    for (let hour = openHour; hour < closeHour; hour++) {
      slots.push(`${hour.toString().padStart(2, "0")}:00`);
      slots.push(`${hour.toString().padStart(2, "0")}:30`);
    }
    return slots;
  }, [businessHours]);

  const days = useMemo(() => {
    if (viewMode === "day") {
      return [currentDate];
    } else if (viewMode === "week") {
      return eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      });
    } else {
      return eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      });
    }
  }, [currentDate, viewMode]);

  const navigate = (direction: "prev" | "next") => {
    if (viewMode === "day") {
      onDateChange(direction === "prev" ? subDays(currentDate, 1) : addDays(currentDate, 1));
    } else if (viewMode === "week") {
      onDateChange(direction === "prev" ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
    } else {
      onDateChange(direction === "prev" ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
    }
  };

  const getAppointmentsForDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return appointments.filter((a) => a.scheduled_date === dateStr);
  };

  const getAppointmentsForSlot = (date: Date, time: string) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return appointments.filter((a) => {
      if (a.scheduled_date !== dateStr) return false;
      const appointmentTime = a.scheduled_time.slice(0, 5);
      return appointmentTime === time;
    });
  };

  const isWorkingDay = (date: Date) => {
    const dayName = format(date, "EEEE");
    return businessHours.working_days.includes(dayName);
  };

  const handleDragStart = (e: React.DragEvent, appointmentId: string) => {
    setDraggedAppointment(appointmentId);
    e.dataTransfer.setData("appointmentId", appointmentId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, date: Date, time: string) => {
    e.preventDefault();
    const appointmentId = e.dataTransfer.getData("appointmentId");
    if (appointmentId && isWorkingDay(date)) {
      onDrop(appointmentId, format(date, "yyyy-MM-dd"), time);
    }
    setDraggedAppointment(null);
  };

  const stopEvent = (e: React.SyntheticEvent) => e.stopPropagation();

  const headerTitle =
    viewMode === "day"
      ? format(currentDate, "EEEE, MMMM d, yyyy")
      : viewMode === "week"
        ? `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "MMM d")} – ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), "MMM d, yyyy")}`
        : format(currentDate, "MMMM yyyy");

  const summary = useMemo(() => {
    const list = days.flatMap((d) => getAppointmentsForDay(d));
    const minutes = list.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
    return { count: list.length, minutes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, appointments, viewMode]);

  const renderAppointmentBlock = (appointment: CalendarAppointment, compact = false) => {
    const status = getSemanticStatus("appointment", appointment.status);
    const start = appointment.scheduled_time.slice(0, 5);
    const end = endTime(start, appointment.duration_minutes);
    const customer = appointment.customer?.name;
    const service = appointment.service_catalog?.name;
    const meta = [customer, service, status.label].filter(Boolean).join(" · ");

    return (
      <div
        key={appointment.id}
        role="button"
        tabIndex={0}
        draggable
        // Extra defense: stop pointer/mouse events from reaching the slot container.
        // This prevents the "new appointment" dialog opening when clicking an existing appointment.
        onPointerDown={stopEvent}
        onMouseDown={stopEvent}
        onDragStart={(e) => handleDragStart(e, appointment.id)}
        onClick={(e) => {
          e.stopPropagation(); // Prevent slot click from firing
          onAppointmentClick(appointment);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onAppointmentClick(appointment);
          }
        }}
        aria-label={`${appointment.title}, ${start} to ${end}, ${status.label}`}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-border/70 bg-card px-3 py-2 text-left transition-colors hover:border-border-strong hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          draggedAppointment === appointment.id && "opacity-50",
        )}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", status.dotClass)} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className={cn("truncate font-medium text-foreground", compact ? "text-xs" : "text-sm")}>
              {appointment.title}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {start}–{end}
            </span>
          </span>
          {!compact && meta && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span>
          )}
        </span>
      </div>
    );
  };

  const renderMonthView = () => (
    <div className="grid grid-cols-7 gap-1" role="grid" aria-label={headerTitle}>
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
        <div key={day} className="p-2 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {day}
        </div>
      ))}
      {days.map((day) => {
        const dayAppointments = getAppointmentsForDay(day);
        const today = isToday(day);
        const isCurrentMonth = isSameMonth(day, currentDate);
        const isWorking = isWorkingDay(day);

        return (
          <div
            key={day.toISOString()}
            role="button"
            tabIndex={isWorking ? 0 : -1}
            aria-label={`${format(day, "EEEE, MMMM d")}, ${dayAppointments.length} appointments`}
            className={cn(
              "min-h-[96px] rounded-md border border-border/60 p-1.5 transition-colors",
              !isCurrentMonth && "opacity-40",
              !isWorking && "bg-muted/30",
              isWorking && "cursor-pointer hover:bg-muted/30",
              today && "border-primary/60",
            )}
            onClick={() => isWorking && onSlotClick(day, businessHours.opening_time)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && isWorking) {
                e.preventDefault();
                onSlotClick(day, businessHours.opening_time);
              }
            }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, day, businessHours.opening_time)}
          >
            <div className="mb-1 flex items-center justify-between">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                  today ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {format(day, "d")}
              </span>
              {dayAppointments.length > 0 && (
                <span className="font-mono text-[11px] text-muted-foreground">{dayAppointments.length}</span>
              )}
            </div>
            <div className="space-y-1">
              {dayAppointments.slice(0, 3).map((a) => {
                const status = getSemanticStatus("appointment", a.status);
                return (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    onPointerDown={stopEvent}
                    onMouseDown={stopEvent}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppointmentClick(a);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onAppointmentClick(a);
                      }
                    }}
                    className="flex cursor-pointer items-center gap-1.5 rounded border border-border/50 bg-card px-1.5 py-1 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status.dotClass)} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{a.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {a.scheduled_time.slice(0, 5)}
                    </span>
                  </div>
                );
              })}
              {dayAppointments.length > 3 && (
                <div className="pl-1 text-xs text-muted-foreground">+{dayAppointments.length - 3} more</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderDayView = () => {
    const dayAppointments = getAppointmentsForDay(currentDate);
    const working = isWorkingDay(currentDate);
    const now = new Date();
    const viewingToday = isToday(currentDate);
    const nowHHMM = format(now, "HH:mm");

    return (
      <div>
        {dayAppointments.length === 0 && (
          <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-dashed border-border px-4 py-3">
            <CalendarX className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              No jobs on <span className="font-medium text-foreground">{format(currentDate, "EEEE, MMM d")}</span>
              {working ? ". Tap an open slot to book one." : " — outside business hours."}
            </p>
          </div>
        )}
        <div className="overflow-hidden rounded-lg border border-border/70">
          <div className="max-h-[640px] overflow-y-auto" role="list" aria-label={`Schedule for ${format(currentDate, "EEEE, MMMM d")}`}>
            {timeSlots.map((time) => {
              const slotAppointments = getAppointmentsForSlot(currentDate, time);
              const isHour = time.endsWith(":00");
              const isNowSlot = viewingToday && nowHHMM >= time && nowHHMM < endTime(time, 30);
              return (
                <div
                  key={time}
                  className={cn("grid grid-cols-[76px_1fr]", isHour ? "border-t border-border/70" : "border-t border-dashed border-border/40")}
                >
                  <div className="flex items-start justify-end gap-1.5 py-2 pr-3">
                    {isHour ? (
                      <span className="font-mono text-sm text-muted-foreground">{time}</span>
                    ) : (
                      <span className="mt-2 h-1 w-1 rounded-full bg-border" aria-hidden="true" />
                    )}
                    {isNowSlot && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Current time" role="img" />
                    )}
                  </div>
                  <div
                    role="button"
                    tabIndex={working ? 0 : -1}
                    aria-label={working ? `Book appointment ${format(currentDate, "MMM d")} at ${time}` : `${time}, outside business hours`}
                    aria-disabled={!working}
                    className={cn(
                      "min-h-[52px] px-2 py-1.5",
                      working ? "cursor-pointer hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" : "cursor-not-allowed bg-muted/30",
                    )}
                    onClick={() => working && onSlotClick(currentDate, time)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && working) {
                        e.preventDefault();
                        onSlotClick(currentDate, time);
                      }
                    }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, currentDate, time)}
                  >
                    {slotAppointments.length > 0 && (
                      <div className="space-y-1.5">
                        {slotAppointments.map((a) => renderAppointmentBlock(a))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
    const toWeekEvent = (a: CalendarAppointment): WeekEvent => {
      const [h, m] = a.scheduled_time.slice(0, 5).split(":").map(Number);
      const start = new Date(`${a.scheduled_date}T00:00:00`);
      start.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
      const end = new Date(start.getTime() + (a.duration_minutes || 60) * 60000);
      const dot = getSemanticStatus("appointment", a.status).dotClass;
      const palette = dot.match(/bg-([a-z]+)-500/)?.[1] ?? "gray";
      return {
        id: a.id,
        title: a.title,
        start,
        end,
        calendarColor: PALETTE_HEX[palette] ?? PALETTE_HEX.gray,
      };
    };
    const weekEvents = days.flatMap((d) => getAppointmentsForDay(d)).map(toWeekEvent);

    return (
      <div className="overflow-hidden rounded-lg border border-border/70">
        {/* Sticky day header — day names stay while hours scroll */}
        <div
          className="grid border-b border-border/70 bg-background"
          style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}
        >
          <div />
          {days.map((day) => {
            const today = isToday(day);
            const isWorking = isWorkingDay(day);
            return (
              <div
                key={day.toISOString()}
                className={cn("border-l border-border/60 px-2 py-2 text-center", !isWorking && "bg-muted/30")}
              >
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {format(day, "EEE")}
                </div>
                <div
                  className={cn(
                    "mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold",
                    today ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                >
                  {format(day, "d")}
                </div>
              </div>
            );
          })}
        </div>
        <WeekView
          weekStart={ws}
          events={weekEvents}
          onEventClick={(e) => {
            const a = appointments.find((x) => x.id === e.id);
            if (a) onAppointmentClick(a);
          }}
          onCreateEvent={(start) => onSlotClick(start, format(start, "HH:mm"))}
          onMoveEvent={(e, newStart) =>
            onDrop(e.id, format(newStart, "yyyy-MM-dd"), format(newStart, "HH:mm"))
          }
          className="h-[600px]"
        />
      </div>
    );
  };

  const renderSkeleton = () => (
    <div className="space-y-2" aria-busy="true" aria-label="Loading schedule">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
      {viewMode === "month" ? (
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border/70 p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-border/40 py-2 first:border-t-0">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-12 flex-1 rounded-md" />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderError = () => (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">Couldn&apos;t load the schedule.</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {error || "Check your connection and try again."}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dispatch calendar</p>
            <div className="mt-1.5 flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("prev")} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="min-w-[200px] text-center text-lg font-semibold tracking-tight text-foreground">
                {headerTitle}
              </h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("next")} aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDateChange(new Date())} className="ml-1">
                Today
              </Button>
            </div>
          </div>
          <div role="tablist" aria-label="Calendar view" className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-1">
            {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
              <Button
                key={mode}
                role="tab"
                aria-selected={viewMode === mode}
                variant="ghost"
                size="sm"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "gap-1.5 text-muted-foreground hover:text-foreground",
                  viewMode === mode &&
                    "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </Button>
            ))}
          </div>
        </div>
        {!isLoading && !error && (
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
            <span className="font-mono">{summary.count}</span> {summary.count === 1 ? "job" : "jobs"}
            {summary.count > 0 && (
              <>
                {" · "}
                <span className="font-mono">{formatBooked(summary.minutes)}</span> booked
              </>
            )}
            {viewMode === "week" && " this week"}
            {viewMode === "month" && " this month"}
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-1">
        {isLoading ? renderSkeleton() : error ? renderError() : viewMode === "month" ? renderMonthView() : viewMode === "week" ? renderWeekView() : renderDayView()}
      </CardContent>
    </Card>
  );
};

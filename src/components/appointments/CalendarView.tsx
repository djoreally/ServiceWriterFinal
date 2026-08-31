import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar, List, LayoutGrid } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, parseISO } from "date-fns";
import { getAppointmentStatusStyle } from "./statusStyles";

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
}

type ViewMode = "day" | "week" | "month";

export const CalendarView = ({
  appointments,
  currentDate,
  onDateChange,
  onAppointmentClick,
  onDrop,
  onSlotClick,
  businessHours,
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

  const getApptDateAndSlotTime = (a: CalendarAppointment): { dateStr: string; timeStr: string } => {
    let dateStr = a.scheduled_date ?? "";
    let timeStr = (a.scheduled_time || "").slice(0, 5);

    // If scheduled_date is missing or empty, derive from starts_at if available on raw object
    const rawStartsAt = (a as unknown as { starts_at?: string }).starts_at;
    if ((!dateStr || !timeStr) && rawStartsAt) {
      const dt = parseISO(rawStartsAt);
      if (!Number.isNaN(dt.getTime())) {
        if (!dateStr) dateStr = format(dt, "yyyy-MM-dd");
        if (!timeStr) timeStr = format(dt, "HH:mm");
      }
    }
    return { dateStr, timeStr };
  };

  const getAppointmentsForDay = (date: Date) => {
    const targetDateStr = format(date, "yyyy-MM-dd");
    return appointments.filter((a) => {
      const { dateStr } = getApptDateAndSlotTime(a);
      return dateStr === targetDateStr;
    });
  };

  const getAppointmentsForSlot = (date: Date, time: string) => {
    const targetDateStr = format(date, "yyyy-MM-dd");
    const targetTimeStr = time.slice(0, 5);
    return appointments.filter((a) => {
      const { dateStr, timeStr } = getApptDateAndSlotTime(a);
      return dateStr === targetDateStr && timeStr === targetTimeStr;
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

  const renderAppointmentCard = (appointment: CalendarAppointment, compact = false) => (
    (() => {
      const statusStyle = getAppointmentStatusStyle(appointment.status);
      return (
    <div
      key={appointment.id}
      draggable
      // Extra defense: stop pointer/mouse events from reaching the slot container.
      // This prevents the “new appointment” dialog opening when clicking an existing appointment.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDragStart={(e) => handleDragStart(e, appointment.id)}
      onClick={(e) => {
        e.stopPropagation(); // Prevent slot click from firing
        onAppointmentClick(appointment);
      }}
      className={cn(
        "cursor-pointer rounded-md border-l-4 px-2 py-1 text-xs transition-all hover:opacity-80",
        statusStyle.surfaceClass,
        draggedAppointment === appointment.id && "opacity-50",
        compact ? "truncate" : ""
      )}
    >
      <div className="font-medium truncate">{appointment.title}</div>
      {!compact && (
        <>
          <div className="text-foreground/80">{appointment.scheduled_time.slice(0, 5)}</div>
          {appointment.customer && (
            <div className="text-foreground/70 truncate">{appointment.customer.name}</div>
          )}
          {appointment.service_catalog && (
            <div className="text-foreground/70 truncate text-[10px]">{appointment.service_catalog.name}</div>
          )}
        </>
      )}
    </div>
      );
    })()
  );

  const renderMonthView = () => (
    <div className="grid grid-cols-7 gap-1">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
        <div key={day} className="text-center text-sm font-medium text-muted-foreground p-2">
          {day}
        </div>
      ))}
      {days.map(day => {
        const dayAppointments = getAppointmentsForDay(day);
        const isToday = isSameDay(day, new Date());
        const isCurrentMonth = isSameMonth(day, currentDate);
        const isWorking = isWorkingDay(day);
        
        return (
          <div
            key={day.toISOString()}
            className={cn(
              "min-h-[100px] p-1 border rounded-md",
              !isCurrentMonth && "opacity-40",
              !isWorking && "bg-muted/50",
              isToday && "ring-2 ring-primary"
            )}
            onClick={() => isWorking && onSlotClick(day, businessHours.opening_time)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, day, businessHours.opening_time)}
          >
            <div className={cn(
              "text-sm font-medium mb-1",
              isToday && "text-primary"
            )}>
              {format(day, "d")}
            </div>
            <div className="space-y-1">
              {dayAppointments.slice(0, 3).map(a => renderAppointmentCard(a, true))}
              {dayAppointments.length > 3 && (
                <div className="text-xs text-muted-foreground">
                  +{dayAppointments.length - 3} more
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderWeekDayView = () => (
    <div className="flex flex-col">
      {/* Header */}
      <div className={cn("grid border-b", viewMode === "day" ? "grid-cols-1" : "grid-cols-8")}>
        {viewMode !== "day" && <div className="w-16 shrink-0" />}
        {days.map(day => {
          const isToday = isSameDay(day, new Date());
          const isWorking = isWorkingDay(day);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex-1 text-center py-2 border-l",
                !isWorking && "bg-muted/50"
              )}
            >
              <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
              <div className={cn(
                "text-lg font-semibold",
                isToday && "bg-primary text-primary-foreground rounded-md w-8 h-8 flex items-center justify-center mx-auto"
              )}>
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="overflow-auto max-h-[600px]">
        {timeSlots.map(time => (
          <div key={time} className={cn("grid min-h-[60px]", viewMode === "day" ? "grid-cols-[64px_1fr]" : "grid-cols-8")}> 
            {/* Always render time as a fixed sidebar */}
            <div className="w-16 text-xs text-muted-foreground pr-2 text-right py-1 shrink-0 flex items-center h-full">
              {time}
            </div>
            {days.map(day => {
              const slotAppointments = getAppointmentsForSlot(day, time);
              const isWorking = isWorkingDay(day);
              return (
                <div
                  key={`${day.toISOString()}-${time}`}
                  className={cn(
                    "border-l border-t p-1 min-h-[60px] cursor-pointer hover:bg-muted/50 transition-colors",
                    !isWorking && "bg-muted/30 cursor-not-allowed"
                  )}
                  onClick={() => isWorking && onSlotClick(day, time)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, day, time)}
                >
                  {slotAppointments.map(a => renderAppointmentCard(a))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate("prev")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-lg">
              {viewMode === "day" && format(currentDate, "EEEE, MMMM d, yyyy")}
              {viewMode === "week" && `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "MMM d")} - ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), "MMM d, yyyy")}`}
              {viewMode === "month" && format(currentDate, "MMMM yyyy")}
            </CardTitle>
            <Button variant="outline" size="icon" onClick={() => navigate("next")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDateChange(new Date())}
            >
              Today
            </Button>
          </div>
          <div className="flex items-center gap-1 border rounded-md p-1">
            <Button
              variant={viewMode === "day" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("day")}
            >
              <List className="h-4 w-4 mr-1" />
              Day
            </Button>
            <Button
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("week")}
            >
              <LayoutGrid className="h-4 w-4 mr-1" />
              Week
            </Button>
            <Button
              variant={viewMode === "month" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("month")}
            >
              <Calendar className="h-4 w-4 mr-1" />
              Month
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        {viewMode === "month" ? renderMonthView() : renderWeekDayView()}
      </CardContent>
    </Card>
  );
};

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, Users, AlertTriangle, CheckCircle } from "lucide-react";
import { format, parseISO, parse, addMinutes, isBefore, isAfter } from "date-fns";

interface Appointment {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
}

interface TimeSlotManagerProps {
  appointments: Appointment[];
  selectedDate: Date;
  businessHours: {
    opening_time: string;
    closing_time: string;
    working_days: string[];
  };
  onSlotSelect: (time: string) => void;
}

interface TimeSlot {
  time: string;
  available: boolean;
  appointments: Appointment[];
  conflictCount: number;
}

export const TimeSlotManager = ({
  appointments,
  selectedDate,
  businessHours,
  onSlotSelect,
}: TimeSlotManagerProps) => {
  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const dayName = format(selectedDate, "EEEE");
  const isWorkingDay = businessHours.working_days.includes(dayName);

  const timeSlots = useMemo((): TimeSlot[] => {
    if (!isWorkingDay) return [];

    const slots: TimeSlot[] = [];
    const openTime = parse(businessHours.opening_time, "HH:mm", new Date());
    const closeTime = parse(businessHours.closing_time, "HH:mm", new Date());
    const dayAppointments = appointments.filter(a => a.scheduled_date === dateStr && a.status !== "cancelled");

    let current = openTime;
    while (isBefore(current, closeTime)) {
      const timeStr = format(current, "HH:mm");
      const slotStart = current;
      const slotEnd = addMinutes(current, 30);

      // Check for overlapping appointments
      const overlapping = dayAppointments.filter(a => {
        const apptStart = parse(a.scheduled_time.slice(0, 5), "HH:mm", new Date());
        const apptEnd = addMinutes(apptStart, a.duration_minutes);
        return (
          (isBefore(slotStart, apptEnd) && isAfter(slotEnd, apptStart)) ||
          (format(apptStart, "HH:mm") === timeStr)
        );
      });

      slots.push({
        time: timeStr,
        available: overlapping.length === 0,
        appointments: overlapping,
        conflictCount: overlapping.length > 1 ? overlapping.length - 1 : 0,
      });

      current = addMinutes(current, 30);
    }

    return slots;
  }, [appointments, dateStr, businessHours, isWorkingDay]);

  const stats = useMemo(() => {
    const total = timeSlots.length;
    const available = timeSlots.filter(s => s.available).length;
    const booked = timeSlots.filter(s => !s.available).length;
    const conflicts = timeSlots.filter(s => s.conflictCount > 0).length;
    return { total, available, booked, conflicts };
  }, [timeSlots]);

  if (!isWorkingDay) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Time Slots</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
            <p>{dayName} is not a working day</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Time Slots - {format(selectedDate, "MMM d")}
          </span>
        </CardTitle>
        <div className="flex gap-2 text-xs">
          <Badge variant="outline" className="gap-1">
            <CheckCircle className="h-3 w-3 text-gray-500" />
            {stats.available} Available
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Users className="h-3 w-3 text-blue-500" />
            {stats.booked} Booked
          </Badge>
          {stats.conflicts > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {stats.conflicts} Conflicts
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-1 max-h-[400px] overflow-y-auto">
          {timeSlots.map(slot => (
            <button
              key={slot.time}
              onClick={() => slot.available && onSlotSelect(slot.time)}
              className={cn(
                "p-2 rounded-md text-xs font-medium transition-all",
                slot.available
                  ? "bg-gray-500/10 text-gray-700 hover:bg-gray-500/20 cursor-pointer dark:text-gray-400"
                  : "bg-muted text-muted-foreground cursor-default",
                slot.conflictCount > 0 && "bg-red-500/10 text-red-700 ring-1 ring-red-500/50 dark:text-red-400"
              )}
              disabled={!slot.available}
            >
              <div>{slot.time}</div>
              {slot.appointments.length > 0 && (
                <div className="text-[10px] truncate">
                  {slot.appointments[0]?.status === "cancelled" ? "Cancelled" : "Booked"}
                </div>
              )}
              {slot.conflictCount > 0 && (
                <div className="text-[10px] text-red-600">
                  +{slot.conflictCount} conflict
                </div>
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

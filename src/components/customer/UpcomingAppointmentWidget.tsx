import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, Sparkles } from "lucide-react";
import { format, parseISO, differenceInDays, differenceInHours } from "date-fns";
import { AppointmentStatusTimeline } from "./AppointmentStatusTimeline";
import type { CustomerAppointment } from "./CustomerAppointmentsTab";

interface Props {
  appointment: CustomerAppointment & {
    created_at?: string | null;
    assigned_at?: string | null;
    actual_start_time?: string | null;
    actual_end_time?: string | null;
  };
}

function relativeLabel(date: Date): string {
  const now = new Date();
  const days = differenceInDays(date, now);
  const hours = differenceInHours(date, now);
  if (days >= 2) return `In ${days} days`;
  if (days === 1) return "Tomorrow";
  if (days === 0 && hours > 0) return `In ${hours}h`;
  if (days === 0 && hours <= 0) return "Today";
  return format(date, "MMM d");
}

export function UpcomingAppointmentWidget({ appointment }: Props) {
  const apptDate = parseISO(
    `${appointment.scheduled_date}T${appointment.scheduled_time}`,
  );

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-primary/15 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Next Appointment
              </p>
              <h3 className="font-semibold text-base leading-tight">
                {appointment.service_catalog?.name || appointment.title}
              </h3>
            </div>
          </div>
          <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/20 whitespace-nowrap">
            {relativeLabel(apptDate)}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">{format(apptDate, "EEE, MMM d, yyyy")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <span>
              {format(apptDate, "h:mm a")}
              {appointment.duration_minutes > 0 &&
                ` · ${appointment.duration_minutes} min`}
            </span>
          </div>
          {appointment.location_address && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="truncate">{appointment.location_address}</span>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-border/50">
          <AppointmentStatusTimeline
            status={appointment.status}
            createdAt={appointment.created_at}
            assignedAt={appointment.assigned_at}
            actualStartTime={appointment.actual_start_time}
            actualEndTime={appointment.actual_end_time}
          />
        </div>
      </CardContent>
    </Card>
  );
}

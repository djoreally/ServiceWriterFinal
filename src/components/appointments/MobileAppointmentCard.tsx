import { memo } from "react";
import type { Appointment } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResponsiveRecord } from "@/components/data-table/ResponsiveRecord";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  MoreVertical,
} from "lucide-react";
import { getAppointmentStatusStyle } from "./statusStyles";
import { formatTimeLabel } from "@/lib/datetime";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppointmentWithSource extends Appointment {
  source?: "manual" | "online_booking" | "ai_intake" | string;
}

interface MobileAppointmentCardProps {
  appointment: AppointmentWithSource;
  onClick: (appointment: Appointment) => void;
  onComplete?: (appointment: Appointment) => void;
  onStatusChange?: (appointment: Appointment, status: string) => void;
}

function shortDate(value?: string | null): string {
  if (!value) return "Date unavailable";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed);
}

export const MobileAppointmentCard = memo(function MobileAppointmentCard({
  appointment,
  onClick,
  onComplete,
  onStatusChange,
}: MobileAppointmentCardProps) {
  const customerName = appointment.customer?.name || appointment.guest_name || "Customer";
  const vehicleName = appointment.vehicle
    ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
    : "Vehicle not specified";
  const serviceTitle = appointment.service_catalog?.name || appointment.title || "Service appointment";
  const statusStyle = getAppointmentStatusStyle(appointment.status);
  const canChangeStatus = appointment.status !== "completed" && appointment.status !== "cancelled";
  const time = formatTimeLabel(appointment.scheduled_time, "h:mm a", "--");

  const actions = canChangeStatus && (onComplete || onStatusChange) ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Appointment actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onComplete ? (
          <DropdownMenuItem onClick={() => onComplete(appointment)} className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Mark complete
          </DropdownMenuItem>
        ) : null}
        {onStatusChange ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onStatusChange(appointment, "confirmed")}>
              Confirm
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStatusChange(appointment, "in_progress")}>
              Start service
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onStatusChange(appointment, "cancelled")}
              className="text-destructive"
            >
              Cancel
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <ResponsiveRecord
      primary={customerName}
      secondary={vehicleName}
      slot={time}
      status={
        <Badge className={cn("capitalize text-xs", statusStyle.badgeClass)}>
          {appointment.status.replaceAll("_", " ")}
        </Badge>
      }
      meta={
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">{serviceTitle}</span>
          <span aria-hidden="true">·</span>
          <span>Scheduled {shortDate(appointment.scheduled_date)}</span>
          <span aria-hidden="true">·</span>
          <span>{appointment.duration_minutes ?? 60} min</span>
        </div>
      }
      details={[
        { label: "Customer", value: customerName },
        { label: "Vehicle", value: vehicleName },
        { label: "Service", value: serviceTitle },
        { label: "Scheduled", value: `${shortDate(appointment.scheduled_date)} at ${time}` },
        { label: "Duration", value: `${appointment.duration_minutes ?? 60} min` },
        { label: "Source", value: appointment.source?.replaceAll("_", " ") || "Staff" },
        ...(appointment.guest_phone ? [{ label: "Phone", value: appointment.guest_phone }] : []),
        ...(appointment.guest_email ? [{ label: "Email", value: appointment.guest_email }] : []),
        ...(appointment.location_address ? [{ label: "Location", value: appointment.location_address }] : []),
        ...(appointment.notes ? [{ label: "Notes", value: appointment.notes }] : []),
      ]}
      actions={actions}
      onOpen={() => onClick(appointment)}
      className={cn("transition-colors hover:border-primary/40", statusStyle.surfaceClass)}
      revealLabel="Appointment details"
    />
  );
});

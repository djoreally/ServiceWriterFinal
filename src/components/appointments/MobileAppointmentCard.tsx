import { memo, useRef } from "react";
import { Appointment } from "@/shared/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { User, Car, Clock, DollarSign, CheckCircle, MoreVertical, Bot } from "lucide-react";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { formatMoney } from "@/lib/financialMath";
import { computeAppointmentTotal } from "@/lib/appointmentTotal";
import { useFeeSettings } from "@/hooks/useFeeSettings";
import { getAppointmentStatusStyle } from "./statusStyles";
import { formatTimeLabel } from "@/lib/datetime";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface AppointmentWithSource extends Appointment {
  source?: 'manual' | 'online_booking' | 'ai_intake' | string;
}

interface MobileAppointmentCardProps {
  appointment: AppointmentWithSource;
  onClick: (appointment: Appointment) => void;
  onComplete?: (appointment: Appointment) => void;
  onStatusChange?: (appointment: Appointment, status: string) => void;
}

export const MobileAppointmentCard = memo(function MobileAppointmentCard({ appointment, onClick, onComplete, onStatusChange }: MobileAppointmentCardProps) {
  const { feeSettings } = useFeeSettings();
  const totalDue = computeAppointmentTotal(appointment, feeSettings);
  const appointmentVehicles = Array.isArray((appointment as Appointment & { vehicles?: Appointment['vehicle'][] }).vehicles)
    ? ((appointment as Appointment & { vehicles?: Appointment['vehicle'][] }).vehicles ?? []).filter(Boolean)
    : appointment.vehicle ? [appointment.vehicle] : [];
  const vehicleNames = appointmentVehicles.map((vehicle) => `${vehicle!.year} ${vehicle!.make} ${vehicle!.model}`);
  const vehicleName = vehicleNames[0] || 'Vehicle not specified';
  const customerName = appointment.customer?.name || appointment.guest_name || 'Customer';
  const serviceTitle = appointment.service_catalog?.name || appointment.title;
  const engine = (appointment.vehicle as (Appointment['vehicle'] & { engine?: string }) | undefined)?.engine;
  const canComplete = appointment.status !== 'completed' && appointment.status !== 'cancelled';
  const canChangeStatus = appointment.status !== 'completed' && appointment.status !== 'cancelled';

  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onComplete?.(appointment);
  };

  const statusStyle = getAppointmentStatusStyle(appointment.status);
  const lastTouchTapRef = useRef(0);

  const handleCardOpen = () => {
    const coarsePointer = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (!coarsePointer) {
      onClick(appointment);
      return;
    }
    const now = Date.now();
    if (now - lastTouchTapRef.current <= 360) {
      lastTouchTapRef.current = 0;
      onClick(appointment);
      return;
    }
    lastTouchTapRef.current = now;
  };

  return (
    <Card
      className={cn("backdrop-blur-sm hover:border-primary/40 transition-all cursor-pointer", statusStyle.surfaceClass)}
      onClick={handleCardOpen}
      style={{ touchAction: "manipulation" }}
      aria-label={`${serviceTitle}. Double tap to open appointment details.`}
    >
      <CardContent className="p-4">
        <div className="flex min-w-0 gap-3 sm:gap-4">
          <div className="min-w-0 flex-1 flex flex-col">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <p className="text-xl font-bold tracking-wider">
                {formatTimeLabel(appointment.scheduled_time, "h:mm a", "Time unavailable")}
              </p>
              <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
                {appointment.source === 'ai_intake' && (
                  <Badge variant="outline" className="gap-1 text-xs bg-primary/10 text-primary border-primary/30">
                    <Bot className="h-3 w-3" />AI
                  </Badge>
                )}
                <Badge className={cn("capitalize text-xs font-medium", statusStyle.badgeClass)}>
                  {appointment.status.replace('_', ' ')}
                </Badge>
                {canChangeStatus && (onComplete || onStatusChange) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Appointment actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canComplete && onComplete && (
                        <DropdownMenuItem onClick={handleComplete} className="gap-2 text-gray-600">
                          <CheckCircle className="h-4 w-4" />Mark Complete
                        </DropdownMenuItem>
                      )}
                      {onStatusChange && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange?.(appointment, 'confirmed'); }} disabled={appointment.status === 'confirmed'}>
                            {appointment.status === 'pending' ? 'Approve' : 'Confirm'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange?.(appointment, 'in_progress'); }} disabled={appointment.status === 'in_progress'}>
                            Start Service
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onStatusChange?.(appointment, 'cancelled'); }} disabled={appointment.status === 'cancelled'} className="text-destructive">
                            Cancel
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            <p className="text-lg font-semibold text-card-foreground mt-1">{serviceTitle}</p>

            <div className="text-sm text-muted-foreground mt-2 space-y-1">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span className="truncate">{customerName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4" />
                <span className="min-w-0">{vehicleNames.length > 0 ? vehicleNames.join(" • ") : vehicleName}{engine ? ` · ${engine}` : ''}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border/20 pt-3 mt-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4 text-primary" />
            <span>{appointment.duration_minutes} min</span>
          </div>
          <div className="flex items-center justify-end gap-1 font-semibold text-card-foreground">
            <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">Due</span>
            <DollarSign className="w-4 h-4 text-primary/80" />
            <span>{totalDue > 0 ? formatMoney(totalDue) : '--'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

import { memo } from "react";
import { Appointment } from "@/shared/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { User, Car, Wrench, Clock, DollarSign, CheckCircle, MoreVertical, Bot } from "lucide-react";
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

// Extended appointment type with source field
interface AppointmentWithSource extends Appointment {
  source?: 'manual' | 'online_booking' | 'ai_intake' | string;
}

interface MobileAppointmentCardProps {
  appointment: AppointmentWithSource;
  onClick: (appointment: Appointment) => void;
  onComplete?: (appointment: Appointment) => void;
  onStatusChange?: (appointment: Appointment, status: string) => void;
}

// Placeholder function to get a random vehicle image
const getVehicleImage = (vehicleModel?: string) => {
  // In a real app, you would have a mapping or fetch this URL
  // For now, we use a placeholder service with keywords
  const keywords = vehicleModel ? vehicleModel.split(' ').join(',') : 'car';
  return `https://source.unsplash.com/random/400x300/?${keywords}`;
};

// ⚡ Performance: Memoized to prevent re-renders in virtualized lists
export const MobileAppointmentCard = memo(function MobileAppointmentCard({ appointment, onClick, onComplete, onStatusChange }: MobileAppointmentCardProps) {
  const { formatTime } = useRegionalSettings();
  const { feeSettings } = useFeeSettings();
  const totalDue = computeAppointmentTotal(appointment, feeSettings);
  const vehicleName = appointment.vehicle ? `${appointment.vehicle.year} ${appointment.vehicle.make} ${appointment.vehicle.model}` : 'Vehicle not specified';
  const customerName = appointment.customer?.name || appointment.guest_name || 'Customer';

  // Fallback to title if service name is not present
  const serviceTitle = appointment.service_catalog?.name || appointment.title;
  
  const canComplete = appointment.status !== 'completed' && appointment.status !== 'cancelled';
  // ⚡ Performance: Skip rendering entire dropdown for terminal statuses
  const canChangeStatus = appointment.status !== 'completed' && appointment.status !== 'cancelled';
  
  const handleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onComplete?.(appointment);
  };
  
  const handleStatusChange = (e: Event, status: string) => {
    e.stopPropagation();
    onStatusChange?.(appointment, status);
  };

  const statusStyle = getAppointmentStatusStyle(appointment.status);

  return (
    <Card 
      className={cn(
        "backdrop-blur-sm hover:border-primary/40 transition-all cursor-pointer",
        statusStyle.surfaceClass,
      )}
      onClick={() => onClick(appointment)}
    >
      <CardContent className="p-4">
        <div className="flex min-w-0 gap-3 sm:gap-4">
          {/* Left Side: Details */}
          <div className="min-w-0 flex-1 flex flex-col">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <p className="text-xl font-bold tracking-wider">
                {formatTimeLabel(appointment.scheduled_time, "h:mm a", "Time unavailable")}
              </p>
              <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
                {appointment.source === 'ai_intake' && (
                  <Badge variant="outline" className="gap-1 text-xs bg-primary/10 text-primary border-primary/30">
                    <Bot className="h-3 w-3" />
                    AI
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
                          <CheckCircle className="h-4 w-4" />
                          Mark Complete
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
                <span className="truncate">{vehicleName}</span>
              </div>
            </div>
          </div>

          {/* Right Side: Image */}
          <div className="hidden h-24 w-24 shrink-0 overflow-hidden rounded-lg sm:block">
             <img 
              src={`https://source.unsplash.com/400x300/?${appointment.vehicle?.make || 'car'},${appointment.vehicle?.model || ''}`}
              alt={vehicleName}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-sm text-muted-foreground border-t border-border/20 pt-3 mt-4">
            <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-primary" />
                <span>Maintenance</span>
            </div>
            <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span>{appointment.duration_minutes}m</span>
            </div>
            <div className="flex items-center gap-1 font-semibold text-base text-card-foreground">
                 <DollarSign className="w-4 h-4 text-primary/80" />
                <span>{totalDue > 0 ? formatMoney(totalDue) : '--'}</span>
            </div>
        </div>
      </CardContent>
    </Card>
  );
});

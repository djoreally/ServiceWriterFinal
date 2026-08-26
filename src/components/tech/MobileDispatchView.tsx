/**
 * Mobile Dispatch View — Enterprise status transitions for technicians
 * 
 * Provides status buttons for the appointment workflow:
 * assigned → en_route → arrived → in_progress → completed
 * 
 * Integrates with real-time dispatch sync and location services
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Navigation, MapPin, Play, CheckCircle2, Clock, Loader2,
  AlertTriangle, Users, Phone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealTimeTechStatus } from '@/hooks/useRealTimeTechStatus';
import { format } from 'date-fns';
import { formatTimeLabel, formatDateLabel } from "@/lib/datetime";
import { toast } from '@/components/ui/sonner';

interface MobileDispatchViewProps {
  appointment: {
    id: string;
    dispatch_status: string;
    scheduled_time: string;
    guest_name: string | null;
    guest_phone: string | null;
    location_address: string | null;
    customer?: { name: string };
    service_catalog?: { name: string };
  };
  technician_id: string;
  onStatusChange?: () => void;
}

const STATUS_CONFIG: Record<string, {
  label: string;
  color: string;
  icon: typeof Clock;
  nextAction: string | null;
  nextIcon: typeof Navigation | null;
}> = {
  assigned: {
    label: 'SCHEDULED',
    color: 'bg-muted text-muted-foreground',
    icon: Clock,
    nextAction: 'Mark En Route',
    nextIcon: Navigation,
  },
  en_route: {
    label: 'EN ROUTE', 
    color: 'bg-primary/10 text-primary border-primary/30',
    icon: Navigation,
    nextAction: 'Mark Arrived',
    nextIcon: MapPin,
  },
  arrived: {
    label: 'ARRIVED',
    color: 'bg-primary/10 text-primary border-primary/30',
    icon: MapPin,
    nextAction: 'Start Job',
    nextIcon: Play,
  },
  in_progress: {
    label: 'IN PROGRESS',
    color: 'bg-primary/10 text-primary border-primary/30',
    icon: Play,
    nextAction: 'View Details',
    nextIcon: CheckCircle2,
  },
  completed: {
    label: 'COMPLETED',
    color: 'bg-primary/10 text-primary border-primary/30',
    icon: CheckCircle2,
    nextAction: null,
    nextIcon: null,
  },
};

export function MobileDispatchView({ 
  appointment, 
  technician_id, 
  onStatusChange 
}: MobileDispatchViewProps) {
  const [transitioning, setTransitioning] = useState(false);
  const { 
    transitionToEnRoute, 
    transitionToArrived, 
    transitionToInProgress 
  } = useRealTimeTechStatus(technician_id);

  const statusKey = appointment.dispatch_status as keyof typeof STATUS_CONFIG;
  const status = STATUS_CONFIG[statusKey] || STATUS_CONFIG.assigned;
  const customerName = appointment.customer?.name || appointment.guest_name || 'Customer';

  const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
        reject,
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const handleStatusTransition = async () => {
    if (transitioning) return;
    
    setTransitioning(true);
    try {
      let location: { lat: number; lng: number } | undefined;
      
      // Get location for location-dependent transitions
      if (['assigned', 'en_route'].includes(appointment.dispatch_status)) {
        try {
          location = await getCurrentLocation();
        } catch (err) {
          console.warn('Location access denied, proceeding without location');
        }
      }

      switch (appointment.dispatch_status) {
        case 'assigned':
          await transitionToEnRoute(appointment.id, location);
          break;
        case 'en_route':
          await transitionToArrived(appointment.id, location);
          break;
        case 'arrived':
          await transitionToInProgress(appointment.id);
          break;
      }

      onStatusChange?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update status');
    } finally {
      setTransitioning(false);
    }
  };

  const openNavigation = () => {
    if (appointment.location_address) {
      const encoded = encodeURIComponent(appointment.location_address);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}`, '_blank');
    }
  };

  const callCustomer = () => {
    if (appointment.guest_phone) {
      window.open(`tel:${appointment.guest_phone}`);
    }
  };

  return (
    <Card className={cn('border-l-4', {
      'border-l-muted': appointment.dispatch_status === 'assigned',
      'border-l-blue-500': appointment.dispatch_status === 'en_route',
      'border-l-primary': appointment.dispatch_status === 'arrived',
      'border-l-amber-500': appointment.dispatch_status === 'in_progress',
      'border-l-green-500': appointment.dispatch_status === 'completed',
    })}>
      <CardContent className="p-4">
        {/* Job header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">
                {formatTimeLabel(appointment.scheduled_time, 'h:mm a')}
              </span>
              <Badge variant="outline" className={status.color}>
                <status.icon className="h-3 w-3 mr-1" />
                {status.label}
              </Badge>
            </div>
            <h3 className="font-semibold">{customerName}</h3>
            <p className="text-sm text-muted-foreground">
              {appointment.service_catalog?.name || 'Service'}
            </p>
          </div>
        </div>

        {/* Location */}
        {appointment.location_address && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <MapPin className="h-4 w-4" />
            <span className="flex-1 truncate">{appointment.location_address}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {/* Primary status transition */}
          {status.nextAction && appointment.dispatch_status !== 'completed' && (
            <Button
              className="flex-1"
              onClick={handleStatusTransition}
              disabled={transitioning}
            >
              {transitioning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <status.nextIcon className="h-4 w-4 mr-2" />
              )}
              {status.nextAction}
            </Button>
          )}

          {/* Navigation button */}
          {appointment.location_address && ['assigned', 'en_route'].includes(appointment.dispatch_status) && (
            <Button variant="outline" size="icon" onClick={openNavigation}>
              <Navigation className="h-4 w-4" />
            </Button>
          )}

          {/* Customer contact */}
          {appointment.guest_phone && (
            <Button variant="outline" size="icon" onClick={callCustomer}>
              <Phone className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Enterprise status indicators */}
        {appointment.dispatch_status === 'in_progress' && (
          <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-primary">
              <Play className="h-4 w-4" />
              <span className="font-medium">Job Active</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Use appointment detail to complete service and create work order
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
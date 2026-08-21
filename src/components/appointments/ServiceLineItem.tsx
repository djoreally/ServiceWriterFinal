import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Edit2 } from "lucide-react";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";

export interface AppointmentService {
  id: string;
  appointment_id: string;
  service_catalog_id: string | null;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  is_prepaid: boolean;
  added_at_service: boolean;
  created_at: string;
}

interface ServiceLineItemProps {
  service: AppointmentService;
  onEdit?: (service: AppointmentService) => void;
  onRemove?: (serviceId: string) => void;
  readOnly?: boolean;
}

// ⚡ Performance: Memoized to prevent re-renders in appointment service lists
export const ServiceLineItem = memo(function ServiceLineItem({ service, onEdit, onRemove, readOnly = false }: ServiceLineItemProps) {
  const { formatCurrency } = useRegionalSettings();
  const lineTotal = service.price * service.quantity;

  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium truncate">{service.name}</p>
          {service.is_prepaid && (
            <Badge variant="secondary" className="bg-gray-500/10 text-gray-600 border-gray-500/30 text-xs">
              Prepaid
            </Badge>
          )}
          {service.added_at_service && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs">
              Added at Service
            </Badge>
          )}
        </div>
        {service.description && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{service.description}</p>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          {service.quantity > 1 ? `${service.quantity} × ` : ""}{formatCurrency(service.price)}
        </p>
      </div>
      
      <div className="flex items-center gap-2">
        <p className="font-semibold whitespace-nowrap">{formatCurrency(lineTotal)}</p>
        {!readOnly && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(service)}>
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
            {onRemove && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onRemove(service.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

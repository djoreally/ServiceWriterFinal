import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plus, Wrench, Loader2 } from "lucide-react";
import {
  fetchAppointmentServices,
  type CatalogServiceInfo,
} from "@/application/queries/appointment-services.query";
import type { CanonicalAppointmentFinancials } from "@/application/queries/appointment-detail.query";
import { removeAppointmentService } from "@/application/commands/appointment-services.command";
import { toast } from "@/components/ui/sonner";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { useTerminology } from "@/contexts/TerminologyContext";
import { ServiceLineItem, type AppointmentService } from "./ServiceLineItem";
import { AddServiceDialog } from "./AddServiceDialog";

// FeeSettings imported from application layer

interface AppointmentServicesListProps {
  appointmentId: string;
  appointmentStatus: string;
  serviceCatalogId?: string | null;
  isPrepaid?: boolean;
  canonicalFinancials?: CanonicalAppointmentFinancials | null;
  onChanged?: () => void;
}

// CatalogServiceInfo imported from application layer

export function AppointmentServicesList({
  appointmentId,
  appointmentStatus,
  serviceCatalogId,
  isPrepaid = false,
  canonicalFinancials = null,
  onChanged,
}: AppointmentServicesListProps) {
  const { formatCurrency } = useRegionalSettings();
  const { terms } = useTerminology();
  const [services, setServices] = useState<AppointmentService[]>([]);
  const [catalogService, setCatalogService] = useState<CatalogServiceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingService, setEditingService] = useState<AppointmentService | null>(null);

  const isReadOnly = appointmentStatus === "completed" || appointmentStatus === "cancelled";

  const fetchServices = useCallback(async () => {
    setLoading(true);
    
    const result = await fetchAppointmentServices(appointmentId, serviceCatalogId);
    setServices(result.services as unknown as AppointmentService[]);
    if (result.catalogService) setCatalogService(result.catalogService);
    
    setLoading(false);
  }, [appointmentId, serviceCatalogId]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchServices());
  }, [fetchServices]);

  const handleServiceAdded = (service: AppointmentService) => {
    const existingIndex = services.findIndex(s => s.id === service.id);
    let updatedServices: AppointmentService[];
    
    if (existingIndex >= 0) {
      updatedServices = [...services];
      updatedServices[existingIndex] = service;
      toast.success("Service updated");
    } else {
      updatedServices = [...services, service];
      toast.success("Service added");
    }
    
    setServices(updatedServices);
    onChanged?.();
    setEditingService(null);
    setCatalogService(null);
  };

  const handleRemoveService = async (serviceId: string) => {
    if (!confirm("Remove this service?")) return;

    try {
      await removeAppointmentService(serviceId);
      const updatedServices = services.filter(s => s.id !== serviceId);
      setServices(updatedServices);
      onChanged?.();
      toast.success("Service removed");
    } catch {
      toast.error("Failed to remove service");
    }
  };

  const handleEditService = (service: AppointmentService) => {
    setEditingService(service);
    setShowAddDialog(true);
  };

  const hasServices = services.length > 0;
  const showCatalogService = !hasServices && !loading && catalogService;
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            {terms.service} Details
          </CardTitle>
          {!isReadOnly && (
            <Button size="sm" onClick={() => setShowAddDialog(true)} className="gap-1">
              <Plus className="h-4 w-4" />
              Add {terms.service}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {showCatalogService ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 rounded-lg bg-muted/30 p-3">
                <div className="space-y-1">
                  <p className="font-medium">{catalogService.name}</p>
                  {catalogService.description && (
                    <p className="text-sm text-muted-foreground">{catalogService.description}</p>
                  )}
                </div>
                <span className="text-sm font-medium text-destructive">Commercial line missing</span>
              </div>
              <p className="text-sm text-destructive">
                This appointment has a service selection but no persisted commercial line. It is not financially certified.
              </p>
            </div>
          ) : hasServices ? (
            <div className="space-y-2">
              {services.map(service => (
                <ServiceLineItem
                  key={service.id}
                  service={service}
                  onEdit={!isReadOnly ? handleEditService : undefined}
                  onRemove={!isReadOnly ? handleRemoveService : undefined}
                  readOnly={isReadOnly}
                />
              ))}
              
              <Separator className="my-4" />
              {canonicalFinancials ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Canonical subtotal</span>
                    <span>{formatCurrency(canonicalFinancials.subtotal)}</span>
                  </div>
                  {canonicalFinancials.tax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span>{formatCurrency(canonicalFinancials.tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 text-lg font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(canonicalFinancials.total)}</span>
                  </div>
                  {!canonicalFinancials.integrity.subtotal_matches_lines || !canonicalFinancials.integrity.total_matches_header ? (
                    <p className="text-sm font-medium text-destructive">Financial integrity check failed for this invoice.</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-destructive">Canonical financial record unavailable.</p>
              )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No services added yet</p>
              {!isReadOnly && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add First {terms.service}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AddServiceDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) setEditingService(null);
        }}
        appointmentId={appointmentId}
        onServiceAdded={handleServiceAdded}
        editService={editingService}
        isPrepaidAppointment={isPrepaid}
      />
    </>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Wrench, Loader2 } from "lucide-react";
import {
  fetchAppointmentServices,
  type CatalogServiceInfo,
} from "@/application/queries/appointment-services.query";
import { removeAppointmentService } from "@/application/commands/appointment-services.command";
import { toast } from "@/components/ui/sonner";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { useTerminology } from "@/contexts/TerminologyContext";
import { ServiceLineItem, type AppointmentService } from "./ServiceLineItem";
import { AddServiceDialog } from "./AddServiceDialog";

interface AppointmentServicesListProps {
  appointmentId: string;
  appointmentStatus: string;
  estimatedCost: number | null;
  taxAmount: number | null;
  serviceCatalogId?: string | null;
  isPrepaid?: boolean;
  onTotalChange?: (subtotal: number, serviceCount: number) => void;
}

/**
 * Service editor only. Pricing totals and fees intentionally live in the
 * appointment financial summary so the page has one authoritative math block.
 */
export function AppointmentServicesList({
  appointmentId,
  appointmentStatus,
  estimatedCost,
  serviceCatalogId,
  isPrepaid = false,
  onTotalChange,
}: AppointmentServicesListProps) {
  const { formatCurrency } = useRegionalSettings();
  const { terms } = useTerminology();
  const [services, setServices] = useState<AppointmentService[]>([]);
  const [catalogService, setCatalogService] = useState<CatalogServiceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingService, setEditingService] = useState<AppointmentService | null>(null);

  const isReadOnly = appointmentStatus === "completed" || appointmentStatus === "cancelled";

  const calculateTotals = useCallback((serviceList: AppointmentService[]) => {
    const subtotal = serviceList.reduce((sum, service) => sum + service.price * service.quantity, 0);
    onTotalChange?.(subtotal, serviceList.length);
  }, [onTotalChange]);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    const result = await fetchAppointmentServices(appointmentId, serviceCatalogId);
    const nextServices = result.services as unknown as AppointmentService[];
    setServices(nextServices);
    calculateTotals(nextServices);
    setCatalogService(result.catalogService ?? null);
    setLoading(false);
  }, [appointmentId, serviceCatalogId, calculateTotals]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchServices());
  }, [fetchServices]);

  const handleServiceAdded = (service: AppointmentService) => {
    const existingIndex = services.findIndex((item) => item.id === service.id);
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
    calculateTotals(updatedServices);
    setEditingService(null);
    setCatalogService(null);
  };

  const handleRemoveService = async (serviceId: string) => {
    if (!confirm("Remove this service?")) return;

    try {
      await removeAppointmentService(serviceId);
      const updatedServices = services.filter((service) => service.id !== serviceId);
      setServices(updatedServices);
      calculateTotals(updatedServices);
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
            <div className="flex items-start justify-between gap-4 rounded-lg bg-muted/30 p-3">
              <div className="space-y-1">
                <p className="font-medium">{catalogService.name}</p>
                {catalogService.description && (
                  <p className="text-sm text-muted-foreground">{catalogService.description}</p>
                )}
              </div>
              <span className="shrink-0 font-semibold">
                {formatCurrency(estimatedCost || catalogService.default_price)}
              </span>
            </div>
          ) : hasServices ? (
            <div className="space-y-2">
              {services.map((service) => (
                <ServiceLineItem
                  key={service.id}
                  service={service}
                  onEdit={!isReadOnly ? handleEditService : undefined}
                  onRemove={!isReadOnly ? handleRemoveService : undefined}
                  readOnly={isReadOnly}
                />
              ))}
              <p className="pt-2 text-xs text-muted-foreground">
                Fees, tax, discounts, and the final amount due are shown once in Financial Summary.
              </p>
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

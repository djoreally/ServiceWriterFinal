import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plus, Wrench, Loader2 } from "lucide-react";
import {
  fetchAppointmentServices,
  fetchFeeSettings,
  type FeeSettings,
  type CatalogServiceInfo,
} from "@/application/queries/appointment-services.query";
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
  estimatedCost: number | null;
  taxAmount: number | null;
  serviceCatalogId?: string | null;
  isPrepaid?: boolean;
  onTotalChange?: (subtotal: number, serviceCount: number) => void;
}

// CatalogServiceInfo imported from application layer

// ⚡ Use centralized financial math with banker's rounding
import { computeFees as computeFeesStandard } from "@/lib/financialMath";
function computeFees(feeSettings: FeeSettings | null, subtotal: number) {
  const result = computeFeesStandard(feeSettings, subtotal);
  return { wasteOilFee: result.wasteOilFee, shopFee: result.shopFee, surcharge: result.surcharge };
}

export function AppointmentServicesList({
  appointmentId,
  appointmentStatus,
  estimatedCost,
  taxAmount,
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
  const [feeSettings, setFeeSettings] = useState<FeeSettings | null>(null);

  const isReadOnly = appointmentStatus === "completed" || appointmentStatus === "cancelled";

  const calculateTotals = useCallback((serviceList: AppointmentService[]) => {
    const subtotal = serviceList.reduce((sum, s) => sum + s.price * s.quantity, 0);
    onTotalChange?.(subtotal, serviceList.length);
  }, [onTotalChange]);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    
    const result = await fetchAppointmentServices(appointmentId, serviceCatalogId);
    setServices(result.services as unknown as AppointmentService[]);
    calculateTotals(result.services as unknown as AppointmentService[]);
    if (result.catalogService) setCatalogService(result.catalogService);
    
    setLoading(false);
  }, [appointmentId, serviceCatalogId, calculateTotals]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // Fetch business profile fee settings
  useEffect(() => {
    const loadFees = async () => {
      const fees = await fetchFeeSettings();
      if (fees) setFeeSettings(fees);
    };
    loadFees();
  }, []);
  
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
    calculateTotals(updatedServices);
    setEditingService(null);
    setCatalogService(null);
  };

  const handleRemoveService = async (serviceId: string) => {
    if (!confirm("Remove this service?")) return;

    try {
      await removeAppointmentService(serviceId);
      const updatedServices = services.filter(s => s.id !== serviceId);
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
  const displayTax = taxAmount || 0;

  // --- Itemized services totals ---
  const subtotal = services.reduce((sum, s) => sum + s.price * s.quantity, 0);
  const { wasteOilFee, shopFee, surcharge } = computeFees(feeSettings, subtotal);
  const total = subtotal + wasteOilFee + shopFee + surcharge + displayTax;

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
            // Catalog service fallback — now includes all fees
            (() => {
              const catSubtotal = estimatedCost || catalogService.default_price;
              const { wasteOilFee: catWaste, shopFee: catShop, surcharge: catSurcharge } = computeFees(feeSettings, catSubtotal);
              const catTotal = catSubtotal + catWaste + catShop + catSurcharge + displayTax;
              return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="space-y-1">
                      <p className="font-medium">{catalogService.name}</p>
                      {catalogService.description && (
                        <p className="text-sm text-muted-foreground">{catalogService.description}</p>
                      )}
                    </div>
                    <span className="font-semibold">{formatCurrency(catSubtotal)}</span>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatCurrency(catSubtotal)}</span>
                    </div>
                    {catWaste > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Waste Oil Disposal Fee</span>
                        <span>{formatCurrency(catWaste)}</span>
                      </div>
                    )}
                    {catShop > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{feeSettings?.shop_fee_description || "Shop Supplies Fee"}</span>
                        <span>{formatCurrency(catShop)}</span>
                      </div>
                    )}
                    {catSurcharge > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{feeSettings?.surcharge_description || "Card Processing Fee"}</span>
                        <span>{formatCurrency(catSurcharge)}</span>
                      </div>
                    )}
                    {displayTax > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tax</span>
                        <span>{formatCurrency(displayTax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                      <span>Total</span>
                      <span>{formatCurrency(catTotal)}</span>
                    </div>
                  </div>
                </div>
              );
            })()
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
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {wasteOilFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Waste Oil Disposal Fee</span>
                    <span>{formatCurrency(wasteOilFee)}</span>
                  </div>
                )}
                {shopFee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{feeSettings?.shop_fee_description || "Shop Supplies Fee"}</span>
                    <span>{formatCurrency(shopFee)}</span>
                  </div>
                )}
                {surcharge > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{feeSettings?.surcharge_description || "Card Processing Fee"}</span>
                    <span>{formatCurrency(surcharge)}</span>
                  </div>
                )}
                {displayTax > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span>{formatCurrency(displayTax)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                
                {services.some(s => s.is_prepaid) && services.some(s => !s.is_prepaid) && (
                  <div className="mt-4 pt-4 border-t space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Prepaid</span>
                      <span className="text-gray-600">
                        {formatCurrency(services.filter(s => s.is_prepaid).reduce((sum, s) => sum + s.price * s.quantity, 0))}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-600">Due at Service</span>
                      <span className="text-amber-600">
                        {formatCurrency(services.filter(s => !s.is_prepaid).reduce((sum, s) => sum + s.price * s.quantity, 0))}
                      </span>
                    </div>
                  </div>
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

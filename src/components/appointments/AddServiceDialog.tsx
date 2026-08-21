import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchActiveServiceCatalog, insertAppointmentService, updateAppointmentService } from "@/application/queries/appointment-service.query";
import { Loader2, Plus } from "lucide-react";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import type { AppointmentService } from "./ServiceLineItem";
import { bankersRound } from '@/lib/financialMath';

interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
}

interface AddServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  onServiceAdded: (service: AppointmentService) => void;
  editService?: AppointmentService | null;
  isPrepaidAppointment?: boolean;
}

export function AddServiceDialog({
  open,
  onOpenChange,
  appointmentId,
  onServiceAdded,
  editService,
  isPrepaidAppointment = false,
}: AddServiceDialogProps) {
  const { formatCurrency } = useRegionalSettings();
  const [loading, setLoading] = useState(false);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogItem[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("");
  const [isCustom, setIsCustom] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    quantity: "1",
  });

  useEffect(() => {
    if (open) {
      fetchServiceCatalog();
      if (editService) {
        setFormData({
          name: editService.name,
          description: editService.description || "",
          price: editService.price.toString(),
          quantity: editService.quantity.toString(),
        });
        setSelectedCatalogId(editService.service_catalog_id || "custom");
        setIsCustom(!editService.service_catalog_id);
      } else {
        resetForm();
      }
    }
  }, [open, editService]);

  const fetchServiceCatalog = async () => {
    const { data } = await fetchActiveServiceCatalog();
    if (data) {
      setServiceCatalog(data);
    }
  };

  const resetForm = () => {
    setFormData({ name: "", description: "", price: "", quantity: "1" });
    setSelectedCatalogId("");
    setIsCustom(false);
  };

  const handleCatalogSelect = (value: string) => {
    setSelectedCatalogId(value);
    if (value === "custom") {
      setIsCustom(true);
      setFormData({ name: "", description: "", price: "", quantity: "1" });
    } else {
      setIsCustom(false);
      const service = serviceCatalog.find(s => s.id === value);
      if (service) {
        setFormData({
          name: service.name,
          description: service.description || "",
          price: service.default_price.toString(),
          quantity: "1",
        });
      }
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.price) return;

    setLoading(true);
    try {
      const serviceData = {
        appointment_id: appointmentId,
        service_catalog_id: isCustom ? null : selectedCatalogId || null,
        name: formData.name,
        description: formData.description || null,
        price: bankersRound(Number(formData.price) || 0, 2),
        quantity: parseInt(formData.quantity) || 1,
        is_prepaid: false, // New services added at service time are not prepaid
        added_at_service: !editService, // Only mark as added at service if it's a new service
      };

      if (editService) {
        const { data, error } = await updateAppointmentService(editService.id, serviceData);
        if (error) throw error;
        onServiceAdded(data as unknown as AppointmentService);
      } else {
        const { data, error } = await insertAppointmentService(serviceData);
        if (error) throw error;
        onServiceAdded(data as unknown as AppointmentService);
      }

      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Failed to save service:", error);
    } finally {
      setLoading(false);
    }
  };

  const lineTotal = bankersRound(
    bankersRound(Number(formData.price) || 0, 4) * (parseInt(formData.quantity) || 1),
  2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editService ? "Edit Service" : "Add Service"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select from Catalog</Label>
            <Select value={selectedCatalogId} onValueChange={handleCatalogSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a service..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">
                  <span className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Custom Service
                  </span>
                </SelectItem>
                {serviceCatalog.map(service => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name} - {formatCurrency(service.default_price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Service Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Air Filter Replacement"
              disabled={!isCustom && !!selectedCatalogId}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Additional details..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
              />
            </div>
          </div>

          {lineTotal > 0 && (
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-muted-foreground">Line Total</span>
              <span className="font-semibold text-lg">{formatCurrency(lineTotal)}</span>
            </div>
          )}

          {isPrepaidAppointment && !editService && (
            <p className="text-sm text-amber-600 bg-amber-500/10 p-2 rounded-md">
              This appointment was prepaid. A separate invoice will be created for any added services.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !formData.name || !formData.price}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editService ? "Update" : "Add"} Service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

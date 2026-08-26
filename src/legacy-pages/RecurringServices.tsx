import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Repeat } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  fetchRecurringServices,
  fetchRecurringServicesLookupData,
  type RecurringServiceCatalogItem,
  type RecurringCustomer,
  type RecurringServiceRecord,
  type RecurringVehicle,
} from "@/application/queries/recurring-services.query";
import { createRecurringService } from "@/application/commands/recurring-services.command";

const RecurringServices = () => {
  const [serviceCatalog, setServiceCatalog] = useState<RecurringServiceCatalogItem[]>([]);
  const [customers, setCustomers] = useState<RecurringCustomer[]>([]);
  const [vehicles, setVehicles] = useState<RecurringVehicle[]>([]);
  const [services, setServices] = useState<RecurringServiceRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<any>({
    frequency: 'months',
    interval: 1,
    start_date: format(new Date(), 'yyyy-MM-dd'),
  });

  const fetchData = useCallback(async () => {
    try {
      const data = await fetchRecurringServicesLookupData();
      const recurring = await fetchRecurringServices();
      setServiceCatalog(data.serviceCatalog);
      setCustomers(data.customers);
      setVehicles(data.vehicles);
      setServices(recurring);
    } catch (err) {
      console.error("Failed to load recurring services", err);
      toast.error(err instanceof Error ? err.message : "Failed to load data");
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createRecurringService({
        service_catalog_id: formData.service_catalog_id,
        customer_id: formData.customer_id,
        vehicle_id: formData.vehicle_id,
        frequency: formData.frequency,
        interval: Number(formData.interval),
        start_date: formData.start_date,
      });
      toast.success("Recurring service created");
      setOpen(false);
      await fetchData();
    } catch (err) {
      console.error("Failed to create recurring service", err);
      toast.error("Failed to create recurring service");
    }
  };

  const serviceNameById = new Map(serviceCatalog.map((s) => [s.id, s.name]));
  const customerNameById = new Map(customers.map((c) => [c.id, c.name]));
  const vehicleLabelById = new Map(vehicles.map((v) => [v.id, `${v.year} ${v.make} ${v.model}`]));

  return (
    <AppLayout title="Recurring Services">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Recurring Services</h2>
            <p className="text-muted-foreground">Manage automated service schedules.</p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-2"><Plus /> New Recurring Service</Button>
        </div>

        <Card>
          <CardContent className="py-12">
            {services.length === 0 ? (
              <div className="text-center text-muted-foreground">
                <Repeat className="h-12 w-12 mx-auto mb-4" />
                <p className="text-lg font-medium mb-2">No Recurring Services Yet</p>
                <p>Create a recurring service to automate future appointment scheduling.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {services.map((service) => (
                  <div key={service.id} className="border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{serviceNameById.get(service.service_catalog_id) || "Service"}</p>
                      <p className="text-sm text-muted-foreground">
                        Every {service.interval} {service.frequency} • Next due {service.next_due_date}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {customerNameById.get(service.customer_id || "") || "No customer"}
                        {service.vehicle_id ? ` • ${vehicleLabelById.get(service.vehicle_id) || "Vehicle"}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Recurring Service</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Service</Label>
              <Select value={formData.service_catalog_id} onValueChange={(v) => setFormData({...formData, service_catalog_id: v})}>
                <SelectTrigger><SelectValue placeholder="Select a service" /></SelectTrigger>
                <SelectContent>{serviceCatalog.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Customer</Label>
              <Select value={formData.customer_id} onValueChange={(v) => setFormData({...formData, customer_id: v})}>
                <SelectTrigger><SelectValue placeholder="Select a customer" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vehicle</Label>
              <Select value={formData.vehicle_id} onValueChange={(v) => setFormData({...formData, vehicle_id: v})}>
                <SelectTrigger><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
                <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Interval</Label>
                <Input type="number" value={formData.interval} onChange={(e) => setFormData({...formData, interval: parseInt(e.target.value)})} required />
              </div>
              <div>
                <Label>Frequency</Label>
                <Select value={formData.frequency} onValueChange={(v) => setFormData({...formData, frequency: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                    <SelectItem value="years">Years</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={formData.start_date} onChange={(e) => setFormData({...formData, start_date: e.target.value})} required />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default RecurringServices;

/**
 * TechServices — Service Records inside the Tech App.
 *
 * Mirrors the dashboard Services screen but in a mobile-first shell with
 * no AppLayout chrome and no delete action (per business rule: technicians
 * can read + create + edit only).
 *
 * Reuses the same `ServiceRecordForm` dialog as the dashboard so service
 * writers and field technicians log records identically.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchServiceRecordsPageData,
  type ServiceRecordRow,
} from "@/application/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Wrench, AlertCircle, Zap, FileText, Edit, Loader2,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { ServiceRecordForm } from "@/components/services/ServiceRecordForm";
import ServiceInvoice from "@/components/ServiceInvoice";
import { useTechContext } from "./TechAppLayout";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";

type Service = ServiceRecordRow;
interface Customer { id: string; name: string; }
interface Vehicle { id: string; customer_id: string | null; make: string; model: string; year: number; }

export default function TechServices() {
  const navigate = useNavigate();
  const { identity } = useTechContext();
  const { terms } = useTerminology();
  const { formatCurrency, formatDate } = useRegionalSettings();

  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [invoiceService, setInvoiceService] = useState<Service | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchServiceRecordsPageData();
      if (!result) return;
      setServices(result.services);
      setCustomers(result.customers);
      setVehicles(result.vehicles);
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || "Failed to load service records");
      toast.error("Failed to load service records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(() => fetchData()); }, [fetchData]);

  const customerName = useCallback(
    (id: string | null) => (id ? customers.find(c => c.id === id)?.name || "Unknown" : "Customer"),
    [customers],
  );
  const vehicleInfo = useCallback(
    (id: string | null) => {
      if (!id) return "No vehicle";
      const v = vehicles.find(x => x.id === id);
      return v ? `${v.year} ${v.make} ${v.model}` : "Unknown";
    },
    [vehicles],
  );

  const filtered = useMemo(
    () => services.filter(s =>
      s.service_type.toLowerCase().includes(search.toLowerCase()) ||
      customerName(s.customer_id).toLowerCase().includes(search.toLowerCase()) ||
      vehicleInfo(s.vehicle_id).toLowerCase().includes(search.toLowerCase())
    ),
    [services, search, customerName, vehicleInfo],
  );

  const getStatusBadge = (status: string) => {
    if (status === "completed") return <Badge className="bg-gray-500/10 text-gray-600 hover:bg-gray-500/20">Completed</Badge>;
    if (status === "in_progress" || status === "in-progress") return <Badge className="bg-primary/10 text-primary hover:bg-primary/20">In Progress</Badge>;
    if (status === "pending") return <Badge className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20">Pending</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  const handleFormSuccess = () => {
    setEditingService(null);
    fetchData();
  };

  const stats = useMemo(() => ({
    total: services.length,
    pending: services.filter(s => s.status === "pending").length,
    inProgress: services.filter(s => s.status.includes("progress")).length,
  }), [services]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{terms.service} Records</h1>
          <p className="text-xs text-muted-foreground">Log work performed in the field</p>
        </div>
        <Button
          size="sm"
          className="gap-1"
          onClick={() => { setEditingService(null); setOpen(true); }}
        >
          <Plus className="h-4 w-4" />
          New
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <div className="text-xl font-bold mt-1">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <span className="text-xs text-muted-foreground">Pending</span>
            </div>
            <div className="text-xl font-bold mt-1">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Active</span>
            </div>
            <div className="text-xl font-bold mt-1">{stats.inProgress}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search records…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-4 text-center text-destructive text-sm">{error}</CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No service records yet</p>
            <p className="text-xs mt-1">Tap “New” to log your first record</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <Card key={s.id}>
              <CardContent
                className="p-3"
                onClick={() => navigate(`/services/${s.id}`)}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{s.service_type}</p>
                    <p className="text-xs text-muted-foreground truncate">{vehicleInfo(s.vehicle_id)}</p>
                  </div>
                  {getStatusBadge(s.status)}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate flex-1">{customerName(s.customer_id)}</span>
                  <span className="shrink-0 ml-2">{formatDate(s.service_date)}</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                  <span className="font-semibold">{formatCurrency(s.total_cost)}</span>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setInvoiceService(s)}
                      aria-label="View invoice"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => { setEditingService(s); setOpen(true); }}
                      aria-label="Edit record"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {invoiceService && (
        <ServiceInvoice
          serviceId={invoiceService.id}
          customerId={invoiceService.customer_id}
          vehicleId={invoiceService.vehicle_id}
          onClose={() => setInvoiceService(null)}
        />
      )}

      <ServiceRecordForm
        open={open}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) setEditingService(null);
        }}
        editingService={editingService}
        onSuccess={handleFormSuccess}
        // Critical: when a technician saves, all writes must be scoped to
        // the business owner's user_id, not the technician's auth uid.
        businessUserId={identity?.businessUserId}
      />
    </div>
  );
}

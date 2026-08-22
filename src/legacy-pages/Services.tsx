import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchServiceRecordsPageData,
  type ServiceRecordRow,
} from "@/application/queries";
import { deleteServiceRecord } from "@/application/commands/service-records.command";
import { AppLayout } from "@/components/layout/AppLayout";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useRealtimeWorkflow } from "@/hooks/useRealtimeWorkflow";
import { PullToRefreshContainer } from "@/components/ui/pull-to-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Calendar, Wrench, AlertCircle, Zap, FileText, Edit, Trash2, Eye, Download } from "lucide-react";
import ServiceInvoice from "@/components/ServiceInvoice";
import { ServiceRecordForm } from "@/components/services/ServiceRecordForm";
import { toast } from "sonner";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { getServiceStatusBadgeClass, getServiceStatusLabel } from "@/lib/statusStyles";
import { StatCard } from "@/components/dashboard/StatCard";
import { WorkflowStatusIndicator } from "@/components/workflow/WorkflowStatusIndicator";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { TableSkeleton } from "@/components/loading/PageSkeletons";
import { Skeleton } from "@/components/ui/skeleton";

type Service = ServiceRecordRow;

interface Customer { id: string; name: string; }
interface Vehicle { id: string; customer_id: string | null; make: string; model: string; year: number; }

const Services = () => {
  const navigate = useNavigate();
  const { terms } = useTerminology();
  const { formatCurrency, formatDate } = useRegionalSettings();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [invoiceService, setInvoiceService] = useState<Service | null>(null);
  const [userId, setUserId] = useState<string | undefined>();

  const { isConnected } = useRealtimeWorkflow({
    userId,
    onEvent: (event) => {
      if (event.type === "service") {
        fetchData();
      }
    },
    showToasts: true,
    enabled: !!userId,
  });

  const fetchData = useCallback(async () => {
    setServicesLoading(true);
    setCustomersLoading(true);
    setVehiclesLoading(true);
    setServicesError(null);
    setCustomersError(null);
    setVehiclesError(null);

    try {
      const result = await fetchServiceRecordsPageData();
      if (!result) return;

      setUserId(result.userId);
      setServices(result.services);
      setCustomers(result.customers);
      setVehicles(result.vehicles);
    } catch (err: unknown) {
      setServicesError(err instanceof Error ? err.message : "Failed to load data");
      toast.error("Failed to load service records");
    } finally {
      setServicesLoading(false);
      setCustomersLoading(false);
      setVehiclesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { containerRef, isRefreshing } = usePullToRefresh({ onRefresh: fetchData });

  const getCustomerName = useCallback((id: string | null) => id ? customers.find(c => c.id === id)?.name || "Unknown" : "Customer", [customers]);
  const getVehicleInfo = useCallback((id: string | null) => { if (!id) return "No vehicle"; const v = vehicles.find(x => x.id === id); return v ? `${v.year} ${v.make} ${v.model}` : "Unknown"; }, [vehicles]);

  // Export service records as CSV
  const handleExport = useCallback(() => {
    if (!services.length) return;
    const headers = ["Service Type", "Date", "Customer", "Vehicle", "Status", "Total Cost", "Technician", "Notes"];
    const rows = services.map((s: Service) => [
      s.service_type, s.service_date, getCustomerName(s.customer_id), getVehicleInfo(s.vehicle_id),
      s.status, s.total_cost ?? "", s.technician || "", s.notes || ""
    ]);
    const csv = [headers.join(","), ...rows.map((r: unknown[]) => r.map((x: unknown) => `"${String(x).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `service-records-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [services, getCustomerName, getVehicleInfo]);

  const filteredServices = useMemo(() => services.filter(s =>
    s.service_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getCustomerName(s.customer_id).toLowerCase().includes(searchQuery.toLowerCase()) ||
    getVehicleInfo(s.vehicle_id).toLowerCase().includes(searchQuery.toLowerCase())
  ), [services, searchQuery, getCustomerName, getVehicleInfo]);

  const openEditDialog = useCallback((s: Service) => {
    setEditingService(s);
    setOpen(true);
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this service record?")) return;
    try {
      await deleteServiceRecord(id);
      toast.success("Record deleted.");
      fetchData();
    } catch {
      toast.error("Failed to delete record.");
    }
  };
  
  const handleFormSuccess = () => {
    setEditingService(null);
    fetchData();
  };
  
  const getStatusBadge = (status: string) => {
    const className = getServiceStatusBadgeClass(status);
    if (!className) return <Badge variant="secondary">{status}</Badge>;

    return <Badge className={className}>{getServiceStatusLabel(status)}</Badge>;
  };

  return (
    <AppLayout title={`${terms.service} Records`}>
      <PullToRefreshContainer containerRef={containerRef} isRefreshing={isRefreshing}>
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold">{terms.service} Records</h2>
                <p className="text-sm sm:text-base text-muted-foreground">Log and manage all completed and ongoing services.</p>
              </div>
              <WorkflowStatusIndicator isConnected={isConnected} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={handleExport}>
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button className="gap-2 w-full sm:w-auto" onClick={() => { setEditingService(null); setOpen(true); }}>
                <Plus className="h-4 w-4" /> New Record
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Services" value={services.length} icon={Wrench} />
            <StatCard title="Pending" value={services.filter(s=>s.status === 'pending').length} icon={AlertCircle} />
            <StatCard title="In Progress" value={services.filter(s=>s.status.includes('progress')).length} icon={Zap} />
            <StatCard title="Completed" value={services.filter(s=>s.status === 'completed').length} icon={Calendar} />
          </div>

          <Card className="border border-border/50">
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by customer, vehicle, or service type..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
            </CardContent>
          </Card>

          {isMobile ? (
            <div className="space-y-3">
              {servicesLoading ? (
                <div className="space-y-3" aria-busy="true" aria-label="Loading service records">
                  {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
                </div>
              ) : servicesError ? (
                <div className="text-center py-8 text-red-700 bg-red-50 rounded p-4">{servicesError}</div>
              ) : filteredServices.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No records found</div>
              ) : (
                filteredServices.map((s) => (
                  <Card key={s.id} className="border border-border/50" onClick={() => navigate(`/services/${s.id}`)}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium">{s.service_type}</p>
                          <p className="text-sm text-muted-foreground">{getVehicleInfo(s.vehicle_id)}</p>
                        </div>
                        {getStatusBadge(s.status)}
                      </div>
                      <div className="flex justify-between items-center text-sm text-muted-foreground">
                        <span>{getCustomerName(s.customer_id)}</span>
                        <span>{formatDate(s.service_date)}</span>
                      </div>
                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-border/50">
                        <span className="font-semibold text-lg">{formatCurrency(s.total_cost)}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setInvoiceService(s); }}><FileText className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEditDialog(s); }}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : (
            <Card className="border border-border/50">
                <div className="font-medium text-sm text-muted-foreground flex items-center border-b border-border/50">
                    <div className="p-2 pl-4 w-28 shrink-0">ID</div>
                    <div className="p-2 w-48 shrink-0">{terms.vehicle.toUpperCase()}</div>
                    <div className="p-2 flex-1">{terms.customer.toUpperCase()}</div>
                    <div className="p-2 w-32 shrink-0">DATE</div>
                    <div className="p-2 w-32 shrink-0">STATUS</div>
                    <div className="p-2 w-28 shrink-0 text-right">TOTAL</div>
                    <div className="p-2 w-32 shrink-0">ACTIONS</div>
                </div>
                <div className="divide-y divide-border/50">
                    {servicesLoading ? (
                        <TableSkeleton rows={7} columns={7} />
                    ) : servicesError ? (
                        <div className="text-center py-12 text-red-700 bg-red-50 rounded p-4">{servicesError}</div>
                    ) : filteredServices.length === 0 ? (
                        <div className="text-center py-24 text-muted-foreground">No records found</div>
                    ) : (
                        filteredServices.map((s) => (
                            <div key={s.id} className="flex items-center text-sm hover:bg-muted/50">
                                <div className="p-2 pl-4 font-mono text-xs w-28 shrink-0">#{s.id.slice(0, 8)}</div>
                                <div className="p-2 w-48 shrink-0">
                                    <p className="font-medium truncate">{getVehicleInfo(s.vehicle_id)}</p>
                                    <p className="text-xs text-muted-foreground">VIN: ...</p>
                                </div>
                                <div className="p-2 flex-1 text-primary truncate">{getCustomerName(s.customer_id)}</div>
                                <div className="p-2 w-32 shrink-0">{formatDate(s.service_date)}</div>
                                <div className="p-2 w-32 shrink-0">{getStatusBadge(s.status)}</div>
                                <div className="p-2 w-28 shrink-0 text-right font-medium">{formatCurrency(s.total_cost)}</div>
                                <div className="p-2 w-32 shrink-0">
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/services/${s.id}`)}><Eye className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setInvoiceService(s)}><FileText className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(s)}><Edit className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
          )}
        </div>
        {invoiceService && <ServiceInvoice serviceId={invoiceService.id} customerId={invoiceService.customer_id} vehicleId={invoiceService.vehicle_id} onClose={() => setInvoiceService(null)} />}
        
        <ServiceRecordForm
          open={open}
          onOpenChange={(isOpen) => {
            setOpen(isOpen);
            if (!isOpen) setEditingService(null);
          }}
          editingService={editingService}
          onSuccess={handleFormSuccess}
        />
      </PullToRefreshContainer>
    </AppLayout>
  );
};

export default Services;

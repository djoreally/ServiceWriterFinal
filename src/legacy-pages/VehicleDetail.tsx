import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  getCurrentUser,
  fetchVehicleById,
  fetchCustomerById,
  fetchVehicleServices,
  fetchVehicleAppointments,
  fetchVehicleWorkOrders,
  fetchVehicleInvoices,
  fetchFleetLinkForVehicle,
} from "@/application/queries/vehicle-detail.query";
import {
  updateVehicleNotes,
  updateVehicleDetails,
} from "@/application/commands/vehicle-detail.command";
import { AppLayout } from "@/components/layout/AppLayout";
import { VehicleYMMSelector } from "@/components/vehicles/VehicleYMMSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Edit, 
  Printer, 
  Calendar, 
  Plus, 
  ChevronRight,
  Car,
  Droplets,
  Circle,
  FileText,
  ImageIcon,
  Clock,
  DollarSign,
  CalendarCheck,
  Wrench,
  Loader2
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { format } from "date-fns";
import { CarfaxServiceHistory } from "@/components/vehicles/CarfaxServiceHistory";
import { VehicleSpecifications } from "@/components/vehicles/VehicleSpecifications";
import { VehicleFilterMatchCard } from "@/components/vehicles/VehicleFilterMatchCard";
import { VehicleRecommendations } from "@/components/vehicles/VehicleRecommendations";
import { VehicleRepairs } from "@/components/vehicles/VehicleRepairs";
import { fetchExactVehicleSpecifications } from "@/application/queries/vehicle-specifications.query";
import { getServiceStatusBadgeClass, getServiceStatusLabel } from "@/lib/statusStyles";

interface VehicleSpecRow {
  engine: string | null;
  oil_type: string | null;
  tire_size: string | null;
  additional_specs: Record<string, any> | null;
}

interface Vehicle {
  id: string;
  customer_id: string | null;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  license_plate: string | null;
  color: string | null;
  mileage: number | null;
  notes: string | null;
  created_at: string;
  engine: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface Service {
  id: string;
  service_number: string | null;
  service_date: string;
  service_type: string;
  description: string;
  status: string;
  total_cost: number;
  labor_cost: number | null;
  parts_cost: number | null;
  notes: string | null;
  technician: string | null;
  mileage: number | null;
  odometer_measure: string | null;
}

interface Appointment {
  id: string;
  title: string;
  description: string | null;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  estimated_cost: number | null;
  status: string;
  guest_name: string | null;
  notes: string | null;
}

interface VehicleWorkOrder {
  id: string;
  order_number: string;
  vehicle_id: string | null;
  customer_id: string | null;
  appointment_id: string | null;
  status: string;
  completed_at: string | null;
  updated_at: string;
  tech_notes: string | null;
  mileage_captured: number | null;
  technicians?: { name: string | null } | null;
  customers?: { id: string; name: string | null } | null;
  appointments?: { id: string; title: string | null; scheduled_date: string; scheduled_time: string } | null;
}

interface VehicleInvoice {
  id: string;
  vehicle_id: string | null;
  service_number: string | null;
  service_date: string;
  total_cost: number;
  status: string;
}

const VehicleDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { terms } = useTerminology();
  const { formatCurrency } = useRegionalSettings();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [workOrders, setWorkOrders] = useState<VehicleWorkOrder[]>([]);
  const [invoices, setInvoices] = useState<VehicleInvoice[]>([]);
  const [fleetClientName, setFleetClientName] = useState<string | null>(null);
  const [techNotes, setTechNotes] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [notesUpdatedAt, setNotesUpdatedAt] = useState<string | null>(null);
  const [specs, setSpecs] = useState<VehicleSpecRow | null>(null);


  const fetchVehicleData = useCallback(async () => {
    setLoading(true);
    const user = await getCurrentUser();
    if (!user || !id) {
      navigate("/vehicles");
      return;
    }

    setCurrentUserEmail(user.email ?? null);

    const { data: vehicleData, error: vehicleError } = await fetchVehicleById(id, user.id);

    if (vehicleError || !vehicleData) {
      toast.error("Vehicle not found");
      navigate("/vehicles");
      return;
    }

    setVehicle(vehicleData);
    setTechNotes(vehicleData.notes || "");

    // Fetch real vehicle specifications by YMM — only used as a fallback when
    // there is exactly one unambiguous match AND the vehicle has no admin override.
    (async () => {
      if (!vehicleData.year || !vehicleData.make || !vehicleData.model) {
        setSpecs(null);
        return;
      }
      const specRows = await fetchExactVehicleSpecifications(
        vehicleData.year,
        vehicleData.make,
        vehicleData.model,
        "engine,oil_type,tire_size,additional_specs",
      );
      if (specRows && specRows.length === 1) {
        setSpecs(specRows[0] as unknown as VehicleSpecRow);
      } else {
        setSpecs(null);
      }

    })();

    if (vehicleData.customer_id) {
      const { data: customerData } = await fetchCustomerById(vehicleData.customer_id);
      setCustomer(customerData);
    }

    setServicesLoading(true); setServicesError(null);
    const { data: servicesData, error: servicesErrorRes } = await fetchVehicleServices(id);

    if (servicesErrorRes) {
      setServicesError(servicesErrorRes.message || "Failed to load services");
      toast.error("Failed to load services");
    }
    setServices(servicesData || []);
    setServicesLoading(false);

    setAppointmentsLoading(true); setAppointmentsError(null);
    const { data: appointmentsData, error: appointmentsErrorRes } = await fetchVehicleAppointments(id);

    if (appointmentsErrorRes) {
      setAppointmentsError(appointmentsErrorRes.message || "Failed to load appointments");
      toast.error("Failed to load appointments");
    }
    setAppointments(appointmentsData || []);
    setAppointmentsLoading(false);

    const [{ data: workOrderData }, { data: invoiceData }, { data: fleetLinkData }] = await Promise.all([
      fetchVehicleWorkOrders(id),
      fetchVehicleInvoices(id),
      fetchFleetLinkForVehicle(vehicleData.vin, vehicleData.license_plate),
    ]);
    setWorkOrders(((workOrderData as VehicleWorkOrder[] | null) ?? []).filter((wo) => wo.vehicle_id === vehicleData.id));
    setInvoices(((invoiceData as VehicleInvoice[] | null) ?? []).filter((inv) => inv.vehicle_id === vehicleData.id));
    setFleetClientName(null);
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    if (id) {
      void Promise.resolve().then(() => fetchVehicleData());
    }
  }, [fetchVehicleData, id]);

  const handleSaveNotes = async () => {
    if (!vehicle) return;
    const { error } = await updateVehicleNotes(vehicle.id, techNotes);
    
    if (error) {
      toast.error("Failed to save notes");
    } else {
      setVehicle(prev => prev ? { ...prev, notes: techNotes } : null);
      setNotesUpdatedAt(new Date().toLocaleDateString());
      toast.success("Notes saved");
    }
  };

  const handlePrintHistory = () => {
    // Create a printable version of the service history
    if (typeof window === 'undefined') {
      toast.error("Printing is only available in the browser");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow || !vehicle) return;

    const serviceRows = services.map(s => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px 8px;">${new Date(s.service_date).toLocaleDateString()}</td>
        <td style="padding: 12px 8px;">${s.service_number || '-'}</td>
        <td style="padding: 12px 8px;">${s.service_type}</td>
        <td style="padding: 12px 8px;">${s.description || '-'}</td>
        <td style="padding: 12px 8px;">${s.technician || 'Unassigned'}</td>
        <td style="padding: 12px 8px;">${s.mileage != null ? `${s.mileage.toLocaleString()} ${(s.odometer_measure || 'mi').toLowerCase()}` : '-'}</td>
        <td style="padding: 12px 8px; text-align: right;">${formatCurrency(s.total_cost)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${terms?.service || 'Service'} History - ${vehicle?.year || ''} ${vehicle?.make || ''} ${vehicle?.model || ''}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; }
            h1 { margin-bottom: 4px; }
            .vehicle-info { color: #666; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { text-align: left; padding: 12px 8px; border-bottom: 2px solid #333; font-weight: 600; }
            th:last-child { text-align: right; }
            .totals { margin-top: 24px; text-align: right; font-weight: 600; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <h1>${terms.service} History Report</h1>
          <div class="vehicle-info">
            <strong>${vehicle.year} ${vehicle.make} ${vehicle.model}</strong><br/>
            VIN: ${vehicle.vin || 'N/A'} | License: ${vehicle.license_plate || 'N/A'} | Mileage: ${vehicle.mileage?.toLocaleString() || 'N/A'} mi
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>${terms.service} #</th>
                <th>Type</th>
                <th>Description</th>
                <th>Technician</th>
                <th>Mileage</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${serviceRows || '<tr><td colspan="7" style="padding: 24px; text-align: center; color: #666;">No service records found</td></tr>'}
            </tbody>
          </table>
          <div class="totals">
            Total ${terms.service}s: ${services.length} | Lifetime Billed Service Value: ${formatCurrency(services.reduce((sum, s) => sum + s.total_cost, 0))}
          </div>
          <p style="margin-top: 40px; color: #666; font-size: 12px;">Generated on ${new Date().toLocaleDateString()}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleScheduleAppointment = () => {
    navigate('/appointments', { 
      state: { 
        prefillVehicleId: vehicle?.id,
        prefillVehicleName: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : undefined,
        prefillCustomerId: customer?.id,
        prefillCustomerName: customer?.name
      }
    });
  };

  const handleEditDetails = () => {
    setEditDialogOpen(true);
  };

  const [editFormData, setEditFormData] = useState({
    make: '',
    model: '',
    year: new Date().getFullYear(),
    vin: '',
    license_plate: '',
    color: '',
    mileage: '',
    notes: '',
    engine: '',
    oil_type: '',
    oil_capacity: ''
  });
  // All matching spec rows for this YMM — powers the admin override dropdowns
  const [specOptions, setSpecOptions] = useState<Array<{
    engine: string | null;
    oil_type: string | null;
    oil_capacity: string | null;
    tire_size: string | null;
  }>>([]);

  useEffect(() => {
    if (vehicle && editDialogOpen) {
      void Promise.resolve().then(() => setEditFormData({
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        vin: vehicle.vin || '',
        license_plate: vehicle.license_plate || '',
        color: vehicle.color || '',
        mileage: vehicle.mileage?.toString() || '',
        notes: vehicle.notes || '',
        engine: vehicle.engine || '',
        oil_type: vehicle.oil_type || '',
        oil_capacity: vehicle.oil_capacity || ''
      }));
      // Pull every spec variant for the YMM so admin can choose the correct engine/oil
      (async () => {
        if (!vehicle.year || !vehicle.make || !vehicle.model) {
          setSpecOptions([]);
          return;
        }
        const data = await fetchExactVehicleSpecifications(
          vehicle.year,
          vehicle.make,
          vehicle.model,
          "engine,oil_type,oil_capacity,tire_size",
        );
        setSpecOptions((data as any[]) || []);
      })();

    }
  }, [vehicle, editDialogOpen]);

  const handleUpdateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicle) return;

    const user = await getCurrentUser();
    if (!user) return;

    const updateData = {
      make: editFormData.make,
      model: editFormData.model,
      year: editFormData.year,
      vin: editFormData.vin || null,
      license_plate: editFormData.license_plate || null,
      color: editFormData.color || null,
      mileage: editFormData.mileage ? parseInt(editFormData.mileage) : null,
      notes: editFormData.notes || null,
      engine: editFormData.engine.trim() || null,
      oil_type: editFormData.oil_type.trim() || null,
      oil_capacity: editFormData.oil_capacity.trim() || null
    };

    const { error } = await updateVehicleDetails(vehicle.id, updateData);

    if (error) {
      toast.error("Failed to update vehicle");
    } else {
      toast.success("Vehicle updated successfully");
      setEditDialogOpen(false);
      fetchVehicleData();
    }
  };

  const getStatusBadge = (status: string) => {
    const className = getServiceStatusBadgeClass(status);
    if (!className) return <Badge variant="secondary">{status}</Badge>;

    return <Badge className={className}>{getServiceStatusLabel(status)}</Badge>;
  };

  const filteredServices = services.filter(s => {
    if (serviceFilter === "all") return true;
    return s.status.toLowerCase() === serviceFilter;
  });

  // Calculate vehicle statistics
  // Billed service value: sum of actual total_cost from service records
  const totalServicesValue = services.reduce((sum, s) => sum + s.total_cost, 0);
  const openWorkOrders = workOrders.filter((wo) => !["completed", "invoiced", "paid"].includes(wo.status)).length;
  const lastServiceDate = services[0]?.service_date || null;
  const totalInvoices = invoices.length;
  const completedServicesCount = services.filter(s => s.status.toLowerCase() === "completed").length;
  const upcomingAppointments = appointments.filter(a => 
    a.status.toLowerCase() !== "completed" && a.status.toLowerCase() !== "cancelled"
  );

  if (loading || !vehicle) {
    return (
      <AppLayout title="Loading...">
        <div className="space-y-4">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-48 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}>
      <div className="space-y-6">
        {/* Breadcrumb & Actions */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/vehicles" className="hover:text-primary transition-colors">{terms.vehicle}s</Link>
            <span>/</span>
            {customer && (
              <>
                <Link to="/customers" className="hover:text-primary transition-colors">{customer.name}</Link>
                <span>/</span>
              </>
            )}
            <span className="text-foreground font-medium">{vehicle.year} {vehicle.make} {vehicle.model}</span>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleEditDetails}>
              <Edit className="h-4 w-4" />
              Edit Details
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={handlePrintHistory}>
              <Printer className="h-4 w-4" />
              Print History
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleScheduleAppointment}>
              <Calendar className="h-4 w-4" />
              Schedule Appointment
            </Button>
            <Button size="sm" className="gap-2" onClick={() => navigate('/services', { state: { prefillVehicleId: vehicle.id, prefillVehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}` } })}>
              <Plus className="h-4 w-4" />
              New {terms.service} Record
            </Button>
          </div>
        </div>

        {/* Vehicle Hero Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Vehicle Image Card */}
          <Card className="lg:col-span-1 overflow-hidden border-border/50">
            <div className="relative h-64 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
              <Car className="h-24 w-24 text-muted-foreground/50" />
              {/* Vehicle Info Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <h2 className="text-2xl font-bold text-white">{vehicle.year} {vehicle.make} {vehicle.model}</h2>
                <p className="text-white/80">{vehicle.color || "Unknown"} · Sedan</p>
              </div>
            </div>
          </Card>

          {/* Vehicle Specs */}
          <Card className="lg:col-span-2 border-border/50">
            <CardContent className="p-6">
              {/* Primary Info Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">VIN</p>
                  <p className="font-mono font-medium">{vehicle.vin || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">License Plate</p>
                  <div className="flex items-center gap-2">
                    <div className="bg-muted px-2 py-0.5 rounded text-sm">🚗</div>
                    <span className="font-medium">{vehicle.license_plate || "—"}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Odometer</p>
                  <p className="font-medium">📍 {vehicle.mileage?.toLocaleString() || "—"} mi</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Client / Fleet</p>
                  {fleetClientName ? (
                    <Badge variant="secondary">{fleetClientName}</Badge>
                  ) : customer ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {customer.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <Link to="/customers" className="text-primary hover:underline font-medium">{customer.name}</Link>
                    </div>
                  ) : (
                    <Badge variant="secondary">Unassigned</Badge>
                  )}
                </div>
              </div>

              {/* Secondary Info Row — admin-saved vehicle overrides take priority over
                  ambiguous spec lookups. Falls back to spec match, then em-dash. */}
              <div className="flex flex-wrap items-center gap-6 pt-4 border-t border-border/50">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-light tracking-wide text-muted-foreground">ENGINE</span>
                  <span className="text-sm text-muted-foreground">{vehicle.engine || specs?.engine || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{vehicle.oil_type || specs?.oil_type || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Circle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{specs?.tire_size || (specs?.additional_specs as any)?.tire_size || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-md bg-gradient-to-r from-gray-300 to-gray-400" />
                  <span className="text-sm">Color: {vehicle.color || "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Wrench className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{openWorkOrders}</p>
                  <p className="text-xs text-muted-foreground">Open Work Orders</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gray-500/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{upcomingAppointments.length}</p>
                  <p className="text-xs text-muted-foreground">Upcoming Appointments</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <CalendarCheck className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-base font-bold">{lastServiceDate ? format(new Date(lastServiceDate), "MMM dd, yyyy") : "—"}</p>
                  <p className="text-xs text-muted-foreground">Last Service Date</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalInvoices}</p>
                  <p className="text-xs text-muted-foreground">Total Invoices</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {services.length === 0 && appointments.length === 0 && workOrders.length === 0 && invoices.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              This vehicle has no service history, invoices, work orders, or appointments yet.
            </CardContent>
          </Card>
        )}

        {/* Tabs Section */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-transparent border-b border-border/50 rounded-none h-auto p-0 gap-6 flex-wrap">
            <TabsTrigger 
              value="overview" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 pb-3"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="service-history" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 pb-3"
            >
              Service History ({services.length})
            </TabsTrigger>
            <TabsTrigger 
              value="invoice-history" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 pb-3"
            >
              Invoice History ({invoices.length})
            </TabsTrigger>
            <TabsTrigger 
              value="work-orders" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 pb-3"
            >
              Work Orders ({workOrders.length})
            </TabsTrigger>
            <TabsTrigger 
              value="appointments" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 pb-3"
            >
              Appointments ({appointments.length})
            </TabsTrigger>
            <TabsTrigger
              value="repairs"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 pb-3"
            >
              Repairs Intelligence
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <Card className="border-border/50">
              <CardHeader><CardTitle>Vehicle Overview</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <p><strong>Year/Make/Model:</strong> {vehicle.year} {vehicle.make} {vehicle.model}</p>
                  <p><strong>VIN:</strong> {vehicle.vin || "—"}</p>
                  <p><strong>Plate:</strong> {vehicle.license_plate || "—"}</p>
                  <p><strong>Mileage:</strong> {vehicle.mileage?.toLocaleString() || "—"} mi</p>
                  <p><strong>Client/Fleet:</strong> {fleetClientName || customer?.name || "Unassigned"}</p>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={techNotes} onChange={(e) => setTechNotes(e.target.value)} className="mt-2 min-h-24" />
                  <Button size="sm" className="mt-2" onClick={handleSaveNotes}>Save Notes</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="service-history" className="mt-6">
            <Card className="border-border/50 mb-6">
              <CardHeader><CardTitle>Completed Work</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Work Order ID</TableHead>
                      <TableHead>Services Performed</TableHead>
                      <TableHead>Mileage</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Appointment</TableHead>
                      <TableHead>Technician</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrders.filter((wo) => wo.status === "completed").slice(0, 10).map((wo) => (
                      <TableRow key={`completed-${wo.id}`}>
                        <TableCell>{format(new Date(wo.completed_at || wo.updated_at), "MMM dd, yyyy")}</TableCell>
                        <TableCell>{wo.order_number || wo.id.slice(0, 8)}</TableCell>
                        <TableCell>{wo.tech_notes || "—"}</TableCell>
                        <TableCell>{wo.mileage_captured?.toLocaleString() || "—"}</TableCell>
                        <TableCell>{wo.customers?.name || "—"}</TableCell>
                        <TableCell>{wo.appointment_id ? wo.appointment_id.slice(0, 8) : "—"}</TableCell>
                        <TableCell>{wo.technicians?.name || "Unassigned"}</TableCell>
                        <TableCell>{getStatusBadge(wo.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Service Logs */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{terms.service} Logs</h3>
                  <Select value={serviceFilter} onValueChange={setServiceFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="All Services" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All {terms.service}s</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Card className="border-border/50">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50">
                        <TableHead className="text-xs uppercase tracking-wide">Date</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide">{terms.service.toUpperCase()}</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide">Tech</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide">Mileage</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                        <TableHead className="text-xs uppercase tracking-wide text-right">Total</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {servicesLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                          </TableCell>
                        </TableRow>
                      ) : servicesError ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12 text-red-700 bg-red-50 rounded p-4">
                            <div className="space-y-2">
                              <p>{servicesError}</p>
                              <Button size="sm" variant="outline" onClick={fetchVehicleData}>Retry</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredServices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                            No service history yet
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredServices.map((service) => (
                          <TableRow 
                            key={service.id} 
                            className="border-border/50 cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/services/${service.id}`)}
                          >
                            <TableCell>
                              <div>
                                <p className="font-medium">{format(new Date(service.service_date), "MMM dd, yyyy")}</p>
                                {service.service_number && (
                                  <p className="text-xs text-primary font-mono">{service.service_number}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{service.service_type}</p>
                                <p className="text-xs text-muted-foreground truncate max-w-48">{service.description}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                    {service.technician?.substring(0, 2).toUpperCase() || "NA"}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{service.technician || "Unassigned"}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm font-mono">
                                {service.mileage != null
                                  ? `${service.mileage.toLocaleString()} ${(service.odometer_measure || "mi").toLowerCase()}`
                                  : "—"}
                              </span>
                            </TableCell>
                            <TableCell>{getStatusBadge(service.status)}</TableCell>
                            <TableCell className="text-right">
                              <div>
                                <p className="font-medium">{formatCurrency(service.total_cost)}</p>
                                {(service.labor_cost || service.parts_cost) && (
                                  <p className="text-xs text-muted-foreground">
                                    {service.labor_cost ? `L: ${formatCurrency(service.labor_cost, 0)}` : ""}
                                    {service.labor_cost && service.parts_cost ? " · " : ""}
                                    {service.parts_cost ? `P: ${formatCurrency(service.parts_cost, 0)}` : ""}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  {services.length > 5 && (
                    <div className="p-4 border-t border-border/50 text-center">
                      <Button variant="link" className="text-primary">View All History</Button>
                    </div>
                  )}
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6 lg:sticky lg:top-24 self-start">
                {/* Critical vehicle snapshot: front-end-only summary from already-loaded vehicle/history data. */}
                <Card className="border-primary/20 bg-primary/[0.03]">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">Vehicle Snapshot</CardTitle>
                        <p className="text-xs text-muted-foreground">At-a-glance context before opening deeper tabs</p>
                      </div>
                      <Badge variant={openWorkOrders > 0 ? "destructive" : "secondary"}>
                        {openWorkOrders > 0 ? `${openWorkOrders} open` : "Clear"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Odometer</p>
                        <p className="font-semibold">{vehicle.mileage?.toLocaleString() || "—"} mi</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Last service</p>
                        <p className="font-semibold">{lastServiceDate ? format(new Date(lastServiceDate), "MMM d") : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">History</p>
                        <p className="font-semibold">{completedServicesCount}/{services.length} complete</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Value</p>
                        <p className="font-semibold text-primary">{formatCurrency(totalServicesValue)}</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/60 bg-card/70 p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Upcoming</span>
                        <span className="font-medium">{upcomingAppointments.length} appointment{upcomingAppointments.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Invoices</span>
                        <span className="font-medium">{totalInvoices}</span>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      VIN {vehicle.vin || "not captured"}
                      {vehicle.license_plate ? ` · Plate ${vehicle.license_plate}` : ""}
                    </div>
                  </CardContent>
                </Card>

                {/* Tech Notes */}
                <Card className="border-border/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="h-4 w-4 text-yellow-500" />
                        Tech Notes
                      </CardTitle>
                      <Button variant="link" size="sm" className="text-primary h-auto p-0" onClick={handleSaveNotes}>
                        Save
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Add internal notes for mechanics here..."
                      value={techNotes}
                      onChange={(e) => setTechNotes(e.target.value)}
                      className="min-h-24 bg-muted/50 border-0 resize-none"
                    />
                    {currentUserEmail && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Last updated by <span className="text-primary">{currentUserEmail}</span>
                        {notesUpdatedAt ? ` on ${notesUpdatedAt}` : ""}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Recommendations */}
                <VehicleRecommendations 
                  vehicleId={vehicle.id}
                  currentMileage={vehicle.mileage}
                  onCreateQuote={(rec) => {
                    navigate('/quotes', { 
                      state: { 
                        prefillVehicleId: vehicle.id,
                        prefillVehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
                        prefillCustomerId: customer?.id,
                        prefillDescription: `${rec.title}${rec.description ? `: ${rec.description}` : ''}`
                      }
                    });
                  }}
                />

                {/* Recent Files */}
                <Card className="border-border/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Recent Files</CardTitle>
                      <Button variant="link" size="sm" className="text-primary h-auto p-0">View All</Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-3">
                      <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="h-16 w-16 bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors">
                        <Plus className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* CARFAX Service History */}
                <CarfaxServiceHistory 
                  vin={vehicle.vin} 
                  vehicleName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="invoice-history" className="mt-6">
            <Card className="border-border/50">
              <CardHeader><CardTitle>Invoice History</CardTitle></CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No invoices yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Payment Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell>{inv.service_number || `INV-${inv.id.slice(0, 8)}`}</TableCell>
                          <TableCell>{format(new Date(inv.service_date), "MMM dd, yyyy")}</TableCell>
                          <TableCell>{formatCurrency(inv.total_cost)}</TableCell>
                          <TableCell>{getStatusBadge(inv.status)}</TableCell>
                          <TableCell>
                            <Button variant="link" size="sm" onClick={() => navigate(`/services/${inv.id}`)}>View</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="work-orders" className="mt-6">
            <Card className="border-border/50">
              <CardHeader><CardTitle>Work Orders</CardTitle></CardHeader>
              <CardContent>
                {workOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No work orders found for this vehicle.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Work Order</TableHead>
                        <TableHead>Services Performed</TableHead>
                        <TableHead>Mileage</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Appointment</TableHead>
                        <TableHead>Technician</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workOrders.map((wo) => (
                        <TableRow key={wo.id}>
                          <TableCell>{format(new Date(wo.completed_at || wo.updated_at), "MMM dd, yyyy")}</TableCell>
                          <TableCell>{wo.order_number || wo.id.slice(0, 8)}</TableCell>
                          <TableCell>{wo.tech_notes || "—"}</TableCell>
                          <TableCell>{wo.mileage_captured?.toLocaleString() || "—"}</TableCell>
                          <TableCell>{wo.customers?.name || "—"}</TableCell>
                          <TableCell>{wo.appointments?.id ? wo.appointments.id.slice(0, 8) : "—"}</TableCell>
                          <TableCell>{wo.technicians?.name || "Unassigned"}</TableCell>
                          <TableCell>{getStatusBadge(wo.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appointments Tab */}
          <TabsContent value="appointments" className="mt-6">
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Appointment History</CardTitle>
                  <Button size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Schedule Appointment
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {appointmentsLoading ? (
                  <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
                ) : appointmentsError ? (
                  <div className="text-center py-12 text-red-700 bg-red-50 rounded p-4 space-y-2">
                    <p>{appointmentsError}</p>
                    <Button size="sm" variant="outline" onClick={fetchVehicleData}>Retry</Button>
                  </div>
                ) : appointments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CalendarCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No appointments found for this {terms.vehicle.toLowerCase()}</p>
                    <Button variant="outline" className="mt-4">
                      Schedule First Appointment
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {appointments.map((appointment) => (
                      <div 
                        key={appointment.id} 
                        className="flex items-start gap-4 p-4 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/appointments/${appointment.id}`)}
                      >
                        <div className="h-12 w-12 rounded-lg bg-primary/10 flex flex-col items-center justify-center">
                          <span className="text-xs font-medium text-primary">
                            {format(new Date(appointment.scheduled_date), "MMM")}
                          </span>
                          <span className="text-lg font-bold text-primary leading-none">
                            {format(new Date(appointment.scheduled_date), "dd")}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-medium">{appointment.title}</h4>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(appointment.scheduled_date), "EEEE, MMMM d, yyyy")} at {appointment.scheduled_time}
                              </p>
                              {appointment.description && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {appointment.description}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {getStatusBadge(appointment.status)}
                              {appointment.estimated_cost && (
                                <span className="text-sm font-medium">
                                  Est. {formatCurrency(appointment.estimated_cost)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {appointment.duration_minutes} min
                            </span>
                            {appointment.guest_name && (
                              <span>Booked by: {appointment.guest_name}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="specs" className="mt-6 space-y-6">
            <VehicleFilterMatchCard
              title="Filter match"
              year={vehicle.year}
              make={vehicle.make}
              model={vehicle.model}
              engine={vehicle.engine ?? null}
              vehicleKind="retail"
              vehicleId={vehicle.id}
              allowConfirm
            />
            <VehicleSpecifications 
              year={vehicle.year} 
              make={vehicle.make} 
              model={vehicle.model} 
            />
          </TabsContent>

          <TabsContent value="owner" className="mt-6">
            <Card className="border-border/50">
              <CardContent className="p-6">
                {customer ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16">
                        <AvatarFallback className="text-xl bg-primary/10 text-primary">
                          {customer.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="text-xl font-semibold">{customer.name}</h3>
                        <p className="text-muted-foreground">{terms.customer}</p>
                      </div>
                    </div>
                    <Button variant="outline">View {terms.customer} Profile</Button>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No owner assigned to this {terms.vehicle.toLowerCase()}</p>
                    <Button variant="outline" className="mt-4">Assign Owner</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="photos" className="mt-6">
            <Card className="border-border/50">
              <CardContent className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="aspect-square bg-muted rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors">
                    <Plus className="h-8 w-8 text-primary mb-2" />
                    <span className="text-sm text-primary">Add</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="repairs" className="mt-6">
            <VehicleRepairs
              vin={vehicle.vin}
              vehicleName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            />
          </TabsContent>
        </Tabs>

        {/* Edit Vehicle Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit {terms.vehicle} Details</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateVehicle} className="space-y-4">
              <VehicleYMMSelector
                required
                value={{ year: editFormData.year ? String(editFormData.year) : "", make: editFormData.make || "", model: editFormData.model || "" }}
                onChange={(v) => setEditFormData({ ...editFormData, year: v.year ? parseInt(v.year) : editFormData.year, make: v.make, model: v.model })}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Color</Label>
                  <Input 
                    value={editFormData.color} 
                    onChange={(e) => setEditFormData({ ...editFormData, color: e.target.value })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mileage</Label>
                  <Input 
                    type="number" 
                    value={editFormData.mileage} 
                    onChange={(e) => setEditFormData({ ...editFormData, mileage: e.target.value })} 
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>VIN</Label>
                  <Input 
                    value={editFormData.vin} 
                    onChange={(e) => setEditFormData({ ...editFormData, vin: e.target.value.toUpperCase() })} 
                    maxLength={17}
                    className="font-mono uppercase"
                    placeholder="17-character VIN"
                  />
                </div>
                <div className="space-y-2">
                  <Label>License Plate</Label>
                  <Input 
                    value={editFormData.license_plate} 
                    onChange={(e) => setEditFormData({ ...editFormData, license_plate: e.target.value.toUpperCase() })} 
                    className="uppercase"
                  />
                </div>
              </div>

              {/* Admin spec override — engine / oil / capacity. Manual entries always
                  win over ambiguous vehicle_specifications matches. */}
              <div className="space-y-3 rounded-md border border-border/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Specifications Override</p>
                    <p className="text-xs text-muted-foreground">
                      {specOptions.length > 1
                        ? `${specOptions.length} engine/oil variants found for this year/make/model — pick the correct one or type a custom value.`
                        : "Manually correct engine, oil type, or capacity for this vehicle."}
                    </p>
                  </div>
                </div>
                {specOptions.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Apply a known spec variant</Label>
                    <Select
                      onValueChange={(val) => {
                        const opt = specOptions[parseInt(val, 10)];
                        if (!opt) return;
                        setEditFormData((prev) => ({
                          ...prev,
                          engine: opt.engine || prev.engine,
                          oil_type: opt.oil_type || prev.oil_type,
                          oil_capacity: opt.oil_capacity || prev.oil_capacity,
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a spec variant…" />
                      </SelectTrigger>
                      <SelectContent>
                        {specOptions.map((opt, idx) => (
                          <SelectItem key={idx} value={String(idx)}>
                            {[opt.engine, opt.oil_type, opt.oil_capacity].filter(Boolean).join(" · ") || "Unnamed variant"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Engine</Label>
                    <Input
                      value={editFormData.engine}
                      onChange={(e) => setEditFormData({ ...editFormData, engine: e.target.value })}
                      placeholder="e.g., 2.4L 4-cyl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Oil Type</Label>
                    <Input
                      value={editFormData.oil_type}
                      onChange={(e) => setEditFormData({ ...editFormData, oil_type: e.target.value })}
                      placeholder="e.g., 0W-20 Synthetic"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Oil Capacity</Label>
                    <Input
                      value={editFormData.oil_capacity}
                      onChange={(e) => setEditFormData({ ...editFormData, oil_capacity: e.target.value })}
                      placeholder='e.g., "5.1 qts with filter"'
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea 
                  value={editFormData.notes} 
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })} 
                  rows={3}
                  placeholder="Internal notes about this vehicle..."
                />
              </div>
              <div className="flex gap-2 justify-end pt-4">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Save Changes
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default VehicleDetail;

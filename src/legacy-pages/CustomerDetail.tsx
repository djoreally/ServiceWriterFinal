import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchCustomerDetail } from "@/application/queries/customer-detail.query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Car, Wrench, FileText, MapPin, Calendar, DollarSign, Edit } from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import ServiceInvoice from "@/components/ServiceInvoice";
import { ClickablePhone, ClickableEmail } from "@/components/ui/clickable-contact";
import { VehiclePartsManager } from "@/components/parts/VehiclePartsManager";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  license_plate: string | null;
  color: string | null;
  mileage: number | null;
}

interface Service {
  id: string;
  service_date: string;
  service_type: string;
  description: string;
  total_cost: number;
  status: string;
  vehicle_id: string | null;
}

interface Quote {
  id: string;
  quote_number: string;
  quote_date: string;
  description: string;
  total_cost: number;
  status: string;
  vehicle_id: string | null;
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
  vehicle_id: string | null;
}

const CustomerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { terms } = useTerminology();
  const { formatCurrency } = useRegionalSettings();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [billedTotal, setBilledTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoiceService, setInvoiceService] = useState<Service | null>(null);
  const [partsVehicleId, setPartsVehicleId] = useState<string | null>(null);
  const partsVehicle = vehicles.find((v) => v.id === partsVehicleId) ?? null;

  useEffect(() => {
    if (id) fetchCustomerData();
  }, [id]);

  const fetchCustomerData = async () => {
    if (!id) return;
    setLoading(true);

    const result = await fetchCustomerDetail(id);
    if (!result) {
      navigate("/customers");
      return;
    }
    setCustomer(result.customer);
    setVehicles(result.vehicles);
    setServices(result.services);
    setQuotes(result.quotes);
    setAppointments(result.appointments);
    // payment_records.amount is in cents — convert to dollars
    const totalCents = (result.paymentRecords ?? []).reduce((s, r) => s + (r.amount || 0), 0);
    setBilledTotal(result.paymentRecords.length > 0 ? totalCents / 100 : null);
    setLoading(false);
  };

  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const getVehicleInfo = (vehicleId: string | null) => {
    if (!vehicleId) return "No vehicle";
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Unknown";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge className="bg-gray-500/10 text-gray-600">Completed</Badge>;
      case "in_progress":
      case "in-progress": return <Badge className="bg-primary/10 text-primary">In Progress</Badge>;
      case "pending": return <Badge className="bg-yellow-500/10 text-yellow-600">Pending</Badge>;
      case "accepted": return <Badge className="bg-gray-500/10 text-gray-600">Accepted</Badge>;
      case "rejected": return <Badge className="bg-destructive/10 text-destructive">Rejected</Badge>;
      case "expired": return <Badge variant="secondary">Expired</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Billed total now sourced from payment_records (authoritative ledger). Null means not calculated from real billing records.
  const completedServiceRevenue = billedTotal;
  const completedServices = useMemo(() => services.filter((service) => service.status === "completed"), [services]);
  const latestService = useMemo(
    () =>
      [...completedServices].sort(
        (a, b) => parseISO(b.service_date).getTime() - parseISO(a.service_date).getTime(),
      )[0],
    [completedServices],
  );
  const daysSinceLast = latestService ? differenceInDays(new Date(), parseISO(latestService.service_date)) : null;
  const hasCompletedServiceHistory = completedServices.length > 0;
  const healthScore = hasCompletedServiceHistory
    ? Math.min(
        100,
        Math.round(((completedServiceRevenue ?? 0) / 500) * 40 + (completedServices.length / 10) * 30 + (daysSinceLast !== null && daysSinceLast < 90 ? 30 : 0)),
      )
    : null;
  const healthTier = !hasCompletedServiceHistory ? "New customer" : healthScore! >= 90 ? "VIP" : healthScore! >= 70 ? "Gold" : healthScore! >= 50 ? "Silver" : "Unranked";
  const ringRadius = 24;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - (healthScore ?? 0) / 100);

  if (invoiceService) {
    return (
      <ServiceInvoice
        serviceId={invoiceService.id}
        customerId={id || ""}
        vehicleId={invoiceService.vehicle_id || ""}
        onClose={() => setInvoiceService(null)}
      />
    );
  }

  if (loading) {
    return (
      <AppLayout title="Loading...">
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-24 w-24 rounded-md" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-72" />
                </div>
              </div>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!customer) {
    return (
      <AppLayout title="Not Found">
        <div className="text-center py-12">
          <p className="text-muted-foreground">{terms.customer} not found</p>
          <Button variant="outline" onClick={() => navigate("/customers")} className="mt-4">
            Back to {terms.customer}s
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={customer.name}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/customers")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{terms.customer} Details</h1>
            <p className="text-muted-foreground">View complete {terms.customer.toLowerCase()} profile and history</p>
          </div>
        </div>

        {/* Customer Profile Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              <Avatar className="h-24 w-24">
                <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                  {getInitials(customer.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold">{customer.name}</h2>
                  <p className="text-muted-foreground">
                    {terms.customer} since {format(new Date(customer.created_at), "MMMM yyyy")}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {customer.phone && (
                    <ClickablePhone phone={customer.phone} className="text-sm" />
                  )}
                  {customer.email && (
                    <ClickableEmail email={customer.email} className="text-sm" />
                  )}
                  {customer.address && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{customer.address}</span>
                    </div>
                  )}
                </div>
                {customer.notes && (
                  <p className="text-sm text-muted-foreground border-t pt-4">{customer.notes}</p>
                )}
              </div>
              <Button variant="outline" size="sm" className="self-start">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Car className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{vehicles.length}</p>
                <p className="text-xs text-muted-foreground">{terms.vehicle}s</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-500/10">
                <Wrench className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{services.length}</p>
                <p className="text-xs text-muted-foreground">{terms.service}s</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <FileText className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{quotes.length}</p>
                <p className="text-xs text-muted-foreground">{terms.quote}s</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedServiceRevenue === null ? "—" : formatCurrency(completedServiceRevenue)}</p>
                <p className="text-xs text-muted-foreground">{completedServiceRevenue === null ? "No billing records" : "Billed Service Total"}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <svg width="60" height="60" viewBox="0 0 60 60" className="shrink-0">
                <circle cx="30" cy="30" r={ringRadius} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                <circle
                  cx="30"
                  cy="30"
                  r={ringRadius}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 30 30)"
                />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-[11px] font-semibold">
                  {healthScore ?? "—"}
                </text>
              </svg>
              <div>
                <p className="text-sm font-semibold">Customer Health</p>
                <p className="text-xs text-muted-foreground">{healthTier}</p>
                <p className="text-xs text-muted-foreground">{daysSinceLast === null ? "No completed service yet" : `Last ${terms.service.toLowerCase()}: ${daysSinceLast}d ago`}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="vehicles" className="space-y-4">
          <TabsList>
            <TabsTrigger value="vehicles" className="gap-2">
              <Car className="h-4 w-4" />
              {terms.vehicle}s ({vehicles.length})
            </TabsTrigger>
            <TabsTrigger value="services" className="gap-2">
              <Wrench className="h-4 w-4" />
              {terms.service} History ({services.length})
            </TabsTrigger>
            <TabsTrigger value="quotes" className="gap-2">
              <FileText className="h-4 w-4" />
              {terms.quote}s ({quotes.length})
            </TabsTrigger>
            <TabsTrigger value="appointments" className="gap-2">
              <Calendar className="h-4 w-4" />
              Appointments ({appointments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vehicles">
            <Card>
              <CardHeader>
                <CardTitle>{terms.vehicle}s</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{terms.vehicle.toUpperCase()}</TableHead>
                      <TableHead>VIN</TableHead>
                      <TableHead>LICENSE PLATE</TableHead>
                      <TableHead>MILEAGE</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No {terms.vehicle.toLowerCase()}s registered
                        </TableCell>
                      </TableRow>
                    ) : (
                      vehicles.map((vehicle) => (
                        <TableRow key={vehicle.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                              {vehicle.color && <p className="text-xs text-muted-foreground">{vehicle.color}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{vehicle.vin || "—"}</TableCell>
                          <TableCell>{vehicle.license_plate || "—"}</TableCell>
                          <TableCell>{vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setPartsVehicleId((prev) => (prev === vehicle.id ? null : vehicle.id))
                                }
                              >
                                {partsVehicleId === vehicle.id ? "Hide parts" : "Parts"}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/vehicles/${vehicle.id}`)}>
                                View
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            {partsVehicle && (
              <VehiclePartsManager
                className="mt-4"
                vehicleKind="retail"
                vehicleId={partsVehicle.id}
                vehicleLabel={`${partsVehicle.year} ${partsVehicle.make} ${partsVehicle.model}`}
                year={partsVehicle.year}
                make={partsVehicle.make}
                model={partsVehicle.model}
              />
            )}

          </TabsContent>

          <TabsContent value="services">
            <Card>
              <CardHeader>
                <CardTitle>{terms.service} History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DATE</TableHead>
                      <TableHead>{terms.service.toUpperCase()} TYPE</TableHead>
                      <TableHead>{terms.vehicle.toUpperCase()}</TableHead>
                      <TableHead>STATUS</TableHead>
                      <TableHead className="text-right">COST</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No {terms.service.toLowerCase()} history
                        </TableCell>
                      </TableRow>
                    ) : (
                      services.map((service) => (
                        <TableRow key={service.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {format(new Date(service.service_date), "MMM dd, yyyy")}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{service.service_type}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1">{service.description}</p>
                            </div>
                          </TableCell>
                          <TableCell>{getVehicleInfo(service.vehicle_id)}</TableCell>
                          <TableCell>{getStatusBadge(service.status)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(Number(service.total_cost || 0))}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => setInvoiceService(service)}>
                              <FileText className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quotes">
            <Card>
              <CardHeader>
                <CardTitle>{terms.quote}s</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{terms.quote.toUpperCase()} #</TableHead>
                      <TableHead>DATE</TableHead>
                      <TableHead>DESCRIPTION</TableHead>
                      <TableHead>STATUS</TableHead>
                      <TableHead className="text-right">AMOUNT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No {terms.quote.toLowerCase()}s
                        </TableCell>
                      </TableRow>
                    ) : (
                      quotes.map((quote) => (
                        <TableRow key={quote.id}>
                          <TableCell className="font-mono text-sm">{quote.quote_number}</TableCell>
                          <TableCell>{format(new Date(quote.quote_date), "MMM dd, yyyy")}</TableCell>
                          <TableCell className="max-w-xs truncate">{quote.description}</TableCell>
                          <TableCell>{getStatusBadge(quote.status)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(Number(quote.total_cost || 0))}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appointments">
            <Card>
              <CardHeader>
                <CardTitle>Appointments</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DATE</TableHead>
                      <TableHead>TITLE</TableHead>
                      <TableHead>{terms.vehicle.toUpperCase()}</TableHead>
                      <TableHead>STATUS</TableHead>
                      <TableHead className="text-right">EST. COST</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appointments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No appointments found
                        </TableCell>
                      </TableRow>
                    ) : (
                      appointments.map((appointment) => (
                        <TableRow 
                          key={appointment.id} 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/appointments/${appointment.id}`)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {format(new Date(appointment.scheduled_date), "MMM dd, yyyy")}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{appointment.title}</p>
                              {appointment.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">{appointment.description}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getVehicleInfo(appointment.vehicle_id)}</TableCell>
                          <TableCell>{getStatusBadge(appointment.status)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {appointment.estimated_cost ? formatCurrency(Number(appointment.estimated_cost)) : "—"}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm">View</Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default CustomerDetail;

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { emailServiceRecord, fetchServiceInspections } from "@/application/queries/service-detail-email.query";
import { SHOW_INCOMPLETE_FEATURES } from "@/lib/feature-flags";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Mail,
  Printer,
  User,
  Car,
  Phone,
  MapPin,
  CheckCircle2,
  Clock,
  FileText,
  Wrench,
  Package,
  History,
  Droplets,
  Loader2,
  Mic,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { getServiceStatusBadgeClass, getServiceStatusLabel } from "@/lib/statusStyles";
import { VoiceInspection } from "@/components/inspections/VoiceInspection";
import { VisualServiceReport } from "@/components/inspections/VisualServiceReport";
import { PrintLetterhead } from "@/components/service/PrintLetterhead";
import {
  fetchServiceDetail,
  type ServiceDetailResult,
  type ServiceDetailData as ServiceData,
  type ServiceDetailCustomer as CustomerData,
  type ServiceDetailVehicle as VehicleData,
  type ServiceDetailLaborItem as LaborItem,
  type ServiceDetailTimelineEvent as TimelineEvent,
} from "@/application/queries";

const ServiceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { terms } = useTerminology();
  const { formatDate } = useRegionalSettings();

  const [service, setService] = useState<ServiceData | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [vehicle, setVehicle] = useState<VehicleData | null>(null);
  const [laborItems, setLaborItems] = useState<LaborItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogDescription, setCatalogDescription] = useState<string | null>(null);
  const [catalogLaborHours, setCatalogLaborHours] = useState<number | null>(null);
  const [guestInfo, setGuestInfo] = useState<{ name: string; email?: string; phone?: string } | null>(null);
  const [oilType, setOilType] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string>("");
  const [businessEmail, setBusinessEmail] = useState<string>("");
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);

    const result = await fetchServiceDetail(id);
    if (!result) {
      toast.error("Service not found");
      navigate("/services");
      return;
    }

    setService(result.service);
    setCustomer(result.customer);
    setVehicle(result.vehicle);
    setLaborItems(result.laborItems);
    setTimeline(result.timeline);
    setBusinessName(result.businessName);
    setBusinessEmail(result.businessEmail);
    setGuestInfo(result.guestInfo);
    setCatalogDescription(result.catalogDescription);
    setCatalogLaborHours(result.catalogLaborHours);
    setOilType(result.oilType);
    setLoading(false);
  };

  // Determine effective labor hours: stored value > catalog value
  const effectiveLaborHours = service?.labor_hours ?? catalogLaborHours;

  const handleEmailServiceRecord = async () => {
    const recipientEmail = customer?.email || guestInfo?.email;
    const recipientName = customer?.name || guestInfo?.name;

    if (!recipientEmail) {
      toast.error("No customer email address found for this service record");
      return;
    }

    setSendingEmail(true);
    try {
      const vehicleInfo = vehicle
        ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.vin ? ` (VIN: ${vehicle.vin})` : ""}`
        : undefined;

      await emailServiceRecord({
        to: recipientEmail,
        type: "service_record",
        customerName: recipientName,
        businessName: businessName || "Your Service Provider",
        businessEmail: businessEmail || undefined,
        documentNumber: service?.service_number || service?.id.slice(0, 8).toUpperCase(),
        serviceDescription: catalogDescription || service?.description,
        vehicleInfo,
        scheduledDate: service?.service_date ? format(new Date(service.service_date), "MMMM d, yyyy") : undefined,
        notes: service?.notes || undefined,
      });


      toast.success(`Service record emailed to ${recipientEmail}`);
    } catch (err: unknown) {
      const e = err as Error;
      toast.error(e.message || "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };


  const getStatusBadge = (status: string) => {
    const className = getServiceStatusBadgeClass(status) || "bg-muted text-muted-foreground";
    return <Badge className={className}>{getServiceStatusLabel(status)}</Badge>;
  };

  const getTimelineIcon = (status: string) => {
    if (status === "completed" || status.toLowerCase().includes("ready")) return <CheckCircle2 className="h-4 w-4" />;
    return <Clock className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <AppLayout title="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  if (!service) {
    return (
      <AppLayout title="Not Found">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Service record not found</p>
          <Button onClick={() => navigate("/services")} className="mt-4">Back to Services</Button>
        </div>
      </AppLayout>
    );
  }

  // Parse parts_used string into individual items for display
  const partsUsedItems = service.parts_used
    ? service.parts_used.split(",").map(p => p.trim()).filter(Boolean)
    : [];

  const isCompleted = service.status === "completed";
  const recipientEmail = customer?.email || guestInfo?.email;

  return (
    <AppLayout title={`${terms.service} Record`}>
      <div className="space-y-6">
        {/* Print-only letterhead — business details for legal/Carfax-compliant record */}
        <PrintLetterhead
          service={service}
          customer={customer}
          vehicle={vehicle}
          guestInfo={guestInfo}
        />

        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between print:hidden">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold">
                {terms.service} Record #{service.service_number || service.id.slice(0, 8).toUpperCase()}
              </h1>
              {getStatusBadge(service.status)}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Created on {formatDate(service.created_at)}
              {service.technician && ` • Technician: ${service.technician}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            {/* Email service record button — gated: inspection email non-functional per audit */}
            {SHOW_INCOMPLETE_FEATURES && recipientEmail && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleEmailServiceRecord}
                disabled={sendingEmail}
              >
                {sendingEmail ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Email Record
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer & Vehicle Information */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{terms.customer} & {terms.vehicle} Information</CardTitle>
                {customer && (
                  <Button variant="link" size="sm" className="gap-1" onClick={() => navigate(`/customers/${customer.id}`)}>
                    <History className="h-4 w-4" />
                    View History
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Customer Info */}
                  <div className="flex gap-4">
                    <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold">{customer?.name || guestInfo?.name || "—"}</p>
                      {customer?.created_at && (
                        <p className="text-sm text-primary">Customer since {format(new Date(customer.created_at), "yyyy")}</p>
                      )}
                      {(customer?.phone || guestInfo?.phone) && (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Phone className="h-4 w-4" />{customer?.phone || guestInfo?.phone}
                        </p>
                      )}
                      {(customer?.email || guestInfo?.email) && (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Mail className="h-4 w-4" />{customer?.email || guestInfo?.email}
                        </p>
                      )}
                      {customer?.address && (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <MapPin className="h-4 w-4" />{customer.address}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Vehicle Info */}
                  <div className="flex gap-4">
                    <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Car className="h-6 w-6 text-accent-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold">
                        {(service.vehicle_year ?? vehicle?.year)
                          ? `${service.vehicle_year ?? vehicle?.year} ${service.vehicle_make ?? vehicle?.make ?? ""} ${service.vehicle_model ?? vehicle?.model ?? ""}`.trim()
                          : "No vehicle"}
                      </p>
                      {vehicle?.color && <p className="text-sm text-muted-foreground">{vehicle.color}</p>}
                      {(service.vehicle_engine || vehicle?.engine) && (
                        <p className="text-sm text-muted-foreground">{service.vehicle_engine ?? vehicle?.engine}</p>
                      )}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
                        {(service.vin_captured || vehicle?.vin) && (
                          <>
                            <span className="text-muted-foreground font-medium">VIN NUMBER</span>
                            <span className="text-muted-foreground font-medium">ODOMETER</span>
                            <span className="font-mono">{service.vin_captured ?? vehicle?.vin}</span>
                            <span>
                              {/* Per-record odometer only — never fall back to the
                                  vehicle's *current* mileage or every old record
                                  shows the same number. */}
                              {service.mileage != null ? service.mileage.toLocaleString() : "—"}{" "}
                              {service.odometer_measure?.toLowerCase() || "mi"}
                            </span>
                          </>
                        )}
                        {(service.license_plate || vehicle?.license_plate) && (
                          <>
                            <span className="text-muted-foreground font-medium">PLATE</span>
                            <span></span>
                            <span>{service.license_plate ?? vehicle?.license_plate}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Service Breakdown */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{terms.service} Breakdown</CardTitle>
                {service.technician && (
                  <span className="text-sm text-muted-foreground">Technician: {service.technician}</span>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Work Performed — read-only for completed records */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-5 w-5 text-primary" />
                      <h4 className="font-semibold">Work Performed</h4>
                    </div>
                    {/* No "Add Work Item" button — completed records are immutable */}
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>DESCRIPTION</TableHead>
                          <TableHead className="text-right">HOURS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {laborItems.length > 0 ? laborItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.description}</TableCell>
                            <TableCell className="text-right">{item.hours}</TableCell>
                          </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell>{service.service_type}</TableCell>
                            {/* Show stored labor hours, falling back to catalog estimate */}
                            <TableCell className="text-right">
                              {effectiveLaborHours != null ? effectiveLaborHours : "—"}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Parts & Materials Used */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="h-5 w-5 text-primary" />
                    <h4 className="font-semibold">Parts & Materials Used</h4>
                  </div>
                  {partsUsedItems.length > 0 ? (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>PART / MATERIAL</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {partsUsedItems.map((part, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{part}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="border rounded-lg p-6 text-center text-muted-foreground">
                      No parts recorded
                    </div>
                  )}
                </div>

                {/* Oil Usage — show if oil was used */}
                {(service.oil_quarts_used || vehicle?.oil_type) && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Droplets className="h-5 w-5 text-blue-500" />
                      <h4 className="font-semibold">Oil Information</h4>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                      {(service.oil_quarts_used || oilType || vehicle?.oil_type) && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Oil Used:</span>
                          <span className="font-medium">
                            {service.oil_quarts_used ? `${service.oil_quarts_used} qt` : ""}
                            {(oilType || vehicle?.oil_type) ? ` ${oilType || vehicle?.oil_type}` : ""}
                          </span>
                        </div>
                      )}
                      {vehicle?.oil_capacity && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Vehicle Capacity:</span>
                          <span className="font-medium">
                            {/* Render capacity as-stored — avoid appending "qt" when the
                                stored string already contains a unit (e.g. "5.1 qts with filter"). */}
                            {/qt|quart|liter|l\b/i.test(vehicle.oil_capacity)
                              ? vehicle.oil_capacity
                              : `${vehicle.oil_capacity} qt`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Mechanic Notes — strip redundant "Mileage: NNN" prefix since mileage is captured separately */}
            {(() => {
              const raw = (service.notes || service.description || "").toString();
              const cleaned = raw
                .replace(/^\s*Mileage:\s*[0-9,]+\s*(mi)?\.?\s*/i, "")
                .replace(/(^|\n)\s*Mileage:\s*[0-9,]+\s*(mi)?\.?\s*/gi, "$1")
                .trim();
              if (!cleaned) return null;
              return (
                <Card>
                  <CardHeader>
                    <CardTitle>Service Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-sm whitespace-pre-wrap">{cleaned}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Completed record notice — no photos/inspections on a finished record */}
            {isCompleted && (
              <Card className="border-dashed border-muted-foreground/30">
                <CardContent className="py-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <span>This is a completed service record. Photos, inspections, and work items cannot be added to a finished record.</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Voice Inspection Section */}
            <VoiceInspectionSection
              serviceId={service.id}
              vehicleId={service.vehicle_id || undefined}
              vehicleInfo={vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : undefined}
              isCompleted={isCompleted}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Service Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>{terms.service} Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Always show created */}
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      </div>
                      {timeline.length > 0 && <div className="w-0.5 flex-1 bg-border mt-2"></div>}
                    </div>
                    <div>
                      <p className="font-medium">Created</p>
                      <p className="text-sm text-muted-foreground">{formatDate(service.created_at)}</p>
                    </div>
                  </div>
                  {/* Timeline events */}
                  {timeline.map((event, index) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                          {getTimelineIcon(event.status)}
                        </div>
                        {index < timeline.length - 1 && <div className="w-0.5 flex-1 bg-border mt-2"></div>}
                      </div>
                      <div>
                        <p className="font-medium capitalize">{event.status.replace(/_/g, " ")}</p>
                        <p className="text-sm text-muted-foreground">{formatDate(event.timestamp)}</p>
                        {event.notes && <p className="text-sm text-muted-foreground mt-1">{event.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Service Summary */}
            <Card>
              <CardHeader>
                <CardTitle>{terms.service} Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{terms.service} Type</span>
                  <span className="font-medium">{service.service_type}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date</span>
                  <span>{formatDate(service.service_date)}</span>
                </div>
                {effectiveLaborHours != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Labor Hours</span>
                    <span>
                      {effectiveLaborHours} hrs
                      {!service.labor_hours && catalogLaborHours && (
                        <span className="text-xs text-muted-foreground ml-1">(catalog est.)</span>
                      )}
                    </span>
                  </div>
                )}
                {service.oil_quarts_used && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Oil Used</span>
                    <span>{service.oil_quarts_used} qt{oilType ? ` ${oilType}` : ""}</span>
                  </div>
                )}
                {service.technician && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Technician</span>
                    <span>{service.technician}</span>
                  </div>
                )}
                <Separator />
                <div className="text-sm">
                  <span className="text-muted-foreground">Description</span>
                  <p className="mt-1">{catalogDescription || service.description}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

/**
 * Inline section for voice inspections on a service detail page.
 * Shows existing inspections + button to start a new voice inspection.
 */
function VoiceInspectionSection({
  serviceId,
  vehicleId,
  vehicleInfo,
  isCompleted,
}: {
  serviceId: string;
  vehicleId?: string;
  vehicleInfo?: string;
  isCompleted: boolean;
}) {
  const [showRecorder, setShowRecorder] = useState(false);
  const [viewReportId, setViewReportId] = useState<string | null>(null);
  const [inspections, setInspections] = useState<any[]>([]);
  const [loadingInspections, setLoadingInspections] = useState(true);

  useEffect(() => {
    fetchInspectionsData();
  }, [serviceId]);

  const fetchInspectionsData = async () => {
    setLoadingInspections(true);
    const data = await fetchServiceInspections(serviceId);
    setInspections(data);
    setLoadingInspections(false);
  };

  if (viewReportId) {
    return (
      <VisualServiceReport
        inspectionId={viewReportId}
        onClose={() => setViewReportId(null)}
      />
    );
  }

  if (showRecorder) {
    return (
      <VoiceInspection
        serviceId={serviceId}
        vehicleId={vehicleId}
        vehicleInfo={vehicleInfo}
        onComplete={() => {
          setShowRecorder(false);
          fetchInspectionsData();
        }}
        onCancel={() => setShowRecorder(false)}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" />
          Inspection Reports
        </CardTitle>
        {!isCompleted && (
          <Button size="sm" onClick={() => setShowRecorder(true)} className="gap-1">
            <Mic className="h-4 w-4" />
            Voice Inspect
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loadingInspections ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : inspections.length > 0 ? (
          <div className="space-y-2">
            {inspections.map((insp: any) => (
              <div
                key={insp.id}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => setViewReportId(insp.id)}
              >
                <div>
                  <p className="text-sm font-medium">{insp.template_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {insp.inspector_name} &middot; {insp.inspection_date}
                    {insp.source === "voice" && (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        <Mic className="h-2.5 w-2.5 mr-1" />
                        Voice
                      </Badge>
                    )}
                  </p>
                </div>
                <Badge variant={insp.status === "completed" ? "default" : "outline"} className="text-[10px]">
                  {insp.status}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No inspections yet.{!isCompleted && " Start a voice inspection to create one."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default ServiceDetail;

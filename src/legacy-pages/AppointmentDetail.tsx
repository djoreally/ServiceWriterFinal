import { errorMessage } from "@/lib/error-message";
import { useEffect, useState, useCallback } from 'react';
import { sendReviewRequest } from '@/application/commands/review-request.command';
import { computeFinancialSummary } from '@/lib/financialMath';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCurrentAuthUser,
  fetchAppointmentWithRelations,
  fetchVehicleSpecs,
  fetchCustomerAddressByGuestEmail,
  fetchSucceededPayments,
  fetchAppointmentFeeSettings,
} from '@/application/queries/appointment-detail.query';
import {
  updateAppointmentStatus as updateAppointmentStatusQuery,
  deleteAppointment as deleteAppointmentQuery,
} from '@/application/commands/appointment-detail.command';
import { unassignAppointment, updateAppointmentSchedule } from '@/application/commands';
import { fetchReviewRequestStatusForService } from '@/application/queries/appointments.query';

import { AppointmentSyncCard } from '@/components/appointments/AppointmentSyncCard';
import { AppointmentConfigurationSummary } from '@/components/booking/AppointmentConfigurationSummary';
import { Appointment } from '@/shared/types';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { statusBadgeClasses } from '@/lib/statusStyles';
import { format, parseISO } from 'date-fns';
import { formatTimeLabel, formatDateLabel } from "@/lib/datetime";
import {
  ArrowLeft,
  MapPin, 
  Car, 
  CheckCircle2,
  Clock,
  FileText,
  User,
  Calendar,
  History,
  Edit,
  Loader2,
  XCircle,
  AlertCircle,
  Receipt,
  Wrench,
  Trash2,
  Star,
  UserX,
  MessageSquare,
} from 'lucide-react';
import { InternalInbox } from '@/components/communications/InternalInbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useTerminology } from '@/contexts/TerminologyContext';
import { useRegionalSettings } from '@/contexts/RegionalSettingsContext';
import { LocationPreview } from '@/components/appointments/LocationPreview';
import { ClickablePhone, ClickableEmail } from '@/components/ui/clickable-contact';
import { EditAppointmentDialog } from '@/components/appointments/EditAppointmentDialog';
import { AppointmentServicesList } from '@/components/appointments/AppointmentServicesList';
import { AppointmentPaymentsTab } from '@/components/appointments/AppointmentPaymentsTab';
import { CompleteAppointmentDialog } from '@/components/appointments/CompleteAppointmentDialog';
import { JobActionButton } from '@/components/appointments/JobActionButton';
import { MobileDispatchView } from '@/components/tech/MobileDispatchView';
import { AppointmentSmsTimeline } from '@/components/appointments/AppointmentSmsTimeline';
import { toast } from '@/components/ui/sonner';
import { useServiceCategoryPolicy } from '@/hooks/useServiceCategoryPolicy';

const STATUS_STYLES: Record<string, { className: string; label: string }> = {
  pending: { className: `${statusBadgeClasses.awaiting} animate-pulse`, label: "Pending Approval" },
  confirmed: { className: statusBadgeClasses.scheduled, label: "Confirmed" },
  completed: { className: statusBadgeClasses.completed, label: "Completed" },
  cancelled: { className: statusBadgeClasses.critical, label: "Cancelled" },
  no_show: { className: statusBadgeClasses.awaiting, label: "No Show" },
};

interface AppointmentDetailProps {
  /** When true, renders without AppLayout wrapper (for embedding in tech app) */
  embedded?: boolean;
  /** Override user_id for query — used by admin/master tech to view all business appointments */
  overrideUserId?: string;
  /** Pass technicianId to show MobileDispatchView controls */
  technicianId?: string;
  /** Controls whether destructive delete action is visible/enabled */
  allowDelete?: boolean;
}

export const AppointmentDetail = ({ embedded = false, overrideUserId, technicianId, allowDelete = true }: AppointmentDetailProps = {}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { terms } = useTerminology();
  const { formatCurrency, formatDate } = useRegionalSettings();
  
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("services");
  const [servicesTotal, setServicesTotal] = useState(0);
  const [vehicleSpecs, setVehicleSpecs] = useState<{ oil_type?: string; oil_capacity?: string; engine?: string } | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  /**
   * Category policy for this appointment. Tire and detailing jobs must never
   * render oil/fluid information or be charged a waste-oil disposal fee.
   */
  const categoryPolicy = useServiceCategoryPolicy([
    appointment?.service_catalog?.category ?? null,
    appointment?.service_catalog?.name ?? null,
    appointment?.title ?? null,
  ]);
  const showsFluids = categoryPolicy.showsFluidSpecs;
  const isTireJob = categoryPolicy.vehicleSelector === 'wheel_tire';
  const [feeSettings, setFeeSettings] = useState<{
    waste_oil_fee_enabled: boolean; waste_oil_fee: number;
    shop_fee_enabled: boolean; shop_fee_type: string; shop_fee_value: number; shop_fee_description: string;
    surcharge_enabled: boolean; surcharge_type: string; surcharge_value: number; surcharge_description: string;
    tax_rate: number | null;
  } | null>(null);
  
  // Track if this is a prepaid appointment (deposit was collected upfront)
  const [isPrepaid, setIsPrepaid] = useState(false);
  const [reviewRequestLoading, setReviewRequestLoading] = useState(false);
  const [reviewRequestSent, setReviewRequestSent] = useState(false);
  const [reviewRequestStatus, setReviewRequestStatus] = useState<string | null>(null);
  const [unassigning, setUnassigning] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  const handleReschedule = async () => {
    if (!appointment || !rescheduleDate || !rescheduleTime) return;
    setRescheduling(true);
    try {
      await updateAppointmentSchedule(appointment.id, rescheduleDate, rescheduleTime);
      toast.success('Appointment rescheduled');
      setRescheduleOpen(false);
      fetchAppointment();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to reschedule'));
    } finally {
      setRescheduling(false);
    }
  };


  const handleRequestReview = async () => {
    if (!appointment) return;
    const customerEmail = appointment.customer?.email || appointment.guest_email;
    const customerName = appointment.customer?.name || appointment.guest_name || 'Customer';
    const customerId = appointment.customer?.id;

    if (!customerEmail) {
      toast.error("No customer email available to send review request.");
      return;
    }
    if (!customerId) {
      toast.error("Customer record is required to send a review request.");
      return;
    }
    if (!appointment.service_record_id) return;

    setReviewRequestLoading(true);
    const result = await sendReviewRequest({
      appointmentId: appointment.id,
      customerId,
      customerEmail,
      customerName,
      serviceRecordId: appointment.service_record_id,
      serviceName: appointment.service_catalog?.name || appointment.title,
    });
    setReviewRequestLoading(false);

    if (result.success) {
      toast.success("Review request sent!");
      setReviewRequestSent(true);
      setReviewRequestStatus("pending");
    } else {
      toast.error(result.error || "Failed to send review request.");
    }
  };

  const fetchAppointment = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const user = await getCurrentAuthUser();
    if (!user) {
      setError('You must be logged in to view appointment details.');
      setLoading(false);
      return;
    }

    // Fetch appointment with related data
    const queryUserId = overrideUserId || user.id;
    const { data, error: fetchError } = await fetchAppointmentWithRelations(id, queryUserId);

    if (fetchError || !data) {
      setAppointment(null);
      setError(fetchError instanceof Error
        ? fetchError.message
        : "We couldn't load this appointment. It may have been deleted or you may not have access.");
      setLoading(false);
      return;
    }

    setAppointment(data as unknown as Appointment);

    if (data.service_record_id) {
      const status = await fetchReviewRequestStatusForService(
        data.service_record_id,
        queryUserId,
      );
      setReviewRequestStatus(status);
      setReviewRequestSent(status !== null);
    } else {
      setReviewRequestStatus(null);
      setReviewRequestSent(false);

    }

    // Fetch vehicle specifications if vehicle exists
    if (data.vehicle) {
      const { data: specs } = await fetchVehicleSpecs(data.vehicle.make, data.vehicle.model, data.vehicle.year);
      // Vehicle's own data takes priority, then specs from database
      setVehicleSpecs({
        oil_type: data.vehicle.oil_type || specs?.oil_type || undefined,
        oil_capacity: data.vehicle.oil_capacity || specs?.oil_capacity || undefined,
        engine: data.vehicle.engine || specs?.engine || undefined,
      });
    } else {
      setVehicleSpecs(null);
    }

    // Resolve address: prefer customer → appointment location_address → email lookup
    let address = data.customer?.address || data.location_address || null;
    if (!address && data.guest_email) {
      const { data: matchedCustomer } = await fetchCustomerAddressByGuestEmail(data.guest_email, queryUserId);
      address = matchedCustomer?.address || null;
    }
    setResolvedAddress(address);

    // Check if there's a paid deposit for this appointment
    const { data: payments } = await fetchSucceededPayments(id);
    setIsPrepaid(payments && payments.length > 0);
    setLoading(false);
  }, [id, overrideUserId]);

  useEffect(() => {
    fetchAppointment();
  }, [fetchAppointment]);

  // Fetch fee settings from business profile
  useEffect(() => {
    const fetchFees = async () => {
      const user = await getCurrentAuthUser();
      if (!user) return;
      const { data } = await fetchAppointmentFeeSettings(overrideUserId || user.id);
      if (data) {
        setFeeSettings({
          waste_oil_fee_enabled: data.waste_oil_fee_enabled ?? false,
          waste_oil_fee: data.waste_oil_fee ?? 0,
          shop_fee_enabled: data.shop_fee_enabled ?? false,
          shop_fee_type: data.shop_fee_type ?? "fixed",
          shop_fee_value: data.shop_fee_value ?? 0,
          shop_fee_description: data.shop_fee_description ?? "",
          surcharge_enabled: data.surcharge_enabled ?? false,
          surcharge_type: data.surcharge_type ?? "fixed",
          surcharge_value: data.surcharge_value ?? 0,
          surcharge_description: data.surcharge_description ?? "",
          tax_rate: data.tax_rate,
        });
      }
    };
    fetchFees();
  }, [overrideUserId]);

  const handleEditSuccess = () => {
    fetchAppointment();
  };

  const handleCompleteSuccess = (serviceId: string) => {
    fetchAppointment();
    // Optionally navigate to service record
    // navigate(`/services/${serviceId}`);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!appointment) return;
    try {
      await updateAppointmentStatusQuery(appointment.id, newStatus);
      toast.success(`Appointment ${newStatus === 'cancelled' ? 'cancelled' : 'updated'}`);
      fetchAppointment();
    } catch (err) {
      const message = err instanceof Error ? errorMessage(err) : 'Failed to update status';
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!appointment || !allowDelete) {
      toast.error('You do not have permission to delete this appointment');
      return;
    }
    const { error } = await deleteAppointmentQuery(appointment.id);
    if (error) {
      toast.error('Failed to delete appointment');
    } else {
      toast.success('Appointment deleted');
      navigate('/appointments');
    }
  };

  const handleUnassign = async () => {
    if (!appointment) return;
    setUnassigning(true);
    try {
      await unassignAppointment(appointment.id);
      toast.success('Appointment moved back to dispatch board');
      fetchAppointment();
    } catch {
      toast.error('Failed to unassign appointment');
    } finally {
      setUnassigning(false);
    }
  };

  const handleServicesChange = (subtotal: number, _count: number) => {
    setServicesTotal(subtotal);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4" />;
      case 'cancelled': return <XCircle className="h-4 w-4" />;
      case 'no_show': return <AlertCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <AppointmentDetailLayout embedded={embedded}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppointmentDetailLayout>
    );
  }

  if (error || !appointment) {
    return (
      <AppointmentDetailLayout embedded={embedded}>
        <div className="max-w-md mx-auto text-center py-12 space-y-4">
          <h1 className="text-xl font-semibold">Appointment unavailable</h1>
          <p className="text-muted-foreground">{error ?? 'This appointment could not be found.'}</p>
          <Button onClick={() => navigate(-1)} className="w-full">
            Back
          </Button>
        </div>
      </AppointmentDetailLayout>
    );
  }

  const statusStyle = STATUS_STYLES[appointment.status] || STATUS_STYLES.confirmed;
  const vehicleName = appointment.vehicle 
    ? `${appointment.vehicle.year} ${appointment.vehicle.make} ${appointment.vehicle.model}` 
    : 'Vehicle not specified';
  // Prefer guest_name (full name from booking) over customer.name which may be first-name only
  const customerName = appointment.guest_name || appointment.customer?.name || 'Customer';
  const customerEmail = appointment.customer?.email || appointment.guest_email || null;
  
  // ⚡ Calculate financials using centralized banker's rounding
  const estimatedCost = servicesTotal || appointment.estimated_cost || 0;
  const taxAmount = appointment.tax_amount || 0;

  // Compute fees via standard financial math (banker's-rounded)
  const financials = computeFinancialSummary({
    subtotal: estimatedCost,
    // Waste-oil disposal never applies to tire or detailing work.
    feeSettings: feeSettings
      ? { ...feeSettings, waste_oil_fee_enabled: feeSettings.waste_oil_fee_enabled && showsFluids }
      : undefined,
    taxAmount,
  });
  const { wasteOilFee, shopFee, surcharge } = financials;
  const totalDue = financials.total;
  const isEditable = appointment.status !== 'completed' && appointment.status !== 'cancelled';
  const canReactivate = appointment.status === 'cancelled' || appointment.status === 'no_show';

  return (
    <AppointmentDetailLayout embedded={embedded}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mr-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-2xl sm:text-3xl font-bold">
                Appointment #{appointment.id.slice(0, 8).toUpperCase()}
              </h1>
              <Badge className={cn("capitalize", statusStyle.className)}>
                {getStatusIcon(appointment.status)}
                <span className="ml-1">{statusStyle.label}</span>
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 ml-12">
              {formatDate(appointment.scheduled_date)} at {formatTimeLabel(appointment.scheduled_time, "h:mm a")}
              {` • ${appointment.duration_minutes} min`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isEditable && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditDialogOpen(true)}>
                <Edit className="h-4 w-4" />
                Edit
              </Button>
            )}
            {appointment.status === 'completed' && appointment.service_record_id && (
              <>
                <Button size="sm" className="gap-2" onClick={() => navigate(`/services/${appointment.service_record_id}`)}>
                  <FileText className="h-4 w-4" />
                  View Service Record
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={reviewRequestLoading || reviewRequestSent}
                  onClick={handleRequestReview}
                >
                  {reviewRequestLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Star className="h-4 w-4" />
                  )}
                  {reviewRequestSent ? `Review ${reviewRequestStatus ?? "requested"}` : "Request Review"}
                </Button>
              </>
            )}
          </div>
        </div>

        {embedded && technicianId && appointment && (
          <div className="mb-6">
            <MobileDispatchView 
              appointment={{
                id: appointment.id,
                dispatch_status: appointment.dispatch_status || 'assigned',
                scheduled_time: appointment.scheduled_time,
                guest_name: appointment.guest_name,
                guest_phone: appointment.guest_phone,
                location_address: appointment.location_address,
                customer: appointment.customer ? { name: appointment.customer.name } : undefined,
                service_catalog: appointment.service_catalog ? { name: appointment.service_catalog.name } : undefined,
              }}
              technician_id={technicianId}
              onStatusChange={() => fetchAppointment()}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer & Vehicle Information */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{terms.customer} & {terms.vehicle} Information</CardTitle>
                {appointment.customer && (
                  <Button variant="link" size="sm" className="gap-1" onClick={() => navigate(`/customers/${appointment.customer!.id}`)}>
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
                    <div className="space-y-2 min-w-0">
                      <p className="font-semibold break-words">{customerName}</p>
                      {(appointment.customer?.phone || appointment.guest_phone) && (
                        <ClickablePhone phone={(appointment.customer?.phone || appointment.guest_phone)!} className="text-sm" />
                      )}
                      {customerEmail && (
                        <ClickableEmail email={customerEmail} className="text-sm" />
                      )}
                      {(appointment.customer?.address || resolvedAddress) ? (
                        <button
                          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(appointment.customer?.address || resolvedAddress || '')}`, '_blank', 'noopener,noreferrer')}
                          className="text-sm text-primary hover:underline flex items-start gap-2 text-left whitespace-normal break-words"
                        >
                          <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>{appointment.customer?.address || resolvedAddress}</span>
                        </button>
                      ) : (
                        appointment.customer && (
                          <button
                            onClick={() => navigate(`/customers/${appointment.customer!.id}?edit=1`)}
                            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-2 text-left"
                          >
                            <MapPin className="h-4 w-4 flex-shrink-0" />
                            <span className="italic">No address on file — add one</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Vehicle Info */}
                  <div className="flex gap-4">
                    <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Car className="h-6 w-6 text-accent-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold">{vehicleName}</p>
                      {appointment.vehicle?.color && <p className="text-sm text-muted-foreground">{appointment.vehicle.color}</p>}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
                        {appointment.vehicle?.vin && (
                          <>
                            <span className="text-muted-foreground font-medium">VIN</span>
                            <span className="text-muted-foreground font-medium">ODOMETER</span>
                            <span>{appointment.vehicle.vin.slice(0, 10)}...</span>
                            <span>{appointment.vehicle.mileage?.toLocaleString() || "—"} mi</span>
                          </>
                        )}
                        {appointment.vehicle?.license_plate && (
                          <>
                            <span className="text-muted-foreground font-medium">PLATE</span>
                            <span></span>
                            <span>{appointment.vehicle.license_plate}</span>
                          </>
                        )}
                      </div>
                      {/* Tire specification — tire jobs show tire size, never oil */}
                      {isTireJob && appointment.vehicle?.tire_size && (
                        <div className="border-t pt-2 mt-2 space-y-1">
                          <p className="text-sm">
                            <span className="text-muted-foreground">Tire Size:</span> {appointment.vehicle.tire_size}
                            {appointment.vehicle.tire_size_source === 'oe' && (
                              <span className="ml-2 text-xs text-muted-foreground">(factory)</span>
                            )}
                          </p>
                          {appointment.vehicle.tire_load_index && (
                            <p className="text-sm"><span className="text-muted-foreground">Load Index:</span> {appointment.vehicle.tire_load_index}</p>
                          )}
                          {appointment.vehicle.tire_speed_rating && (
                            <p className="text-sm"><span className="text-muted-foreground">Speed Rating:</span> {appointment.vehicle.tire_speed_rating}</p>
                          )}
                        </div>
                      )}
                      {/* Engine & Oil Specifications — suppressed for tire/detailing */}
                      {(vehicleSpecs?.engine || (showsFluids && (vehicleSpecs?.oil_type || vehicleSpecs?.oil_capacity))) && (
                        <div className="border-t pt-2 mt-2 space-y-1">
                          {vehicleSpecs.engine && (
                            <p className="text-sm"><span className="text-muted-foreground">Engine:</span> {vehicleSpecs.engine}</p>
                          )}
                          {showsFluids && vehicleSpecs.oil_type && (
                            <p className="text-sm"><span className="text-muted-foreground">Oil Type:</span> {vehicleSpecs.oil_type}</p>
                          )}
                          {showsFluids && vehicleSpecs.oil_capacity && (
                            <p className="text-sm"><span className="text-muted-foreground">Oil Capacity:</span> {vehicleSpecs.oil_capacity}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabbed Content: Services & Payments */}
            <AppointmentConfigurationSummary appointmentId={appointment.id} />
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="services" className="gap-2">
                  <Wrench className="h-4 w-4" />
                  Services
                </TabsTrigger>
                <TabsTrigger value="payments" className="gap-2">
                  <Receipt className="h-4 w-4" />
                  Invoices & Payments
                </TabsTrigger>
                <TabsTrigger value="messages" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Job Messages
                </TabsTrigger>
              </TabsList>

              <TabsContent value="services" className="mt-4">
                <AppointmentServicesList
                  appointmentId={appointment.id}
                  appointmentStatus={appointment.status}
                  estimatedCost={appointment.estimated_cost}
                  taxAmount={appointment.tax_amount}
                  serviceCatalogId={appointment.service_catalog_id}
                  isPrepaid={isPrepaid}
                  onTotalChange={handleServicesChange}
                />
              </TabsContent>

              <TabsContent value="payments" className="mt-4">
                <AppointmentPaymentsTab
                  appointmentId={appointment.id}
                  customerEmail={customerEmail}
                  customerName={customerName}
                  isPrepaid={isPrepaid}
                  estimatedTotal={totalDue}
                  taxAmount={taxAmount}
                  subtotal={estimatedCost + wasteOilFee + shopFee + surcharge}
                  taxRate={feeSettings?.tax_rate || undefined}
                />
              </TabsContent>

              <TabsContent value="messages" className="mt-4">
                <div className="border rounded-lg overflow-hidden h-[600px]">
                  <InternalInbox initialAppointmentId={appointment.id} embedded />
                </div>
              </TabsContent>
            </Tabs>

            {/* Notes */}
            {(appointment.notes || appointment.description) && (
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm whitespace-pre-wrap">{appointment.notes || appointment.description}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6 lg:sticky lg:top-24 self-start">
            {/* Critical job snapshot: front-end-only summary using fields already loaded above. */}
            <Card className="border-primary/20 bg-primary/[0.03]">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Job Snapshot</CardTitle>
                    <p className="text-xs text-muted-foreground">Most important details for the next action</p>
                  </div>
                  <Badge className={cn("shrink-0 capitalize", statusStyle.className)}>
                    {statusStyle.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">When</p>
                    <p className="font-medium">
                      {formatDate(appointment.scheduled_date)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTimeLabel(appointment.scheduled_time, "h:mm a")} · {appointment.duration_minutes} min
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimate</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(totalDue)}</p>
                    <p className="text-xs text-muted-foreground">{isPrepaid ? "Prepaid" : "Due at service"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{terms.customer}</p>
                    <p className="font-medium truncate" title={customerName}>{customerName}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{terms.vehicle}</p>
                    <p className="font-medium truncate" title={vehicleName}>{vehicleName}</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Dispatch</span>
                  <span className="font-medium text-right">
                    {appointment.assigned_technician_id || appointment.assigned_van_id ? "Assigned" : "Needs assignment"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Next step</span>
                  <span className="font-medium text-right">
                    {appointment.status === "completed"
                      ? "View service record"
                      : appointment.status === "cancelled"
                        ? "Reactivate if needed"
                        : appointment.assigned_technician_id || appointment.assigned_van_id
                          ? "Work the job"
                          : "Assign technician or van"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Location Map - show if we have any address */}
            {(resolvedAddress || appointment.customer?.address) && (
              <LocationPreview address={resolvedAddress || appointment.customer?.address || ''} />
            )}

            {/* Provider Sync (Stripe / Square) */}
            <AppointmentSyncCard appointmentId={appointment.id} />

            {/* Appointment Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Appointment Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Scheduled */}
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                        <Calendar className="h-4 w-4 text-primary" />
                      </div>
                      <div className="w-0.5 flex-1 bg-border mt-2"></div>
                    </div>
                    <div>
                      <p className="font-medium">Scheduled</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(appointment.scheduled_date)} at {formatTimeLabel(appointment.scheduled_time, "h:mm a")}
                      </p>
                    </div>
                  </div>

                  {/* Current Status */}
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                        {getStatusIcon(appointment.status)}
                      </div>
                    </div>
                    <div>
                      <p className="font-medium capitalize">{statusStyle.label}</p>
                      <p className="text-sm text-muted-foreground">Current status</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Financial Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Estimate Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Services</span>
                  <span>{formatCurrency(estimatedCost)}</span>
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
                {taxAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span>{formatCurrency(taxAmount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="font-medium">Estimated Total</span>
                  <span className="text-2xl font-bold text-primary">{formatCurrency(totalDue)}</span>
                </div>
                
                {/* Action Buttons */}
                <div className="space-y-2 pt-4">
                  {isEditable && (
                    <>
                      {(appointment.assigned_technician_id || appointment.assigned_van_id) && (
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={handleUnassign}
                          disabled={unassigning}
                        >
                          {unassigning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserX className="h-4 w-4 mr-2" />}
                          Unassign to Dispatch Board
                        </Button>
                      )}
                      <JobActionButton
                        appointment={appointment}
                        onUpdated={fetchAppointment}
                        className="w-full"
                      />
                      <Button className="w-full" variant="outline" onClick={() => {
                        if (appointment) {
                          setRescheduleDate(appointment.scheduled_date);
                          setRescheduleTime(appointment.scheduled_time?.slice(0, 5) || '');
                        }
                        setRescheduleOpen(true);
                      }}>
                        <Calendar className="h-4 w-4 mr-2" />
                        Reschedule
                      </Button>
                      <Button 
                        className="w-full" 
                        variant="destructive"
                        onClick={() => handleStatusChange('cancelled')}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </>
                  )}
                  {appointment.status === 'completed' && appointment.service_record_id && (
                    <>
                      <Button 
                        className="w-full gap-2"
                        onClick={() => navigate(`/services/${appointment.service_record_id}`)}
                      >
                        <FileText className="h-4 w-4" />
                        View Service Record
                      </Button>
                      <Button
                        className="w-full gap-2"
                        variant="outline"
                        disabled={reviewRequestLoading || reviewRequestSent}
                        onClick={handleRequestReview}
                      >
                        {reviewRequestLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Star className="h-4 w-4" />
                        )}
                        {reviewRequestSent ? `Review ${reviewRequestStatus ?? "requested"}` : "Request Review"}
                      </Button>
                    </>
                  )}
                  {canReactivate && (
                    <>
                      <Separator className="my-2" />
                      <p className="text-xs text-muted-foreground text-center">Reactivate this appointment</p>
                      <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={() => handleStatusChange('confirmed')}
                      >
                        Reschedule
                      </Button>
                      <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={() => handleStatusChange('confirmed')}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Confirm
                      </Button>
                    </>
                  )}

                  {allowDelete && (
                    <>
                      <Separator className="my-2" />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button className="w-full" variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                            <span className="text-destructive">Delete Appointment</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Appointment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the appointment. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDelete}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <EditAppointmentDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        appointment={appointment}
        onSuccess={handleEditSuccess}
      />

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Reschedule Appointment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reschedule-date">New Date</Label>
              <Input id="reschedule-date" type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reschedule-time">New Time</Label>
              <Input id="reschedule-time" type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setRescheduleOpen(false)} disabled={rescheduling}>Cancel</Button>
            <Button onClick={handleReschedule} disabled={!rescheduleDate || !rescheduleTime || rescheduling}>
              {rescheduling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Reschedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* SMS timeline for this appointment */}
      <div className="container mx-auto px-4 pb-8 max-w-4xl">
        <AppointmentSmsTimeline appointmentId={appointment.id} customerPhone={appointment.customer?.phone || appointment.guest_phone} scheduledDate={appointment.scheduled_date} />
      </div>

      {/* Complete Appointment Dialog */}
      <CompleteAppointmentDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        appointment={appointment}
        onSuccess={handleCompleteSuccess}
      />
    </AppointmentDetailLayout>
  );
};

function AppointmentDetailLayout({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  if (embedded) return <div className="flex-1 overflow-y-auto">{children}</div>;
  return <AppLayout title="Appointment Details">{children}</AppLayout>;
}

export default AppointmentDetail;

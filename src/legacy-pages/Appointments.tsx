
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useRealtimeWorkflow } from "@/hooks/useRealtimeWorkflow";
import { AppLayout } from "@/components/layout/AppLayout";
import { MobileAppointmentView } from "@/components/appointments/MobileAppointmentView";
import { CompleteAppointmentDialog } from "@/components/appointments/CompleteAppointmentDialog";
import { WorkflowStatusIndicator } from "@/components/workflow/WorkflowStatusIndicator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Appointment, Customer, Vehicle, ServiceCatalogItem, BusinessHours } from "@/shared/types";
import type { ScheduleResource } from "@/components/schedule/CurbeeScheduleBoard";
import type { AppointmentFormState, CustomerFormData, VehicleFormData } from "@/shared/types/forms";

import { AppointmentForm } from "@/components/appointments/AppointmentForm";
// ENTERPRISE: Booking confirmation emails are now server-side via DB triggers → email_queue → transactional-email-worker
import {
  fetchAppointmentsPageData,
  type AppointmentWithSource,
} from "@/application/queries";
import {
  saveAppointment,
  tryAutoDispatchAppointment,
  updateAppointmentStatus,
} from "@/application/commands";
// ENTERPRISE: In-app notifications are now created server-side by transactional-email-worker
import { toast } from "@/components/ui/sonner";
import { Loader2, Calendar, Download, LayoutGrid } from "lucide-react";
import { TableSkeleton } from "@/components/loading/PageSkeletons";
import { DispatchBoard } from "@/components/workflow/DispatchBoard";
import { addDays } from "date-fns";
import { downloadCsv } from "@/lib/exportCsv";
import { useOptimisticAction } from "@/hooks/useOptimisticAction";
import {
  getPendingOutboxCount,
  processOfflineOutbox,
  getDeadLetterOutboxItems,
  retryDeadLetterOutboxItem,
  discardDeadLetterOutboxItem,
} from "@/offline/outbox";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";

type AppointmentDraft = Partial<Appointment> & Record<string, unknown>;

const AppointmentsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [userId, setUserId] = useState<string | undefined>();
  const [viewMode, setViewMode] = useState<"list" | "calendar" | "month">("list");
  const [sourceFilter, setSourceFilter] = useState<"all" | "upcoming">("all");
  const [activeTab, setActiveTab] = useState<"appointments" | "dispatch">("appointments");

  // Real-time workflow updates
  const { isConnected } = useRealtimeWorkflow({
    userId,
    onEvent: (event) => {
      // Refresh data when appointment changes occur
      if (event.type === "appointment") {
        fetchData();
      }
    },
    showToasts: true,
    enabled: !!userId,
  });

  const [appointments, setAppointments] = useState<AppointmentWithSource[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogItem[]>([]);
  const [scheduleResources, setScheduleResources] = useState<ScheduleResource[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHours>({
    opening_time: "08:00",
    closing_time: "17:00",
    working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  });
  const [providerName, setProviderName] = useState<string>("Auto Shop");
  const [providerEmail, setProviderEmail] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentDraft | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [deadLetterCount, setDeadLetterCount] = useState(0);
  const [syncingOutbox, setSyncingOutbox] = useState(false);
  const [resolvingDeadLetter, setResolvingDeadLetter] = useState(false);
  
  // Complete appointment dialog state
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [appointmentToComplete, setAppointmentToComplete] = useState<Appointment | null>(null);
  // Track when the dialog is opened with prefill data from another page (not an actual edit)
  const [isPrefillNew, setIsPrefillNew] = useState(false);

  // Auto-open the new appointment dialog when navigating from vehicle detail with prefill state
  // We use a ref to track if we've already processed the state so fetchData populating
  // customers/vehicles doesn't cause a race condition — we handle it after data loads.
  const prefillStateRef = useState<{ prefillVehicleId?: string; prefillCustomerId?: string } | null>(() => {
    const s = location.state as { prefillVehicleId?: string; prefillCustomerId?: string } | null;
    return (s?.prefillVehicleId || s?.prefillCustomerId) ? s : null;
  })[0];

  useEffect(() => {
    if (!prefillStateRef) return;
    // Clear navigation state immediately so back-navigation doesn't re-open the dialog
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, navigate, prefillStateRef]);

  const fetchData = useCallback(async () => {
    try {
      setAppointmentsLoading(true);
      setCustomersLoading(true);
      setVehiclesLoading(true);
      setCatalogLoading(true);
      setAppointmentsError(null);
      setCustomersError(null);
      setVehiclesError(null);
      setCatalogError(null);

      const data = await fetchAppointmentsPageData();

      // Store userId for realtime filtering
      setUserId(data.userId);

      setAppointments(data.appointments);
      setCustomers(data.customers);
      setVehicles(data.vehicles);
      setServiceCatalog(data.serviceCatalog);
      setScheduleResources(data.scheduleVans.map((van) => ({ id: van.id, name: van.name })));
      setBusinessHours(data.businessHours);
      setProviderName(data.providerName);
      setProviderEmail(data.providerEmail);

      setAppointmentsLoading(false);
      setCustomersLoading(false);
      setVehiclesLoading(false);
      setCatalogLoading(false);
      setLoading(false);

      // After data loads, open prefill dialog with full customer + vehicle info
      if (prefillStateRef) {
        const allCustomers = data.customers ?? [];
        const allVehicles = data.vehicles ?? [];
      const customer = prefillStateRef.prefillCustomerId
        ? allCustomers.find(c => c.id === prefillStateRef.prefillCustomerId)
        : undefined;
      const vehicle = prefillStateRef.prefillVehicleId
        ? allVehicles.find(v => v.id === prefillStateRef.prefillVehicleId)
        : undefined;

        setEditingAppointment({
          vehicle_id: vehicle?.id ?? null,
          customer_id: customer?.id ?? null,
          // Pre-populate guest fields from customer record
          guest_name: customer?.name ?? "",
          guest_phone: customer?.phone ?? "",
          guest_email: customer?.email ?? "",
          // Pre-populate vehicle fields
          vehicle_year: vehicle?.year ? String(vehicle.year) : "",
          vehicle_make: vehicle?.make ?? "",
          vehicle_model: vehicle?.model ?? "",
          vehicle_license: vehicle?.license_plate ?? "",
        });
        setIsPrefillNew(true);
        setDialogOpen(true);
      }
    } catch (error) {
      console.error("Failed to load appointments page data", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load appointments page data",
      );
      setAppointmentsLoading(false);
      setCustomersLoading(false);
      setVehiclesLoading(false);
      setCatalogLoading(false);
      setLoading(false);
    }
  }, [prefillStateRef, setAppointments, setEditingAppointment, setIsPrefillNew, setDialogOpen]);

  const { isRefreshing, containerRef } = usePullToRefresh({ onRefresh: fetchData });

  // Filter appointments based on source tab
  const filteredAppointments = useMemo(() => {
    if (sourceFilter === "upcoming") {
      const now = new Date();
      const sevenDaysOut = addDays(now, 7);

      const withinNextWeek = appointments
        .map((apt) => ({
          appointment: apt,
          date: new Date(`${apt.scheduled_date}T${apt.scheduled_time || "00:00"}`),
        }))
        .filter(({ date }) => !Number.isNaN(date.getTime()) && date >= now && date <= sevenDaysOut)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map(({ appointment }) => appointment);

      return withinNextWeek;
    }

    return appointments;
  }, [appointments, sourceFilter]);

  const handleExportAppointments = useCallback(() => {
    downloadCsv("appointments", [
      { header: "Title", value: (appointment) => appointment.title || "" },
      { header: "Date", value: (appointment) => appointment.scheduled_date || "" },
      { header: "Time", value: (appointment) => appointment.scheduled_time || "" },
      { header: "Duration Minutes", value: (appointment) => appointment.duration_minutes ?? "" },
      { header: "Customer", value: (appointment) => appointment.customer?.name || appointment.guest_name || "" },
      { header: "Vehicle", value: (appointment) => appointment.vehicle ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ") : "" },
      { header: "Status", value: (appointment) => appointment.status || "" },
      { header: "Dispatch Status", value: (appointment) => appointment.dispatch_status || "" },
      { header: "Location", value: (appointment) => appointment.location_address || "" },
      { header: "Source", value: (appointment) => appointment.source || "" },
      { header: "Notes", value: (appointment) => appointment.notes || "" },
    ], filteredAppointments);
  }, [filteredAppointments]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelectAppointment = (appointment: Appointment) => {
    navigate(`/appointments/${appointment.id}`);
  };

  const handleAddAppointment = (date?: Date) => {
    setEditingAppointment(null);
    if (date) {
        setCurrentDate(date);
    }
    setDialogOpen(true);
  };
  
  const handleEditAppointment = (appointment: Appointment) => {
    navigate(`/appointments/${appointment.id}`);
  };

  const optimisticCreateAppointment = useOptimisticAction<{ id: string; formData: AppointmentFormState; existingAppointmentId?: string; isPrefillNew: boolean }, Awaited<ReturnType<typeof saveAppointment>>>({
    apply: ({ id, formData }) => {
      setAppointments((current) => [
        {
          id,
          title: formData.title || "New appointment",
          status: formData.status || "confirmed",
          scheduled_date: formData.scheduled_date || new Date().toISOString().slice(0, 10),
          scheduled_time: formData.scheduled_time || "09:00",
          duration_minutes: Number(formData.duration_minutes) || 60,
          guest_name: formData.guest_name || "Pending customer",
          guest_phone: formData.guest_phone || "",
          guest_email: formData.guest_email || "",
          source: "admin",
        } as AppointmentWithSource,
        ...current,
      ]);
    },
    rollback: ({ id }) => {
      setAppointments((current) => current.filter((appointment) => appointment.id !== id));
    },
    run: ({ formData, existingAppointmentId, isPrefillNew }) => saveAppointment(formData, { existingAppointmentId, isPrefillNew }),
    onError: (error) => {
      console.error("Failed to save appointment", error);
      toast.error(error instanceof Error ? error.message : "Failed to save appointment");
    },
  });
  
  const handleFormSubmit = async (formData: AppointmentFormState) => {
    setSaving(true);
    const isCreating = !editingAppointment?.id || isPrefillNew;
    const optimisticId = `optimistic-${Date.now()}`;
    let result: Awaited<ReturnType<typeof saveAppointment>>;
    try {
      if (isCreating) {
        const saveResult = await optimisticCreateAppointment.executeWithResult({
          id: optimisticId,
          formData,
          existingAppointmentId: editingAppointment?.id,
          isPrefillNew,
        });
        if (!saveResult.ok) return;
        result = saveResult.result;
      } else {
        result = await saveAppointment(formData, {
          existingAppointmentId: editingAppointment?.id,
          isPrefillNew,
        });
      }

      const isUpdate = result.isUpdate;

      toast.success(
        isUpdate
          ? "Appointment updated successfully"
          : "Appointment created successfully",
      );

      if (!isUpdate) {
        const customerName =
          formData.guest_name ||
          (formData.customer &&
          typeof formData.customer === "object" &&
          "name" in formData.customer
            ? String((formData.customer as { name?: string }).name || "")
            : "") || "Customer";

        // ENTERPRISE: Emails & in-app notifications are now event-driven via DB triggers.
        // The INSERT trigger on appointments auto-enqueues booking_confirmation emails.
        // No client-side email dispatch needed.

        try {
          const autoDispatchResult = await tryAutoDispatchAppointment(
            result.appointmentId,
            formData,
          );

          if (autoDispatchResult.autoDispatchEnabled) {
            if (autoDispatchResult.topRecommendationName) {
              toast.success(
                `⚡ Auto-assigned to ${autoDispatchResult.topRecommendationName}`,
              );
            } else {
              toast.info(
                "⚡ Auto-dispatch: no eligible technician found — assign manually",
              );
            }
          }
        } catch {
          // Auto-dispatch failure is non-fatal
        }

        toast.success("Appointment created — confirmation email queued");
      }

      setDialogOpen(false);
      setEditingAppointment(null);
      setIsPrefillNew(false);
      fetchData();
    } catch (error) {
      console.error("Failed to save appointment", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save appointment",
      );
    } finally {
      setSaving(false);
    }
  };
  
  const handleCreateCustomer = async (_data: CustomerFormData): Promise<Customer | null> => {
    // Implementation to be added
    return null;
  }
  
  const handleCreateVehicle = async (_data: VehicleFormData): Promise<Vehicle | null> => {
    // Implementation to be added
    return null;
  }
  
  // Handle completing an appointment (opens dialog to add service record details)
  const handleCompleteAppointment = (appointment: Appointment) => {
    setAppointmentToComplete(appointment);
    setCompleteDialogOpen(true);
  };
  
  // Handle completion success - refresh data
  const handleCompleteSuccess = (serviceId: string) => {
    fetchData();
    setAppointmentToComplete(null);
    // Optionally navigate to the service record
    // navigate(`/services/${serviceId}`);
  };

  const optimisticStatus = useOptimisticAction<{ appointment: Appointment; newStatus: string }>({
    apply: ({ appointment, newStatus }) => {
      setAppointments((current) =>
        current.map((item) =>
          item.id === appointment.id ? { ...item, status: newStatus } : item,
        ),
      );
    },
    rollback: ({ appointment }) => {
      setAppointments((current) =>
        current.map((item) =>
          item.id === appointment.id ? { ...item, status: appointment.status } : item,
        ),
      );
    },
    run: ({ appointment, newStatus }) => updateAppointmentStatus(appointment.id, newStatus),
    onError: (error) => {
      console.error("Failed to update appointment status", error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to update status — appointment reverted";
      toast.error(message);
    },
  });
  
  // Handle status change (for statuses that don't need service record creation)
  const handleStatusChange = async (appointment: Appointment, newStatus: string) => {
    const succeeded = await optimisticStatus.execute({ appointment, newStatus });
    if (!succeeded) return;

    toast.success(
      `Appointment ${
        newStatus === "cancelled" ? "cancelled" : "updated"
      }`,
    );
    fetchData();
    refreshOutboxStatus().catch((): undefined => undefined);
  };


  const refreshOutboxStatus = useCallback(async () => {
    const isOfflineEligible = await isOfflineEligibleForCurrentUser();
    if (!isOfflineEligible) {
      setPendingOutboxCount(0);
      return;
    }

    const count = await getPendingOutboxCount();
    setPendingOutboxCount(count);

    const deadLetters = await getDeadLetterOutboxItems();
    setDeadLetterCount(deadLetters.length);
  }, [setPendingOutboxCount, setDeadLetterCount]);

  useEffect(() => {
    refreshOutboxStatus().catch((): undefined => undefined);
    const interval = window.setInterval((): void => {
      refreshOutboxStatus().catch((): undefined => undefined);
    }, 10000);

    return () => window.clearInterval(interval);
  }, [refreshOutboxStatus]);

  const handleRetryPendingSync = async () => {
    try {
      setSyncingOutbox(true);
      await processOfflineOutbox();
      await refreshOutboxStatus();
      toast.success("Sync retry started");
    } catch (error) {
      console.error("Failed to retry outbox sync", error);
      toast.error("Failed to retry sync");
    } finally {
      setSyncingOutbox(false);
    }
  };



  const handleRetryDeadLetter = async () => {
    try {
      setResolvingDeadLetter(true);
      const deadLetters = await getDeadLetterOutboxItems();
      if (deadLetters.length === 0) {
        return;
      }

      await retryDeadLetterOutboxItem(deadLetters[0].mutationId);
      await processOfflineOutbox();
      await refreshOutboxStatus();
      toast.success("Dead-letter mutation moved back to retry queue");
    } catch (error) {
      console.error("Failed to retry dead-letter mutation", error);
      toast.error("Failed to retry dead-letter mutation");
    } finally {
      setResolvingDeadLetter(false);
    }
  };

  const handleDiscardDeadLetter = async () => {
    try {
      setResolvingDeadLetter(true);
      const deadLetters = await getDeadLetterOutboxItems();
      if (deadLetters.length === 0) {
        return;
      }

      await discardDeadLetterOutboxItem(deadLetters[0].mutationId);
      await refreshOutboxStatus();
      toast.success("Dead-letter mutation discarded");
    } catch (error) {
      console.error("Failed to discard dead-letter mutation", error);
      toast.error("Failed to discard dead-letter mutation");
    } finally {
      setResolvingDeadLetter(false);
    }
  };

  // Unified view for both mobile and desktop - uses the same component with List/Calendar toggle
  return (
    <AppLayout title={isMobile ? undefined : "Appointments"}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <WorkflowStatusIndicator isConnected={isConnected} />
          {pendingOutboxCount > 0 && (
            <>
              <Badge variant="secondary">{pendingOutboxCount} pending sync</Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetryPendingSync}
                disabled={syncingOutbox}
              >
                {syncingOutbox ? "Retrying..." : "Retry sync"}
              </Button>
            </>
          )}
          {deadLetterCount > 0 && (
            <>
              <Badge variant="destructive">{deadLetterCount} dead-letter</Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetryDeadLetter}
                disabled={resolvingDeadLetter}
              >
                Retry dead-letter
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDiscardDeadLetter}
                disabled={resolvingDeadLetter}
              >
                Discard
              </Button>
            </>
          )}
        </div>
        {appointmentsLoading && appointments.length > 0 && (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        )}
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={handleExportAppointments}
          disabled={appointmentsLoading}
        >
          <Download className="h-4 w-4" />
          Export appointments
        </Button>
      </div>

      {/* Top-level tabs: Appointments vs Dispatch Board */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "appointments" | "dispatch")} className="mb-4">
        <TabsList>
          <TabsTrigger value="appointments" className="gap-2">
            <Calendar className="h-4 w-4" />
            Appointments
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            Dispatch Board
          </TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="mt-4">
          {/* Source Filter Tabs */}
          <Tabs value={sourceFilter} onValueChange={(v) => setSourceFilter(v as "all" | "upcoming")} className="mb-4">
            <TabsList className="flex w-full justify-start gap-2">
              <TabsTrigger value="upcoming" className="gap-2">
                <Calendar className="h-4 w-4" />
                Upcoming (7d)
              </TabsTrigger>
              <TabsTrigger value="all" className="gap-2 ml-auto">
                <Calendar className="h-4 w-4" />
                All Appointments
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {appointmentsError ? (
            <div className="py-4 text-center bg-destructive/10 text-destructive rounded p-4 border border-destructive/20">
              {appointmentsError}
            </div>
          ) : appointmentsLoading && appointments.length === 0 ? (
            <TableSkeleton rows={7} columns={5} />
          ) : (
            <MobileAppointmentView
              appointments={filteredAppointments as Appointment[]}
              onSelectAppointment={handleSelectAppointment}
              onAddAppointment={handleAddAppointment}
              onEditAppointment={handleEditAppointment}
              businessHours={businessHours}
              onDateChange={setCurrentDate}
              currentDate={currentDate}
              onCompleteAppointment={handleCompleteAppointment}
              onStatusChange={handleStatusChange}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              scheduleResources={scheduleResources}
            />
          )}
        </TabsContent>

        <TabsContent value="dispatch" className="mt-4">
          <DispatchBoard />
        </TabsContent>
      </Tabs>

      <AppointmentForm
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingAppointment(null); setIsPrefillNew(false); } }}
        onSubmit={handleFormSubmit}
        initialData={editingAppointment}
        customers={customers}
        vehicles={vehicles}
        serviceCatalog={serviceCatalog}
        businessHours={businessHours}
        saving={saving}
        isEditing={!!editingAppointment && !isPrefillNew}
        onCreateCustomer={handleCreateCustomer}
        onCreateVehicle={handleCreateVehicle}
        businessUserId={userId}
      />
      <CompleteAppointmentDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        appointment={appointmentToComplete}
        onSuccess={handleCompleteSuccess}
      />
    </AppLayout>
  );
};

export default AppointmentsPage;

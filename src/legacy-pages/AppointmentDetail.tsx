import { errorMessage } from "@/lib/error-message";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendReviewRequest } from "@/application/commands/review-request.command";
import { computeFinancialSummary } from "@/lib/financialMath";
import { isWebsiteQuoteLocked } from "@/lib/price-lock";
import { useNavigate, useParams } from "react-router-dom";
import {
  getCurrentAuthUser,
  fetchAppointmentWithRelations,
  fetchCustomerAddressByGuestEmail,
  fetchSucceededPayments,
  fetchAppointmentFeeSettings,
} from "@/application/queries/appointment-detail.query";
import {
  updateAppointmentStatus as updateAppointmentStatusQuery,
  deleteAppointment as deleteAppointmentQuery,
} from "@/application/commands/appointment-detail.command";
import {
  fetchAppointmentServices,
  type AppointmentServiceRow,
} from "@/application/queries/appointment-services.query";
import {
  fetchInvoiceForAppointment,
  type InvoiceFullRow,
} from "@/application/queries/invoices.query";
import { unassignAppointment, updateAppointmentSchedule } from "@/application/commands";
import { fetchReviewRequestStatusForService } from "@/application/queries/appointments.query";

import { AppointmentSyncCard } from "@/components/appointments/AppointmentSyncCard";
import { AppointmentConfigurationSummary } from "@/components/booking/AppointmentConfigurationSummary";
import { Appointment } from "@/shared/types";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatTimeLabel } from "@/lib/datetime";
import { AppointmentStatusChip } from "@/components/appointments/StatusToneChip";
import { PaymentStateBand } from "@/components/appointments/PaymentStateBand";
import { resolveStatusChip, statusToneClasses } from "@/lib/status-tone";
import { realCustomerEmail } from "@/lib/contact-display";
import {
  ArrowLeft,
  MapPin,
  CheckCircle2,
  Clock,
  FileText,
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
  Navigation,
  Lock,
  Mail,
} from "lucide-react";
import { InternalInbox } from "@/components/communications/InternalInbox";
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
} from "@/components/ui/alert-dialog";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { LocationPreview } from "@/components/appointments/LocationPreview";
import { ClickablePhone, ClickableEmail } from "@/components/ui/clickable-contact";
import { EditAppointmentDialog } from "@/components/appointments/EditAppointmentDialog";
import { AppointmentServicesList } from "@/components/appointments/AppointmentServicesList";
import { AppointmentPaymentsTab } from "@/components/appointments/AppointmentPaymentsTab";
import { CompleteAppointmentDialog } from "@/components/appointments/CompleteAppointmentDialog";
import { JobActionButton } from "@/components/appointments/JobActionButton";
import { FieldJobView } from "@/components/tech/FieldJobView";
import { AppointmentSmsTimeline } from "@/components/appointments/AppointmentSmsTimeline";
import { toast } from "@/components/ui/sonner";
import { useServiceCategoryPolicy } from "@/hooks/useServiceCategoryPolicy";

interface AppointmentDetailProps {
  embedded?: boolean;
  overrideUserId?: string;
  technicianId?: string;
  allowDelete?: boolean;
}

function cleanHumanNotes(value?: string | null) {
  if (!value) return "";
  const lines = value.split(/\r?\n/);
  const kept: string[] = [];
  let suppressFilterBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (kept.length && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }

    if (/^(vehicles?|services?|payment):/i.test(line)) continue;
    // System provenance from the website push ("Pushed from MOMS website
    // booking <id>. Source: website. Website payment status: ...") is not a
    // customer note — the Notes card shows customer notes only.
    if (/^pushed from .*website booking\b/i.test(line)) continue;
    if (/^filter match\s*\(/i.test(line)) {
      suppressFilterBlock = true;
      continue;
    }
    if (suppressFilterBlock && (/^•?\s*oil filter:/i.test(line) || /^\d{4}\s+/.test(line))) continue;
    suppressFilterBlock = false;
    kept.push(rawLine);
  }

  return kept.join("\n").trim();
}

/** 12px uppercase eyebrow — establishes context above a heading, never carries content alone. */
function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-widest text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export const AppointmentDetail = ({
  embedded = false,
  overrideUserId,
  technicianId,
  allowDelete = true,
}: AppointmentDetailProps = {}) => {
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
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isPrepaid, setIsPrepaid] = useState(false);
  const [reviewRequestLoading, setReviewRequestLoading] = useState(false);
  const [reviewRequestSent, setReviewRequestSent] = useState(false);
  const [reviewRequestStatus, setReviewRequestStatus] = useState<string | null>(null);
  const [unassigning, setUnassigning] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [feeSettings, setFeeSettings] = useState<{
    waste_oil_fee_enabled: boolean;
    waste_oil_fee: number;
    shop_fee_enabled: boolean;
    shop_fee_type: string;
    shop_fee_value: number;
    shop_fee_description: string;
    surcharge_enabled: boolean;
    surcharge_type: string;
    surcharge_value: number;
    surcharge_description: string;
    tax_rate: number | null;
  } | null>(null);
  // Recorded money for the Financial summary: the appointment's invoice and
  // its item rows, loaded independently of the services tab.
  const [summaryInvoice, setSummaryInvoice] = useState<InvoiceFullRow | null>(null);
  const [summaryItems, setSummaryItems] = useState<AppointmentServiceRow[]>([]);
  const [succeededPaymentTotal, setSucceededPaymentTotal] = useState(0);

  const categoryPolicy = useServiceCategoryPolicy([
    appointment?.service_catalog?.category ?? null,
    appointment?.service_catalog?.name ?? null,
    appointment?.title ?? null,
  ]);
  const showsFluids = categoryPolicy.showsFluidSpecs;

  const fetchAppointment = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const user = await getCurrentAuthUser();
    if (!user) {
      setError("You must be logged in to view appointment details.");
      setLoading(false);
      return;
    }

    const queryUserId = overrideUserId || user.id;
    const { data, error: fetchError } = await fetchAppointmentWithRelations(id, queryUserId);

    if (fetchError || !data) {
      setAppointment(null);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "We couldn't load this appointment. It may have been deleted or you may not have access.",
      );
      setLoading(false);
      return;
    }

    setAppointment(data as unknown as Appointment);

    if (data.service_record_id) {
      const status = await fetchReviewRequestStatusForService(data.service_record_id, queryUserId);
      setReviewRequestStatus(status);
      setReviewRequestSent(status !== null);
    } else {
      setReviewRequestStatus(null);
      setReviewRequestSent(false);
    }

    let address = data.location_address || data.customer?.address || null;
    if (!address && data.guest_email) {
      const { data: matchedCustomer } = await fetchCustomerAddressByGuestEmail(data.guest_email, queryUserId);
      address = matchedCustomer?.address || null;
    }
    setResolvedAddress(address);

    const { data: payments } = await fetchSucceededPayments(id);
    setIsPrepaid(Boolean(payments?.length));
    const paidRows = (payments ?? []) as Array<{ amount?: number | string }>;
    setSucceededPaymentTotal(
      paidRows.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
    );
    setLoading(false);
  }, [id, overrideUserId]);

  // Load the recorded financial breakdown (invoice + appointment items) for
  // the summary card. Best-effort: a missing invoice/items just leaves the
  // summary on its legacy single-total presentation.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const [invoice, services] = await Promise.all([
        fetchInvoiceForAppointment(id).catch(() => null),
        fetchAppointmentServices(id).catch(() => null),
      ]);
      if (cancelled) return;
      setSummaryInvoice(invoice);
      setSummaryItems(services?.services ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    void fetchAppointment();
  }, [fetchAppointment]);

  useEffect(() => {
    const fetchFees = async () => {
      const user = await getCurrentAuthUser();
      if (!user) return;
      const { data } = await fetchAppointmentFeeSettings(overrideUserId || user.id);
      if (!data) return;
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
    };
    void fetchFees();
  }, [overrideUserId]);

  // Progressive disclosure: a finished job opens on money, everything else opens on services.
  const defaultTabSet = useRef(false);
  useEffect(() => {
    if (appointment && !defaultTabSet.current) {
      defaultTabSet.current = true;
      const terminal = appointment.status === "completed" || appointment.status === "cancelled" || appointment.status === "no_show";
      setActiveTab(terminal ? "payments" : "services");
    }
  }, [appointment]);

  const handleReschedule = async () => {
    if (!appointment || !rescheduleDate || !rescheduleTime) return;
    setRescheduling(true);
    try {
      await updateAppointmentSchedule(appointment.id, rescheduleDate, rescheduleTime);
      toast.success("Appointment rescheduled");
      setRescheduleOpen(false);
      await fetchAppointment();
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to reschedule"));
    } finally {
      setRescheduling(false);
    }
  };

  const handleRequestReview = async () => {
    if (!appointment) return;
    // T-15: a placeholder/system email is not the customer's — never send to it.
    const customerEmail = realCustomerEmail(appointment.customer?.email || appointment.guest_email);
    const customerName = appointment.customer?.name || appointment.guest_name || "Customer";
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

  const handleStatusChange = async (newStatus: string) => {
    if (!appointment) return;
    try {
      await updateAppointmentStatusQuery(appointment.id, newStatus);
      toast.success(`Appointment ${newStatus === "cancelled" ? "cancelled" : "updated"}`);
      await fetchAppointment();
    } catch (err) {
      toast.error(err instanceof Error ? errorMessage(err) : "Failed to update status");
    }
  };

  const handleDelete = async () => {
    if (!appointment || !allowDelete) {
      toast.error("You do not have permission to delete this appointment");
      return;
    }
    const { error: deleteError } = await deleteAppointmentQuery(appointment.id);
    if (deleteError) {
      toast.error("Failed to delete appointment");
      return;
    }
    toast.success("Appointment deleted");
    navigate("/appointments");
  };

  const handleUnassign = async () => {
    if (!appointment) return;
    setUnassigning(true);
    try {
      await unassignAppointment(appointment.id);
      toast.success("Appointment moved back to dispatch board");
      await fetchAppointment();
    } catch {
      toast.error("Failed to unassign appointment");
    } finally {
      setUnassigning(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4" />;
      case "cancelled":
        return <XCircle className="h-4 w-4" />;
      case "no_show":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const stageEyebrow = useMemo(() => {
    if (!appointment) return "Appointment";
    switch (appointment.status) {
      case "completed":
        return "Finished job";
      case "cancelled":
        return "Cancelled appointment";
      case "no_show":
        return "No show";
      case "pending":
        return "Awaiting approval";
      default:
        return "Scheduled job";
    }
  }, [appointment]);

  if (loading) {
    return (
      <AppointmentDetailLayout embedded={embedded}>
        <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-12 pt-6" aria-busy="true" aria-label="Loading appointment details">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 animate-pulse rounded-md bg-secondary" />
            <div className="space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-secondary" />
              <div className="h-8 w-64 animate-pulse rounded bg-secondary" />
            </div>
          </div>
          <div className="h-20 animate-pulse rounded-2xl bg-secondary" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="h-72 animate-pulse rounded-2xl bg-secondary" />
              <div className="h-48 animate-pulse rounded-2xl bg-secondary" />
            </div>
            <div className="h-96 animate-pulse rounded-2xl bg-secondary" />
          </div>
          <span className="sr-only">Loading appointment details</span>
        </div>
      </AppointmentDetailLayout>
    );
  }

  if (error || !appointment) {
    return (
      <AppointmentDetailLayout embedded={embedded}>
        <div className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
          <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight">Appointment unavailable</h2>
          <p className="text-base text-muted-foreground">{error ?? "This appointment could not be found."}</p>
          <div className="flex flex-col gap-3 pt-2">
            <Button onClick={() => fetchAppointment()} className="min-h-[56px] text-base">
              Try again
            </Button>
            <Button variant="outline" onClick={() => navigate(-1)} className="min-h-[56px] text-base">
              Back
            </Button>
          </div>
        </div>
      </AppointmentDetailLayout>
    );
  }

  const statusChip = resolveStatusChip(appointment);
  const customerName = appointment.guest_name || appointment.customer?.name || "Customer";
  const customerEmail = appointment.customer?.email || appointment.guest_email || null;
  // T-15: what renders as the customer's email — a placeholder/system
  // address renders as "No email on file", never as a sendable address.
  const displayEmail = realCustomerEmail(customerEmail);
  const customerPhone = appointment.customer?.phone || appointment.guest_phone || null;
  const address = resolvedAddress || appointment.customer?.address || null;
  const humanNotes = cleanHumanNotes(appointment.notes || appointment.description);
  // Website quote lock: for a website-pushed appointment the stored quote is
  // the total — no fee or tax recompute may move the displayed/charged amount
  // (see @/lib/price-lock).
  const priceLocked = isWebsiteQuoteLocked({
    source: appointment.source,
    metadata: appointment.intake_responses,
  });
  const estimatedCost = priceLocked
    ? appointment.estimated_cost || 0
    : servicesTotal || appointment.estimated_cost || 0;
  const taxAmount = priceLocked ? 0 : appointment.tax_amount || 0;

  const financials = priceLocked
    ? computeFinancialSummary({ subtotal: estimatedCost, taxAmount: 0 })
    : computeFinancialSummary({
        subtotal: estimatedCost,
        feeSettings: feeSettings
          ? { ...feeSettings, waste_oil_fee_enabled: feeSettings.waste_oil_fee_enabled && showsFluids }
          : undefined,
        taxAmount,
      });
  const { wasteOilFee, shopFee, surcharge } = financials;
  const totalDue = financials.total;

  // --- Financial summary from recorded data -------------------------------
  // Lines and totals come from what is actually recorded on the appointment
  // (its invoice lines, else its item rows) — never a fee/tax split derived
  // from workspace settings. Records whose only recorded shape is a single
  // lump line (legacy locked website quotes) show exactly that line, plus
  // Total / Amount Paid / Balance Due.
  const roundMoney = (value: number) => Math.round(value * 100) / 100;
  const feeKeyForDescription = (description: string): string | null => {
    const normalized = description.trim().toLowerCase();
    if (normalized === "waste oil disposal fee") return "waste_oil_fee";
    if (normalized === "card processing fee") return "surcharge";
    if (normalized === "tax") return "tax";
    return null;
  };
  type RecordedLine = { description: string; amount: number; feeKey: string | null };
  const recordedLines: RecordedLine[] =
    summaryInvoice && summaryInvoice.invoice_line_items.length > 0
      ? summaryInvoice.invoice_line_items.map((line) => ({
          description: line.description,
          amount: line.line_total,
          feeKey: line.fee_key ?? feeKeyForDescription(line.description),
        }))
      : summaryItems.map((item) => ({
          description: item.name,
          amount: item.price * item.quantity,
          feeKey:
            item.fee_key ??
            (item.item_type === "fee" ? feeKeyForDescription(item.name) : null),
        }));
  const recordedServiceLines = recordedLines.filter((line) => line.feeKey === null);
  const recordedFeeTotal = (key: string) =>
    roundMoney(
      recordedLines
        .filter((line) => line.feeKey === key)
        .reduce((sum, line) => sum + line.amount, 0),
    );
  const recordedWasteFee = recordedFeeTotal("waste_oil_fee");
  const recordedProcessingFee = recordedFeeTotal("surcharge");
  const recordedShopFee = recordedFeeTotal("shop_fee");
  const recordedTaxLines = recordedFeeTotal("tax");
  const hasRecordedBreakdown = recordedLines.length > 0;
  const summaryTax =
    recordedTaxLines > 0
      ? recordedTaxLines
      : summaryInvoice
        ? summaryInvoice.tax_amount
        : taxAmount;
  const summaryTotal = summaryInvoice ? summaryInvoice.total : totalDue;
  const summaryPaid = summaryInvoice ? summaryInvoice.amount_paid : succeededPaymentTotal;
  const summaryBalance = Math.max(0, roundMoney(summaryTotal - summaryPaid));
  const isEditable = appointment.status !== "completed" && appointment.status !== "cancelled";
  const canReactivate = appointment.status === "cancelled" || appointment.status === "no_show";

  const openDirections = () => {
    if (!address) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <AppointmentDetailLayout embedded={embedded}>
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-28 pt-6 md:pb-12">
        {/* Header — one H1, eyebrow for stage context, mono for the when */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="h-12 w-12 shrink-0"
              aria-label="Back to appointments"
            >
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div className="min-w-0">
              <Eyebrow>{stageEyebrow}</Eyebrow>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight">
                  {appointment.display_title || appointment.title}
                </h2>
                <AppointmentStatusChip appointment={appointment} />
                {appointment.confirmation_code && (
                  <span className="font-mono text-sm uppercase tracking-wide text-muted-foreground">
                    Confirmation {appointment.confirmation_code}
                  </span>
                )}
              </div>
              <p className="mt-2 font-display text-sm font-semibold text-muted-foreground">
                {formatDate(appointment.scheduled_date)} at {formatTimeLabel(appointment.scheduled_time, "h:mm a")} · {appointment.duration_minutes} min
              </p>
            </div>
          </div>
          {isEditable && (
            <Button variant="outline" size="sm" className="min-h-[56px] gap-2 px-6 text-base" onClick={() => setEditDialogOpen(true)}>
              <Edit className="h-5 w-5" />Edit
            </Button>
          )}
        </header>

        {embedded && technicianId && (
          <FieldJobView
            appointment={{
              id: appointment.id,
              dispatch_status: appointment.dispatch_status || "assigned",
              scheduled_time: appointment.scheduled_time,
              guest_name: appointment.guest_name,
              guest_phone: appointment.guest_phone,
              location_address: appointment.location_address,
              customer: appointment.customer ? { name: appointment.customer.name } : undefined,
              service_catalog: appointment.service_catalog ? { name: appointment.service_catalog.name } : undefined,
              vehicle: appointment.vehicle
                ? {
                    year: appointment.vehicle.year != null ? String(appointment.vehicle.year) : undefined,
                    make: appointment.vehicle.make,
                    model: appointment.vehicle.model,
                  }
                : null,
            }}
            technician_id={technicianId}
            onStatusChange={() => fetchAppointment()}
          />
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main column — what the job is */}
          <div className="space-y-8 lg:col-span-2">
            <section aria-labelledby="customer-vehicle-heading">
              <h2 id="customer-vehicle-heading" className="font-display text-2xl font-bold leading-tight tracking-tight">
                {terms.customer} &amp; {terms.vehicle}
              </h2>
              <Card className="mt-4 rounded-2xl shadow-card">
                <CardContent className="p-0">
                  {/* Customer block */}
                  <div className="space-y-4 p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Eyebrow>{terms.customer}</Eyebrow>
                        <p className="mt-1 break-words font-display text-lg font-bold leading-snug">{customerName}</p>
                      </div>
                      {appointment.customer && (
                        <Button
                          variant="link"
                          className="min-h-[44px] shrink-0 gap-1 px-2"
                          onClick={() => navigate(`/customers/${appointment.customer!.id}`)}
                        >
                          <History className="h-4 w-4" />History
                        </Button>
                      )}
                    </div>

                    {customerPhone && (
                      <ClickablePhone
                        phone={customerPhone}
                        className="flex min-h-[56px] w-full items-center gap-3 rounded-lg border px-4 font-mono text-[15px] text-foreground no-underline hover:bg-muted/40 hover:text-foreground hover:no-underline"
                        iconClassName="h-5 w-5 text-primary"
                      >
                        <span className="sr-only">Call </span>
                        {customerPhone}
                      </ClickablePhone>
                    )}

                    {displayEmail ? (
                      <ClickableEmail
                        email={displayEmail}
                        className="flex min-h-[56px] w-full items-center gap-3 rounded-lg border px-4 text-[15px] text-foreground no-underline hover:bg-muted/40 hover:text-foreground hover:no-underline"
                        iconClassName="h-5 w-5 text-primary"
                      >
                        <span className="min-w-0 flex-1 break-all font-mono text-[14px]">
                          <span className="sr-only">Email </span>
                          {displayEmail}
                        </span>
                      </ClickableEmail>
                    ) : (
                      <div className="flex min-h-[56px] w-full items-center gap-3 rounded-lg border border-dashed px-4 text-[15px] text-muted-foreground">
                        <Mail className="h-5 w-5 shrink-0" aria-hidden />
                        No email on file
                      </div>
                    )}

                    {address ? (
                      <button
                        onClick={openDirections}
                        className="flex min-h-[56px] w-full items-center gap-3 rounded-lg border px-4 text-left transition-colors hover:bg-muted/40"
                      >
                        <MapPin className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0 flex-1 break-words font-mono text-[14px]">{address}</span>
                        <Navigation className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    ) : (
                      <div className="rounded-lg border border-dashed px-4 py-4">
                        <p className="text-sm text-muted-foreground">
                          No address on file for this job.{" "}
                          <button className="underline underline-offset-2" onClick={() => setEditDialogOpen(true)}>
                            Add one
                          </button>{" "}
                          so the tech can navigate.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>

            <AppointmentConfigurationSummary appointmentId={appointment.id} />

            <section aria-label="Job records">
              <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Job records</h2>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
                <TabsList className="flex h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
                  <TabsTrigger value="services" className="min-h-11 gap-2 rounded-none border-b-2 border-transparent px-3 text-base shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-primary data-[state=active]:shadow-none">
                    <Wrench className="h-5 w-5" />Services
                  </TabsTrigger>
                  <TabsTrigger value="payments" className="min-h-11 gap-2 rounded-none border-b-2 border-transparent px-3 text-base shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-primary data-[state=active]:shadow-none">
                    <Receipt className="h-5 w-5" />Invoices &amp; Payments
                  </TabsTrigger>
                  <TabsTrigger value="messages" className="min-h-11 gap-2 rounded-none border-b-2 border-transparent px-3 text-base shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-primary data-[state=active]:shadow-none">
                    <MessageSquare className="h-5 w-5" />Job Messages
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
                    onTotalChange={(subtotal) => setServicesTotal(subtotal)}
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
                  <div className="h-[600px] overflow-hidden rounded-2xl border">
                    <InternalInbox initialAppointmentId={appointment.id} embedded />
                  </div>
                </TabsContent>
              </Tabs>
            </section>

            {humanNotes && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-lg font-bold leading-snug">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg bg-secondary p-5">
                    <p className="whitespace-pre-wrap text-base leading-[1.5]">{humanNotes}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Rail — money and actions, nothing else */}
          <div className="space-y-6 self-start lg:sticky lg:top-24">
            <PaymentStateBand
              invoiceNumber={summaryInvoice?.invoice_number ?? null}
              invoiceStatus={summaryInvoice?.status ?? null}
              total={summaryTotal}
              amountPaid={summaryPaid}
              balance={summaryBalance}
              onViewPayments={() => setActiveTab("payments")}
            />
            <Card className="rounded-2xl shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="font-display text-lg font-bold leading-snug">Financial summary</CardTitle>
                  {isPrepaid && (
                    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold", statusToneClasses("success").chip)}>
                      Prepaid
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">One total for this appointment</p>
                {priceLocked && (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Lock className="h-3.5 w-3.5" />Website quote locked
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {hasRecordedBreakdown ? (
                  <>
                    {recordedServiceLines.map((line, index) => (
                      <div key={`${line.description}-${index}`} className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-muted-foreground">{line.description}</span>
                        <span className="font-mono text-sm">{formatCurrency(line.amount)}</span>
                      </div>
                    ))}
                    {recordedWasteFee > 0 && (
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-muted-foreground">Waste Oil Disposal Fee</span>
                        <span className="font-mono text-sm">{formatCurrency(recordedWasteFee)}</span>
                      </div>
                    )}
                    {recordedShopFee > 0 && (
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-muted-foreground">{feeSettings?.shop_fee_description || "Shop fee"}</span>
                        <span className="font-mono text-sm">{formatCurrency(recordedShopFee)}</span>
                      </div>
                    )}
                    {recordedProcessingFee > 0 && (
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-muted-foreground">Card Processing Fee</span>
                        <span className="font-mono text-sm">{formatCurrency(recordedProcessingFee)}</span>
                      </div>
                    )}
                    {summaryTax > 0 && (
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-muted-foreground">Tax</span>
                        <span className="font-mono text-sm">{formatCurrency(summaryTax)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm text-muted-foreground">Services</span>
                      <span className="font-mono text-sm">{formatCurrency(estimatedCost)}</span>
                    </div>
                    {wasteOilFee > 0 && (
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-muted-foreground">Waste oil disposal fee</span>
                        <span className="font-mono text-sm">{formatCurrency(wasteOilFee)}</span>
                      </div>
                    )}
                    {shopFee > 0 && (
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-muted-foreground">{feeSettings?.shop_fee_description || "Shop supplies fee"}</span>
                        <span className="font-mono text-sm">{formatCurrency(shopFee)}</span>
                      </div>
                    )}
                    {surcharge > 0 && (
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-muted-foreground">{feeSettings?.surcharge_description || "Card processing fee"}</span>
                        <span className="font-mono text-sm">{formatCurrency(surcharge)}</span>
                      </div>
                    )}
                    {taxAmount > 0 && (
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-muted-foreground">Tax</span>
                        <span className="font-mono text-sm">{formatCurrency(taxAmount)}</span>
                      </div>
                    )}
                  </>
                )}
                <Separator />
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-display text-base font-bold">Total</span>
                  <span className="font-display text-lg font-extrabold">{formatCurrency(summaryTotal)}</span>
                </div>
                {summaryPaid > 0 && (
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Amount paid</span>
                    <span className="font-semibold text-status-completed-fg">{formatCurrency(summaryPaid)}</span>
                  </div>
                )}
                <div className="flex items-end justify-between gap-4 pt-1">
                  <div>
                    <p className="text-base font-semibold">Balance due</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {summaryBalance > 0 ? "Collect after the job" : summaryPaid > 0 ? "Paid in full" : "Collect after the job"}
                    </p>
                  </div>
                  <p className="font-display text-3xl font-extrabold leading-none text-blue-strong">{formatCurrency(summaryBalance)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display text-lg font-bold leading-snug">Job actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isEditable && (
                  <>
                    {(appointment.assigned_technician_id || appointment.assigned_van_id) && (
                      <Button className="min-h-[56px] w-full text-base" variant="outline" onClick={handleUnassign} disabled={unassigning}>
                        {unassigning ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UserX className="mr-2 h-5 w-5" />}
                        Unassign to dispatch board
                      </Button>
                    )}
                    <JobActionButton appointment={appointment} onUpdated={fetchAppointment} className="min-h-[56px] w-full text-base" />
                    <Button
                      className="min-h-[56px] w-full text-base"
                      variant="outline"
                      onClick={() => {
                        setRescheduleDate(appointment.scheduled_date);
                        setRescheduleTime(appointment.scheduled_time?.slice(0, 5) || "");
                        setRescheduleOpen(true);
                      }}
                    >
                      <Calendar className="mr-2 h-5 w-5" />Reschedule
                    </Button>
                    <Button className="min-h-[56px] w-full text-base" variant="destructive" onClick={() => handleStatusChange("cancelled")}>
                      <XCircle className="mr-2 h-5 w-5" />Cancel
                    </Button>
                  </>
                )}

                {appointment.status === "completed" && appointment.service_record_id && (
                  <>
                    <Button className="min-h-[56px] w-full gap-2 text-base" onClick={() => navigate(`/services/${appointment.service_record_id}`)}>
                      <FileText className="h-5 w-5" />View service record
                    </Button>
                    <Button
                      className="min-h-[56px] w-full gap-2 text-base"
                      variant="outline"
                      disabled={reviewRequestLoading || reviewRequestSent}
                      onClick={handleRequestReview}
                    >
                      {reviewRequestLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Star className="h-5 w-5" />}
                      {reviewRequestSent ? `Review ${reviewRequestStatus ?? "requested"}` : "Request review"}
                    </Button>
                  </>
                )}

                {canReactivate && (
                  <>
                    <Separator className="my-2" />
                    <Button className="min-h-[56px] w-full text-base" variant="outline" onClick={() => handleStatusChange("confirmed")}>
                      Reactivate
                    </Button>
                  </>
                )}

                {allowDelete && (
                  <>
                    <Separator className="my-2" />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button className="min-h-[56px] w-full text-base" variant="ghost">
                          <Trash2 className="mr-2 h-5 w-5 text-destructive" />
                          <span className="text-destructive">Delete appointment</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete appointment?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently delete the appointment. This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="min-h-[56px]">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete} className="min-h-[56px] bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </CardContent>
            </Card>

            {(resolvedAddress || appointment.customer?.address) && (
              <LocationPreview address={resolvedAddress || appointment.customer?.address || ""} />
            )}

            <AppointmentSyncCard appointmentId={appointment.id} />

            <Card>
              <CardHeader>
                <CardTitle className="font-display text-lg font-bold leading-snug">Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div className="mt-2 w-0.5 flex-1 bg-border" />
                    </div>
                    <div className="pb-1">
                      <p className="text-base font-semibold">Scheduled</p>
                      <p className="mt-0.5 font-mono text-[14px] text-muted-foreground">
                        {formatDate(appointment.scheduled_date)} · {formatTimeLabel(appointment.scheduled_time, "h:mm a")}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                      {getStatusIcon(appointment.status)}
                    </div>
                    <div>
                      <p className="text-base font-semibold">{statusChip.label}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">Current status</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Text messages — the paper trail, below the fold */}
        <section aria-labelledby="job-texts-heading">
          <h2 id="job-texts-heading" className="font-display text-2xl font-bold leading-tight tracking-tight">Text messages</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border">
            <AppointmentSmsTimeline
              appointmentId={appointment.id}
              customerPhone={appointment.customer?.phone || appointment.guest_phone}
              scheduledDate={appointment.scheduled_date}
            />
          </div>
        </section>
      </div>

      <EditAppointmentDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        appointment={appointment}
        onSuccess={() => fetchAppointment()}
      />

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[18px]"><Calendar className="h-5 w-5" />Reschedule appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reschedule-date">New date</Label>
              <Input id="reschedule-date" type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} className="min-h-[56px] text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reschedule-time">New time</Label>
              <Input id="reschedule-time" type="time" value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)} className="min-h-[56px] text-base" />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setRescheduleOpen(false)} disabled={rescheduling} className="min-h-[56px] text-base">Cancel</Button>
            <Button onClick={handleReschedule} disabled={!rescheduleDate || !rescheduleTime || rescheduling} className="min-h-[56px] text-base">
              {rescheduling && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}Confirm reschedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CompleteAppointmentDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        appointment={appointment}
        onSuccess={() => fetchAppointment()}
      />
    </AppointmentDetailLayout>
  );
};

function AppointmentDetailLayout({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  if (embedded) return <div className="flex-1 overflow-y-auto">{children}</div>;
  return <AppLayout title="Appointment Details">{children}</AppLayout>;
}

export default AppointmentDetail;

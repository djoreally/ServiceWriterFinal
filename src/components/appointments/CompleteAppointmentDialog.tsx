import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle, FileText, Filter, Car, Droplets, Banknote, Send, WalletCards } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { completeAppointmentWithServiceRecord } from "@/application/commands/service-record.command";
import { Appointment } from "@/shared/types";
import { computeAppointmentTotal } from "@/lib/appointmentTotal";
import { formatOilQuarts, parseOilCapacityToQuarts } from "@/lib/oilCapacity";
import { useFeeSettings } from "@/hooks/useFeeSettings";
import { fetchVehicleSpecifications } from "@/application/queries/vehicle-specifications.query";
import { updateVehicleOilType } from "@/application/commands/vehicles.command";
import { createAppointmentPaymentRecord, sendAppointmentPaymentLink } from "@/application/commands/appointment-payments.command";
import { isWebsiteQuoteLocked, websiteQuoteAmountDue } from "@/lib/price-lock";
import { fetchAppointmentPayments } from "@/application/queries/appointment-payments.query";
import { ManualPaymentDialog } from "@/components/payments/ManualPaymentDialog";
import { PaymentLinkDialog } from "@/components/payments/PaymentLinkDialog";
import { dollarsToCents, toCents, toDollars } from "@/lib/financialMath";

interface CompleteAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: Appointment | null;
  onSuccess?: (serviceId: string) => void;
}

export function CompleteAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onSuccess,
}: CompleteAppointmentDialogProps) {
  const { terms } = useTerminology();
  const { formatCurrency } = useRegionalSettings();
  const { feeSettings } = useFeeSettings();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    technician: "",
    laborHours: "",
    additionalNotes: "",
    mileage: "",
    vin: "",
    oilFilterNumber: "",
    airFilterNumber: "",
    cabinFilterNumber: "",
    fuelFilterNumber: "",
    oilQuartsUsed: "",
    oilType: "",
  });
  const [mileageError, setMileageError] = useState<string | null>(null);
  const [oilOptions, setOilOptions] = useState<Array<{ oil_type: string; oil_capacity: string | null; engine: string | null }>>([]);
  const [customOilType, setCustomOilType] = useState(false);
  const [step, setStep] = useState<"details" | "closeout">("details");
  const [closeoutProcessing, setCloseoutProcessing] = useState(false);
  const [closeoutPayment, setCloseoutPayment] = useState<{ id: string; amount: number; subtotal?: number; tax_amount?: number; refund_amount?: number; currency: string; customer_name?: string } | null>(null);
  const [manualPaymentOpen, setManualPaymentOpen] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [paymentLinkOpen, setPaymentLinkOpen] = useState(false);
  // For a website-quote-locked appointment, the amount already collected
  // (succeeded payment records for this appointment) is loaded from the DB
  // so the closeout collects exactly quote − paid, never a fee-loaded total.
  const [lockedAmountPaid, setLockedAmountPaid] = useState(0);

  // Pre-populate VIN, oil quarts, and current oil type from vehicle data
  useEffect(() => {
    if (appointment?.vehicle) {
      void Promise.resolve().then(() => setFormData(prev => ({
        ...prev,
        vin: appointment.vehicle?.vin || "",
        oilQuartsUsed: formatOilQuarts(parseOilCapacityToQuarts(appointment.vehicle?.oil_capacity)),
        oilType: appointment.vehicle?.oil_type || "",
      })));
    }
  }, [appointment?.vehicle?.vin, appointment?.vehicle?.oil_capacity, appointment?.vehicle?.oil_type, appointment?.vehicle]);

  // Load oil type options from vehicle_specifications for this year/make/model
  useEffect(() => {
    const v = appointment?.vehicle;
    if (!v?.year || !v?.make || !v?.model || !open) {
      void Promise.resolve().then(() => setOilOptions([]));
      return;
    }
    (async () => {
      const specs = await fetchVehicleSpecifications(v.year, v.make, v.model);
      const rows = specs.filter((r) => r.oil_type);
      // Dedupe by oil_type
      const seen = new Set<string>();
      const unique = rows.filter((r) => {
        const k = String(r.oil_type).toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setOilOptions(unique);
    })();
  }, [appointment?.vehicle?.year, appointment?.vehicle?.make, appointment?.vehicle?.model, open, appointment?.vehicle]);

  // Load what has already been collected for a locked appointment whenever
  // the dialog opens. The appointment's lock state comes from the same
  // fields the detail page uses: `source` + the raw metadata carried on
  // `intake_responses` (see @/lib/price-lock and AppointmentDetail).
  useEffect(() => {
    if (!open || !appointment || !isWebsiteQuoteLocked(appointment)) {
      void Promise.resolve().then(() => setLockedAmountPaid(0));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchAppointmentPayments(appointment.id);
        if (cancelled) return;
        const paidCents = rows
          .filter((row) => row.status === "succeeded")
          .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        setLockedAmountPaid(paidCents / 100);
      } catch {
        if (!cancelled) setLockedAmountPaid(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, appointment]);

  const handleComplete = async () => {
    if (!appointment) return;
    
    // Require mileage
    if (!formData.mileage || parseInt(formData.mileage) <= 0) {
      setMileageError("Ending mileage is required");
      return;
    }
    setMileageError(null);
    
    setLoading(true);
    try {
      // Build filter parts array for itemization
      const filterParts: { name: string; partNumber: string }[] = [];
      if (formData.oilFilterNumber.trim()) {
        filterParts.push({ name: "Oil Filter", partNumber: formData.oilFilterNumber.trim() });
      }
      if (formData.airFilterNumber.trim()) {
        filterParts.push({ name: "Air Filter", partNumber: formData.airFilterNumber.trim() });
      }
      if (formData.cabinFilterNumber.trim()) {
        filterParts.push({ name: "Cabin Filter", partNumber: formData.cabinFilterNumber.trim() });
      }
      if (formData.fuelFilterNumber.trim()) {
        filterParts.push({ name: "Fuel Filter", partNumber: formData.fuelFilterNumber.trim() });
      }

      // Persist the selected oil type to the vehicle BEFORE creating the
      // service record so the record captures the corrected oil.
      if (appointment.vehicle?.id && formData.oilType && formData.oilType !== appointment.vehicle?.oil_type) {
        await updateVehicleOilType(appointment.vehicle.id, formData.oilType);
      }

      const result = await completeAppointmentWithServiceRecord(appointment.id, {
        technician: formData.technician || undefined,
        laborHours: formData.laborHours ? parseFloat(formData.laborHours) : undefined,
        additionalNotes: formData.additionalNotes || undefined,
        mileage: parseInt(formData.mileage),
        vin: formData.vin.trim() || undefined,
        filterParts: filterParts.length > 0 ? filterParts : undefined,
        oilQuartsUsed: formData.oilQuartsUsed ? parseFloat(formData.oilQuartsUsed) : undefined,
        oilType: formData.oilType.trim() || undefined,
      });


      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success("Appointment completed and service record created!");
      onSuccess?.(result.serviceId!);
      setStep("closeout");
      
      // Reset form
      setFormData({
        technician: "",
        laborHours: "",
        additionalNotes: "",
        mileage: "",
        vin: "",
        oilFilterNumber: "",
        airFilterNumber: "",
        cabinFilterNumber: "",
        fuelFilterNumber: "",
        oilQuartsUsed: "",
        oilType: "",
      });
    } catch (error: unknown) {
      const err = error as Error;
      toast.error(err.message || "Failed to complete appointment");
    } finally {
      setLoading(false);
    }
  };

  if (!appointment) return null;

  const vehicleName = appointment.vehicle 
    ? `${appointment.vehicle.year} ${appointment.vehicle.make} ${appointment.vehicle.model}`
    : 'No vehicle specified';
  
  const customerName = appointment.customer?.name || appointment.guest_name || 'Customer';
  const hasVin = !!appointment.vehicle?.vin;
  const vehicleOilType = appointment.vehicle?.oil_type;
  const vehicleOilCapacity = appointment.vehicle?.oil_capacity;
  // Website quote lock: for a locked appointment the amount to collect is
  // the stored website quote minus what has already been paid, floored at
  // 0 — no workspace fee settings (waste fee, surcharge) or tax are applied
  // on top of the quote (see @/lib/price-lock). Unlocked appointments keep
  // the fee-loaded helper total unchanged.
  const priceLocked = isWebsiteQuoteLocked(appointment);
  const lockedAmountDue = priceLocked ? websiteQuoteAmountDue(appointment, lockedAmountPaid) : null;
  const finalTotal = lockedAmountDue ?? computeAppointmentTotal(appointment, feeSettings);
  const taxAmount = priceLocked ? 0 : Number(appointment.tax_amount ?? 0);
  const subtotal = priceLocked ? finalTotal : Math.max(finalTotal - taxAmount, 0);

  const resetAndClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep("details");
      setCloseoutPayment(null);
    }
    onOpenChange(nextOpen);
  };

  const createCloseoutPayment = async () => {
    if (closeoutPayment) return closeoutPayment;
    // A locked appointment whose quote is already fully collected has no
    // balance to create a payment for.
    if (priceLocked && finalTotal <= 0) return null;

    setCloseoutProcessing(true);
    try {
      const amountCents = dollarsToCents(toDollars(finalTotal));
      const subtotalCents = dollarsToCents(toDollars(subtotal));
      const taxCents = dollarsToCents(toDollars(taxAmount));
      const payment = await createAppointmentPaymentRecord({
        appointmentId: appointment.id,
        amountCents,
        subtotalCents,
        // Locked quotes carry no separate tax or fee rate: the quote is
        // the total, so the payment record is created tax-free at the due
        // amount. (The server independently enforces this amount.)
        taxCents: priceLocked ? null : taxCents > 0 ? taxCents : null,
        taxRate: priceLocked ? null : feeSettings?.tax_rate ?? null,
        customerEmail: appointment.customer?.email ?? appointment.guest_email ?? null,
        customerName,
      });

      setCloseoutPayment({
        id: payment.id,
        amount: payment.amount,
        subtotal,
        tax_amount: taxAmount,
        currency: payment.currency_code,
        customer_name: customerName,
      });
      return payment;
    } finally {
      setCloseoutProcessing(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-gray-500" />
            {step === "details" ? "Complete Appointment" : "Closeout & Collect"}
          </DialogTitle>
          <DialogDescription>
            {step === "details"
              ? "Mark this appointment as complete and generate a service record."
              : "Choose how to settle the completed job now, or leave a balance due."}
          </DialogDescription>
        </DialogHeader>

        {step === "details" ? <>
        <div className="space-y-4 py-4">
          {/* Appointment Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{terms.service}:</span>
              <span className="font-medium">{appointment.service_catalog?.name || appointment.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{terms.customer}:</span>
              <span>{customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{terms.vehicle}:</span>
              <span>{vehicleName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-medium">{formatCurrency(finalTotal)}</span>
            </div>
          </div>

          <Separator />

          {/* Vehicle Details Section - VIN if not already set */}
          {!hasVin && appointment.vehicle && (
            <>
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  Vehicle Information
                </h4>
                <div className="space-y-2">
                  <Label>VIN Number</Label>
                  <Input
                    placeholder="Enter 17-character VIN"
                    value={formData.vin}
                    onChange={(e) => setFormData({ ...formData, vin: e.target.value.toUpperCase() })}
                    maxLength={17}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    The VIN will be saved to the vehicle record
                  </p>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Oil Usage Section - show vehicle oil specs and allow quarts input */}
          {appointment.vehicle && (
            <>
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Droplets className="h-4 w-4" />
                  Oil Usage
                </h4>
                {(vehicleOilType || vehicleOilCapacity) && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 space-y-1 text-sm">
                    {vehicleOilType && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">On file — Oil Type:</span>
                        <span className="font-medium">{vehicleOilType}</span>
                      </div>
                    )}
                    {vehicleOilCapacity && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">On file — Capacity:</span>
                        <span className="font-medium">
                          {/qt|quart|liter|l\b/i.test(vehicleOilCapacity)
                            ? vehicleOilCapacity
                            : `${vehicleOilCapacity} qt`}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Oil Type</Label>
                  {oilOptions.length > 0 && !customOilType ? (
                    <Select
                      value={formData.oilType && oilOptions.some(o => o.oil_type === formData.oilType) ? formData.oilType : ""}
                      onValueChange={(val) => {
                        if (val === "__custom__") {
                          setCustomOilType(true);
                          return;
                        }
                        const match = oilOptions.find(o => o.oil_type === val);
                        setFormData((prev) => ({
                          ...prev,
                          oilType: val,
                          oilQuartsUsed: prev.oilQuartsUsed || formatOilQuarts(parseOilCapacityToQuarts(match?.oil_capacity)),
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select the oil used…" />
                      </SelectTrigger>
                      <SelectContent>
                        {oilOptions.map((opt) => (
                          <SelectItem key={opt.oil_type} value={opt.oil_type}>
                            {opt.oil_type}
                            {opt.engine ? ` · ${opt.engine}` : ""}
                            {opt.oil_capacity ? ` · ${opt.oil_capacity}` : ""}
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">Other / enter manually…</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="e.g., 0W-20 Synthetic"
                      value={formData.oilType}
                      onChange={(e) => setFormData({ ...formData, oilType: e.target.value })}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {appointment.vehicle?.oil_type
                      ? "Selecting a different oil will update the vehicle record."
                      : "The selected oil will be saved to the vehicle record for future services."}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Oil Used (quarts)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    placeholder={formatOilQuarts(parseOilCapacityToQuarts(vehicleOilCapacity)) || "e.g., 5"}
                    value={formData.oilQuartsUsed}
                    onChange={(e) => setFormData({ ...formData, oilQuartsUsed: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Amount of oil used — will be itemized on the invoice
                  </p>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Filter Numbers Section */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Parts Used (Filter Numbers)
            </h4>
            <p className="text-sm text-muted-foreground">
              Enter filter part numbers used. These will be itemized on invoices and service records.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Oil Filter #</Label>
                <Input
                  placeholder="e.g., PH3614"
                  value={formData.oilFilterNumber}
                  onChange={(e) => setFormData({ ...formData, oilFilterNumber: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="space-y-2">
                <Label>Air Filter #</Label>
                <Input
                  placeholder="e.g., CA10171"
                  value={formData.airFilterNumber}
                  onChange={(e) => setFormData({ ...formData, airFilterNumber: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cabin Filter #</Label>
                <Input
                  placeholder="e.g., CF10134"
                  value={formData.cabinFilterNumber}
                  onChange={(e) => setFormData({ ...formData, cabinFilterNumber: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="space-y-2">
                <Label>Fuel Filter #</Label>
                <Input
                  placeholder="e.g., G6335"
                  value={formData.fuelFilterNumber}
                  onChange={(e) => setFormData({ ...formData, fuelFilterNumber: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Service Record Details */}
          <div className="space-y-4">
            <h4 className="font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {terms.service} Record Details
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Technician</Label>
                <Input
                  placeholder="Who performed the service?"
                  value={formData.technician}
                  onChange={(e) => setFormData({ ...formData, technician: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Labor Hours</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="0"
                  value={formData.laborHours}
                  onChange={(e) => setFormData({ ...formData, laborHours: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ending Mileage <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                placeholder={appointment.vehicle?.mileage?.toString() || "Enter mileage"}
                value={formData.mileage}
                onChange={(e) => {
                  setFormData({ ...formData, mileage: e.target.value });
                  if (mileageError) setMileageError(null);
                }}
                className={mileageError ? "border-destructive" : ""}
              />
              {mileageError && (
                <p className="text-sm text-destructive">{mileageError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Additional Notes</Label>
              <Textarea
                placeholder="Any additional notes about the completed service..."
                value={formData.additionalNotes}
                onChange={(e) => setFormData({ ...formData, additionalNotes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => resetAndClose(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleComplete} disabled={loading} className="gap-2">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Complete & Create Record
          </Button>
        </DialogFooter>
        </> : <>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{customerName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Final amount due</span>
                <span className="font-bold text-lg">{formatCurrency(finalTotal)}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                {priceLocked && finalTotal <= 0
                  ? "The locked website quote has already been paid in full — there is no balance to collect."
                  : "Cash collection is available without an email address. A payment link requires one."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                className="h-auto min-h-24 justify-start gap-3 p-4 text-left"
                disabled={closeoutProcessing || (priceLocked && finalTotal <= 0)}
                onClick={async () => {
                  try {
                    const payment = await createCloseoutPayment();
                    if (payment) setManualPaymentOpen(true);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Unable to start cash collection");
                  }
                }}
              >
                {closeoutProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Banknote className="h-5 w-5" />}
                <span><span className="block font-semibold">Record cash or manual payment</span><span className="block text-xs font-normal opacity-90">Cash, check, or external terminal</span></span>
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-24 justify-start gap-3 p-4 text-left"
                disabled={closeoutProcessing || (priceLocked && finalTotal <= 0) || !(appointment.customer?.email || appointment.guest_email)}
                onClick={async () => {
                  try {
                    const payment = await createCloseoutPayment();
                    if (!payment) return;
                    const result = await sendAppointmentPaymentLink({
                      paymentId: payment.id,
                      customerEmail: appointment.customer?.email ?? appointment.guest_email ?? null,
                      customerName,
                    });
                    setPaymentLinkUrl(result.url);
                    setPaymentLinkOpen(true);
                    toast.success(result.emailSent ? "Payment link sent" : "Payment link created");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Unable to create payment link");
                  }
                }}
              >
                <Send className="h-5 w-5" />
                <span><span className="block font-semibold">Send payment link</span><span className="block text-xs font-normal text-muted-foreground">{appointment.customer?.email || appointment.guest_email ? "Email the customer securely" : "Customer email required"}</span></span>
              </Button>
            </div>

            <Button
              variant="secondary"
              className="w-full justify-start gap-3 p-4 h-auto"
              disabled={closeoutProcessing}
              onClick={async () => {
                try {
                  const payment = await createCloseoutPayment();
                  if (priceLocked && !payment && !closeoutPayment) {
                    toast.success("Locked website quote already paid in full");
                  } else {
                    toast.success("Balance due saved for follow-up");
                  }
                  resetAndClose(false);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Unable to save balance due");
                }
              }}
            >
              <WalletCards className="h-5 w-5" />
              <span className="text-left"><span className="block font-semibold">Leave balance due</span><span className="block text-xs font-normal text-muted-foreground">Record the receivable and collect later</span></span>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => resetAndClose(false)} disabled={closeoutProcessing}>Finish later</Button>
          </DialogFooter>
        </>}
      </DialogContent>
      </Dialog>
      <ManualPaymentDialog
        open={manualPaymentOpen}
        onOpenChange={setManualPaymentOpen}
        payment={closeoutPayment}
        onSuccess={() => resetAndClose(false)}
      />
      <PaymentLinkDialog
        open={paymentLinkOpen}
        onOpenChange={setPaymentLinkOpen}
        paymentUrl={paymentLinkUrl}
        customerEmail={appointment.customer?.email ?? appointment.guest_email ?? null}
      />
    </>
  );
}

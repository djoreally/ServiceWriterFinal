import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, Banknote, Send, WalletCards } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { completeAppointmentWithServiceRecord, type AppointmentCloseoutResult } from "@/application/commands/service-record.command";
import { type Appointment } from "@/shared/types";
import { sendAppointmentPaymentLink } from "@/application/commands/appointment-payments.command";
import { ManualPaymentDialog } from "@/components/payments/ManualPaymentDialog";
import { PaymentLinkDialog } from "@/components/payments/PaymentLinkDialog";

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
  const { formatCurrency } = useRegionalSettings();
  const [processing, setProcessing] = useState(false);
  const [closeout, setCloseout] = useState<AppointmentCloseoutResult | null>(null);
  const [manualPaymentOpen, setManualPaymentOpen] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [paymentLinkOpen, setPaymentLinkOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      void Promise.resolve().then(() => {
        setCloseout(null);
        setProcessing(false);
        setManualPaymentOpen(false);
        setPaymentLinkOpen(false);
        setPaymentLinkUrl(null);
      });
    }
  }, [open]);

  if (!appointment) return null;

  const customerName = appointment.customer?.name || appointment.guest_name || "Customer";
  const customerEmail = appointment.customer?.email ?? appointment.guest_email ?? null;
  const vehicleName = appointment.vehicle
    ? [appointment.vehicle.year, appointment.vehicle.make, appointment.vehicle.model].filter(Boolean).join(" ")
    : "Vehicle(s) on appointment";

  const completeJob = async () => {
    setProcessing(true);
    try {
      const result = await completeAppointmentWithServiceRecord(appointment.id);
      if (!result.success) throw new Error(result.error || "Unable to complete appointment.");
      setCloseout(result);
      if (result.serviceId) onSuccess?.(result.serviceId);
      toast.success("Appointment completed and vehicle service history created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to complete appointment");
    } finally {
      setProcessing(false);
    }
  };

  const payment = closeout?.paymentId && Number(closeout.balanceDue ?? 0) > 0
    ? {
        id: closeout.paymentId,
        amount: Number(closeout.balanceDue ?? 0),
        subtotal: Number(closeout.subtotal ?? 0),
        tax_amount: Number(closeout.taxAmount ?? 0),
        surcharge_amount: Number(closeout.cardFeeAmount ?? 0),
        currency: closeout.currencyCode ?? "USD",
        customer_name: customerName,
      }
    : null;

  const finish = () => onOpenChange(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              {closeout ? "Closeout & Collect" : "Complete Appointment"}
            </DialogTitle>
            <DialogDescription>
              {closeout
                ? "The canonical invoice and receivable are finalized. Choose how to settle the remaining balance."
                : "Completion is allowed only after every required vehicle inspection and recommendation has been resolved."}
            </DialogDescription>
          </DialogHeader>

          {!closeout ? (
            <>
              <div className="space-y-3 py-4">
                <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Customer</span>
                    <span className="font-medium text-right">{customerName}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Appointment</span>
                    <span className="font-medium text-right">{appointment.title || "Service"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Primary vehicle</span>
                    <span className="font-medium text-right">{vehicleName}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  VIN, mileage, inspection findings, parts and service details are recorded in their vehicle-scoped workflow. This closeout does not overwrite one vehicle with another.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={finish} disabled={processing}>Cancel</Button>
                <Button onClick={completeJob} disabled={processing}>
                  {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                  Complete Job
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Invoice total</span>
                    <span className="font-medium">{formatCurrency(Number(closeout.total ?? 0))}</span>
                  </div>
                  {Number(closeout.cardFeeAmount ?? 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Card processing fee</span>
                      <span>{formatCurrency(Number(closeout.cardFeeAmount ?? 0))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Already paid</span>
                    <span>{formatCurrency(Number(closeout.amountPaid ?? 0))}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="font-medium">Balance due</span>
                    <span className="font-bold text-lg">{formatCurrency(Number(closeout.balanceDue ?? 0))}</span>
                  </div>
                </div>

                {payment ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      className="h-auto min-h-24 justify-start gap-3 p-4 text-left"
                      onClick={() => setManualPaymentOpen(true)}
                    >
                      <Banknote className="h-5 w-5" />
                      <span>
                        <span className="block font-semibold">Record manual payment</span>
                        <span className="block text-xs font-normal opacity-90">Cash, check, or external terminal</span>
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto min-h-24 justify-start gap-3 p-4 text-left"
                      disabled={!customerEmail}
                      onClick={async () => {
                        try {
                          const result = await sendAppointmentPaymentLink({
                            paymentId: payment.id,
                            customerEmail,
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
                      <span>
                        <span className="block font-semibold">Send payment link</span>
                        <span className="block text-xs font-normal text-muted-foreground">{customerEmail ? "Email the customer securely" : "Customer email required"}</span>
                      </span>
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border p-4 text-sm">
                    <div className="font-medium">Paid in full</div>
                    <div className="text-muted-foreground">No additional receivable was created.</div>
                  </div>
                )}

                {payment && (
                  <Button variant="secondary" className="w-full justify-start gap-3 p-4 h-auto" onClick={finish}>
                    <WalletCards className="h-5 w-5" />
                    <span className="text-left">
                      <span className="block font-semibold">Leave balance due</span>
                      <span className="block text-xs font-normal text-muted-foreground">The canonical receivable is already saved for follow-up.</span>
                    </span>
                  </Button>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={finish}>Finish</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ManualPaymentDialog
        open={manualPaymentOpen}
        onOpenChange={setManualPaymentOpen}
        payment={payment}
        onSuccess={finish}
      />
      <PaymentLinkDialog
        open={paymentLinkOpen}
        onOpenChange={setPaymentLinkOpen}
        paymentUrl={paymentLinkUrl}
        customerEmail={customerEmail}
      />
    </>
  );
}

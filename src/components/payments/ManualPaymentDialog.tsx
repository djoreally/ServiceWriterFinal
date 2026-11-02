import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Banknote, CheckCircle2, ArrowLeft } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { recordManualPayment } from "@/application/commands";
import {
  centsToDollars,
  dollarsToCents,
  formatCentsAsCurrency,
  toCents,
  toDollars,
} from "@/lib/financialMath";

interface ManualPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: {
    id: string;
    amount: number;
    /** Subtotal in cents — service line items only, no fees/tax. */
    subtotal?: number | null;
    /** Tax in cents. */
    tax_amount?: number | null;
    refund_amount?: number | null;
    currency: string;
    customer_name?: string | null;
  } | null;
  onSuccess: () => void;
}

export function ManualPaymentDialog({
  open,
  onOpenChange,
  payment,
  onSuccess,
}: ManualPaymentDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [notes, setNotes] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<"form" | "review">("form");

  // Cash close-out: the amount received at the door settles the ticket. If it
  // is less than the finalized balance, the difference is waived as a cash
  // adjustment (card fees) and the invoice closes PAID — partial payments are
  // never recorded.
  const fullDueCents = payment
    ? toCents(payment.amount - (payment.refund_amount || 0))
    : 0;

  const parsedReceived = Number(amountInput);
  const receivedCents =
    amountInput.trim() === "" || Number.isNaN(parsedReceived)
      ? 0
      : dollarsToCents(toDollars(parsedReceived));
  const waivedCents = Math.max(0, fullDueCents - receivedCents);
  const isCashCloseout = waivedCents > 0;

  // Seed the received amount at the full balance each time the dialog opens
  // for a payment; it is only lowered for a cash close-out.
  const seededForRef = useRef<string | null>(null);
  useEffect(() => {
    if (open && payment && seededForRef.current !== payment.id) {
      seededForRef.current = payment.id;
      setAmountInput(centsToDollars(toCents(fullDueCents)).toFixed(2));
    }
  }, [open, payment, fullDueCents]);

  // Reset the wizard whenever the dialog is closed so it never reopens on review.
  useEffect(() => {
    if (!open) {
      seededForRef.current = null;
      void Promise.resolve().then(() => setStep("form"));
      void Promise.resolve().then(() => setProcessing(false));
    }
  }, [open]);

  // The review and receipt use the amount actually received.
  const requestedDollars = centsToDollars(toCents(receivedCents));
  const requestedCents = receivedCents;

  const goToReview = () => {
    if (!payment) return;
    if (requestedDollars <= 0 || receivedCents > fullDueCents) {
      toast.error(
        `Amount must be between $0.01 and ${formatCentsAsCurrency(
          fullDueCents,
          payment.currency,
        )}`,
      );
      return;
    }
    setStep("review");
  };

  const handleConfirm = async () => {
    if (!payment) return;
    setProcessing(true);
    try {
      await recordManualPayment({
        paymentId: payment.id,
        amountCents: requestedCents,
        paymentMethod,
        notes: notes.trim() || undefined,
        waiveFees: false,
        waiveTax: false,
        waiveRemaining: isCashCloseout,
      });

      toast.success(
        isCashCloseout
          ? `Payment of ${formatCentsAsCurrency(
              requestedCents,
              payment.currency,
            )} recorded — ${formatCentsAsCurrency(
              waivedCents,
              payment.currency,
            )} waived as a cash adjustment. Invoice PAID in full`
          : `Payment of ${formatCentsAsCurrency(
              requestedCents,
              payment.currency,
            )} recorded`,
      );
      onOpenChange(false);
      onSuccess();

      // Reset form
      setPaymentMethod("cash");
      setNotes("");
      setAmountInput("");
      setStep("form");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to record payment";
      toast.error(message);
      // Stay on review so the user can adjust without losing context.
    } finally {
      setProcessing(false);
    }
  };

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: "Cash",
    check: "Check",
    external_card: "External Card Terminal",
    other: "Other",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            {step === "review" ? "Confirm Payment" : "Record Manual Payment"}
          </DialogTitle>
          <DialogDescription>
            {step === "review"
              ? "Review the final charge summary before recording the payment."
              : "Record a payment received in person (cash, check, or external card terminal)"}
          </DialogDescription>
        </DialogHeader>

        {payment && step === "form" && (
          <div className="space-y-4 mt-4">
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{payment.customer_name || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount Due</span>
                <span className="font-bold text-lg">
                  {formatCentsAsCurrency(fullDueCents, payment.currency)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment-method">
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="external_card">External Card Terminal</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-amount">Amount Received</Label>
              <Input
                id="payment-amount"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
              {isCashCloseout ? (
                <p className="text-xs text-muted-foreground">
                  Cash received {formatCentsAsCurrency(receivedCents, payment.currency)} · Waived{" "}
                  {formatCentsAsCurrency(waivedCents, payment.currency)} (cash adjustment — card
                  fees) · Invoice will be PAID in full
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  If less than the full balance is received, the difference is waived as a cash
                  adjustment (card fees) and the invoice closes PAID in full. Partial payments are
                  never recorded.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-notes">Notes (Optional)</Label>
              <Textarea
                id="payment-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Check #1234, received by John..."
                rows={2}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={goToReview}
                disabled={processing}
                className="flex-1"
              >
                Review &amp; Confirm
              </Button>
            </div>
          </div>
        )}

        {payment && step === "review" && (
          <div className="space-y-4 mt-4">
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-5 space-y-3">
              <div className="text-center">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Will be recorded as paid
                </p>
                <p className="text-3xl font-bold mt-1">
                  {formatCentsAsCurrency(requestedCents, payment.currency)}
                </p>
              </div>

              <div className="border-t border-border/60 pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">
                    {payment.customer_name || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment method</span>
                  <span className="font-medium">
                    {PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Original amount due</span>
                  <span>
                    {formatCentsAsCurrency(fullDueCents, payment.currency)}
                  </span>
                </div>
                {isCashCloseout && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cash received</span>
                      <span>
                        {formatCentsAsCurrency(receivedCents, payment.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Waived (cash adjustment — card fees)
                      </span>
                      <span>
                        {formatCentsAsCurrency(waivedCents, payment.currency)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-center pt-1">
                      Invoice will be PAID in full
                    </p>
                  </>
                )}
                {notes.trim() && (
                  <div className="pt-1">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{notes.trim()}</p>
                  </div>
                )}
              </div>
            </div>


            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep("form")}
                disabled={processing}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={processing}
                className="flex-1"
              >
                {processing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Confirm &amp; Record
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

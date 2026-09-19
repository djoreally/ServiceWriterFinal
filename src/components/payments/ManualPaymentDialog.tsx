import { useEffect, useState } from "react";
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
  formatCentsAsCurrency,
  formatMoney,
  toCents,
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
    surcharge_amount?: number | null;
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
  const [waiveCardFee, setWaiveCardFee] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<"form" | "review">("form");

  const fullDueCents = payment
    ? toCents(payment.amount - (payment.refund_amount || 0))
    : 0;
  const surchargeCents = payment
    ? Math.max(0, toCents(Number((payment as { surcharge_amount?: number | null }).surcharge_amount ?? 0)))
    : 0;
  const canWaiveCardFee = (paymentMethod === "cash" || paymentMethod === "check" || paymentMethod === "external_card") && surchargeCents > 0;
  const waivedFeeCents = canWaiveCardFee && waiveCardFee ? surchargeCents : 0;
  const effectiveDueCents = toCents(Math.max(0, fullDueCents - waivedFeeCents));
  const effectiveDueDollars = centsToDollars(toCents(effectiveDueCents));

  // Reset the wizard whenever the dialog is closed so it never reopens on review.
  useEffect(() => {
    if (!open) {
      void Promise.resolve().then(() => setStep("form"));
      void Promise.resolve().then(() => setProcessing(false));
    }
  }, [open]);

  // The review and receipt always use the exact finalized balance.
  const requestedDollars = effectiveDueDollars;
  const requestedCents = effectiveDueCents;

  const goToReview = () => {
    if (!payment) return;
    if (requestedDollars <= 0) {
      toast.error(
        `Amount must be between $0.01 and ${formatCentsAsCurrency(
          effectiveDueCents,
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
        waiveFees: waivedFeeCents > 0,
        waiveTax: false,
        waiveRemaining: false,
      });

      toast.success(
        `Payment of ${formatCentsAsCurrency(
          requestedCents,
          payment.currency,
        )} recorded`,
      );
      onOpenChange(false);
      onSuccess();

      // Reset form
      setPaymentMethod("cash");
      setNotes("");
      setWaiveCardFee(false);
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
                  {formatCentsAsCurrency(effectiveDueCents, payment.currency)}
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
              <Label>Finalized Amount Received</Label>
              <Input
                readOnly
                value={formatMoney(effectiveDueDollars)}
              />
              <p className="text-xs text-muted-foreground">
                The displayed balance includes the configured card fee. Cash/check can waive that fee and reconcile the balance due.
              </p>
            </div>

            {canWaiveCardFee && (
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={waiveCardFee}
                  onChange={(e) => setWaiveCardFee(e.target.checked)}
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">Waive card processing fee</span>
                  <span className="block text-xs text-muted-foreground">
                    Subtract {formatCentsAsCurrency(surchargeCents, payment.currency)} and record the waiver in reconciliation.
                  </span>
                </span>
              </label>
            )}

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
                  <span>{formatCentsAsCurrency(fullDueCents, payment.currency)}</span>
                </div>
                {waivedFeeCents > 0 && (
                  <>
                    <div className="flex justify-between text-amber-700">
                      <span>Card fee waived</span>
                      <span>-{formatCentsAsCurrency(waivedFeeCents, payment.currency)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Reconciled amount due</span>
                      <span>{formatCentsAsCurrency(requestedCents, payment.currency)}</span>
                    </div>
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

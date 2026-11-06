import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Receipt,
  Send,
  Loader2,
  CreditCard,
  AlertCircle,
  DollarSign,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  fetchAppointmentPaymentsWithState,
  isProviderSyncArtifact,
  sumPendingPaymentsCents,
  sumSucceededPaymentsCents,
  type AppointmentPaymentRow,
  type AppointmentPaymentState,
} from "@/application/queries/appointment-payments.query";
import {
  createAppointmentPaymentRecord,
  sendAppointmentPaymentLink,
} from "@/application/commands/appointment-payments.command";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { format } from "date-fns";
import { PaymentLinkDialog } from "@/components/payments/PaymentLinkDialog";
import { centsToDollars, toCents } from "@/lib/financialMath";
import { computeAppointmentPaymentAmounts } from "@/lib/appointmentPaymentAmounts";

type PaymentRecord = AppointmentPaymentRow;

interface AppointmentPaymentsTabProps {
  appointmentId: string;
  customerEmail: string | null;
  customerName: string | null;
  isPrepaid: boolean;
  estimatedTotal?: number;
  taxAmount?: number;
  subtotal?: number;
  /**
   * Workspace tax_rate — a PERCENT (6 means 6%), exactly as stored in
   * workspace_settings. Never a fraction; see
   * @/lib/appointmentPaymentAmounts for the contract.
   */
  taxRate?: number;
  /** True when the appointment's quote is locked (see @/lib/price-lock). */
  priceLocked?: boolean;
  /** Dollars still to collect on a locked quote (quote − already paid). */
  lockedAmountDue?: number | null;
}

export function AppointmentPaymentsTab({
  appointmentId,
  customerEmail,
  customerName,
  isPrepaid,
  estimatedTotal = 0,
  taxAmount = 0,
  subtotal,
  taxRate,
  priceLocked = false,
  lockedAmountDue = null,
}: AppointmentPaymentsTabProps) {
  const { formatCurrency } = useRegionalSettings();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentState, setPaymentState] = useState<AppointmentPaymentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingLink, setSendingLink] = useState<string | null>(null);
  const [creatingPaymentRecord, setCreatingPaymentRecord] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const { payments: rows, paymentState: state } = await fetchAppointmentPaymentsWithState(appointmentId);
      setPayments(rows);
      setPaymentState(state);
    } catch (error) {
      console.error("Failed to fetch payments:", error);
    }
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchPayments());
  }, [fetchPayments]);

  const handleCreatePaymentRecord = async () => {
    if (!customerEmail) {
      toast.error("Customer email is required to create a payment record");
      return;
    }
    
    setCreatingPaymentRecord(true);
    try {
      // All amount math lives in one tested helper: a locked quote
      // collects exactly its remaining balance (no tax recompute), and
      // the workspace tax rate is a PERCENT, not a fraction.
      const amounts = computeAppointmentPaymentAmounts({
        priceLocked,
        lockedAmountDue,
        estimatedTotal,
        taxAmount,
        subtotal,
        taxRatePercent: taxRate,
      });

      await createAppointmentPaymentRecord({
        appointmentId,
        amountCents: amounts.amountCents,
        subtotalCents: amounts.subtotalCents,
        taxCents: amounts.taxCents,
        taxRate: amounts.taxRate,
        customerEmail,
        customerName,
      });
      
      toast.success("Payment record created");
      fetchPayments();
    } catch (error: unknown) {
      const err = error as Error;
      toast.error(err.message || "Failed to create payment record");
    } finally {
      setCreatingPaymentRecord(false);
    }
  };

  const handleSendPaymentLink = async (paymentId: string) => {
    setSendingLink(paymentId);
    try {
      const result = await sendAppointmentPaymentLink({
        paymentId,
        customerEmail,
        customerName,
      });

      setPaymentLinkUrl(result.url);
      setShowLinkDialog(true);
      fetchPayments();
      toast.success(result.emailSent ? "Payment link sent to customer" : "Payment link created");
    } catch (error: unknown) {
      const err = error as Error;
      toast.error(err.message || "Failed to create payment link");
    } finally {
      setSendingLink(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "succeeded":
        return <Badge className="bg-gray-500/10 text-gray-600 border-gray-500/20">Paid</Badge>;
      case "pending":
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Failed</Badge>;
      case "refunded":
        return <Badge className="bg-gray-500/10 text-gray-600 border-gray-500/20">Refunded</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentTypeBadge = (type: string) => {
    switch (type) {
      case "booking_deposit":
        return <Badge variant="outline" className="text-xs">Deposit</Badge>;
      case "pay_at_service":
        return <Badge variant="outline" className="text-xs">Pay at Service</Badge>;
      case "invoice_payment":
        return <Badge variant="outline" className="text-xs">Invoice</Badge>;
      case "balance":
        return <Badge variant="outline" className="text-xs">Balance</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{type}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // P3: the summary reads the COMPOSED payment state (the invoice
  // facts), never row sums. The provider-sync working row is an
  // accounting-invisible artifact — its amount mirrors the invoice, so
  // summing rows double-counts it against the real charge and reported
  // this tab's paid jobs as unpaid. Artifact-excluded row sums are only
  // the fallback for appointments with no invoice.
  // If no payments exist and not prepaid, show the estimated total as pending.
  const hasNoPayments = payments.length === 0;
  const displayPaid = paymentState
    ? paymentState.amount_paid
    : sumSucceededPaymentsCents(payments) / 100;
  const displayPending = paymentState
    ? paymentState.balance
    : hasNoPayments && !isPrepaid
      ? estimatedTotal
      : sumPendingPaymentsCents(payments) / 100;

  return (
    <>
      <div className="space-y-6">
        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Payment Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-500/10 rounded-lg">
                <p className="text-sm text-muted-foreground">Paid</p>
                <p className="text-2xl font-bold text-gray-600">{formatCurrency(displayPaid)}</p>
              </div>
              <div className="p-4 bg-amber-500/10 rounded-lg">
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-amber-600">{formatCurrency(displayPending)}</p>
              </div>
            </div>

            {!isPrepaid && displayPending > 0 && (
              <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">Payment Due</p>
                    <p className="text-sm text-muted-foreground">
                      {hasNoPayments 
                        ? "Create a payment record to send a payment link to the customer."
                        : "This appointment has a pending balance. Send a payment link to the customer to collect payment."
                      }
                    </p>
                    {hasNoPayments && (
                      <Button 
                        size="sm" 
                        className="mt-3 gap-2"
                        onClick={handleCreatePaymentRecord}
                        disabled={creatingPaymentRecord || !customerEmail}
                      >
                        {creatingPaymentRecord ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Receipt className="h-4 w-4" />
                        )}
                        Create Payment Record
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transactions List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No payment records found</p>
                {!isPrepaid && estimatedTotal > 0 && (
                  <p className="text-sm mt-2">
                    Create a payment record above to track and collect payment.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {payments.map((payment) => {
                  // The provider-sync working row is a collection
                  // artifact, not a customer debt: it renders as the
                  // Stripe sync it is (state + mirrored invoice + hosted
                  // link) and never gets a dunning action. If its status
                  // ever truly flips to succeeded, it renders as the
                  // normal paid row it became.
                  const isSyncArtifact =
                    isProviderSyncArtifact(payment) && payment.status !== "succeeded";
                  return (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {isSyncArtifact ? (
                          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                            {payment.stripe_sync_status === "synced" ? "Synced to Stripe" : "Stripe sync"}
                          </Badge>
                        ) : (
                          getStatusBadge(payment.status)
                        )}
                        {getPaymentTypeBadge(payment.payment_type || "payment")}
                      </div>
                      <p className="text-lg font-semibold">{formatCurrency(centsToDollars(toCents(payment.amount)))}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(payment.created_at), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                      {payment.stripe_payment_intent_id && (
                        <p className="text-xs font-mono text-muted-foreground">
                          {payment.stripe_payment_intent_id.slice(-8).toUpperCase()}
                        </p>
                      )}
                      {isSyncArtifact && payment.stripe_invoice_id && (
                        <p className="text-xs font-mono text-muted-foreground">
                          Synced invoice {payment.stripe_invoice_id}
                        </p>
                      )}
                      {isSyncArtifact && payment.payment_url && (
                        <p className="text-xs">
                          <a
                            href={payment.payment_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 underline"
                          >
                            View hosted invoice
                          </a>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Show send link button for genuinely pending
                          payments while a balance is actually due —
                          never for the sync artifact. */}
                      {payment.status === "pending" && !isSyncArtifact && displayPending > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          disabled={sendingLink === payment.id || !customerEmail}
                          onClick={() => handleSendPaymentLink(payment.id)}
                        >
                          {sendingLink === payment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          {payment.invoice_sent_at ? "Resend Link" : "Send Payment Link"}
                        </Button>
                      )}
                      
                      {payment.invoice_sent_at && (
                        <Badge variant="secondary" className="text-xs">
                          Sent {format(new Date(payment.invoice_sent_at), "MMM d")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PaymentLinkDialog
        open={showLinkDialog}
        onOpenChange={setShowLinkDialog}
        paymentUrl={paymentLinkUrl}
        customerEmail={customerEmail}
      />
    </>
  );
}

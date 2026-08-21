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
import { toast } from "sonner";
import {
  fetchAppointmentPayments,
  type AppointmentPaymentRow,
} from "@/application/queries";
import {
  createAppointmentPaymentRecord,
  sendAppointmentPaymentLink,
} from "@/application/commands/appointment-payments.command";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { format } from "date-fns";
import { PaymentLinkDialog } from "@/components/payments/PaymentLinkDialog";
import { centsToDollars, dollarsToCents, toCents, toDollars } from "@/lib/financialMath";

type PaymentRecord = AppointmentPaymentRow;

interface AppointmentPaymentsTabProps {
  appointmentId: string;
  customerEmail: string | null;
  customerName: string | null;
  isPrepaid: boolean;
  estimatedTotal?: number;
  taxAmount?: number;
  subtotal?: number;
  taxRate?: number;
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
}: AppointmentPaymentsTabProps) {
  const { formatCurrency } = useRegionalSettings();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingLink, setSendingLink] = useState<string | null>(null);
  const [creatingPaymentRecord, setCreatingPaymentRecord] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAppointmentPayments(appointmentId);
      setPayments(data);
    } catch (error) {
      console.error("Failed to fetch payments:", error);
    }
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleCreatePaymentRecord = async () => {
    if (!customerEmail) {
      toast.error("Customer email is required to create a payment record");
      return;
    }
    
    setCreatingPaymentRecord(true);
    try {
      // If no tax was explicitly set on the appointment but a tax rate exists, compute it
      let effectiveTax = taxAmount;
      let effectiveSubtotal = subtotal;
      if (effectiveTax === 0 && taxRate && taxRate > 0 && estimatedTotal > 0) {
        effectiveSubtotal = effectiveSubtotal ?? estimatedTotal;
        effectiveTax = effectiveSubtotal * taxRate;
      }
      const taxInCents = dollarsToCents(toDollars(effectiveTax));
      const subtotalInCents = effectiveSubtotal != null
        ? dollarsToCents(toDollars(effectiveSubtotal))
        : (dollarsToCents(toDollars(estimatedTotal)) - taxInCents);
      const amountInCents = subtotalInCents + taxInCents;
      
      await createAppointmentPaymentRecord({
        appointmentId,
        amountCents: amountInCents,
        subtotalCents: subtotalInCents,
        taxCents: taxInCents > 0 ? taxInCents : null,
        taxRate: taxRate || null,
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

  const pendingPayments = payments.filter((p) => p.status === "pending");
  const completedPayments = payments.filter((p) => p.status === "succeeded");
  const totalPaid = completedPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalPending = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
  
  // If no payments exist and not prepaid, show the estimated total as pending
  const hasNoPayments = payments.length === 0;
  const displayPending = hasNoPayments && !isPrepaid ? estimatedTotal : totalPending / 100;
  const displayPaid = totalPaid / 100;

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
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(payment.status)}
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
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Show send link button for pending pay-at-service payments */}
                      {payment.status === "pending" && (
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
                ))}
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

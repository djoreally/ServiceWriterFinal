import { useState, useEffect, useCallback } from "react";
import { fetchCustomerPaymentHistory, type CustomerPaymentRecord } from "@/application/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  ReceiptText,
  Calendar,
  RefreshCcw,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatMoney } from "@/lib/financialMath";

type PaymentRow = CustomerPaymentRecord;

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  paid: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  unpaid: "bg-red-500/10 text-red-500 border-red-500/20",
  refunded: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  partial: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

const PAYMENT_STATUS_ICONS: Record<string, React.ReactNode> = {
  paid: <CheckCircle className="h-3 w-3 mr-1" />,
  pending: <Clock className="h-3 w-3 mr-1" />,
  unpaid: <AlertCircle className="h-3 w-3 mr-1" />,
  refunded: <RefreshCcw className="h-3 w-3 mr-1" />,
};

interface Props {
  account: { id: string; email: string; full_name: string | null };
}

export function CustomerPaymentsTab({ account }: Props) {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCustomerPaymentHistory(account.id);
      setPayments(data);
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [account.id]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchPayments());
  }, [fetchPayments]);

  const totalPaid = payments
    .filter((p) => p.payment_status === "paid")
    .reduce((sum, p) => sum + (p.estimated_cost || 0), 0);

  const totalPending = payments
    .filter(
      (p) => p.payment_status === "pending" || p.payment_status === "unpaid"
    )
    .reduce((sum, p) => sum + (p.estimated_cost || 0), 0);

  const totalRefunded = payments
    .filter((p) => p.payment_status === "refunded")
    .reduce((sum, p) => sum + (p.estimated_cost || 0), 0);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-500/10 rounded-lg">
                <CheckCircle className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-2xl font-bold text-gray-500">
                  ${formatMoney(totalPaid)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Pending / Unpaid
                </p>
                <p className="text-2xl font-bold text-yellow-500">
                  ${formatMoney(totalPending)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <RefreshCcw className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Refunded</p>
                <p className="text-2xl font-bold text-purple-500">
                  ${formatMoney(totalRefunded)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment List */}
      {payments.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="p-12 text-center">
            <ReceiptText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">No payment history</h3>
            <p className="text-muted-foreground">
              Payments for your appointments will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {payments.map((payment) => {
            const date = parseISO(payment.scheduled_date);
            const pStatus = payment.payment_status || "pending";

            return (
              <Card key={payment.id} className="border-border/50">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className={
                            PAYMENT_STATUS_STYLES[pStatus] ||
                            PAYMENT_STATUS_STYLES.pending
                          }
                        >
                          {PAYMENT_STATUS_ICONS[pStatus]}
                          {pStatus.charAt(0).toUpperCase() + pStatus.slice(1)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {payment.status}
                        </Badge>
                      </div>

                      <h3 className="font-semibold">
                        {payment.service_catalog?.name || payment.title}
                      </h3>

                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{format(date, "MMM d, yyyy")}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      {payment.estimated_cost != null && (
                        <div>
                          <p className="text-xl font-bold">
                            ${formatMoney(payment.estimated_cost)}
                          </p>
                          {payment.tax_amount != null &&
                            payment.tax_amount > 0 && (
                              <p className="text-xs text-muted-foreground">
                                incl. ${formatMoney(payment.tax_amount)} tax
                              </p>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

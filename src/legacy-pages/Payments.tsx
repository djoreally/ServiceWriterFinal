import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  CreditCard,
  ExternalLink,
  AlertCircle,
  MoreHorizontal,
  RotateCcw,
  Send,
  Wallet,
  Link2,
  Banknote,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { toast } from "@/components/ui/sonner";
import OfflinePaymentIndicator from "@/components/OfflinePaymentIndicator";
import { DataTableEnhancementToolbar } from "@/components/data-table/DataTableEnhancementToolbar";
import { PayoutsDashboard } from "@/components/payments/PayoutsDashboard";
import { ManualPaymentDialog } from "@/components/payments/ManualPaymentDialog";
import { PaymentLinkDialog } from "@/components/payments/PaymentLinkDialog";
import {
  fetchPaymentRecords,
  fetchStripeAccountStatus,
  type PaymentRecord,
  type StripeAccountStatus,
} from "@/application/queries";
import {
  refundPayment,
  sendInvoiceForPayment,
  sendPaymentLink,
} from "@/application/commands";
import { centsToDollars, dollarsToCents, formatCentsAsCurrency, formatMoney, toCents, toDollars } from "@/lib/financialMath";
import { downloadCsv } from "@/lib/exportCsv";

const Payments = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [stripeStatus, setStripeStatus] = useState<StripeAccountStatus | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const { settings } = useRegionalSettings();
  
  // Refund dialog state
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [processingRefund, setProcessingRefund] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const [sendingPaymentLink, setSendingPaymentLink] = useState<string | null>(null);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [tableDensity, setTableDensity] = useState<"compact" | "normal" | "comfortable">("normal");
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  
  // Manual payment dialog state
  const [manualPaymentDialogOpen, setManualPaymentDialogOpen] = useState(false);
  const [manualPaymentRecord, setManualPaymentRecord] = useState<PaymentRecord | null>(null);
  
  // Payment link dialog state
  const [paymentLinkDialogOpen, setPaymentLinkDialogOpen] = useState(false);
  const [generatedPaymentUrl, setGeneratedPaymentUrl] = useState<string | null>(null);
  const [paymentLinkEmail, setPaymentLinkEmail] = useState<string | null>(null);

  const fetchPayments = async () => {
    setPaymentsLoading(true);
    try {
      const records = await fetchPaymentRecords();
      setPayments(records);
    } catch (err) {
      console.error("Error fetching payments:", err);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const fetchStripeStatus = async () => {
    setStripeLoading(true);
    try {
      const status = await fetchStripeAccountStatus();
      setStripeStatus(status);
    } catch (error) {
      console.error("Error fetching Stripe status:", error);
    } finally {
      setStripeLoading(false);
    }
  };


  useEffect(() => {
    fetchPayments();
    fetchStripeStatus();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPayments(), fetchStripeStatus()]);
    setRefreshing(false);
  };

  const openRefundDialog = (payment: PaymentRecord) => {
    setSelectedPayment(payment);
    const maxRefundable = payment.amount - (payment.refund_amount || 0);
    setRefundAmount(formatMoney(centsToDollars(toCents(maxRefundable))));
    setRefundReason("");
    setRefundDialogOpen(true);
  };

  const handleRefund = async () => {
    if (!selectedPayment) return;
    setProcessingRefund(true);

    try {
      const amountCents = dollarsToCents(toDollars(Number(refundAmount) || 0));

      await refundPayment({
        paymentId: selectedPayment.id,
        amountCents,
        reason: refundReason || undefined,
      });

      const { trackPaymentRefunded } = await import("@/lib/posthog/analytics");
      trackPaymentRefunded({
        payment_id: selectedPayment.id,
        appointment_id: (selectedPayment as any).appointment_id ?? undefined,
        organization_id: (selectedPayment as any).user_id ?? undefined,
        amount_cents: amountCents,
        currency: selectedPayment.currency,
        reason: refundReason || undefined,
      });

      toast.success(`Refunded ${formatCentsAsCurrency(amountCents, selectedPayment.currency)}`);
      setRefundDialogOpen(false);
      fetchPayments();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to process refund";
      toast.error(message);
    } finally {
      setProcessingRefund(false);
    }
  };

  const handleSendInvoice = async (payment: PaymentRecord) => {
    setSendingInvoice(payment.id);

    try {
      await sendInvoiceForPayment(payment.id);

      toast.success("Invoice sent successfully");
      fetchPayments();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to send invoice";
      toast.error(message);
    } finally {
      setSendingInvoice(null);
    }
  };

  const handleSendPaymentLink = async (payment: PaymentRecord) => {
    if (!payment.customer_email) {
      toast.error("Customer email is required to send payment link");
      return;
    }

    setSendingPaymentLink(payment.id);

    try {
      const amountCents =
        payment.amount - (payment.refund_amount || 0);

      const result = await sendPaymentLink({
        paymentId: payment.id,
        amountCents,
        customerEmail: payment.customer_email,
        customerName: payment.customer_name,
        description: payment.appointments?.title || "Invoice Payment",
      });

      if (result.url) {
        setGeneratedPaymentUrl(result.url);
        setPaymentLinkEmail(payment.customer_email);
        setPaymentLinkDialogOpen(true);
      } else {
        toast.success(
          result.message || "Payment link sent successfully",
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to send payment link";
      toast.error(message);
    } finally {
      setSendingPaymentLink(null);
    }
  };

  const openManualPaymentDialog = (payment: PaymentRecord) => {
    setManualPaymentRecord(payment);
    setManualPaymentDialogOpen(true);
  };

  const openStripeDashboard = () => {
    window.open("https://dashboard.stripe.com/payments", "_blank");
  };


  const filteredPayments = payments.filter((payment) => {
    if (statusFilter === "all") return true;
    return payment.status === statusFilter;
  });

  const handleExportPayments = () => {
    downloadCsv("financial-transactions", [
      { header: "Created At", value: (payment) => payment.created_at },
      { header: "Customer", value: (payment) => payment.customer_name || "" },
      { header: "Customer Email", value: (payment) => payment.customer_email || "" },
      { header: "Type", value: (payment) => payment.payment_type || "" },
      { header: "Subtotal", value: (payment) => centsToDollars(toCents(payment.subtotal || 0)) },
      { header: "Tax", value: (payment) => centsToDollars(toCents(payment.tax_amount || 0)) },
      { header: "Amount", value: (payment) => centsToDollars(toCents(payment.amount || 0)) },
      { header: "Currency", value: (payment) => payment.currency || "" },
      { header: "Status", value: (payment) => payment.status || "" },
      { header: "Refund Amount", value: (payment) => centsToDollars(toCents(payment.refund_amount || 0)) },
      { header: "Appointment", value: (payment) => payment.appointments?.title || "" },
      { header: "Appointment Date", value: (payment) => payment.appointments?.scheduled_date || "" },
      { header: "Reference", value: (payment) => payment.stripe_payment_intent_id || "" },
    ], filteredPayments);
  };

  const selectedPayments = useMemo(() => payments.filter((payment) => selectedPaymentIds.includes(payment.id)), [payments, selectedPaymentIds]);
  const allFilteredSelected = filteredPayments.length > 0 && filteredPayments.every((payment) => selectedPaymentIds.includes(payment.id));
  const rowClassName = tableDensity === "compact" ? "h-10" : tableDensity === "comfortable" ? "h-16" : undefined;
  const paymentColumns = ["Date", "Customer", "Type", "Subtotal", "Tax", "Total", "Status", "Reference"];
  const isColumnVisible = (column: string) => !hiddenColumns.includes(column);

  const togglePaymentSelection = (paymentId: string) => {
    setSelectedPaymentIds((current) => current.includes(paymentId) ? current.filter((id) => id !== paymentId) : [...current, paymentId]);
  };

  const toggleAllFilteredPayments = () => {
    setSelectedPaymentIds((current) => {
      const filteredIds = filteredPayments.map((payment) => payment.id);
      if (filteredIds.every((id) => current.includes(id))) {
        return current.filter((id) => !filteredIds.includes(id));
      }
      return Array.from(new Set([...current, ...filteredIds]));
    });
  };

  const handleBulkSendInvoices = async () => {
    const targets = selectedPayments.filter((payment) => payment.customer_email);
    if (targets.length === 0) { toast.error("Select payments with customer emails first"); return; }
    setBulkProcessing(true);
    let sent = 0;
    try {
      for (const payment of targets) {
        await sendInvoiceForPayment(payment.id);
        sent += 1;
      }
      toast.success(`Sent ${sent} invoice${sent === 1 ? "" : "s"}`);
      setSelectedPaymentIds([]);
      fetchPayments();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Bulk invoice send failed");
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkSendPaymentLinks = async () => {
    const targets = selectedPayments.filter((payment) => payment.status !== "succeeded" && payment.customer_email);
    if (targets.length === 0) { toast.error("Select unpaid payments with customer emails first"); return; }
    setBulkProcessing(true);
    let sent = 0;
    try {
      for (const payment of targets) {
        await sendPaymentLink({
          paymentId: payment.id,
          amountCents: payment.amount - (payment.refund_amount || 0),
          customerEmail: payment.customer_email!,
          customerName: payment.customer_name,
          description: payment.appointments?.title || "Invoice Payment",
        });
        sent += 1;
      }
      toast.success(`Sent ${sent} payment link${sent === 1 ? "" : "s"}`);
      setSelectedPaymentIds([]);
      fetchPayments();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Bulk payment link send failed");
    } finally {
      setBulkProcessing(false);
    }
  };

  // Calculate stats
  const totalReceived = payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amount, 0);
  
  const pendingAmount = payments
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amount, 0);

  const successfulCount = payments.filter((p) => p.status === "succeeded").length;
  const failedCount = payments.filter((p) => p.status === "failed").length;


  const getStatusBadge = (status: string) => {
    switch (status) {
      case "succeeded":
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">Succeeded</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Pending</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Render AppLayout and show section-level skeletons when loading

  return (
    <AppLayout title="Payments">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold">Payments</h2>
            <p className="text-muted-foreground">Track deposits, transactions and payouts</p>
          </div>
          <div className="flex items-center gap-2">
            <OfflinePaymentIndicator />
          </div>
        </div>

        {/* Tabs for Transactions vs Payouts */}
        <Tabs defaultValue="transactions" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="transactions" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Transactions
            </TabsTrigger>
            <TabsTrigger value="payouts" className="gap-2">
              <Wallet className="h-4 w-4" />
              Payouts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="space-y-4 mt-6">
            {/* If payments are still loading, show section skeletons */}
            {paymentsLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Card key={i}>
                      <CardContent className="p-6">
                        <Skeleton className="h-4 w-24 mb-2" />
                        <Skeleton className="h-8 w-32" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card>
                  <CardContent className="p-6">
                    <Skeleton className="h-64 w-full" />
                  </CardContent>
                </Card>
              </div>
            ) : (
            /* Refresh button for transactions */
            <div className="flex justify-end gap-2">
              <Button onClick={handleExportPayments} variant="outline" disabled={paymentsLoading} className="gap-2">
                <Download className="h-4 w-4" />
                Export transactions
              </Button>
              <Button onClick={handleRefresh} variant="outline" disabled={refreshing}>
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
            </div>
          )}

        {/* Stripe Status Alert */}
        {stripeStatus && !stripeStatus.chargesEnabled && (
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    Complete Stripe Setup
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Finish setting up your Stripe account to start accepting payments.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { if (typeof window !== 'undefined') window.location.href = "/settings"; }}
                  className="gap-2"
                >
                  Go to Settings
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Received</p>
                  <p className="text-2xl font-bold text-gray-600">
                    {formatCentsAsCurrency(totalReceived, settings.currency)}
                  </p>
                </div>
                <div className="p-3 bg-gray-100 dark:bg-gray-900/30 rounded-md">
                  <DollarSign className="h-6 w-6 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {formatCentsAsCurrency(pendingAmount, settings.currency)}
                  </p>
                </div>
                <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-md">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Successful</p>
                  <p className="text-2xl font-bold">{successfulCount}</p>
                </div>
                <div className="p-3 bg-gray-100 dark:bg-gray-900/30 rounded-md">
                  <CheckCircle2 className="h-6 w-6 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold text-red-600">{failedCount}</p>
                </div>
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-md">
                  <XCircle className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payout Status */}
        {stripeStatus?.connected && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Stripe Connect Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  {stripeStatus.chargesEnabled ? (
                    <CheckCircle2 className="h-4 w-4 text-gray-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-sm">
                    Charges: {stripeStatus.chargesEnabled ? "Enabled" : "Pending"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {stripeStatus.payoutsEnabled ? (
                    <CheckCircle2 className="h-4 w-4 text-gray-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="text-sm">
                    Payouts: {stripeStatus.payoutsEnabled ? "Enabled" : "Pending"}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { if (typeof window !== 'undefined') window.open("https://dashboard.stripe.com", "_blank"); }}
                  className="ml-auto gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Stripe Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Transactions Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Transaction History
              </CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="succeeded">Succeeded</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataTableEnhancementToolbar
              columns={paymentColumns}
              density={tableDensity}
              hiddenColumns={hiddenColumns}
              selectedCount={selectedPaymentIds.length}
              onBulkAction={handleBulkSendInvoices}
              onDensityChange={setTableDensity}
              onToggleColumn={(column) => setHiddenColumns((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column])}
            />
            {selectedPaymentIds.length > 0 && (
              <div className="flex flex-wrap gap-2 rounded-md border bg-muted/40 p-3">
                <Button size="sm" onClick={handleBulkSendInvoices} disabled={bulkProcessing}>Send invoices</Button>
                <Button size="sm" variant="outline" onClick={handleBulkSendPaymentLinks} disabled={bulkProcessing}>Send payment links</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedPaymentIds([])} disabled={bulkProcessing}>Clear selection</Button>
              </div>
            )}
            {filteredPayments.length === 0 ? (
              <div className="text-center py-12">
                <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No transactions yet</h3>
                <p className="text-muted-foreground">
                  Payments will appear here when customers make deposits.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"><Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFilteredPayments} aria-label="Select all filtered payments" /></TableHead>
                      {isColumnVisible("Date") && <TableHead>Date</TableHead>}
                      {isColumnVisible("Customer") && <TableHead>Customer</TableHead>}
                      {isColumnVisible("Type") && <TableHead>Type</TableHead>}
                      {isColumnVisible("Subtotal") && <TableHead>Subtotal</TableHead>}
                      {isColumnVisible("Tax") && <TableHead>Tax</TableHead>}
                      {isColumnVisible("Total") && <TableHead>Total</TableHead>}
                      {isColumnVisible("Status") && <TableHead>Status</TableHead>}
                      {isColumnVisible("Reference") && <TableHead>Reference</TableHead>}
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((payment) => (
                      <TableRow key={payment.id} className={rowClassName}>
                        <TableCell><Checkbox checked={selectedPaymentIds.includes(payment.id)} onCheckedChange={() => togglePaymentSelection(payment.id)} aria-label={`Select payment ${payment.id}`} /></TableCell>
                        {isColumnVisible("Date") && <TableCell className="whitespace-nowrap">
                          {format(new Date(payment.created_at), "MMM d, yyyy")}
                          <span className="text-muted-foreground text-xs block">
                            {format(new Date(payment.created_at), "h:mm a")}
                          </span>
                        </TableCell>}
                        {isColumnVisible("Customer") && <TableCell>
                          <div>
                            <p className="font-medium">{payment.customer_name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{payment.customer_email || ""}</p>
                          </div>
                        </TableCell>}
                        {isColumnVisible("Type") && <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {payment.payment_type || "deposit"}
                          </Badge>
                        </TableCell>}
                        {isColumnVisible("Subtotal") && <TableCell className="text-muted-foreground">
                          {formatCentsAsCurrency(payment.subtotal ?? (payment.amount - (payment.tax_amount || 0)), payment.currency)}
                        </TableCell>}
                        {isColumnVisible("Tax") && <TableCell>
                          {(payment.tax_amount ?? 0) > 0 ? (
                            <span className="text-primary text-sm">
                              {formatCentsAsCurrency(payment.tax_amount || 0, payment.currency)}
                              {payment.tax_rate ? (
                                <span className="text-muted-foreground text-xs block">
                                  ({payment.tax_rate}%)
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>}
                        {isColumnVisible("Total") && <TableCell className="font-medium">
                          {formatCentsAsCurrency(payment.amount, payment.currency)}
                        </TableCell>}
                        {isColumnVisible("Status") && <TableCell>{getStatusBadge(payment.status || "pending")}</TableCell>}
                        {isColumnVisible("Reference") && <TableCell className="font-mono text-xs text-muted-foreground">
                          {payment.stripe_payment_intent_id?.slice(-8).toUpperCase() || "—"}
                        </TableCell>}
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleSendInvoice(payment)}
                                disabled={sendingInvoice === payment.id}
                              >
                                {sendingInvoice === payment.id ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Send className="h-4 w-4 mr-2" />
                                )}
                                {payment.invoice_sent_at ? "Resend Invoice" : "Send Invoice"}
                              </DropdownMenuItem>
                              {payment.status !== "succeeded" && payment.customer_email && (
                                <DropdownMenuItem
                                  onClick={() => handleSendPaymentLink(payment)}
                                  disabled={sendingPaymentLink === payment.id}
                                >
                                  {sendingPaymentLink === payment.id ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Link2 className="h-4 w-4 mr-2" />
                                  )}
                                  Send Payment Link
                                </DropdownMenuItem>
                              )}
                              {payment.status !== "succeeded" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openManualPaymentDialog(payment)}>
                                    <Banknote className="h-4 w-4 mr-2" />
                                    Record Manual Payment
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={openStripeDashboard}>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Collect via Stripe Dashboard
                                  </DropdownMenuItem>
                                </>
                              )}
                              {payment.status === "succeeded" && (
                                <DropdownMenuItem onClick={() => openRefundDialog(payment)}>
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Issue Refund
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="payouts" className="mt-6">
            <PayoutsDashboard />
          </TabsContent>
        </Tabs>
      </div>

      {/* Refund Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Issue Refund
            </DialogTitle>
            <DialogDescription>
              Process a full or partial refund for this payment
            </DialogDescription>
          </DialogHeader>
          
          {selectedPayment && (
            <div className="space-y-4 mt-4">
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{selectedPayment.customer_name || "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Original Amount</span>
                  <span className="font-medium">{formatCentsAsCurrency(selectedPayment.amount, selectedPayment.currency)}</span>
                </div>
                {(selectedPayment.refund_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-amber-600">
                    <span>Already Refunded</span>
                    <span>{formatCentsAsCurrency(selectedPayment.refund_amount || 0, selectedPayment.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-muted-foreground">Max Refundable</span>
                  <span className="font-bold">
                    {formatCentsAsCurrency(selectedPayment.amount - (selectedPayment.refund_amount || 0), selectedPayment.currency)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="refund-amount">Refund Amount ($)</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  min={0}
                  max={centsToDollars(toCents(selectedPayment.amount - (selectedPayment.refund_amount || 0)))}
                  step={0.01}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="refund-reason">Reason (Optional)</Label>
                <Textarea
                  id="refund-reason"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Enter a reason for this refund..."
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setRefundDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRefund}
                  disabled={processingRefund || !refundAmount || Number(refundAmount) <= 0}
                  className="flex-1"
                  variant="destructive"
                >
                  {processingRefund ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-2" />
                  )}
                  Process Refund
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manual Payment Dialog */}
      <ManualPaymentDialog
        open={manualPaymentDialogOpen}
        onOpenChange={setManualPaymentDialogOpen}
        payment={manualPaymentRecord}
        onSuccess={fetchPayments}
      />

      {/* Payment Link Dialog */}
      <PaymentLinkDialog
        open={paymentLinkDialogOpen}
        onOpenChange={setPaymentLinkDialogOpen}
        paymentUrl={generatedPaymentUrl}
        customerEmail={paymentLinkEmail}
      />
    </AppLayout>
  );
};

export default Payments;

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Send,
  Wallet,
  XCircle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import OfflinePaymentIndicator from "@/components/OfflinePaymentIndicator";
import { PayoutsDashboard } from "@/components/payments/PayoutsDashboard";
import { ManualPaymentDialog } from "@/components/payments/ManualPaymentDialog";
import { PaymentLinkDialog } from "@/components/payments/PaymentLinkDialog";
import { ListPagination, usePageSlice, DEFAULT_PAGE_SIZE } from "@/components/ui/list-pagination";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import {
  fetchPaymentRecords,
  fetchStripeAccountStatus,
  type PaymentRecord,
  type StripeAccountStatus,
} from "@/application/queries";
import { refundPayment, sendInvoiceForPayment, sendPaymentLink } from "@/application/commands";
import { centsToDollars, dollarsToCents, formatCentsAsCurrency, formatMoney, toCents, toDollars } from "@/lib/financialMath";
import { downloadCsv } from "@/lib/exportCsv";

const Payments = () => {
  const { settings } = useRegionalSettings();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [stripeStatus, setStripeStatus] = useState<StripeAccountStatus | null>(null);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [processingRefund, setProcessingRefund] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const [sendingPaymentLink, setSendingPaymentLink] = useState<string | null>(null);
  const [manualPaymentDialogOpen, setManualPaymentDialogOpen] = useState(false);
  const [manualPaymentRecord, setManualPaymentRecord] = useState<PaymentRecord | null>(null);
  const [paymentLinkDialogOpen, setPaymentLinkDialogOpen] = useState(false);
  const [generatedPaymentUrl, setGeneratedPaymentUrl] = useState<string | null>(null);
  const [paymentLinkEmail, setPaymentLinkEmail] = useState<string | null>(null);

  const loadPayments = async () => {
    setPaymentsLoading(true);
    try {
      setPayments(await fetchPaymentRecords());
    } catch (error) {
      console.error("Error fetching payments:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load payments");
    } finally {
      setPaymentsLoading(false);
    }
  };

  const loadStripe = async () => {
    setStripeLoading(true);
    try {
      setStripeStatus(await fetchStripeAccountStatus());
    } catch (error) {
      console.error("Error fetching Stripe status:", error);
    } finally {
      setStripeLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadPayments(), loadStripe()]);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadPayments(), loadStripe()]);
    setRefreshing(false);
  };

  const filteredPayments = useMemo(
    () => statusFilter === "all" ? payments : payments.filter((payment) => payment.status === statusFilter),
    [payments, statusFilter],
  );

  useEffect(() => {
    setPage(1);
    setSelectedPaymentIds([]);
  }, [statusFilter, pageSize]);

  const pagedPayments = usePageSlice(filteredPayments, page, pageSize);
  const totalReceived = payments.filter((p) => p.status === "succeeded").reduce((sum, p) => sum + p.amount, 0);
  const pendingAmount = payments.filter((p) => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);
  const successfulCount = payments.filter((p) => p.status === "succeeded").length;
  const failedCount = payments.filter((p) => p.status === "failed").length;

  const getStatusBadge = (status: string) => {
    if (status === "succeeded") return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">Succeeded</Badge>;
    if (status === "pending") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Pending</Badge>;
    if (status === "failed") return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Failed</Badge>;
    return <Badge variant="secondary">{status.replace(/_/g, " ")}</Badge>;
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
      await refundPayment({ paymentId: selectedPayment.id, amountCents, reason: refundReason || undefined });
      toast.success(`Refunded ${formatCentsAsCurrency(amountCents, selectedPayment.currency)}`);
      setRefundDialogOpen(false);
      await loadPayments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to process refund");
    } finally {
      setProcessingRefund(false);
    }
  };

  const handleSendInvoice = async (payment: PaymentRecord) => {
    setSendingInvoice(payment.id);
    try {
      await sendInvoiceForPayment(payment.id);
      toast.success("Invoice sent successfully");
      await loadPayments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send invoice");
    } finally {
      setSendingInvoice(null);
    }
  };

  const handleSendPaymentLink = async (payment: PaymentRecord) => {
    if (!payment.customer_email) {
      toast.error("Customer email is required to send a payment link");
      return;
    }
    setSendingPaymentLink(payment.id);
    try {
      const result = await sendPaymentLink({
        paymentId: payment.id,
        amountCents: payment.amount - (payment.refund_amount || 0),
        customerEmail: payment.customer_email,
        customerName: payment.customer_name,
        description: payment.appointments?.title || "Invoice Payment",
      });
      if (result.url) {
        setGeneratedPaymentUrl(result.url);
        setPaymentLinkEmail(payment.customer_email);
        setPaymentLinkDialogOpen(true);
      } else {
        toast.success(result.message || "Payment link sent successfully");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send payment link");
    } finally {
      setSendingPaymentLink(null);
    }
  };

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
    ], filteredPayments);
  };

  const togglePaymentSelection = (paymentId: string) => {
    setSelectedPaymentIds((current) => current.includes(paymentId)
      ? current.filter((id) => id !== paymentId)
      : [...current, paymentId]);
  };

  const currentPageIds = pagedPayments.map((payment) => payment.id);
  const allPageSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selectedPaymentIds.includes(id));
  const toggleCurrentPage = () => {
    setSelectedPaymentIds((current) => allPageSelected
      ? current.filter((id) => !currentPageIds.includes(id))
      : Array.from(new Set([...current, ...currentPageIds])));
  };

  return (
    <AppLayout title="Payments">
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-3xl font-bold">Payments</h2>
            <p className="text-muted-foreground">Track deposits, transactions and payouts</p>
          </div>
          <OfflinePaymentIndicator />
        </div>

        <Tabs defaultValue="transactions" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="transactions" className="gap-2"><CreditCard className="h-4 w-4" />Transactions</TabsTrigger>
            <TabsTrigger value="payouts" className="gap-2"><Wallet className="h-4 w-4" />Payouts</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="mt-6 space-y-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleExportPayments} disabled={paymentsLoading}><Download className="mr-2 h-4 w-4" />Export transactions</Button>
              <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>{refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh</Button>
            </div>

            {!stripeLoading && stripeStatus && !stripeStatus.chargesEnabled && (
              <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                <CardContent className="flex items-start gap-3 p-4">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-800 dark:text-amber-200">Stripe charges are not enabled</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">{stripeStatus.connected ? "Your Stripe account is connected, but charges are currently disabled." : "Connect Stripe in Settings to accept card payments."}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { window.location.href = "/settings"; }}>Go to Settings<ExternalLink className="ml-2 h-3 w-3" /></Button>
                </CardContent>
              </Card>
            )}

            {paymentsLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0,1,2,3].map((i) => <Card key={i}><CardContent className="p-6"><Skeleton className="mb-2 h-4 w-24" /><Skeleton className="h-8 w-32" /></CardContent></Card>)}</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total Received</p><p className="text-2xl font-bold">{formatCentsAsCurrency(totalReceived, settings.currency)}</p></div><DollarSign className="h-6 w-6" /></div></CardContent></Card>
                <Card><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold text-amber-600">{formatCentsAsCurrency(pendingAmount, settings.currency)}</p></div><Clock className="h-6 w-6 text-amber-600" /></div></CardContent></Card>
                <Card><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Successful</p><p className="text-2xl font-bold">{successfulCount}</p></div><CheckCircle2 className="h-6 w-6" /></div></CardContent></Card>
                <Card><CardContent className="p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Failed</p><p className="text-2xl font-bold text-red-600">{failedCount}</p></div><XCircle className="h-6 w-6 text-red-600" /></div></CardContent></Card>
              </div>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <CardTitle className="flex items-center gap-2 text-lg"><CreditCard className="h-5 w-5" />Transaction History</CardTitle>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="succeeded">Succeeded</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="failed">Failed</SelectItem></SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {filteredPayments.length === 0 && !paymentsLoading ? (
                  <div className="py-12 text-center text-muted-foreground">No transactions found.</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table density="compact">
                        <TableHeader><TableRow><TableHead className="w-10"><Checkbox checked={allPageSelected} onCheckedChange={toggleCurrentPage} /></TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Type</TableHead><TableHead>Subtotal</TableHead><TableHead>Tax</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Reference</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
                        <TableBody>
                          {pagedPayments.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell><Checkbox checked={selectedPaymentIds.includes(payment.id)} onCheckedChange={() => togglePaymentSelection(payment.id)} /></TableCell>
                              <TableCell className="whitespace-nowrap">{format(new Date(payment.created_at), "MMM d, yyyy")}<span className="block text-xs text-muted-foreground">{format(new Date(payment.created_at), "h:mm a")}</span></TableCell>
                              <TableCell><p className="font-medium">{payment.customer_name || "—"}</p><p className="text-xs text-muted-foreground">{payment.customer_email || ""}</p></TableCell>
                              <TableCell><Badge variant="outline" className="capitalize">{payment.payment_type.replace(/_/g, " ")}</Badge></TableCell>
                              <TableCell>{formatCentsAsCurrency(payment.subtotal ?? (payment.amount - (payment.tax_amount || 0)), payment.currency)}</TableCell>
                              <TableCell>{(payment.tax_amount || 0) > 0 ? formatCentsAsCurrency(payment.tax_amount || 0, payment.currency) : "—"}</TableCell>
                              <TableCell className="font-medium">{formatCentsAsCurrency(payment.amount, payment.currency)}</TableCell>
                              <TableCell>{getStatusBadge(payment.status || "pending")}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{payment.stripe_payment_intent_id?.slice(-8).toUpperCase() || "—"}</TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleSendInvoice(payment)} disabled={sendingInvoice === payment.id}>{sendingInvoice === payment.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send invoice</DropdownMenuItem>
                                    {payment.status !== "succeeded" && payment.customer_email && <DropdownMenuItem onClick={() => handleSendPaymentLink(payment)} disabled={sendingPaymentLink === payment.id}>{sendingPaymentLink === payment.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Send payment link</DropdownMenuItem>}
                                    {payment.status !== "succeeded" && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => { setManualPaymentRecord(payment); setManualPaymentDialogOpen(true); }}><Banknote className="mr-2 h-4 w-4" />Record manual payment</DropdownMenuItem></>}
                                    {payment.status === "succeeded" && <DropdownMenuItem onClick={() => openRefundDialog(payment)}><RotateCcw className="mr-2 h-4 w-4" />Issue refund</DropdownMenuItem>}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <ListPagination page={page} pageSize={pageSize} totalItems={filteredPayments.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payouts" className="mt-6"><PayoutsDashboard /></TabsContent>
        </Tabs>
      </div>

      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Issue Refund</DialogTitle><DialogDescription>Process a full or partial refund for this payment.</DialogDescription></DialogHeader>
          {selectedPayment && <div className="space-y-4"><div className="rounded-lg bg-muted p-4"><div className="flex justify-between text-sm"><span>Customer</span><strong>{selectedPayment.customer_name || "—"}</strong></div><div className="mt-2 flex justify-between text-sm"><span>Original Amount</span><strong>{formatCentsAsCurrency(selectedPayment.amount, selectedPayment.currency)}</strong></div></div><div className="space-y-2"><Label htmlFor="refund-amount">Refund Amount ($)</Label><Input id="refund-amount" type="number" min={0} step={0.01} max={centsToDollars(toCents(selectedPayment.amount - (selectedPayment.refund_amount || 0)))} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="refund-reason">Reason</Label><Textarea id="refund-reason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} /></div><Button className="w-full" variant="destructive" onClick={handleRefund} disabled={processingRefund || Number(refundAmount) <= 0}>{processingRefund && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Process Refund</Button></div>}
        </DialogContent>
      </Dialog>

      <ManualPaymentDialog open={manualPaymentDialogOpen} onOpenChange={setManualPaymentDialogOpen} payment={manualPaymentRecord} onSuccess={loadPayments} />
      <PaymentLinkDialog open={paymentLinkDialogOpen} onOpenChange={setPaymentLinkDialogOpen} paymentUrl={generatedPaymentUrl} customerEmail={paymentLinkEmail} />
    </AppLayout>
  );
};

export default Payments;

import { useState, useEffect, useMemo } from "react";
import { fetchPayoutsData, triggerInstantPayout } from "@/application/queries/payouts.query";
import { formatCentsAsCurrency } from "@/lib/financialMath";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  Clock,
  ArrowDownToLine,
  Banknote,
  Loader2,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  Zap,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";

interface BalanceAmount {
  amount: number;
  currency: string;
}

interface PayoutBalance {
  available: BalanceAmount[];
  pending: BalanceAmount[];
}

interface StripePayout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrivalDate: number;
  created: number;
  description: string | null;
  method: string;
  type: string;
  failureCode: string | null;
  failureMessage: string | null;
}

interface PayoutsData {
  payouts: StripePayout[];
  balance: PayoutBalance | null;
  hasMore: boolean;
  message?: string;
}

interface InstantPayoutLogEntry {
  id: string;                 // local request id
  payoutId?: string;          // Stripe payout id (if created)
  amountCents: number;        // requested amount
  currency: string;
  status: "queued" | "succeeded" | "failed";
  requestedAt: number;        // ms epoch
  errorMessage?: string;
  feeCents?: number;
  netCents?: number;
}

const INSTANT_PAYOUT_LOG_KEY = "instant_payout_log_v1";

/** Stripe Instant Payout fee = 1% with a $0.50 (50¢) minimum, in the payout currency. */
function calcInstantPayoutFee(amountCents: number): { feeCents: number; netCents: number } {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { feeCents: 0, netCents: 0 };
  }
  const onePercent = Math.round(amountCents * 0.01);
  const feeCents = Math.max(onePercent, 50);
  const netCents = Math.max(amountCents - feeCents, 0);
  return { feeCents, netCents };
}

function loadInstantPayoutLog(): InstantPayoutLogEntry[] {
  try {
    const raw = localStorage.getItem(INSTANT_PAYOUT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 25) : [];
  } catch {
    return [];
  }
}

function saveInstantPayoutLog(entries: InstantPayoutLogEntry[]) {
  try {
    localStorage.setItem(INSTANT_PAYOUT_LOG_KEY, JSON.stringify(entries.slice(0, 25)));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

export const PayoutsDashboard = () => {
  const [data, setData] = useState<PayoutsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingOut, setPayingOut] = useState(false);

  // Pay-out dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amountInput, setAmountInput] = useState<string>("");

  // Local log of instant payout requests (queued / succeeded / failed)
  const [instantLog, setInstantLog] = useState<InstantPayoutLogEntry[]>([]);

  const fetchPayouts = async () => {
    try {
      const data = await fetchPayoutsData();
      if (data) setData(data);
    } catch (error) {
      console.error("Error fetching payouts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts();
    setInstantLog(loadInstantPayoutLog());
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPayouts();
    setRefreshing(false);
  };

  // Calculate totals from balance
  const availableTotal = data?.balance?.available?.reduce((sum, b) => sum + b.amount, 0) || 0;
  const pendingTotal = data?.balance?.pending?.reduce((sum, b) => sum + b.amount, 0) || 0;
  const primaryCurrency = data?.balance?.available?.[0]?.currency || "usd";

  // Parse the user's requested payout amount (input is in major units, e.g. dollars)
  const requestedAmountCents = useMemo(() => {
    const parsed = parseFloat(amountInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  }, [amountInput]);

  const effectiveAmountCents = Math.min(requestedAmountCents || 0, availableTotal);
  const { feeCents, netCents } = calcInstantPayoutFee(effectiveAmountCents);
  const overAvailable = requestedAmountCents > availableTotal;

  const openPayoutDialog = () => {
    // Default to full available balance, formatted with 2 decimals
    setAmountInput((availableTotal / 100).toFixed(2));
    setDialogOpen(true);
  };

  const appendLog = (entry: InstantPayoutLogEntry) => {
    setInstantLog((prev) => {
      const next = [entry, ...prev].slice(0, 25);
      saveInstantPayoutLog(next);
      return next;
    });
  };

  const updateLog = (id: string, patch: Partial<InstantPayoutLogEntry>) => {
    setInstantLog((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
      saveInstantPayoutLog(next);
      return next;
    });
  };

  const handleConfirmInstantPayout = async () => {
    if (effectiveAmountCents <= 0) return;
    const localId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    appendLog({
      id: localId,
      amountCents: effectiveAmountCents,
      currency: primaryCurrency,
      status: "queued",
      requestedAt: Date.now(),
      feeCents,
      netCents,
    });

    setPayingOut(true);
    try {
      const result = await triggerInstantPayout({
        amount: effectiveAmountCents,
        currency: primaryCurrency,
      });

      // Recoverable "no funds" case — server returns 200 with noFunds flag instead of throwing.
      if (result?.noFunds || !result?.payout) {
        const available = result?.availableAmount ?? 0;
        const currency = result?.currency ?? primaryCurrency;
        updateLog(localId, {
          status: "failed",
          errorMessage: result?.error || "No funds available to pay out",
        });
        toast({
          title: "No funds available",
          description: `Available balance is ${formatCentsAsCurrency(available, currency)}. Wait for pending funds to clear, then try again.`,
        });
        await fetchPayouts();
        return;
      }

      updateLog(localId, {
        status: "succeeded",
        payoutId: result.payout.id,
      });

      toast({
        title: "Instant payout sent",
        description: `${formatCentsAsCurrency(result.payout.amount, result.payout.currency)} on the way to your bank.`,
      });
      setDialogOpen(false);
      await fetchPayouts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payout failed";
      updateLog(localId, { status: "failed", errorMessage: msg });
      toast({ title: "Could not start payout", description: msg, variant: "destructive" });
    } finally {
      setPayingOut(false);
    }
  };

  const getPayoutStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">Paid</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Pending</Badge>;
      case "in_transit":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">In Transit</Badge>;
      case "canceled":
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">Canceled</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getInstantStatusBadge = (status: InstantPayoutLogEntry["status"]) => {
    switch (status) {
      case "queued":
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Queued
          </Badge>
        );
      case "succeeded":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Succeeded
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 gap-1">
            <XCircle className="h-3 w-3" /> Failed
          </Badge>
        );
    }
  };

  // Filter pending payouts (in_transit or pending status)
  const pendingPayouts = data?.payouts?.filter(p => p.status === "pending" || p.status === "in_transit") || [];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
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
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.balance) {
    return (
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Stripe Connect Not Configured
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {data?.message || "Complete your Stripe setup in Settings to view payouts."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-semibold">Payouts Dashboard</h3>
          <p className="text-sm text-muted-foreground">Your balance and payout history</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={openPayoutDialog}
            size="sm"
            disabled={payingOut || availableTotal <= 0}
            title={availableTotal <= 0 ? "No funds available to pay out" : "Send funds to your bank instantly"}
          >
            {payingOut ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Pay out now
          </Button>
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-gray-200 dark:border-green-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="text-2xl font-bold text-gray-600">
                  {formatCentsAsCurrency(availableTotal, primaryCurrency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Tap "Pay out now" to choose an amount</p>
              </div>
              <div className="p-3 bg-gray-100 dark:bg-gray-900/30 rounded-md">
                <Wallet className="h-6 w-6 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Balance</p>
                <p className="text-2xl font-bold text-amber-600">
                  {formatCentsAsCurrency(pendingTotal, primaryCurrency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Clearing — usually 2 business days</p>
              </div>
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-md">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 dark:border-blue-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Balance</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCentsAsCurrency(availableTotal + pendingTotal, primaryCurrency)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Available + Pending</p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-md">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Instant Payout Requests */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Recent Instant Payout Requests
            {instantLog.length > 0 && (
              <Badge variant="secondary" className="ml-2">{instantLog.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {instantLog.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No instant payout requests yet. Use “Pay out now” to send funds to your bank.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requested</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Fee</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Stripe Payout ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instantLog.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(entry.requestedAt), "MMM d, yyyy")}
                        <span className="text-muted-foreground text-xs block">
                          {format(new Date(entry.requestedAt), "h:mm:ss a")}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCentsAsCurrency(entry.amountCents, entry.currency)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.feeCents != null
                          ? formatCentsAsCurrency(entry.feeCents, entry.currency)
                          : "—"}
                      </TableCell>
                      <TableCell className="font-medium text-emerald-600">
                        {entry.netCents != null
                          ? formatCentsAsCurrency(entry.netCents, entry.currency)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {getInstantStatusBadge(entry.status)}
                        {entry.status === "failed" && entry.errorMessage && (
                          <p className="text-xs text-destructive mt-1 max-w-xs truncate" title={entry.errorMessage}>
                            {entry.errorMessage}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.payoutId ? (
                          <a
                            href={`https://dashboard.stripe.com/payouts/${entry.payoutId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {entry.payoutId.slice(-10).toUpperCase()}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Payouts */}
      {pendingPayouts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5 text-amber-600" />
              Pending Payouts
              <Badge variant="secondary" className="ml-2">{pendingPayouts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Initiated</TableHead>
                    <TableHead>Expected Arrival</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPayouts.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(payout.created * 1000), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {format(new Date(payout.arrivalDate * 1000), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="font-bold text-gray-600">
                        {formatCentsAsCurrency(payout.amount, payout.currency)}
                      </TableCell>
                      <TableCell>{getPayoutStatusBadge(payout.status)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {payout.method}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payout History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Payout History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.payouts?.length === 0 ? (
            <div className="text-center py-12">
              <ArrowDownToLine className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No payouts yet</h3>
              <p className="text-muted-foreground">
                Payouts will appear here once Stripe transfers funds to your bank account.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Arrival</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.payouts?.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(payout.created * 1000), "MMM d, yyyy")}
                        <span className="text-muted-foreground text-xs block">
                          {format(new Date(payout.created * 1000), "h:mm a")}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(payout.arrivalDate * 1000), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="font-medium text-gray-600">
                        {formatCentsAsCurrency(payout.amount, payout.currency)}
                      </TableCell>
                      <TableCell>{getPayoutStatusBadge(payout.status)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {payout.method}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <a
                          href={`https://dashboard.stripe.com/payouts/${payout.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:text-primary hover:underline"
                        >
                          {payout.id.slice(-8).toUpperCase()}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pay-out Now Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !payingOut && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Instant payout
            </DialogTitle>
            <DialogDescription>
              Choose how much to send instantly to your bank. Stripe charges 1% (min $0.50) for instant payouts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available balance</span>
                <span className="font-semibold">
                  {formatCentsAsCurrency(availableTotal, primaryCurrency)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payout-amount">Amount ({primaryCurrency.toUpperCase()})</Label>
              <div className="flex gap-2">
                <Input
                  id="payout-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  max={(availableTotal / 100).toString()}
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.00"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAmountInput((availableTotal / 100).toFixed(2))}
                >
                  Max
                </Button>
              </div>
              {overAvailable && (
                <p className="text-xs text-destructive">
                  Amount exceeds available balance — it will be capped at{" "}
                  {formatCentsAsCurrency(availableTotal, primaryCurrency)}.
                </p>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payout amount</span>
                <span className="font-medium">
                  {formatCentsAsCurrency(effectiveAmountCents, primaryCurrency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimated Stripe fee (1%, min $0.50)</span>
                <span className="font-medium text-destructive">
                  −{formatCentsAsCurrency(feeCents, primaryCurrency)}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between">
                <span className="font-semibold">You'll receive</span>
                <span className="font-bold text-emerald-600">
                  {formatCentsAsCurrency(netCents, primaryCurrency)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Fee shown is an estimate. Stripe debits the fee from this payout — your bank deposit will match the net amount.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={payingOut}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmInstantPayout}
              disabled={payingOut || effectiveAmountCents <= 0}
            >
              {payingOut ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Send {formatCentsAsCurrency(netCents, primaryCurrency)}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

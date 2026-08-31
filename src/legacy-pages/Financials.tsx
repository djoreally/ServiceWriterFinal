import React, { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  Download,
  Calendar,
  DollarSign,
  CreditCard,
  Wallet,
  PiggyBank,
  BarChart3,
  PieChart,
  Users,
  FileText,
  Receipt,
} from "lucide-react";
import { ExpensesTab } from "@/legacy-pages/financials/Expenses";
import { InvoicesTab } from "@/legacy-pages/financials/Invoices";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { CustomerLifetimeValue } from "@/components/marketing/CustomerLifetimeValue";
import { getCurrentUserId, fetchSucceededPayments, fetchPendingPayments, fetchAppointmentStatuses, fetchCompletedServices } from "@/application/queries/financials.query";
import { format, subMonths, subWeeks, parseISO, startOfMonth, endOfMonth, startOfWeek, addDays } from "date-fns";
import { toDollars, aggregatePayments } from "@/lib/currencyUtils";
import { computeLedgerMetrics, groupMonthlyCollectedRevenue, mapServicesToCanonicalLedger } from "@/lib/financial-ledger";

interface StatCardProps {
  title: string;
  value: string;
  subValue?: string;
  trend?: { value: string; positive: boolean };
  progress?: number;
  subtitle?: string;
  icon?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subValue, trend, progress, subtitle, icon }) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <h3 className="text-2xl font-black">{value}</h3>
            {subValue && <span className="text-xs text-muted-foreground font-medium">/ {subValue}</span>}
          </div>
        </div>
        {icon && (
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-bold ${trend.positive ? "text-emerald-500" : "text-red-500"}`}>
          {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trend.value}
        </div>
      )}
      {progress !== undefined && (
        <div className="mt-3">
          <Progress value={progress} className="h-1.5" />
        </div>
      )}
      {subtitle && (
        <p className="text-[10px] text-muted-foreground mt-1 uppercase">{subtitle}</p>
      )}
    </CardContent>
  </Card>
);

interface OverviewData {
  totalRevenue: number;
  lastMonthRevenue: number;
  totalTransactions: number;
  avgTicketSize: number;
  outstandingPayments: number;
  completedValue: number;
  totalPending: number;
  collectionRate: number;
  monthlyRevenue: { month: string; revenue: number }[];
  revenueHeatmapWeeks: { date: string; revenue: number }[][];
  revenueHeatmapMax: number;
  paymentMethods: { method: string; amount: number; percentage: number }[];
}

function useFinancialOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const userId = await getCurrentUserId();
      if (!userId) return;

      const now = new Date();
      const startOfThisMonth = startOfMonth(now).toISOString();
      const startOfLastMonth = startOfMonth(subMonths(now, 1)).toISOString();
      const endOfLastMonth = endOfMonth(subMonths(now, 1)).toISOString();
      const twelveMonthsAgo = subMonths(now, 12).toISOString();

      // Fetch all collected payments (succeeded + refunded) for last 12 months
      const [succeededRes, pendingRes, completedServicesRes] = await Promise.all([
        fetchSucceededPayments(userId, twelveMonthsAgo),
        fetchPendingPayments(userId),
        fetchCompletedServices(userId, twelveMonthsAgo),
      ]);

      const succeeded = succeededRes.data || [];
      const pending = pendingRes.data || [];
      const completedServices = completedServicesRes.data || [];

      // Filter pending: exclude cancelled appointments
      let pendingTotal = 0;
      if (pending.length > 0) {
        const apptIds = pending.map(p => p.appointment_id).filter(Boolean) as string[];
        const { data: appts } = await fetchAppointmentStatuses(apptIds);
        const cancelledIds = new Set((appts || []).filter(a => a.status === "cancelled").map(a => a.id));
        const validPending = pending.filter(p => !p.appointment_id || !cancelledIds.has(p.appointment_id));
        // Use currency utility for type-safe cents → dollars conversion
        pendingTotal = aggregatePayments(validPending.map(p => ({ ...p, status: 'pending' })));
      }

      // This month revenue
      const thisMonthPayments = succeeded.filter(p => p.created_at >= startOfThisMonth);
      const lastMonthPayments = succeeded.filter(p =>
        p.created_at >= startOfLastMonth && p.created_at <= endOfLastMonth
      );

      // Use currency utilities for type-safe aggregation
      const totalRevenue = aggregatePayments(
        thisMonthPayments.map((p) => ({
          ...p,
          status: p.status || 'succeeded',
          refund_amount: p.refund_amount || 0,
        }))
      );
      const lastMonthRevenue = aggregatePayments(
        lastMonthPayments.map((p) => ({
          ...p,
          status: p.status || 'succeeded',
          refund_amount: p.refund_amount || 0,
        }))
      );
      const thisMonthCompleted = completedServices.filter((s) => s.service_date >= startOfThisMonth);
      const thisMonthSnapshots = mapServicesToCanonicalLedger(thisMonthCompleted);
      const thisMonthLedger = computeLedgerMetrics({
        services: thisMonthCompleted,
        payments: thisMonthPayments.map((p) => ({
          amount: p.amount,
          refund_amount: p.refund_amount,
          status: p.status,
        })),
      });

      const totalTransactions = thisMonthPayments.length;
      const avgTicketSize = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

      // Collection rate = succeeded / (succeeded + pending)
      const totalSucceededAllTime = aggregatePayments(
        succeeded.map((p) => ({
          ...p,
          status: p.status || 'succeeded',
          refund_amount: p.refund_amount || 0,
        }))
      );
      const collectionRate = (totalSucceededAllTime + pendingTotal) > 0
        ? (totalSucceededAllTime / (totalSucceededAllTime + pendingTotal)) * 100
        : 100;

      // Monthly revenue for chart (last 12 months)
      const monthlyRevenue = groupMonthlyCollectedRevenue(
        succeeded,
        (isoDate) => format(parseISO(isoDate), "MMM yy"),
      );

      // Daily revenue heatmap for last 12 weeks (7-day columns, Sun-Sat)
      const heatmapStart = startOfWeek(subWeeks(now, 11), { weekStartsOn: 0 });
      const dailyRevenueMap = new Map<string, number>();

      succeeded.forEach((p) => {
        if (p.created_at < heatmapStart.toISOString()) return;
        const day = format(parseISO(p.created_at), "yyyy-MM-dd");
        const netAmount = (p.amount || 0) - (p.refund_amount || 0);
        dailyRevenueMap.set(day, (dailyRevenueMap.get(day) || 0) + toDollars(netAmount));
      });

      const revenueHeatmapWeeks: { date: string; revenue: number }[][] = Array.from({ length: 12 }, (_, weekIndex) => {
        const weekStart = addDays(heatmapStart, weekIndex * 7);
        return Array.from({ length: 7 }, (_, dayIndex) => {
          const date = format(addDays(weekStart, dayIndex), "yyyy-MM-dd");
          return {
            date,
            revenue: dailyRevenueMap.get(date) || 0,
          };
        });
      });
      const revenueHeatmapMax = Math.max(
        ...revenueHeatmapWeeks.flat().map((d) => d.revenue),
        0
      );

      // Payment type breakdown (this month) — use payment_type as method label
      const methodMap = new Map<string, number>();
      thisMonthPayments.forEach(p => {
        const raw = p.payment_type || "card";
        // Normalize labels
        const label = raw === "booking_deposit" ? "Deposit"
          : raw === "pay_at_service" ? "Cash / Manual"
          : raw === "invoice_payment" ? "Invoice"
          : raw === "balance" ? "Balance"
          : "Card";
        // Use currency utility for type-safe conversion
        const netAmount = (p.amount || 0) - (p.refund_amount || 0);
        methodMap.set(label, (methodMap.get(label) || 0) + toDollars(netAmount));
      });
      const paymentMethods = Array.from(methodMap.entries()).map(([method, amount]) => ({
        method,
        amount,
        percentage: totalRevenue > 0 ? Math.round((amount / totalRevenue) * 100) : 0,
      })).sort((a, b) => b.amount - a.amount);

      setData({
        totalRevenue,
        lastMonthRevenue,
        totalTransactions,
        avgTicketSize,
        outstandingPayments: thisMonthLedger.outstanding,
        totalPending: thisMonthSnapshots.filter((s) => s.balance_due > 0).length,
        collectionRate,
        completedValue: thisMonthLedger.completedValue,
        monthlyRevenue,
        revenueHeatmapWeeks,
        revenueHeatmapMax,
        paymentMethods,
      });
    } catch (err) {
      console.error("Failed to load financial overview:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(() => fetchData()); }, [fetchData]);

  return { data, loading, refresh: fetchData };
}

const OverviewTab: React.FC = () => {
  const { formatCurrency } = useRegionalSettings();
  const { data, loading } = useFinancialOverview();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`financials-metric-${i}`} className="h-36 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-[320px] lg:col-span-2 rounded-xl" />
          <Skeleton className="h-[320px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
        No financial data available yet.
      </div>
    );
  }

  const revenueChangeAmt = data.totalRevenue - data.lastMonthRevenue;
  const revenueChangePct = data.lastMonthRevenue > 0
    ? ((revenueChangeAmt / data.lastMonthRevenue) * 100).toFixed(1)
    : null;
  const revenuePositive = revenueChangeAmt >= 0;

  const maxMonthRevenue = Math.max(...data.monthlyRevenue.map(m => m.revenue), 1);
  const heatmapIntensity = (value: number) => {
    if (value <= 0 || data.revenueHeatmapMax <= 0) return "bg-muted";
    const ratio = value / data.revenueHeatmapMax;
    if (ratio < 0.25) return "bg-emerald-200 dark:bg-emerald-900/40";
    if (ratio < 0.5) return "bg-emerald-400 dark:bg-emerald-800/60";
    if (ratio < 0.75) return "bg-emerald-600 dark:bg-emerald-700/80";
    return "bg-emerald-800 dark:bg-emerald-600";
  };

  return (
    <div className="space-y-8">
      {/* Key Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Collected Cash (Net)"
          value={formatCurrency(data.totalRevenue)}
          trend={revenueChangePct !== null ? {
            value: `${revenuePositive ? "+" : ""}${revenueChangePct}% vs last month`,
            positive: revenuePositive,
          } : undefined}
          subtitle={`Completed Job Value: ${formatCurrency(data.completedValue)}`}
          icon={<DollarSign className="h-5 w-5 text-primary" />}
        />
        <StatCard
          title="Avg. Transaction"
          value={formatCurrency(data.avgTicketSize)}
          subtitle={`${data.totalTransactions} transactions this month`}
          icon={<CreditCard className="h-5 w-5 text-primary" />}
        />
        <StatCard
          title="Outstanding Balance"
          value={formatCurrency(data.outstandingPayments)}
          subtitle={`${data.totalPending} completed jobs with balance due`}
          icon={<Wallet className="h-5 w-5 text-primary" />}
        />
        <StatCard
          title="Collection Rate"
          value={`${data.collectionRate.toFixed(1)}%`}
          subtitle="Payments collected"
          icon={<PiggyBank className="h-5 w-5 text-primary" />}
        />
      </section>

      {/* Revenue Trend Chart */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold">Monthly Collected Cash (Last 12 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.monthlyRevenue.length > 0 ? (
              <div className="h-64 flex flex-col justify-end">
                <div className="flex items-end gap-2 h-full px-2">
                  {data.monthlyRevenue.map((month, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-primary rounded-t-sm transition-all hover:opacity-80 min-h-[2px]"
                        style={{ height: `${(month.revenue / maxMonthRevenue) * 100}%` }}
                        title={`${month.month}: ${formatCurrency(month.revenue)}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] font-bold text-muted-foreground pt-3 border-t mt-3 overflow-hidden">
                  {data.monthlyRevenue.map((month) => (
                    <span key={month.month} className="flex-1 text-center truncate">{month.month}</span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No succeeded payments yet — collected cash will appear once payments are processed.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue Heatmap */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold">Daily Revenue (12 Weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-7 gap-1.5 text-[10px] text-muted-foreground font-bold">
                {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
                  <span key={day} className="text-center">{day}</span>
                ))}
              </div>
              <div className="space-y-1.5">
                {data.revenueHeatmapWeeks.map((week, weekIndex) => (
                  <div key={`week-${weekIndex}`} className="grid grid-cols-7 gap-1.5">
                    {week.map((day) => (
                      <div
                        key={day.date}
                        className={`h-4 w-full rounded-sm ${heatmapIntensity(day.revenue)}`}
                        title={`${format(parseISO(day.date), "MMM d, yyyy")}: ${formatCurrency(day.revenue)}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold">Payment Methods</CardTitle>
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.paymentMethods.length > 0 ? (
              data.paymentMethods.map((pm) => (
                <div key={pm.method} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{pm.method}</span>
                    <span className="font-bold">{formatCurrency(pm.amount)} ({pm.percentage}%)</span>
                  </div>
                  <Progress value={pm.percentage} className="h-2" />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No payment method data this month.</p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Period Summary — single source of truth, no duplicates */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold">Period Comparison</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">This Month</p>
                <p className="text-xl font-black mt-1">{formatCurrency(data.totalRevenue)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">collected (net)</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Last Month</p>
                <p className="text-xl font-black mt-1">{formatCurrency(data.lastMonthRevenue)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">collected (net)</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Change</p>
                <p className={`text-xl font-black mt-1 ${revenuePositive ? "text-emerald-600" : "text-red-500"}`}>
                  {revenueChangePct !== null ? `${revenuePositive ? "+" : ""}${revenueChangePct}%` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">vs last month</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between bg-primary/5 p-4 rounded-lg border border-primary/20">
              <div>
                <p className="text-xs font-bold text-primary uppercase tracking-wider">Trailing 12-Month Revenue</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Net collected cash from succeeded payments</p>
              </div>
              <p className="text-2xl font-black text-primary">
                {formatCurrency(data.monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0))}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold">Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-2">
              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Awaiting Collection</p>
              <p className="text-3xl font-black mt-2 text-amber-600 dark:text-amber-500">
                {formatCurrency(data.outstandingPayments)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.totalPending} {data.totalPending === 1 ? "job" : "jobs"} with balance due
              </p>
            </div>
            <div className="mt-4 pt-4 border-t space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Completed Job Value</span>
                <span className="text-sm font-bold">{formatCurrency(data.completedValue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Collection Rate</span>
                <span className={`text-sm font-bold ${data.collectionRate >= 90 ? "text-emerald-600" : "text-amber-500"}`}>
                  {data.collectionRate.toFixed(1)}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

const Financials: React.FC = () => {
  return (
    <AppLayout title="Financials">
      <div className="p-8 space-y-6 max-w-[1400px] mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Financial Overview</h1>
            <p className="text-muted-foreground mt-1">
              Track collected cash, outstanding balances, and customer lifetime value.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">This Month</span>
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="inline-flex">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-2">
              <FileText className="h-4 w-4" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="expenses" className="gap-2">
              <Receipt className="h-4 w-4" />
              Expenses
            </TabsTrigger>
            <TabsTrigger value="ltv" className="gap-2">
              <Users className="h-4 w-4" />
              Customer LTV
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab />
          </TabsContent>

          <TabsContent value="invoices">
            <InvoicesTab />
          </TabsContent>

          <TabsContent value="expenses">
            <ExpensesTab />
          </TabsContent>

          <TabsContent value="ltv">
            <CustomerLifetimeValue />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Financials;

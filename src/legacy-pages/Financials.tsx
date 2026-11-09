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
  Wallet,
  BarChart3,
  PieChart,
  FileText,
  Receipt,
  Landmark,
  ScrollText,
} from "lucide-react";
import { Link } from "react-router-dom";
import { ExpensesTab } from "@/legacy-pages/financials/Expenses";
import { StatementsTab } from "@/legacy-pages/financials/Statements";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { AccountingWorkspace } from "@/components/accounting/AccountingWorkspace";
import { getCurrentUserId } from "@/application/queries/financials.query";
import { fetchBankTransactions } from "@/application/queries/accounting.query";
import { fetchInvoiceList } from "@/application/queries/invoices.query";
import { invoiceBalance, isOwedInvoice } from "@/components/invoices/invoice-ui";
import {
  isAccountingOperatingExpense,
  isAccountingRevenue,
  summarizeAccounting,
} from "@/features/accounting/accounting-engine";
import { format, parseISO, isValid, startOfWeek, subWeeks, addDays } from "date-fns";

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
  rangeLabel: string;
  revenue: number;
  operatingExpenses: number;
  operatingProfit: number;
  profitMargin: number | null;
  netCashChange: number;
  investorCapital: number;
  ownerDraws: number;
  unresolvedAmount: number;
  unresolvedCount: number;
  owedTotal: number;
  owedCount: number;
  monthlyRevenue: { month: string; revenue: number }[];
  revenueHeatmapWeeks: { date: string; revenue: number }[][];
  revenueHeatmapMax: number;
  expenseBreakdown: { label: string; amount: number; percentage: number }[];
}

function classificationLabel(classification: string) {
  return classification.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function useFinancialOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const userId = await getCurrentUserId();
      if (!userId) return;

      // THE WAREHOUSE — this tab used to run its own payments-only math in
      // the browser (succeeded payments + pending payments + completed
      // services), a third version of the truth. It now reads the same
      // sources the rest of the product reads: the Accounting tab's bank
      // transactions run through the shared accounting summary engine, and
      // the whole invoice book under the one Fix-2 owed definition.
      const [bankRows, invoiceRows] = await Promise.all([
        fetchBankTransactions(),
        fetchInvoiceList(userId),
      ]);

      if (bankRows.length === 0 && invoiceRows.length === 0) {
        setData(null);
        return;
      }

      const summary = summarizeAccounting(
        bankRows.map((row) => ({ amount: Number(row.amount), classification: row.classification })),
      );

      // The bank data range — every period label on this tab names it.
      const postedDates = bankRows.map((row) => row.posted_on).filter(Boolean).sort();
      const rangeLabel = postedDates.length > 0
        ? `${format(parseISO(postedDates[0]), "MMM d, yyyy")} – ${format(parseISO(postedDates[postedDates.length - 1]), "MMM d, yyyy")}`
        : "No bank records imported";

      // Monthly operating revenue, from classified bank revenue rows.
      const monthlyMap = new Map<string, number>();
      bankRows.forEach((row) => {
        if (!isAccountingRevenue(row.classification) || Number(row.amount) <= 0 || !row.posted_on) return;
        const key = row.posted_on.slice(0, 7);
        monthlyMap.set(key, (monthlyMap.get(key) || 0) + Number(row.amount));
      });
      const monthlyRevenue = Array.from(monthlyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, revenue]) => {
          const parsed = parseISO(`${key}-01`);
          return {
            month: isValid(parsed) ? format(parsed, "MMM yy") : key,
            revenue: Math.round(revenue * 100) / 100,
          };
        });

      // Daily revenue heatmap — the latest 12 weeks OF THE BANK RECORDS,
      // anchored to the newest posted date, not to today.
      let revenueHeatmapWeeks: { date: string; revenue: number }[][] = [];
      let revenueHeatmapMax = 0;
      if (postedDates.length > 0) {
        const heatmapStart = startOfWeek(subWeeks(parseISO(postedDates[postedDates.length - 1]), 11), { weekStartsOn: 0 });
        const heatmapStartKey = format(heatmapStart, "yyyy-MM-dd");
        const dailyRevenueMap = new Map<string, number>();
        bankRows.forEach((row) => {
          if (!isAccountingRevenue(row.classification) || Number(row.amount) <= 0 || !row.posted_on) return;
          if (row.posted_on < heatmapStartKey) return;
          dailyRevenueMap.set(row.posted_on, (dailyRevenueMap.get(row.posted_on) || 0) + Number(row.amount));
        });
        revenueHeatmapWeeks = Array.from({ length: 12 }, (_, weekIndex) => {
          const weekStart = addDays(heatmapStart, weekIndex * 7);
          return Array.from({ length: 7 }, (_, dayIndex) => {
            const date = format(addDays(weekStart, dayIndex), "yyyy-MM-dd");
            return { date, revenue: dailyRevenueMap.get(date) || 0 };
          });
        });
        revenueHeatmapMax = Math.max(...revenueHeatmapWeeks.flat().map((d) => d.revenue), 0);
      }

      // Expense breakdown — the top classified operating-expense
      // categories in the bank records (owner draws and capital excluded
      // by the same engine sets that produce the summary).
      const expenseMap = new Map<string, number>();
      bankRows.forEach((row) => {
        if (!isAccountingOperatingExpense(row.classification) || Number(row.amount) >= 0) return;
        expenseMap.set(row.classification, (expenseMap.get(row.classification) || 0) + Math.abs(Number(row.amount)));
      });
      const expenseBreakdownTotal = Array.from(expenseMap.values()).reduce((sum, v) => sum + v, 0);
      const expenseBreakdown = Array.from(expenseMap.entries())
        .map(([classification, amount]) => ({
          label: classificationLabel(classification),
          amount: Math.round(amount * 100) / 100,
          percentage: expenseBreakdownTotal > 0 ? Math.round((amount / expenseBreakdownTotal) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      // Receivables — the one owed definition over the whole invoice book.
      const owedRows = invoiceRows.filter(isOwedInvoice);
      const owedTotal = Math.round(owedRows.reduce((sum, row) => sum + invoiceBalance(row), 0) * 100) / 100;

      setData({
        rangeLabel,
        revenue: summary.revenue,
        operatingExpenses: summary.operatingExpenses,
        operatingProfit: summary.operatingProfit,
        profitMargin: summary.revenue > 0 ? (summary.operatingProfit / summary.revenue) * 100 : null,
        netCashChange: summary.netCashChange,
        investorCapital: summary.investorCapital,
        ownerDraws: summary.ownerDraws,
        unresolvedAmount: summary.unresolvedAmount,
        unresolvedCount: summary.unresolvedCount,
        owedTotal,
        owedCount: owedRows.length,
        monthlyRevenue,
        revenueHeatmapWeeks,
        revenueHeatmapMax,
        expenseBreakdown,
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
        No financial data available yet. Import a bank statement in the Accounting tab to light up these numbers.
      </div>
    );
  }

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
      {/* Key Metrics — warehouse totals over the bank data range */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Operating Revenue"
          value={formatCurrency(data.revenue)}
          subtitle={`Bank records: ${data.rangeLabel}`}
          icon={<DollarSign className="h-5 w-5 text-primary" />}
        />
        <StatCard
          title="Operating Expenses"
          value={formatCurrency(data.operatingExpenses)}
          subtitle="Classified bank expenses · draws & capital excluded"
          icon={<TrendingDown className="h-5 w-5 text-primary" />}
        />
        <StatCard
          title="Operating Profit"
          value={formatCurrency(data.operatingProfit)}
          subtitle={data.profitMargin !== null ? `${data.profitMargin.toFixed(1)}% of operating revenue` : "Revenue minus operating expenses"}
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
        />
        <StatCard
          title="Outstanding Balance"
          value={formatCurrency(data.owedTotal)}
          subtitle={`${data.owedCount} ${data.owedCount === 1 ? "invoice" : "invoices"} owed`}
          icon={<Wallet className="h-5 w-5 text-primary" />}
        />
      </section>

      {/* Revenue Trend Chart */}
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold">Monthly Operating Revenue (Bank Records)</CardTitle>
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
                No classified revenue yet — revenue appears once bank rows are classified in Accounting.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue Heatmap */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-bold">Daily Revenue (12 Weeks)</CardTitle>
            <p className="text-xs text-muted-foreground">Latest 12 weeks in the bank records</p>
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

        {/* Expense Breakdown (was Payment Methods — payments-only math is gone) */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold">Top Expense Categories</CardTitle>
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.expenseBreakdown.length > 0 ? (
              data.expenseBreakdown.map((category) => (
                <div key={category.label} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{category.label}</span>
                    <span className="font-bold">{formatCurrency(category.amount)} ({category.percentage}%)</span>
                  </div>
                  <Progress value={category.percentage} className="h-2" />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No classified expenses in the bank records yet.</p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Bank Record Summary — the warehouse totals, range labeled */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold">Bank Record Summary</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Operating Revenue</p>
                <p className="text-xl font-black mt-1">{formatCurrency(data.revenue)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">bank records: {data.rangeLabel}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Operating Expenses</p>
                <p className="text-xl font-black mt-1">{formatCurrency(data.operatingExpenses)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">classified, profit & loss</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Operating Profit</p>
                <p className="text-xl font-black mt-1">{formatCurrency(data.operatingProfit)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">revenue minus expenses</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between bg-primary/5 p-4 rounded-lg border border-primary/20">
              <div>
                <p className="text-xs font-bold text-primary uppercase tracking-wider">Net Cash Change</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">All imported bank activity — capital and owner draws move cash but stay out of profit & loss</p>
              </div>
              <p className="text-2xl font-black text-primary">
                {formatCurrency(data.netCashChange)}
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
                {formatCurrency(data.owedTotal)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.owedCount} {data.owedCount === 1 ? "invoice" : "invoices"} owed — issued, partially paid, or past due
              </p>
            </div>
            <div className="mt-4 pt-4 border-t space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Investor Capital In</span>
                <span className="text-sm font-bold">{formatCurrency(data.investorCapital)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Owner Draws</span>
                <span className="text-sm font-bold">{formatCurrency(data.ownerDraws)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Unclassified Bank Activity</span>
                <span className="text-sm font-bold">
                  {formatCurrency(data.unresolvedAmount)} ({data.unresolvedCount})
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
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4" data-print-hide>
          <div>
            <h2 className="text-3xl font-black tracking-tight">Financial Overview</h2>
            <p className="text-muted-foreground mt-1">
              One warehouse: classified bank records, outstanding invoices, and shareable statements.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild className="flex items-center gap-2">
              <Link to="/invoices">
                <FileText className="h-4 w-4" />
                <span className="text-sm">Invoices</span>
              </Link>
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Bank Records</span>
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="inline-flex" data-print-hide>
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="expenses" className="gap-2">
              <Receipt className="h-4 w-4" />
              Expenses
            </TabsTrigger>
            <TabsTrigger value="accounting" className="gap-2">
              <Landmark className="h-4 w-4" />
              Accounting
            </TabsTrigger>
            <TabsTrigger value="statements" className="gap-2">
              <ScrollText className="h-4 w-4" />
              Statements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab />
          </TabsContent>

          <TabsContent value="expenses">
            <ExpensesTab />
          </TabsContent>

          <TabsContent value="accounting">
            <AccountingWorkspace />
          </TabsContent>

          <TabsContent value="statements">
            <StatementsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Financials;

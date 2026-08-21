import { useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { format, parseISO, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, startOfWeek, startOfMonth } from "date-fns";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { bankersRound, formatMoney } from "@/lib/financialMath";
import { aggregateCollectedCash } from "@/lib/canonicalFinancials";
import { AnimatedChartFrame } from "@/components/charts/AnimatedChartFrame";

interface PaymentRecord {
  id: string;
  amount: number; // ⚠️ CURRENCY UNIT: CENTS (type system doesn't enforce this yet)
  created_at: string;
  status: string;
  refund_amount?: number; // ⚠️ CURRENCY UNIT: CENTS
}

interface PreviousPeriodPayment {
  id: string;
  amount: number; // ⚠️ CURRENCY UNIT: CENTS
  status: string;
  refund_amount?: number; // ⚠️ CURRENCY UNIT: CENTS
}

interface RevenueChartProps {
  payments: PaymentRecord[];
  /** Payments from the previous period for trend calculation */
  previousPeriodPayments?: PreviousPeriodPayment[];
  dateRange: { from: Date; to: Date } | undefined;
  granularity?: "day" | "week" | "month";
}

const chartConfig: ChartConfig = {
  collected: {
    label: "Collected Cash",
    color: "hsl(var(--primary))",
  },
  refunds: {
    label: "Refunds",
    color: "hsl(var(--destructive))",
  },
};

// ⚡ Performance: Memoized — heavy chart component, skip re-render when Dashboard's unrelated state changes
export const RevenueChart = memo(function RevenueChart({ payments, previousPeriodPayments = [], dateRange, granularity = "day" }: RevenueChartProps) {
  const { formatCurrency } = useRegionalSettings();

  const chartData = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return [];

    // Generate intervals based on granularity
    let intervals: Date[];
    let formatKey: string;

    switch (granularity) {
      case "week":
        intervals = eachWeekOfInterval({ start: dateRange.from, end: dateRange.to });
        formatKey = "MMM d";
        break;
      case "month":
        intervals = eachMonthOfInterval({ start: dateRange.from, end: dateRange.to });
        formatKey = "MMM yyyy";
        break;
      default:
        intervals = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
        formatKey = "MMM d";
    }

    // Build data map
    const dataMap = new Map<string, { collected: number; refunds: number }>();
    intervals.forEach((date) => {
      const key = format(date, "yyyy-MM-dd");
      dataMap.set(key, { collected: 0, refunds: 0 });
    });

    // REVENUE SOURCE: payment_records.amount (cents) is canonical.
    // services.total_cost is accounts-receivable only — never combine.
    payments.forEach((payment) => {
      if (payment.status !== "succeeded" && payment.status !== "refunded") return;

      const paymentDate = parseISO(payment.created_at);
      let key: string;

      switch (granularity) {
        case "week":
          key = format(startOfWeek(paymentDate), "yyyy-MM-dd");
          break;
        case "month":
          key = format(startOfMonth(paymentDate), "yyyy-MM-dd");
          break;
        default:
          key = format(paymentDate, "yyyy-MM-dd");
      }

      const existing = dataMap.get(key);
      if (existing) {
        const netPayment = aggregateCollectedCash([{
          amount_cents: payment.amount || 0,
          refund_amount_cents: payment.refund_amount || 0,
          status: payment.status,
        }]);
        existing.collected += netPayment.netCollected;
        existing.refunds += netPayment.refunds;
      }
    });

    // Convert to array
    return Array.from(dataMap.entries()).map(([dateKey, values]) => ({
      date: dateKey,
      label: format(parseISO(dateKey), granularity === "month" ? "MMM" : "MMM d"),
      collected: bankersRound(values.collected, 2),
      refunds: bankersRound(values.refunds, 2),
    }));
  }, [payments, dateRange, granularity]);

  const stats = useMemo(() => {
    const totalCollected = chartData.reduce((sum, d) => sum + d.collected, 0);
    const totalRefunds = chartData.reduce((sum, d) => sum + d.refunds, 0);
    const netCollected = totalCollected;
    
    // Trend uses the same canonical source (`payment_records`) for both periods.
    let trendPercent = 0;
    if (previousPeriodPayments && previousPeriodPayments.length > 0) {
      const prevSuccessful = previousPeriodPayments.filter(
        (p) => p.status === "succeeded" || p.status === "refunded"
      );
      const prevRevenue = aggregateCollectedCash(prevSuccessful.map((p) => ({
        amount_cents: p.amount || 0,
        refund_amount_cents: p.refund_amount || 0,
        status: p.status,
      }))).netCollected;
      
      if (prevRevenue > 0) {
        trendPercent = ((netCollected - prevRevenue) / prevRevenue) * 100;
      }
    }

    return { totalCollected, totalRefunds, netCollected, trendPercent };
  }, [chartData, previousPeriodPayments]);

  return (
    <Card className="border border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Collected Cash Overview</CardTitle>
          <div className="flex items-center gap-2 text-sm">
            {stats.trendPercent >= 0 ? (
              <TrendingUp className="h-4 w-4 text-gray-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
            <span className={stats.trendPercent >= 0 ? "text-gray-500" : "text-destructive"}>
              {stats.trendPercent >= 0 ? "+" : ""}{stats.trendPercent.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="flex gap-6 mt-2">
          <div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.netCollected)}</p>
            <p className="text-xs text-muted-foreground">Collected Cash (Net)</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">{formatCurrency(stats.totalCollected + stats.totalRefunds)}</p>
            <p className="text-xs text-muted-foreground">Collected Cash (Gross)</p>
          </div>
          {stats.totalRefunds > 0 && (
            <div>
              <p className="text-lg font-semibold text-destructive">-{formatCurrency(stats.totalRefunds)}</p>
              <p className="text-xs text-muted-foreground">Refunds</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <AnimatedChartFrame animationKey={`${granularity}-${chartData.length}-${stats.netCollected}`}>
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              className="fill-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${value}`}
              className="fill-muted-foreground"
            />
            <ChartTooltip
              content={<ChartTooltipContent />}
              formatter={(value: number) => [`$${formatMoney(value)}`, ""]}
            />
            <Area
              type="monotone"
              dataKey="collected"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#revenueGradient)"
            />
          </AreaChart>
          </ChartContainer>
        </AnimatedChartFrame>
      </CardContent>
    </Card>
  );
});

import { useMemo, memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, Wrench, Calendar, Receipt } from "lucide-react";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { cn } from "@/lib/utils";
import {
  aggregateCollectedCash,
} from "@/lib/canonicalFinancials";
import { computeLedgerMetrics } from "@/lib/financial-ledger";
import { useCountUp } from "@/hooks/useCountUp";
import { Line, LineChart, ResponsiveContainer } from "recharts";

interface MetricsData {
  payments: Array<{
    amount: number; // ⚠️ In CENTS (from payment_records.amount)
    status: string;
    refund_amount?: number; // ⚠️ In CENTS
  }>;
  services: Array<{
    payment_status: string | null;
    total_cost: number; // ⚠️ In DOLLARS (from services.total_cost)
    tax_amount?: number | null;
    discount_amount?: number | null;
    shop_supplies?: number | null;
    paid_amount?: number | null;
    status: string;
  }>;
  appointments: Array<{
    status: string;
    estimated_cost?: number; // ⚠️ In DOLLARS
  }>;
  previousPeriodPayments?: Array<{
    id: string;
    amount: number; // ⚠️ In CENTS
    status: string;
    refund_amount?: number; // ⚠️ In CENTS
  }>;
}

interface DashboardMetricsProps {
  data: MetricsData;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: number; label: string };
  iconBgColor: string;
  iconColor: string;
  animateTarget?: number;
  formatAnimatedValue?: (value: number) => string;
  sparkData?: Array<{ v: number }>;
}

// ⚡ Performance: Memoized — 6 instances rendered, prevents re-render when sibling state changes
const MetricCard = memo(function MetricCard({
  title, value, subtitle, icon: Icon, trend, iconBgColor, iconColor, animateTarget, formatAnimatedValue, sparkData,
}: MetricCardProps) {
  const animated = useCountUp(animateTarget ?? 0);
  const displayValue = animateTarget !== undefined
    ? (formatAnimatedValue ? formatAnimatedValue(animated) : animated)
    : value;

  return (
    <Card className="border border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold text-foreground">{displayValue}</p>
            {trend && (
              <div className="flex items-center gap-1">
                {trend.value >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-600" />
                )}
                <span className={cn(
                  "text-xs font-medium",
                  trend.value >= 0 ? "text-emerald-600" : "text-red-600"
                )}>
                  {trend.value >= 0 ? "+" : ""}{trend.value.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground">{trend.label}</span>
              </div>
            )}
            {subtitle && !trend && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className={cn("p-2.5 rounded-xl", iconBgColor)}>
              <Icon className={cn("h-4 w-4", iconColor)} />
            </div>
            {sparkData && sparkData.length > 1 && (
              <div className={cn("w-[60px] h-6", iconColor)}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkData}>
                    <Line type="monotone" dataKey="v" stroke="currentColor" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

// ⚡ Performance: Memoized to skip re-renders when Dashboard's unrelated state changes
export const DashboardMetrics = memo(function DashboardMetrics({ data }: DashboardMetricsProps) {
  const { formatCurrency } = useRegionalSettings();
  const makeSpark = (current: number, previous?: number, points = 8) => {
    const start = previous ?? current * 0.75;
    return Array.from({ length: points }, (_, i) => {
      const t = i / Math.max(points - 1, 1);
      return { v: start + (current - start) * t };
    });
  };

  const metrics = useMemo(() => {
    const canonical = computeLedgerMetrics({
      services: data.services,
      payments: data.payments,
    });


    let revenueTrend: number | undefined;
    if (data.previousPeriodPayments?.length) {
      const previous = aggregateCollectedCash(
        data.previousPeriodPayments.map((p) => ({
          amount_cents: p.amount || 0,
          refund_amount_cents: p.refund_amount || 0,
          status: p.status,
        })),
      ).netCollected;

      if (previous > 0) {
        revenueTrend = ((canonical.revenueCollected - previous) / previous) * 100;
      }
    }

    const confirmedAppointments = data.appointments.filter(
      (a) => a.status === "confirmed" || a.status === "pending",
    );
    const upcomingRevenue = confirmedAppointments.reduce(
      (sum, a) => sum + (Number(a.estimated_cost) || 0),
      0,
    );

    return {
      netCollectedRevenue: canonical.revenueCollected,
      billedCompletedValue: canonical.completedValue,
      outstandingRevenue: canonical.outstanding,
      revenueTrend,
      completedServices: canonical.completedJobs,
      averageTicket: canonical.averageTicket,
      upcomingAppointments: confirmedAppointments.length,
      forecastedValue: upcomingRevenue,
    };
  }, [data]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <MetricCard
        title="Collected Cash"
        value={formatCurrency(metrics.netCollectedRevenue)}
        animateTarget={metrics.netCollectedRevenue}
        formatAnimatedValue={formatCurrency}
        sparkData={makeSpark(metrics.netCollectedRevenue, metrics.revenueTrend !== undefined
          ? metrics.netCollectedRevenue / (1 + metrics.revenueTrend / 100)
          : undefined)}
        icon={DollarSign}
        trend={metrics.revenueTrend !== undefined ? { value: metrics.revenueTrend, label: "vs prev" } : undefined}
        iconBgColor="bg-emerald-500/10"
        iconColor="text-emerald-600"
      />
      <MetricCard
        title="Avg Ticket (Billed)"
        value={formatCurrency(metrics.averageTicket)}
        animateTarget={metrics.averageTicket}
        formatAnimatedValue={formatCurrency}
        sparkData={makeSpark(metrics.averageTicket)}
        subtitle={`${metrics.completedServices} services`}
        icon={Receipt}
        iconBgColor="bg-primary/10"
        iconColor="text-primary"
      />
      <MetricCard
        title="Completed Jobs"
        value={metrics.completedServices}
        animateTarget={metrics.completedServices}
        sparkData={makeSpark(metrics.completedServices)}
        subtitle="Operational status only"
        icon={Wrench}
        iconBgColor="bg-emerald-500/10"
        iconColor="text-emerald-600"
      />
      <MetricCard
        title="Forecasted Value"
        value={formatCurrency(metrics.forecastedValue)}
        animateTarget={metrics.forecastedValue}
        formatAnimatedValue={formatCurrency}
        sparkData={makeSpark(metrics.forecastedValue)}
        subtitle={`${metrics.upcomingAppointments} scheduled jobs`}
        icon={Calendar}
        iconBgColor="bg-purple-500/10"
        iconColor="text-purple-600"
      />
      <MetricCard
        title="Total Billed (Completed)"
        value={formatCurrency(metrics.billedCompletedValue)}
        animateTarget={metrics.billedCompletedValue}
        formatAnimatedValue={formatCurrency}
        sparkData={makeSpark(metrics.billedCompletedValue)}
        icon={DollarSign}
        iconBgColor="bg-gray-500/10"
        iconColor="text-gray-600"
      />
      <MetricCard
        title="Outstanding Balance"
        value={formatCurrency(metrics.outstandingRevenue)}
        animateTarget={metrics.outstandingRevenue}
        formatAnimatedValue={formatCurrency}
        sparkData={makeSpark(metrics.outstandingRevenue)}
        subtitle="Completed value minus paid"
        icon={DollarSign}
        iconBgColor="bg-amber-500/10"
        iconColor="text-amber-600"
      />
    </div>
  );
});

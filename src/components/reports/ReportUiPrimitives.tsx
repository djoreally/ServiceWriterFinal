import React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: number; label: string };
  accent: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({ title, value, subtitle, icon: Icon, trend, accent }) => {
  const colors: Record<string, { bg: string; icon: string }> = {
    emerald: { bg: "bg-emerald-500/10", icon: "text-emerald-500" },
    blue: { bg: "bg-blue-500/10", icon: "text-blue-500" },
    violet: { bg: "bg-violet-500/10", icon: "text-violet-500" },
    amber: { bg: "bg-amber-500/10", icon: "text-amber-500" },
    orange: { bg: "bg-orange-500/10", icon: "text-orange-500" },
    rose: { bg: "bg-rose-500/10", icon: "text-rose-500" },
    cyan: { bg: "bg-cyan-500/10", icon: "text-cyan-500" },
    primary: { bg: "bg-primary/10", icon: "text-primary" },
  };
  const c = colors[accent] ?? colors.primary;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">{title}</p>
            <p className="text-2xl font-black text-foreground leading-none">{value}</p>
            {trend && (
              <div className="flex items-center gap-1 pt-0.5">
                {trend.value >= 0
                  ? <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
                  : <TrendingDown className="h-3 w-3 text-rose-500 shrink-0" />}
                <span className={`text-xs font-bold ${trend.value >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {trend.value >= 0 ? "+" : ""}{trend.value.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground truncate">{trend.label}</span>
              </div>
            )}
            {subtitle && !trend && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`p-2.5 rounded-xl shrink-0 ${c.bg}`}>
            <Icon className={`h-5 w-5 ${c.icon}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
    no_show: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
    in_progress: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    unpaid: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
    refunded: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    succeeded: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    failed: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  };

  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${map[status] || "bg-muted text-muted-foreground"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
};

export const SectionHeader: React.FC<{ title: string; subtitle?: string; icon: React.ElementType }> = ({ title, subtitle, icon: Icon }) => (
  <div className="flex items-center gap-3">
    <div className="p-2 rounded-lg bg-primary/10">
      <Icon className="h-4 w-4 text-primary" />
    </div>
    <div>
      <h2 className="text-base font-black text-foreground">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  </div>
);

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "💵 Cash",
  card: "💳 Card",
  online_card: "🌐 Online Card",
  check: "🏦 Check",
  zelle: "Zelle",
  venmo: "Venmo",
  ach: "ACH / Bank Transfer",
  invoice: "📧 Invoice",
  other: "Other",
};

export const getPaymentMethodLabel = (method: string): string =>
  PAYMENT_METHOD_LABELS[method] || method.replace(/_/g, " ");

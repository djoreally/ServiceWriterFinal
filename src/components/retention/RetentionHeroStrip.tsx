import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, AlertTriangle, Users, Car, Trophy } from "lucide-react";
import { fetchImpactMetrics } from "@/application/queries/retention-impact.query";

function formatCurrency(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function RetentionHeroStrip({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["retention-impact", userId],
    queryFn: () => fetchImpactMetrics(userId),
  });

  const cards = [
    {
      label: "Revenue at Risk",
      value: data ? formatCurrency(data.revenueAtRisk) : "—",
      sub: `${data?.winbackCustomers ?? 0} customers slipping`,
      icon: AlertTriangle,
      tone: "from-red-500/15 via-red-500/5 to-transparent",
      iconTone: "text-red-500 bg-red-500/10",
    },
    {
      label: "Winback Customers",
      value: data ? `${data.winbackCustomers}` : "—",
      sub: "Unresolved winback signals",
      icon: Users,
      tone: "from-amber-500/15 via-amber-500/5 to-transparent",
      iconTone: "text-amber-500 bg-amber-500/10",
    },
    {
      label: "Overdue Vehicles",
      value: data ? `${data.overdueVehicles}` : "—",
      sub: "Past predicted service date",
      icon: Car,
      tone: "from-orange-500/15 via-orange-500/5 to-transparent",
      iconTone: "text-orange-500 bg-orange-500/10",
    },
    {
      label: "Active Loyalty",
      value: data ? `${data.loyaltyActive}` : "—",
      sub: "Members earning points",
      icon: Trophy,
      tone: "from-emerald-500/15 via-emerald-500/5 to-transparent",
      iconTone: "text-emerald-500 bg-emerald-500/10",
    },
  ];

  const delta = data?.trendDelta ?? 0;
  const trendUp = delta >= 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="relative overflow-hidden border-border/60">
            <div className={`absolute inset-0 bg-gradient-to-br ${c.tone} pointer-events-none`} />
            <CardContent className="relative p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg ${c.iconTone}`}>
                  <Icon className="h-4 w-4" />
                </div>
                {c.label === "Revenue at Risk" && data && (
                  <div className={`flex items-center gap-1 text-xs font-semibold ${trendUp ? "text-red-500" : "text-emerald-500"}`}>
                    {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(delta).toFixed(0)}%
                  </div>
                )}
              </div>
              <p className="text-3xl font-black tracking-tight tabular-nums">
                {isLoading ? <span className="text-muted-foreground/40">···</span> : c.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
              <p className="text-[11px] text-muted-foreground/70 mt-2">{c.sub}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

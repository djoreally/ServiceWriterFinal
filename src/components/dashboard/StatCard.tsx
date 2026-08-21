import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/hooks/useCountUp";
import { Line, LineChart, ResponsiveContainer } from "recharts";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendPositive?: boolean;
  subtitle?: string;
  iconBgColor?: string;
  iconColor?: string;
  sparkData?: Array<{ v: number }>;
}

// ⚡ Performance: Memoized to prevent re-renders when parent updates unrelated state
export const StatCard = memo(function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendPositive = true,
  subtitle,
  iconBgColor = "bg-primary/10",
  iconColor = "text-primary",
  sparkData,
}: StatCardProps) {
  const animatedValue = useCountUp(typeof value === "number" ? value : 0);
  const displayValue = typeof value === "number" ? animatedValue : value;
  const fallbackSpark = typeof value === "number"
    ? [0.65, 0.72, 0.7, 0.78, 0.82, 0.88, 1].map((m) => ({ v: Math.max(0, value * m) }))
    : [];
  const chartData = sparkData && sparkData.length > 1 ? sparkData : fallbackSpark;

  return (
    <Card className="border border-border/50">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-foreground">{displayValue}</p>
            {trend && (
              <div className="flex items-center gap-1 pt-1">
                <TrendingUp className={cn(
                  "h-3.5 w-3.5",
                  trendPositive ? "text-gray-500" : "text-amber-500"
                )} />
                <span className={cn(
                  "text-xs font-medium",
                  trendPositive ? "text-gray-500" : "text-amber-500"
                )}>
                  {trend}
                </span>
              </div>
            )}
            {subtitle && (
              <p className={cn(
                "text-xs pt-1",
                subtitle.includes("attention") ? "text-amber-600" : "text-muted-foreground"
              )}>
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={cn("p-3 rounded-xl", iconBgColor)}>
              <Icon className={cn("h-5 w-5", iconColor)} />
            </div>
            {chartData.length > 1 && (
              <div className={cn("w-[60px] h-6", iconColor)}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
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

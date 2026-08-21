import { useMemo, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell } from "recharts";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { AnimatedChartFrame } from "@/components/charts/AnimatedChartFrame";

interface ServiceData {
  id: string;
  service_type: string;
  total_cost: number;
}

interface ServiceBreakdownChartProps {
  services: ServiceData[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(221 83% 53%)", // blue
  "hsl(262 83% 58%)", // purple
  "hsl(330 81% 60%)", // pink
];

// ⚡ Performance: Memoized — pie chart is expensive to render, skip when props unchanged
export const ServiceBreakdownChart = memo(function ServiceBreakdownChart({ services }: ServiceBreakdownChartProps) {
  const { formatCurrency } = useRegionalSettings();

  const chartData = useMemo(() => {
    const grouped = services.reduce((acc, service) => {
      const type = service.service_type || "Other";
      if (!acc[type]) {
        acc[type] = { name: type, value: 0, count: 0 };
      }
      acc[type].value += Number(service.total_cost) || 0;
      acc[type].count += 1;
      return acc;
    }, {} as Record<string, { name: string; value: number; count: number }>);

    return Object.values(grouped)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [services]);

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    chartData.forEach((item, index) => {
      config[item.name] = {
        label: item.name,
        color: COLORS[index % COLORS.length],
      };
    });
    return config;
  }, [chartData]);

  const total = chartData.reduce((sum, d) => sum + d.value, 0);
  const totalCount = chartData.reduce((sum, d) => sum + d.count, 0);

  if (chartData.length === 0) {
    return (
      <Card className="border border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Service Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px]">
          <p className="text-muted-foreground">No service data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Service Breakdown</CardTitle>
        <div className="flex gap-4 mt-1">
          <div>
            <p className="text-xl font-bold text-foreground">{formatCurrency(total)}</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{totalCount}</p>
            <p className="text-xs text-muted-foreground">Services</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <AnimatedChartFrame animationKey={`${chartData.length}-${total}`}>
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  strokeWidth={0}
                />
              ))}
            </Pie>
            <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-[12px] font-semibold">
              {formatCurrency(total)}
            </text>
            <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">
              Total Revenue
            </text>
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const data = payload[0].payload;
                return (
                  <div className="bg-background border border-border rounded-lg p-2 shadow-lg">
                    <p className="font-medium text-sm">{data.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(data.value)} ({data.count} services)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {((data.value / total) * 100).toFixed(1)}% of total
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
          </ChartContainer>
        </AnimatedChartFrame>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {chartData.slice(0, 6).map((item, index) => (
            <div key={item.name} className="flex items-center gap-2 text-xs">
              <div
                className="w-2.5 h-2.5 rounded-md shrink-0"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="truncate text-muted-foreground">{item.name}</span>
              <span className="ml-auto font-medium text-foreground">
                {((item.value / total) * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

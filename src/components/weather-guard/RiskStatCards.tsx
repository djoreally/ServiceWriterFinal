import { CloudRain, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AtRiskAppointment } from "@/application/queries/weather-guard.query";

export function RiskStatCards({ jobs }: { jobs: AtRiskAppointment[] }) {
  const high = jobs.filter((j) => (j.weather_risk_score ?? 0) >= 60).length;
  const warn = jobs.filter(
    (j) => (j.weather_risk_score ?? 0) >= 40 && (j.weather_risk_score ?? 0) < 60,
  ).length;
  const safe = jobs.filter((j) => (j.weather_risk_score ?? 0) < 40 || j.weather_risk_score === null).length;

  const cards = [
    {
      label: "High Risk Jobs (next 48h)",
      value: high,
      icon: CloudRain,
      tone: "border-destructive/40 bg-destructive/5 text-destructive",
    },
    {
      label: "Warning Jobs",
      value: warn,
      icon: AlertTriangle,
      tone: "border-yellow-500/40 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400",
    },
    {
      label: "Safe Jobs",
      value: safe,
      icon: CheckCircle2,
      tone: "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className={`border ${c.tone}`}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-3xl font-semibold">{c.value}</p>
              </div>
              <Icon className="h-8 w-8 opacity-70" />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";
import type { WeatherRiskLog } from "@/application/queries/weather-guard.query";

function levelTone(level: string) {
  if (level === "extreme") return "text-destructive";
  if (level === "high") return "text-orange-500";
  if (level === "medium") return "text-yellow-500";
  return "text-emerald-500";
}

export function AlertFeed({ logs }: { logs: WeatherRiskLog[] }) {
  const meaningful = logs.filter((l) => l.decision !== "OK").slice(0, 12);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bell className="h-4 w-4" />
          Alert feed
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {meaningful.length === 0 && (
          <p className="text-sm text-muted-foreground">No weather alerts in recent evaluations.</p>
        )}
        {meaningful.map((l) => (
          <div key={l.id} className="flex items-start gap-3 border-b pb-3 last:border-b-0 last:pb-0">
            <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-md ${levelTone(l.risk_level).replace("text-", "bg-")}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${levelTone(l.risk_level)}`}>{l.decision} · risk {l.risk_score}</p>
              <p className="truncate text-xs text-muted-foreground">{l.reason}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {new Date(l.evaluated_at).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

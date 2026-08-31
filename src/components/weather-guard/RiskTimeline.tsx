import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AtRiskAppointment } from "@/application/queries/weather-guard.query";
import { currentTimeMs } from "@/lib/datetime";

function bandColor(score: number | null) {
  if (score === null) return "bg-muted";
  if (score >= 80) return "bg-destructive";
  if (score >= 60) return "bg-orange-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-emerald-500";
}

export function RiskTimeline({ jobs }: { jobs: AtRiskAppointment[] }) {
  const [now] = useState(currentTimeMs);
  const horizon = now + 48 * 3_600_000;

  const positioned = jobs
    .map((j) => {
      const t = new Date(`${j.scheduled_date}T${j.scheduled_time}`).getTime();
      const pct = ((t - now) / (horizon - now)) * 100;
      return { job: j, t, pct };
    })
    .filter((p) => p.pct >= 0 && p.pct <= 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Risk Timeline (next 48 hours)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-16 rounded-md border bg-muted/30">
          {/* hour ticks */}
          {[0, 12, 24, 36, 48].map((h) => (
            <div
              key={h}
              className="absolute top-0 h-full border-l border-border/50 text-[10px] text-muted-foreground"
              style={{ left: `${(h / 48) * 100}%` }}
            >
              <span className="absolute -bottom-5 -translate-x-1/2 whitespace-nowrap">+{h}h</span>
            </div>
          ))}
          {positioned.map(({ job, pct }) => (
            <div
              key={job.id}
              className={`absolute top-2 h-12 w-2 rounded-sm ${bandColor(job.weather_risk_score)} cursor-pointer transition-all hover:w-3`}
              style={{ left: `${pct}%` }}
              title={`${job.guest_name ?? job.title} — ${job.scheduled_time} — risk ${job.weather_risk_score ?? "—"}`}
            />
          ))}
        </div>
        <div className="mt-8 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> safe</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-yellow-500" /> warn</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-orange-500" /> high</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-destructive" /> extreme</span>
        </div>
      </CardContent>
    </Card>
  );
}

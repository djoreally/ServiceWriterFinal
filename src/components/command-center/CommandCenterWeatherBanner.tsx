/**
 * CommandCenterWeatherBanner — Surfaces Weather Guard decisions in the
 * Service Writer Command Center.
 *
 * Behavior:
 *  - Shows a compact banner counting upcoming jobs where the weather engine
 *    decided to BLOCK or SUGGEST_RESCHEDULE.
 *  - Lets the operator one-click apply the recommended action through the
 *    `weather-guard-action` edge function (which auto-blocks outdoor jobs
 *    and posts a suggested-reschedule status when configured to auto_execute).
 *  - Triggers a fresh evaluation on demand.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CloudRain, ShieldAlert, Loader2, RefreshCw, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  fetchUpcomingAtRisk,
  fetchDispatchRules,
  evaluateAppointmentNow,
  executeWeatherAction,
  type AtRiskAppointment,
  type WeatherDecision,
} from "@/application/queries/weather-guard.query";
import { useNavigate } from "react-router-dom";

interface Props {
  /** IDs of jobs visible in the command center, used to scope evaluation. */
  jobIds: string[];
  /** Called after a weather action runs so the Command Center can refresh. */
  onActionApplied?: () => void;
}

function decisionTone(decision: string | null) {
  switch (decision) {
    case "BLOCK":
      return { color: "destructive" as const, label: "Block outdoor", icon: ShieldAlert };
    case "SUGGEST_RESCHEDULE":
      return { color: "outline" as const, label: "Suggest reschedule", icon: CloudRain };
    case "WARN":
      return { color: "secondary" as const, label: "Warn", icon: CloudRain };
    default:
      return null;
  }
}

export function CommandCenterWeatherBanner({ jobIds, onActionApplied }: Props) {
  const navigate = useNavigate();
  const [running, setRunning] = useState<string | null>(null);
  const [evaluatingAll, setEvaluatingAll] = useState(false);

  const atRiskQuery = useQuery({
    queryKey: ["command-center", "weather-risk"],
    queryFn: fetchUpcomingAtRisk,
    refetchInterval: 60_000,
  });

  const rulesQuery = useQuery({
    queryKey: ["dispatch-rules"],
    queryFn: fetchDispatchRules,
  });

  const visibleRisky = useMemo(() => {
    const set = new Set(jobIds);
    return (atRiskQuery.data ?? []).filter(
      (j) =>
        set.has(j.id) &&
        (j.weather_decision === "BLOCK" || j.weather_decision === "SUGGEST_RESCHEDULE"),
    );
  }, [atRiskQuery.data, jobIds]);

  const autoActiveRule = useMemo(
    () => (rulesQuery.data ?? []).some((r) => r.active && r.auto_execute),
    [rulesQuery.data],
  );

  const reEvaluateAll = async () => {
    if (jobIds.length === 0) return;
    setEvaluatingAll(true);
    try {
      // Evaluate up to 10 of the visible jobs to keep request volume bounded.
      const batch = jobIds.slice(0, 10);
      await Promise.allSettled(batch.map((id) => evaluateAppointmentNow(id)));
      await atRiskQuery.refetch();
      toast.success(`Re-evaluated ${batch.length} jobs against the latest forecast.`);
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to evaluate jobs.");
    } finally {
      setEvaluatingAll(false);
    }
  };

  const applyAction = async (job: AtRiskAppointment) => {
    if (!job.weather_decision) return;
    setRunning(job.id);
    try {
      await executeWeatherAction(
        job.id,
        job.weather_decision as WeatherDecision,
        "Applied from Command Center",
      );
      toast.success(
        job.weather_decision === "BLOCK"
          ? `Blocked outdoor job “${job.guest_name ?? job.title}”.`
          : `Reschedule suggestion sent for “${job.guest_name ?? job.title}”.`,
      );
      await atRiskQuery.refetch();
      onActionApplied?.();
    } catch (e) {
      toast.error((e as Error).message ?? "Weather action failed.");
    } finally {
      setRunning(null);
    }
  };

  if (atRiskQuery.isLoading || visibleRisky.length === 0) return null;

  const blockCount = visibleRisky.filter((j) => j.weather_decision === "BLOCK").length;
  const rescheduleCount = visibleRisky.filter(
    (j) => j.weather_decision === "SUGGEST_RESCHEDULE",
  ).length;

  return (
    <Card className="mb-3 border-amber-300 bg-amber-50/70 dark:bg-amber-950/20">
      <CardContent className="py-2.5 px-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
            <CloudRain className="h-4 w-4 shrink-0" />
            <span className="font-medium">Weather Guard</span>
            <span>·</span>
            {blockCount > 0 && (
              <span>
                <strong>{blockCount}</strong> outdoor job{blockCount > 1 ? "s" : ""} flagged to
                block
              </span>
            )}
            {blockCount > 0 && rescheduleCount > 0 && <span>·</span>}
            {rescheduleCount > 0 && (
              <span>
                <strong>{rescheduleCount}</strong> suggested for reschedule
              </span>
            )}
            {autoActiveRule && (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                Auto rules active
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={reEvaluateAll}
              disabled={evaluatingAll}
            >
              {evaluatingAll ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Re-evaluate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => navigate("/weather-guard")}
            >
              Open Weather Guard
              <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {visibleRisky.slice(0, 4).map((job) => {
            const tone = decisionTone(job.weather_decision);
            if (!tone) return null;
            const Icon = tone.icon;
            return (
              <div
                key={job.id}
                className="flex items-center justify-between gap-2 rounded-md border border-amber-200/60 dark:border-amber-700/40 bg-background/60 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">
                    {job.guest_name ?? job.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {job.scheduled_date} · {job.scheduled_time?.slice(0, 5)} · risk{" "}
                    {job.weather_risk_score ?? "—"}
                  </p>
                </div>
                <Badge variant={tone.color} className="text-[10px] gap-1">
                  <Icon className="h-3 w-3" />
                  {tone.label}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  disabled={running === job.id}
                  onClick={() => applyAction(job)}
                >
                  {running === job.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : job.weather_decision === "BLOCK" ? (
                    "Block"
                  ) : (
                    "Reschedule"
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default CommandCenterWeatherBanner;

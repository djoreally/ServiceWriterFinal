import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CloudRain,
  Loader2,
  Clock,
  Thermometer,
  Wind,
  Droplets,
  AlertTriangle,
  Snowflake,
  Info,
  Layers,
  TrendingUp,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RiskStatCards } from "@/components/weather-guard/RiskStatCards";
import { RiskJobTable } from "@/components/weather-guard/RiskJobTable";
import { AlertFeed } from "@/components/weather-guard/AlertFeed";
import { RulesDrawer } from "@/components/weather-guard/RulesDrawer";
import {
  ensureDefaultRules,
  fetchDispatchRules,
  fetchUpcomingAtRisk,
  fetchRecentRiskLogs,
  fetchShopWeatherContext,
  type AtRiskAppointment,
} from "@/application/queries/weather-guard.query";
import { subscribeWeatherRiskLogs } from "@/application/queries/weather-guard.query";
import { cn } from "@/lib/utils";

const WeatherMap = lazy(() => import("@/components/weather-guard/WeatherMap"));

type Severity = "safe" | "warning" | "high" | "extreme";

function severityOf(job: AtRiskAppointment): Severity {
  const s = job.weather_risk_score ?? 0;
  if (s >= 80 || job.weather_decision === "BLOCK") return "extreme";
  if (s >= 60 || job.weather_decision === "SUGGEST_RESCHEDULE") return "high";
  if (s >= 40 || job.weather_decision === "WARN") return "warning";
  return "safe";
}

const SEV_STYLES: Record<
  Severity,
  { label: string; dot: string; ring: string; badge: string; card: string; text: string }
> = {
  safe: {
    label: "SAFE",
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/20",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    card: "bg-card border-border",
    text: "text-foreground",
  },
  warning: {
    label: "WARNING",
    dot: "bg-amber-500",
    ring: "ring-amber-500/20",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    card: "bg-card border-border",
    text: "text-foreground",
  },
  high: {
    label: "HIGH RISK",
    dot: "bg-orange-500",
    ring: "ring-orange-500/20",
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    card: "bg-orange-500/5 border-orange-500/30",
    text: "text-foreground",
  },
  extreme: {
    label: "EXTREME",
    dot: "bg-destructive animate-pulse",
    ring: "ring-destructive/20",
    badge: "bg-destructive text-destructive-foreground",
    card: "bg-destructive/5 border-destructive/30",
    text: "text-destructive",
  },
};

function formatTime(time: string) {
  const [h, m] = time.split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m));
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function hoursUntil(job: AtRiskAppointment): number {
  const t = new Date(`${job.scheduled_date}T${job.scheduled_time}`).getTime();
  return Math.max(0, Math.round((t - Date.now()) / 3_600_000));
}

export default function WeatherGuard() {
  const [seeded, setSeeded] = useState(false);
  const [layers, setLayers] = useState({ precipitation: true, wind: true, gps: true });

  useEffect(() => {
    ensureDefaultRules().finally(() => setSeeded(true));
  }, []);

  const rulesQuery = useQuery({
    queryKey: ["dispatch-rules"],
    queryFn: fetchDispatchRules,
    enabled: seeded,
  });

  const jobsQuery = useQuery({
    queryKey: ["weather-guard", "upcoming"],
    queryFn: fetchUpcomingAtRisk,
    enabled: seeded,
    refetchInterval: 60_000,
  });

  const logsQuery = useQuery({
    queryKey: ["weather-guard", "logs"],
    queryFn: () => fetchRecentRiskLogs(20),
    enabled: seeded,
    refetchInterval: 60_000,
  });

  const shopQuery = useQuery({
    queryKey: ["weather-guard", "shop-context"],
    queryFn: fetchShopWeatherContext,
    enabled: seeded,
  });

  useEffect(() => {
    const sub = subscribeWeatherRiskLogs(() => {
      logsQuery.refetch();
      jobsQuery.refetch();
    });
    return () => {
      sub.unsubscribe();
    };
  }, [logsQuery, jobsQuery]);


  const refreshAll = useCallback(() => {
    jobsQuery.refetch();
    logsQuery.refetch();
  }, [jobsQuery, logsQuery]);

  const jobs = jobsQuery.data ?? [];
  const rules = rulesQuery.data ?? [];
  const logs = logsQuery.data ?? [];
  const shop = shopQuery.data;

  // Build 48-hour forecast bins from jobs' risk scores
  const forecastBars = useMemo(() => {
    const bins = Array.from({ length: 12 }, () => 0); // 4h buckets
    for (const j of jobs) {
      const t = new Date(`${j.scheduled_date}T${j.scheduled_time}`).getTime();
      const hrs = (t - Date.now()) / 3_600_000;
      if (hrs < 0 || hrs > 48) continue;
      const idx = Math.min(11, Math.floor(hrs / 4));
      bins[idx] = Math.max(bins[idx], j.weather_risk_score ?? 0);
    }
    return bins;
  }, [jobs]);

  const trendingUp = forecastBars.slice(6).some((v) => v >= 60);

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)] -m-4 md:-m-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-4 border-b bg-card">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <CloudRain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">
                Weather Risk Dashboard
              </h1>
              <p className="text-xs text-muted-foreground">
                Live field operations intelligence
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="destructive" size="sm" className="rounded-md font-semibold">
              <AlertTriangle className="h-4 w-4 mr-1.5" />
              Emergency Protocol
            </Button>
          </div>
        </header>

        {/* Stat cards strip */}
        <div className="px-4 md:px-6 py-3 border-b bg-muted/20">
          <RiskStatCards jobs={jobs} />
        </div>

        {/* Dual-pane main area */}
        <div className="flex-1 flex overflow-hidden">
          {/* LEFT: Risk Intelligence Timeline */}
          <aside className="w-full max-w-[420px] hidden md:flex flex-col border-r bg-card/60 backdrop-blur">
            <div className="p-5 border-b">
              <h2 className="text-lg font-bold">Risk Intelligence</h2>
              <p className="text-sm text-muted-foreground">
                Active Monitoring Timeline
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-0">
              {jobs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No upcoming appointments in the next 48 hours.
                </div>
              ) : (
                jobs.slice(0, 10).map((job, idx) => {
                  const sev = severityOf(job);
                  const s = SEV_STYLES[sev];
                  const isLast = idx === Math.min(jobs.length, 10) - 1;
                  return (
                    <div key={job.id} className="relative pl-8 pb-6 group">
                      {!isLast && (
                        <div className="absolute left-[5px] top-3 bottom-0 w-px bg-border" />
                      )}
                      <div
                        className={cn(
                          "absolute left-0 top-2 w-3 h-3 rounded-md ring-4",
                          s.dot,
                          s.ring,
                        )}
                      />
                      <div
                        className={cn(
                          "border rounded-xl p-4 transition-shadow group-hover:shadow-md",
                          s.card,
                        )}
                      >
                        <div className="flex justify-between items-start mb-3 gap-2">
                          <div className="min-w-0">
                            <h3 className={cn("font-bold truncate", s.text)}>
                              {job.guest_name ?? job.title}
                            </h3>
                            <p className="text-xs text-muted-foreground truncate">
                              {job.location_address ?? "No address"}
                            </p>
                          </div>
                          <Badge
                            className={cn(
                              "rounded-md font-bold text-[10px] tracking-wider shrink-0",
                              s.badge,
                            )}
                            variant="secondary"
                          >
                            {s.label}
                          </Badge>
                        </div>
                        {sev !== "safe" && job.weather_decision && (
                          <p className="text-xs mb-3 text-muted-foreground">
                            Risk score {job.weather_risk_score ?? "—"} · decision{" "}
                            <span className="font-semibold">{job.weather_decision}</span>
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {formatTime(job.scheduled_time)}
                          </div>
                          <div className="flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            in {hoursUntil(job)}h
                          </div>
                          {sev === "extreme" && (
                            <div className="flex items-center gap-1 text-destructive">
                              <Snowflake className="h-3.5 w-3.5" /> Severe
                            </div>
                          )}
                          {sev === "high" && (
                            <div className="flex items-center gap-1 text-orange-500">
                              <Wind className="h-3.5 w-3.5" /> High winds
                            </div>
                          )}
                          {sev === "warning" && (
                            <div className="flex items-center gap-1 text-amber-600">
                              <Droplets className="h-3.5 w-3.5" /> Precip
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 48h Risk Forecast */}
            <div className="p-5 bg-muted/30 border-t">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-bold text-sm">48h Risk Forecast</h4>
                <span
                  className={cn(
                    "text-xs font-bold flex items-center gap-1",
                    trendingUp ? "text-destructive" : "text-emerald-600",
                  )}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  {trendingUp ? "Trending up" : "Stable"}
                </span>
              </div>
              <div className="flex items-end gap-1.5 h-20">
                {forecastBars.map((v, i) => {
                  const h = Math.max(8, v);
                  const isHigh = v >= 60;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 rounded-t-sm transition-all",
                        isHigh
                          ? "bg-destructive"
                          : v >= 40
                            ? "bg-orange-400"
                            : "bg-primary/30",
                        isHigh && i === forecastBars.findIndex((x) => x >= 60) && "animate-pulse",
                      )}
                      style={{ height: `${h}%` }}
                      title={`+${i * 4}h — risk ${v}`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                <span>Now</span>
                <span>+24h</span>
                <span>+48h</span>
              </div>
            </div>
          </aside>

          {/* RIGHT: Map + overlays */}
          <section className="flex-1 relative bg-muted">
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <div className="absolute inset-0 [&_.card]:!h-full [&>div]:h-full">
                <WeatherMap
                  lat={shop?.lat ?? null}
                  lng={shop?.lng ?? null}
                  address={shop?.address ?? null}
                  jobs={jobs}
                />
              </div>
            </Suspense>

            {/* Map Layers (top-left) */}
            <div className="absolute top-4 left-4 z-20 hidden lg:block">
              <Card className="w-48 shadow-xl border-border bg-card/95 backdrop-blur-md">
                <CardContent className="p-4">
                  <h5 className="text-[11px] font-bold mb-3 pb-2 border-b tracking-widest flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" /> MAP LAYERS
                  </h5>
                  <div className="space-y-3">
                    {(
                      [
                        ["precipitation", "Precipitation"],
                        ["wind", "Wind Gusts"],
                        ["gps", "Fleet GPS"],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={layers[key]}
                          onCheckedChange={(v) =>
                            setLayers((prev) => ({ ...prev, [key]: !!v }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Legend (bottom-right) */}
            <div className="absolute bottom-4 right-4 z-20 hidden lg:block">
              <Card className="shadow-2xl border-border bg-card/95 backdrop-blur-md max-w-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h5 className="font-bold text-sm">Weather Risk Legend</h5>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { color: "bg-emerald-500", label: "SAFE" },
                      { color: "bg-amber-500", label: "WARN" },
                      { color: "bg-orange-500", label: "HIGH" },
                      { color: "bg-destructive", label: "EXTREME" },
                    ].map((item) => (
                      <div key={item.label} className="flex flex-col gap-1.5">
                        <div className={cn("h-1.5 rounded-md", item.color)} />
                        <span className="text-[10px] font-bold text-center tracking-wider text-muted-foreground">
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Thermometer className="h-3.5 w-3.5" /> Live data
                    </span>
                    <span>{jobs.length} jobs tracked</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>

        {/* Bottom tabs: tables, alerts, rules */}
        <div className="border-t bg-card px-4 md:px-6 py-4 max-h-[40vh] overflow-y-auto">
          <Tabs defaultValue="jobs">
            <TabsList>
              <TabsTrigger value="jobs">At-risk jobs</TabsTrigger>
              <TabsTrigger value="alerts">Alert feed</TabsTrigger>
              <TabsTrigger value="rules">Dispatch rules</TabsTrigger>
            </TabsList>
            <TabsContent value="jobs" className="mt-3">
              <RiskJobTable jobs={jobs} onRefresh={refreshAll} />
            </TabsContent>
            <TabsContent value="alerts" className="mt-3">
              <AlertFeed logs={logs} />
            </TabsContent>
            <TabsContent value="rules" className="mt-3">
              <RulesDrawer rules={rules} onChange={() => rulesQuery.refetch()} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}

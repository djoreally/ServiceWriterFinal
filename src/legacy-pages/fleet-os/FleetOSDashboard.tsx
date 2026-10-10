/**
 * Fleet OS — Operations Center Dashboard (visual redesign).
 *
 * Cognitive-load design: the first viewport answers "what needs me right
 * now?" — 4 KPIs (mono numerals, one key metric), then a ranked attention
 * queue, then today's schedule. Everything below is supporting detail.
 *
 * - Signal (primary blue) is reserved for the primary CTA and the key metric.
 * - Status color comes from the canonical semantic registry, one hue per
 *   status family. No rainbow.
 * - Data (money, times, counts, WO numbers) renders in mono.
 * - Every data surface ships loading (skeleton), empty, error, and populated
 *   states. The page H1 is owned by TopHeader (FleetOSLayout title).
 * Data logic (queries, realtime tech updates, completion flow) is unchanged.
 */

import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { CompleteFleetWorkOrderDialog } from "@/components/fleet/CompleteFleetWorkOrderDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/layout/PagePrimitives";
import { useAuth } from "@packages/auth";
import { useRealtimeTechLocations } from "@/hooks/useRealtimeTechLocations";
import {
  fetchFleetOpsDashboard,
  type FleetOpsDashboard,
  type FleetOpsTechnicianRow,
} from "@/application/queries/fleet-ops-dashboard.query";
import { AlertTriangle, Calendar, ChevronRight, Plus, Wrench } from "lucide-react";
import { getSemanticStatus } from "@/lib/semantic-status";
import { cn } from "@/lib/utils";
import {
  FleetIntro,
  FleetKpi,
  FleetKpiSkeleton,
  FleetStatusPill,
  FleetListSkeleton,
  FleetError,
  fmtMoney,
} from "@/components/fleet/FleetViewPrimitives";

const timeFmt = (t: string | null) => {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${m} ${suffix}`;
};

/** Map legacy/raw statuses onto the canonical registry keys. */
const woStatusKey = (status: string) =>
  status === "pending_review" ? "blocked" : status;
const woStatusLabel = (status: string) =>
  status === "pending_review" ? "Pending review" : undefined;

const normalizeTechStatus = (t: FleetOpsTechnicianRow) => {
  const raw =
    t.status === "break" || t.status === "lunch" ? "on_break" : t.status;
  const meta = getSemanticStatus("technician", raw);
  if (meta.label === "Unknown") {
    return getSemanticStatus("technician", t.clockedIn ? "available" : "offline");
  }
  return meta;
};

/** Pipeline stages → registry keys for the status dots. */
const pipelineStageKey: Record<string, string> = {
  new: "new",
  assigned: "assigned",
  traveling: "en_route",
  onSite: "on_site",
  waitingApproval: "blocked",
  completed: "completed",
  invoiced: "invoiced",
};

type AttentionRow = {
  key: string;
  clientId: string;
  clientName: string;
  severity: number;
  overdue: number;
  dueThisWeek: number;
  upcoming: number;
  awaitingApproval: number;
};

const FleetOSDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<FleetOpsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [liveTechs, setLiveTechs] = useState<Record<string, FleetOpsTechnicianRow>>({});

  // Direct completion states
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);

  const metadataRole = user?.app_metadata?.role || user?.user_metadata?.role;
  const inferredRole = typeof metadataRole === "string" ? metadataRole : "provider_owner";
  const isBypassRole = ["admin", "provider_owner", "dispatcher", "ops_manager", "fleet_manager"].includes(inferredRole);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const d = await fetchFleetOpsDashboard(user.id);
        if (cancelled) return;
        setData(d);
        const map: Record<string, FleetOpsTechnicianRow> = {};
        d.technicians.forEach((t) => (map[t.id] = t));
        setLiveTechs(map);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Live technician location + status via realtime channel.
  useRealtimeTechLocations({
    userId: user?.id,
    enabled: Boolean(user?.id),
    onLocationUpdate: (update) => {
      setLiveTechs((prev) => {
        const existing = prev[update.techId];
        if (!existing) return prev;
        return {
          ...prev,
          [update.techId]: {
            ...existing,
            currentLocation: { lat: update.lat, lng: update.lng },
            status: update.status ?? existing.status,
          },
        };
      });
    },
    onStatusChange: (techId, newStatus) => {
      setLiveTechs((prev) => {
        const existing = prev[techId];
        if (!existing) return prev;
        return { ...prev, [techId]: { ...existing, status: newStatus } };
      });
    },
  });

  const techList = useMemo(
    () => (data ? data.technicians.map((t) => liveTechs[t.id] ?? t) : []),
    [data, liveTechs]
  );

  const kpis = data?.kpis;

  /** Attention queue, ranked: overdue → approvals → due this week → upcoming. */
  const attentionRows: AttentionRow[] = useMemo(() => {
    if (!data) return [];
    return data.attention
      .map((c) => ({
        key: c.fleetClientId,
        clientId: c.fleetClientId,
        clientName: c.clientName,
        severity:
          c.overdue > 0 ? 0 : c.awaitingApproval > 0 ? 1 : c.dueThisWeek > 0 ? 2 : 3,
        overdue: c.overdue,
        dueThisWeek: c.dueThisWeek,
        upcoming: c.upcoming,
        awaitingApproval: c.awaitingApproval,
      }))
      .sort((a, b) => a.severity - b.severity || b.overdue - a.overdue);
  }, [data]);

  const pipelineStages = data
    ? [
        { key: "new", label: "New", value: data.pipeline.new },
        { key: "assigned", label: "Assigned", value: data.pipeline.assigned },
        { key: "traveling", label: "Traveling", value: data.pipeline.traveling },
        { key: "onSite", label: "On Site", value: data.pipeline.onSite },
        { key: "waitingApproval", label: "Waiting Approval", value: data.pipeline.waitingApproval },
        { key: "completed", label: "Completed", value: data.pipeline.completed },
        { key: "invoiced", label: "Invoiced", value: data.pipeline.invoiced },
      ]
    : [];

  const inventoryRows = data
    ? [
        { label: "Oil grades", count: data.inventory.oil.length },
        { label: "Filters", count: data.inventory.filters.length },
        { label: "Drain plugs", count: data.inventory.drainPlugs.length },
        { label: "Shop supplies", count: data.inventory.supplies.length },
      ]
    : [];

  const pmDueTotal =
    (data?.forecast.today ?? 0) +
    (data?.forecast.thisWeek ?? 0) +
    (data?.forecast.thirtyDays ?? 0);

  const reload = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(false);
    try {
      setData(await fetchFleetOpsDashboard(user.id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <FleetOSLayout title="Fleet OS — Operations Center">
      <div className="space-y-6">
        <FleetIntro
          eyebrow="Fleet operations"
          description="Today's schedule, open work, and the accounts that need you — across every fleet you run."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => navigate("/fleet-os/work-orders/new")}>
                <Plus className="h-4 w-4 mr-1" /> New work order
              </Button>
              <Button size="sm" onClick={() => navigate("/fleet-os/scheduler")}>
                <Calendar className="h-4 w-4 mr-1" /> Schedule service
              </Button>
            </>
          }
        />

        {loading ? (
          <FleetKpiSkeleton count={4} />
        ) : error || !data ? (
          <FleetError
            title="Couldn't load the operations dashboard"
            message="Check your connection and try again. Your fleet data is safe."
            onRetry={reload}
          />
        ) : (
          <>
            {/* KPI strip — one key metric (today's revenue), everything else ink */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <FleetKpi
                label="Today's jobs"
                value={kpis?.todayJobs ?? 0}
                onClick={() => navigate("/fleet-os/scheduler")}
              />
              <FleetKpi
                label="Today's revenue"
                value={fmtMoney(kpis?.todayRevenue ?? 0)}
                tone="signal"
                onClick={() => navigate("/fleet-os/invoices")}
              />
              <FleetKpi
                label="Techs working"
                value={kpis?.techniciansWorking ?? 0}
                onClick={() => navigate("/fleet-os/command-center")}
              />
              <FleetKpi
                label="Overdue PMs"
                value={kpis?.overduePms ?? 0}
                tone={(kpis?.overduePms ?? 0) > 0 ? "critical" : "default"}
                hint={(kpis?.overduePms ?? 0) > 0 ? "Service is past due on these units" : "All PMs current"}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <div className="space-y-6 xl:col-span-2">
                {/* ── Needs attention: the first thing on the screen ── */}
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Needs attention
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {attentionRows.length === 0 ? (
                      <EmptyState
                        variant="inline"
                        title="All accounts current"
                        description="No overdue work, approvals waiting, or PMs due. The day is yours."
                      />
                    ) : (
                      <div className="divide-y divide-border">
                        {attentionRows.slice(0, 6).map((c) => (
                          <button
                            key={c.key}
                            onClick={() => navigate(`/fleet-os/clients/${c.clientId}`)}
                            className="flex w-full items-center justify-between gap-3 rounded px-2 py-2.5 text-left transition-colors hover:bg-muted/40"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                              {c.clientName}
                            </span>
                            <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                              {c.overdue > 0 && (
                                <FleetStatusPill domain="invoice" status="overdue" label={`${c.overdue} overdue`} />
                              )}
                              {c.awaitingApproval > 0 && (
                                <FleetStatusPill domain="appointment" status="blocked" label={`${c.awaitingApproval} approval`} />
                              )}
                              {c.dueThisWeek > 0 && (
                                <FleetStatusPill domain="appointment" status="scheduled" label={`${c.dueThisWeek} due`} />
                              )}
                              {c.upcoming > 0 && (
                                <FleetStatusPill domain="appointment" status="pending" label={`${c.upcoming} upcoming`} />
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {pmDueTotal > 0 && (
                      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
                        <Wrench className="h-4 w-4 shrink-0" />
                        <span>
                          PM due:{" "}
                          <span className="font-mono font-medium text-foreground">{data.forecast.today}</span> today
                          {" · "}
                          <span className="font-mono font-medium text-foreground">{data.forecast.thisWeek}</span> this week
                          {" · "}
                          <span className="font-mono font-medium text-foreground">{data.forecast.thirtyDays}</span> in 30 days
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ── Today's schedule ── */}
                <Card className="border-border">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      Today's schedule
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/fleet-os/scheduler")}>
                      View all <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {data.todaySchedule.length === 0 ? (
                      <EmptyState
                        variant="inline"
                        title="Nothing scheduled today"
                        description="Booked jobs show up here, in order."
                      />
                    ) : (
                      <div className="divide-y divide-border">
                        {data.todaySchedule.map((item) => (
                          <div
                            key={item.id}
                            className="flex cursor-pointer items-center gap-4 rounded px-2 py-3 transition-colors hover:bg-muted/40"
                            onClick={() => navigate(`/fleet-os/work-orders/${item.id}`)}
                          >
                            <div className="w-20 shrink-0 font-mono text-sm font-medium text-foreground">
                              {timeFmt(item.time)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{item.clientName}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {item.vehicleCount} {item.vehicleCount === 1 ? "vehicle" : "vehicles"}
                                {item.locationName && ` · ${item.locationName}`}
                                {item.technicianName && ` · ${item.technicianName}`}
                              </p>
                            </div>
                            <div
                              className="flex shrink-0 items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {item.total > 0 && (
                                <span className="font-mono text-sm font-medium">{fmtMoney(item.total)}</span>
                              )}
                              <FleetStatusPill
                                domain="appointment"
                                status={woStatusKey(item.status)}
                                label={woStatusLabel(item.status)}
                              />
                              {isBypassRole &&
                                ["scheduled", "assigned", "en_route", "arrived", "in_progress"].includes(item.status) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 shrink-0 border-emerald-500/30 px-2 text-xs text-emerald-600 hover:bg-emerald-500/10"
                                    onClick={() => {
                                      setSelectedWoId(item.id);
                                      setShowCompleteDialog(true);
                                    }}
                                  >
                                    Complete
                                  </Button>
                                )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ── Work order pipeline ── */}
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Work order pipeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
                      {pipelineStages.map((stage, i) => {
                        const meta = getSemanticStatus("appointment", pipelineStageKey[stage.key]);
                        return (
                          <div key={stage.key} className="relative">
                            <button
                              onClick={() => navigate(`/fleet-os/work-orders?stage=${stage.key}`)}
                              className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
                            >
                              <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                                <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dotClass)} />
                                {stage.label}
                              </p>
                              <p className="mt-1 font-mono text-2xl font-semibold">{stage.value}</p>
                            </button>
                            {i < pipelineStages.length - 1 && (
                              <ChevronRight className="pointer-events-none absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground/40 lg:block" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ── Right rail: supporting detail ── */}
              <div className="space-y-6">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Techs on the road</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {techList.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No active technicians
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {techList.map((t) => {
                          const meta = normalizeTechStatus(t);
                          const Icon = meta.icon;
                          return (
                            <div key={t.id} className="flex items-center gap-3 py-2.5">
                              <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dotClass)} />
                              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.badgeClass)}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{t.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {meta.label}
                                  {t.currentJob?.clientName && ` · ${t.currentJob.clientName}`}
                                  {t.currentLocation && " · GPS live"}
                                </p>
                              </div>
                              {t.currentJob && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigate(`/fleet-os/work-orders/${t.currentJob!.id}`)}
                                >
                                  View
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Revenue</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {[
                      { label: "Scheduled today", value: data.revenue.scheduledToday },
                      { label: "Completed", value: data.revenue.completedToday },
                      { label: "Pending approval", value: data.revenue.pendingApproval },
                      { label: "Outstanding", value: data.revenue.outstanding },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-mono font-semibold">{fmtMoney(row.value)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-lg">Low inventory</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/inventory")}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {data.inventory.totalLow === 0 ? (
                      <p className="py-2 text-center text-sm text-muted-foreground">
                        Inventory healthy
                      </p>
                    ) : (
                      <div className="space-y-2 text-sm">
                        {inventoryRows.map((row) => (
                          <div key={row.label} className="flex items-center justify-between">
                            <span className="text-muted-foreground">{row.label}</span>
                            <FleetStatusPill
                              domain="inventory"
                              status={row.count > 0 ? "low_stock" : "in_stock"}
                              label={row.count > 0 ? `${row.count} low` : "OK"}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* ── Top fleet customers ── */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Top fleet customers</CardTitle>
              </CardHeader>
              <CardContent>
                {data.health.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No completed work orders yet
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {data.health.map((c) => (
                      <button
                        key={c.fleetClientId}
                        onClick={() => navigate(`/fleet-os/clients/${c.fleetClientId}`)}
                        className="rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/40"
                      >
                        <p className="truncate text-sm font-semibold">{c.clientName}</p>
                        <p className="mb-3 mt-0.5 font-mono text-xs text-muted-foreground">
                          {c.vehicleCount} {c.vehicleCount === 1 ? "vehicle" : "vehicles"}
                        </p>
                        <div className="space-y-2 text-sm">
                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">PM compliance</span>
                              <span className="font-mono font-medium">{c.pmCompliance}%</span>
                            </div>
                            <Progress value={c.pmCompliance} className="h-1.5" />
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Outstanding</span>
                            <span className="font-mono font-medium">{fmtMoney(c.outstandingAr)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Lifetime</span>
                            <span className="font-mono font-medium">{fmtMoney(c.lifetimeRevenue)}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {loading && !error && (
          <div className="space-y-6">
            <FleetListSkeleton rows={3} />
            <FleetListSkeleton rows={5} />
          </div>
        )}
      </div>

      <CompleteFleetWorkOrderDialog
        open={showCompleteDialog}
        onOpenChange={(open) => { setShowCompleteDialog(open); if (!open) setSelectedWoId(null); }}
        workOrderId={selectedWoId}
        workOrderLabel="Work order"
        onCompleted={async () => {
          if (!user?.id) return;
          try {
            setData(await fetchFleetOpsDashboard(user.id));
          } catch {
            setError(true);
          }
        }}
      />
    </FleetOSLayout>
  );
};

export default FleetOSDashboard;

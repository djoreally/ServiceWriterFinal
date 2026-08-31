/**
 * Fleet OS — Operations Center Dashboard (Phase 1)
 *
 * Operations-first layout: KPIs, today's schedule, customer attention,
 * work order pipeline, technician status, revenue, PM forecast,
 * customer health, inventory signals, quick actions.
 *
 * Data source: fetchFleetOpsDashboard (single Promise.all aggregator).
 */

import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { CompleteFleetWorkOrderDialog } from "@/components/fleet/CompleteFleetWorkOrderDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@packages/auth";
import { useRealtimeTechLocations } from "@/hooks/useRealtimeTechLocations";
import {
  fetchFleetOpsDashboard,
  type FleetOpsDashboard,
  type FleetOpsTechnicianRow,
} from "@/application/queries/fleet-ops-dashboard.query";
import {
  Briefcase,
  DollarSign,
  Car,
  Building2,
  Users,
  AlertTriangle,
  Receipt,
  HeartPulse,
  Calendar,
  ChevronRight,
  Circle,
  Coffee,
  Truck,
  Wrench,
  Plus,
  ScanLine,
  FileText,
  Upload,
  PackagePlus,
  MapPin,
  Activity,
} from "lucide-react";

const currency = (n: number) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const timeFmt = (t: string | null) => {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${m} ${suffix}`;
};

const techStatusMeta: Record<
  string,
  { label: string; icon: typeof Circle; className: string }
> = {
  driving: { label: "Driving", icon: Truck, className: "bg-blue-500/10 text-blue-600" },
  en_route: { label: "Driving", icon: Truck, className: "bg-blue-500/10 text-blue-600" },
  on_site: { label: "On Site", icon: Wrench, className: "bg-amber-500/10 text-amber-600" },
  arrived: { label: "On Site", icon: Wrench, className: "bg-amber-500/10 text-amber-600" },
  in_progress: { label: "On Site", icon: Wrench, className: "bg-amber-500/10 text-amber-600" },
  break: { label: "Lunch", icon: Coffee, className: "bg-purple-500/10 text-purple-600" },
  lunch: { label: "Lunch", icon: Coffee, className: "bg-purple-500/10 text-purple-600" },
  available: { label: "Available", icon: Circle, className: "bg-emerald-500/10 text-emerald-600" },
  offline: { label: "Offline", icon: Circle, className: "bg-muted text-muted-foreground" },
};

const woStatusBadge = (status: string) => {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    scheduled: "bg-blue-500/10 text-blue-600",
    assigned: "bg-indigo-500/10 text-indigo-600",
    in_progress: "bg-amber-500/10 text-amber-600",
    completed: "bg-emerald-500/10 text-emerald-600",
    invoiced: "bg-purple-500/10 text-purple-600",
    pending_review: "bg-orange-500/10 text-orange-600",
  };
  return (
    <Badge variant="secondary" className={map[status] || map.draft}>
      {status.replace("_", " ")}
    </Badge>
  );
};

const FleetOSDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<FleetOpsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
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
    void Promise.resolve().then(() => setLoading(true));
    void Promise.resolve().then(() => fetchFleetOpsDashboard(user.id)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        const map: Record<string, FleetOpsTechnicianRow> = {};
        d.technicians.forEach((t) => (map[t.id] = t));
        setLiveTechs(map);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      }));
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

  const kpiCards = [
    { label: "Today's Jobs", value: kpis?.todayJobs ?? 0, icon: Briefcase, color: "text-blue-500" },
    { label: "Today's Revenue", value: currency(kpis?.todayRevenue ?? 0), icon: DollarSign, color: "text-emerald-500" },
    { label: "Vehicles Scheduled", value: kpis?.vehiclesScheduledToday ?? 0, icon: Car, color: "text-indigo-500" },
    { label: "Fleet Customers", value: kpis?.fleetCustomers ?? 0, icon: Building2, color: "text-cyan-500" },
    { label: "Techs Working", value: kpis?.techniciansWorking ?? 0, icon: Users, color: "text-amber-500" },
    { label: "Overdue PMs", value: kpis?.overduePms ?? 0, icon: AlertTriangle, color: (kpis?.overduePms ?? 0) > 0 ? "text-red-500" : "text-muted-foreground" },
    { label: "Outstanding", value: currency(kpis?.outstandingInvoices ?? 0), icon: Receipt, color: "text-purple-500" },
    { label: "Fleet Health", value: `${kpis?.fleetHealth ?? 0}%`, icon: HeartPulse, color: (kpis?.fleetHealth ?? 100) >= 90 ? "text-emerald-500" : (kpis?.fleetHealth ?? 100) >= 75 ? "text-amber-500" : "text-red-500" },
  ];

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

  const quickActions = [
    { label: "New Fleet Customer", icon: Building2, onClick: () => navigate("/fleet-os/clients/new") },
    { label: "Schedule Service", icon: Calendar, onClick: () => navigate("/fleet-os/scheduler") },
    { label: "Create Work Order", icon: Plus, onClick: () => navigate("/fleet-os/work-orders/new") },
    { label: "Add Vehicle", icon: Car, onClick: () => navigate("/fleet-os/vehicles") },
    { label: "Import Fleet", icon: Upload, onClick: () => navigate("/fleet-os/vehicles/import") },
    { label: "Scan VIN", icon: ScanLine, onClick: () => navigate("/fleet-os/vehicles?scan=1") },
    { label: "Create Estimate", icon: FileText, onClick: () => navigate("/fleet-os/work-orders/new?estimate=1") },
    { label: "Receive Inventory", icon: PackagePlus, onClick: () => navigate("/inventory") },
    { label: "Invoice Customer", icon: Receipt, onClick: () => navigate("/fleet-os/invoices") },
  ];

  return (
    <FleetOSLayout title="Fleet OS — Operations Center">
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label} className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  <span className="text-xs text-muted-foreground truncate">{kpi.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {loading ? "—" : kpi.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid xl:grid-cols-3 gap-6">
          {/* Today's Schedule */}
          <Card className="xl:col-span-2">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-500" />
                Today's Schedule
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/fleet-os/scheduler")}>
                View all <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !data || data.todaySchedule.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nothing scheduled today
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {data.todaySchedule.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer px-2 -mx-2 rounded"
                      onClick={() => navigate(`/fleet-os/work-orders/${item.id}`)}
                    >
                      <div className="w-20 text-sm font-medium text-foreground shrink-0">
                        {timeFmt(item.time)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.clientName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.vehicleCount} {item.vehicleCount === 1 ? "vehicle" : "vehicles"}
                          {item.locationName && ` • ${item.locationName}`}
                          {item.technicianName && ` • ${item.technicianName}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {item.total > 0 && (
                          <span className="text-xs font-medium">{currency(item.total)}</span>
                        )}
                        {woStatusBadge(item.status)}
                        {isBypassRole && ["scheduled", "assigned", "en_route", "arrived", "in_progress"].includes(item.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 px-2 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
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

          {/* Revenue Widget */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                Revenue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Scheduled Today", value: data?.revenue.scheduledToday ?? 0 },
                { label: "Completed", value: data?.revenue.completedToday ?? 0 },
                { label: "Pending Approval", value: data?.revenue.pendingApproval ?? 0 },
                { label: "Outstanding", value: data?.revenue.outstanding ?? 0 },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{row.label}</span>
                  <span className="text-sm font-semibold">{currency(row.value)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Work Order Pipeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Work Order Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {pipelineStages.map((stage, i) => (
                <div key={stage.key} className="relative">
                  <button
                    onClick={() => navigate(`/fleet-os/work-orders?stage=${stage.key}`)}
                    className="w-full text-left rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors p-3"
                  >
                    <p className="text-xs text-muted-foreground truncate">{stage.label}</p>
                    <p className="text-2xl font-bold mt-1">
                      {loading ? "—" : stage.value}
                    </p>
                  </button>
                  {i < pipelineStages.length - 1 && (
                    <ChevronRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 pointer-events-none" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Customers Requiring Attention */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Customers Requiring Attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !data || data.attention.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  All accounts current
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {data.attention.slice(0, 6).map((c) => (
                    <button
                      key={c.fleetClientId}
                      onClick={() => navigate(`/fleet-os/clients/${c.fleetClientId}`)}
                      className="flex items-center justify-between w-full py-2.5 hover:bg-muted/30 rounded px-2 -mx-2 transition-colors text-left"
                    >
                      <span className="text-sm font-medium truncate flex-1">{c.clientName}</span>
                      <div className="flex items-center gap-1.5 text-xs shrink-0">
                        {c.overdue > 0 && (
                          <Badge variant="secondary" className="bg-red-500/10 text-red-600">
                            {c.overdue} overdue
                          </Badge>
                        )}
                        {c.dueThisWeek > 0 && (
                          <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
                            {c.dueThisWeek} due
                          </Badge>
                        )}
                        {c.upcoming > 0 && (
                          <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
                            {c.upcoming} upcoming
                          </Badge>
                        )}
                        {c.awaitingApproval > 0 && (
                          <Badge variant="secondary" className="bg-orange-500/10 text-orange-600">
                            {c.awaitingApproval} approval
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Technician Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-500" />
                Technician Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : techList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No active technicians
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {techList.map((t) => {
                    const meta =
                      techStatusMeta[t.status] ??
                      (t.clockedIn ? techStatusMeta.available : techStatusMeta.offline);
                    const Icon = meta.icon;
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 py-2.5"
                      >
                        <div className={`h-8 w-8 rounded-md flex items-center justify-center ${meta.className}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {meta.label}
                            {t.currentJob?.clientName && ` • ${t.currentJob.clientName}`}
                            {t.currentLocation && ` • GPS live`}
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
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* PM Forecast */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                PM Forecast
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="today">
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="today">Today</TabsTrigger>
                  <TabsTrigger value="week">Week</TabsTrigger>
                  <TabsTrigger value="next">Next</TabsTrigger>
                  <TabsTrigger value="thirty">30d</TabsTrigger>
                </TabsList>
                {(["today", "week", "next", "thirty"] as const).map((k) => {
                  const map = {
                    today: data?.forecast.today ?? 0,
                    week: data?.forecast.thisWeek ?? 0,
                    next: data?.forecast.nextWeek ?? 0,
                    thirty: data?.forecast.thirtyDays ?? 0,
                  };
                  return (
                    <TabsContent key={k} value={k} className="mt-4 text-center">
                      <p className="text-4xl font-bold text-foreground">{map[k]}</p>
                      <p className="text-xs text-muted-foreground mt-1">vehicles due</p>
                    </TabsContent>
                  );
                })}
              </Tabs>
            </CardContent>
          </Card>

          {/* Inventory Signals */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <PackagePlus className="h-4 w-4 text-orange-500" />
                Low Inventory
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/inventory")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : !data || data.inventory.totalLow === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Inventory healthy
                </p>
              ) : (
                <div className="space-y-2 text-sm">
                  {[
                    { label: "Oil Grades", items: data.inventory.oil },
                    { label: "Filters", items: data.inventory.filters },
                    { label: "Drain Plugs", items: data.inventory.drainPlugs },
                    { label: "Shop Supplies", items: data.inventory.supplies },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{row.label}</span>
                      <Badge
                        variant="secondary"
                        className={
                          row.items.length > 0
                            ? "bg-orange-500/10 text-orange-600"
                            : "bg-emerald-500/10 text-emerald-600"
                        }
                      >
                        {row.items.length > 0 ? `${row.items.length} low` : "OK"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fleet Map placeholder — embed link */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Fleet Map
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/fleet-os")}
              >
                Open
              </Button>
            </CardHeader>
            <CardContent>
              <button
                onClick={() => navigate("/fleet-os")}
                className="w-full h-40 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors flex flex-col items-center justify-center text-muted-foreground"
              >
                <MapPin className="h-8 w-8 mb-2" />
                <p className="text-xs">{techList.filter((t) => t.currentLocation).length} techs live</p>
              </button>
            </CardContent>
          </Card>
        </div>

        {/* Customer Health */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-rose-500" />
              Top Fleet Customers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !data || data.health.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No completed work orders yet
              </p>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
                {data.health.map((c) => (
                  <button
                    key={c.fleetClientId}
                    onClick={() => navigate(`/fleet-os/clients/${c.fleetClientId}`)}
                    className="text-left rounded-lg border border-border p-4 hover:border-primary/40 transition-colors"
                  >
                    <p className="text-sm font-semibold truncate">{c.clientName}</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      {c.vehicleCount} {c.vehicleCount === 1 ? "vehicle" : "vehicles"}
                    </p>
                    <div className="space-y-2">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">PM Compliance</span>
                          <span className="font-medium">{c.pmCompliance}%</span>
                        </div>
                        <Progress value={c.pmCompliance} className="h-1.5" />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Outstanding</span>
                        <span className="font-medium">{currency(c.outstandingAr)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">LTV</span>
                        <span className="font-medium">{currency(c.lifetimeRevenue)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Monthly avg</span>
                        <span className="font-medium">{currency(c.monthlyAverage)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Last visit</span>
                        <span className="font-medium">
                          {c.lastVisit ? new Date(c.lastVisit).toLocaleDateString() : "—"}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
              {quickActions.map((a) => (
                <button
                  key={a.label}
                  onClick={a.onClick}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 hover:border-primary/40 hover:bg-muted/30 transition-colors text-center"
                >
                  <a.icon className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium leading-tight">{a.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <CompleteFleetWorkOrderDialog
        open={showCompleteDialog}
        onOpenChange={(open) => { setShowCompleteDialog(open); if (!open) setSelectedWoId(null); }}
        workOrderId={selectedWoId}
        workOrderLabel="Work order"
        onCompleted={async () => {
          if (!user?.id) return;
          setData(await fetchFleetOpsDashboard(user.id));
        }}
      />
    </FleetOSLayout>
  );
};

export default FleetOSDashboard;

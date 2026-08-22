import { useEffect, useMemo, useState } from "react";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@packages/auth";
import { toast } from "sonner";
import {
  fetchFleetReportPageData,
  type FleetReportPageData,
} from "@/application/queries";
import {
  BarChart3,
  DollarSign,
  Car,
  MapPin,
  Gauge,
  Calendar,
  Clock,
  ShoppingCart,
  Receipt,
  Download,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import {
  approveServiceSchedulesInBulk,
  assignRouteBatchForSchedules,
  fetchFleetOperationsOverview,
  fetchUpcomingServiceQueue,
  generateFleetServiceSchedules,
} from "@/application/services/fleet-operations/fleet-operations.service";
import type { FleetOperationsOverview, FleetUpcomingQueueRow } from "@/application/services/fleet-operations/types";

const FleetReportsPage = () => {
  const { user } = useAuth();
  const [pageData, setPageData] = useState<FleetReportPageData | null>(null);
  const [opsData, setOpsData] = useState<FleetOperationsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueRows, setQueueRows] = useState<FleetUpcomingQueueRow[]>([]);
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    const fetch = async () => {
      setLoading(true);
      const data = await fetchFleetReportPageData(user.id);
      const ops = await fetchFleetOperationsOverview(user.id);
      const queue = await fetchUpcomingServiceQueue(user.id);
      setPageData(data);
      setOpsData(ops);
      setQueueRows(queue);
      setLoading(false);
    };
    fetch();
  }, [user?.id]);

  const stats = pageData?.stats ?? {
    totalSpend: 0, vehicleCount: 0, locationCount: 0,
    avgCostPerVehicle: 0, openApprovals: 0, overdueVehicles: 0,
    poOpenCount: 0, invoicesPending: 0,
  };
  const topVehicles = pageData?.topVehicles ?? [];
  const dueRows = opsData?.vehiclesDue ?? [];
  const overdueRows = opsData?.vehiclesOverdue ?? [];
  const upcomingWorkload = opsData?.upcomingWorkload ?? [];
  const historyRollups = opsData?.serviceHistoryRollups ?? [];
  const groupedCounts = opsData?.groupedCounts;
  const selectedQueueRows = useMemo(
    () => queueRows.filter((row) => selectedQueueIds.includes(row.id)),
    [queueRows, selectedQueueIds],
  );

  const reportCards = [
    { label: "Total Spend", value: `$${stats.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-emerald-500" },
    { label: "Fleet Size", value: stats.vehicleCount, icon: Car, color: "text-blue-500" },
    { label: "Avg Cost / Vehicle", value: `$${stats.avgCostPerVehicle.toFixed(2)}`, icon: TrendingUp, color: "text-purple-500" },
    { label: "Locations", value: stats.locationCount, icon: MapPin, color: "text-amber-500" },
    { label: "Open POs", value: stats.poOpenCount, icon: ShoppingCart, color: "text-orange-500" },
    { label: "Pending Invoices", value: stats.invoicesPending, icon: Receipt, color: "text-red-500" },
  ];

  return (
    <FleetOSLayout title="Reports">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Fleet analytics, spend tracking, and SLA compliance
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={scheduling || !user?.id}
              onClick={async () => {
                if (!user?.id) return;
                setScheduling(true);
                const created = await generateFleetServiceSchedules(user.id, 90);
                const ops = await fetchFleetOperationsOverview(user.id);
                const queue = await fetchUpcomingServiceQueue(user.id);
                setOpsData(ops);
                setQueueRows(queue);
                setScheduling(false);
                toast.success(`${created} service schedule rows generated`);
              }}
            >
              <Calendar className="h-4 w-4 mr-1" /> Generate 90d Schedule
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" /> Export PDF
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {reportCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                </div>
                <p className="text-xl font-bold">{loading ? "—" : card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Spend Per Vehicle */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Top Vehicles by Spend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : topVehicles.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No spend data yet</p>
              ) : (
                <div className="space-y-3">
                  {topVehicles.map((item, i) => {
                    const v = item.vehicle;
                    const pct = stats.totalSpend > 0 ? (item.total / stats.totalSpend) * 100 : 0;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="truncate">
                            {v ? `${v.year} ${v.make} ${v.model}` : "Unknown"}
                            {v?.unit_number && <span className="text-muted-foreground ml-1">#{v.unit_number}</span>}
                          </span>
                          <span className="font-medium shrink-0 ml-2">${item.total.toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-md overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-md"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Available Reports */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Available Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { name: "Spend per Vehicle", desc: "Cost breakdown by vehicle", icon: Car },
                  { name: "Spend per Location", desc: "Cost breakdown by service site", icon: MapPin },
                  { name: "Service Frequency", desc: "Intervals and cadence analysis", icon: Calendar },
                  { name: "Upcoming Due Vehicles", desc: "Vehicles due for service", icon: Clock },
                  { name: "PO Utilization", desc: "PO spend vs. authorized limits", icon: ShoppingCart },
                  { name: "Invoice Aging", desc: "Outstanding invoice age report", icon: Receipt },
                ].map((report) => (
                  <button
                    key={report.name}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left text-sm hover:bg-muted transition-colors"
                  >
                    <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <report.icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{report.name}</p>
                      <p className="text-xs text-muted-foreground">{report.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-teal-500" />
                Fleet vs Customer Dimensions
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded border p-2">
                <p className="font-medium mb-1">By Fleet Account</p>
                {(groupedCounts?.byFleet || []).slice(0, 5).map((entry) => (
                  <p key={entry.key} className="text-muted-foreground">{entry.label}: {entry.count}</p>
                ))}
              </div>
              <div className="rounded border p-2">
                <p className="font-medium mb-1">By Customer</p>
                {(groupedCounts?.byCustomer || []).slice(0, 5).map((entry) => (
                  <p key={entry.key} className="text-muted-foreground">{entry.label}: {entry.count}</p>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Vehicles Due / Overdue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="font-medium">{overdueRows.length}</span> overdue • <span className="font-medium">{dueRows.length}</span> due soon</p>
              <div className="max-h-56 overflow-auto space-y-2">
                {[...overdueRows, ...dueRows].slice(0, 12).map((row) => (
                  <div key={`${row.vehicleId}-${row.nextDueDate}`} className="rounded border p-2">
                    <p className="font-medium">{row.year} {row.make} {row.model} {row.unitNumber ? `#${row.unitNumber}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{row.status} • due {row.nextDueDate || "—"} • {row.baseLaborPackage}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-500" />
                Upcoming Workload
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {upcomingWorkload.length === 0 ? (
                <p className="text-muted-foreground">No upcoming workload generated.</p>
              ) : (
                upcomingWorkload.slice(0, 10).map((entry) => (
                  <div key={entry.weekStart} className="flex items-center justify-between rounded border p-2">
                    <span>Week of {entry.weekStart}</span>
                    <span className="font-semibold">{entry.count} vehicles</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-500" />
              Fleet Ops Queue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!user?.id || selectedQueueRows.length === 0 || queueLoading}
                onClick={async () => {
                  if (!user?.id) return;
                  setQueueLoading(true);
                  const approved = await approveServiceSchedulesInBulk({
                    userId: user.id,
                    scheduleIds: selectedQueueRows.map((row) => row.id),
                  });
                  setQueueRows(await fetchUpcomingServiceQueue(user.id));
                  setQueueLoading(false);
                  toast.success(`${approved} schedule row(s) approved`);
                }}
              >
                Approve Selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!user?.id || selectedQueueRows.length === 0 || queueLoading}
                onClick={async () => {
                  if (!user?.id) return;
                  setQueueLoading(true);
                  const routeBatchKey = `route-${new Date().toISOString().slice(0, 10)}-${selectedQueueRows.length}`;
                  const scheduled = await assignRouteBatchForSchedules({
                    userId: user.id,
                    scheduleIds: selectedQueueRows.map((row) => row.id),
                    routeBatchKey,
                  });
                  setQueueRows(await fetchUpcomingServiceQueue(user.id));
                  setQueueLoading(false);
                  toast.success(`${scheduled} schedule row(s) assigned to ${routeBatchKey}`);
                }}
              >
                Assign Route Batch
              </Button>
            </div>

            <div className="max-h-80 overflow-auto space-y-2">
              {queueRows.slice(0, 30).map((row) => (
                <button
                  key={row.id}
                  onClick={() => {
                    setSelectedQueueIds((prev) =>
                      prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id]
                    );
                  }}
                  className={`w-full rounded border p-2 text-left ${selectedQueueIds.includes(row.id) ? "border-primary bg-primary/5" : ""}`}
                >
                  <p className="font-medium">{row.vehicleLabel || "Vehicle"} • {row.fleetClientName || "Unassigned"}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.locationName || "No location"} • due {row.dueDate || "—"} • {row.queueStatus}
                    {row.routeBatchKey ? ` • ${row.routeBatchKey}` : ""}
                  </p>
                </button>
              ))}
              {queueRows.length === 0 && (
                <p className="text-muted-foreground">No queue rows available.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-500" />
              Service History Rollups
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {historyRollups.length === 0 ? (
              <p className="text-muted-foreground">No service history yet.</p>
            ) : (
              historyRollups.map((rollup) => (
                <div key={rollup.fleetClientId || "unknown"} className="grid grid-cols-3 rounded border p-2">
                  <span>{rollup.fleetClientName}</span>
                  <span>{rollup.completedServices30d} (30d)</span>
                  <span>{rollup.completedServices90d} (90d)</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </FleetOSLayout>
  );
};

export default FleetReportsPage;

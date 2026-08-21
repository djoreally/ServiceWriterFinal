import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { fetchReportsCanonical, fetchServiceWriterAudit, type ReportsKpi, type ReportsRange, type ServiceWriterAuditResult } from "@/application/queries/reports-canonical.query";
import { fetchRawReportingRecords, pivotDataset, type UnifiedReportingRecord } from "@/application/queries/dynamic-custom-reports.query";
import type { DimensionSchema, DynamicReportConfig, MeasureSchema } from "@/types/reporting";
import { REPORT_METRICS } from "@/lib/reports-metrics";
import { fetchBookingFunnel, type BookingFunnelData } from "@/application/queries/reports-funnel.query";
import { fetchLocationDemographicCustomers, getCurrentUserId, type LocationDemographicCustomer } from "@/application/queries/customer-segmentation.query";
import { GoogleInsightsConnections } from "@/components/reports/GoogleInsightsConnections";
import { fetchCustomerAnalytics, fetchEarliestActivityDate, fetchTechniciansForReports, type CustomerAnalytics, type TechnicianRef } from "@/application/queries/reports-tabs.query";
import { fetchFleetReportPageData, type FleetReportPageData } from "@/application/queries/fleet-reports.query";
import { backfillAppointmentCoordinates } from "@/application/commands/geocode-appointments.command";
import { toast } from "@/hooks/use-toast";
import { format, startOfMonth, startOfYear, subDays } from "date-fns";
import { AlertTriangle, CalendarDays, Clock3, Download, Info, MapPin, RefreshCw, Search, Settings2, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { errorMessage } from "@/lib/error-message";

type RangeKey = "today" | "7d" | "30d" | "mtd" | "qtd" | "ytd" | "all";
type DataScope = "native" | "all";

const RANGE_LABELS: Record<RangeKey, string> = { today: "Today", "7d": "7 days", "30d": "30 days", mtd: "Month to date", qtd: "Quarter to date", ytd: "Year to date", all: "All time" };

function buildRange(key: RangeKey, earliest: Date | null): ReportsRange {
  const now = new Date();
  if (key === "today") return { from: now, to: now, label: "Today" };
  if (key === "7d") return { from: subDays(now, 6), to: now, label: "Last 7 days" };
  if (key === "30d") return { from: subDays(now, 29), to: now, label: "Last 30 days" };
  if (key === "mtd") return { from: startOfMonth(now), to: now, label: "Month to date" };
  if (key === "qtd") return { from: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1), to: now, label: "Quarter to date" };
  if (key === "ytd") return { from: startOfYear(now), to: now, label: "Year to date" };
  return { from: earliest ?? new Date(2020, 0, 1), to: now, label: "All time" };
}

const percent = (part: number, whole: number) => whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0;
const trendPercent = (current: number, previous: number) => previous > 0 ? ((current - previous) / previous) * 100 : null;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type CohortRow = { label: string; bookings: number; billed: number; collected: number; avgTicket: number };
type LocationBucket = { label: string; customers: number; bookings: number; billed: number; services: number };
type SpatialPoint = { label: string; latitude: number; longitude: number; bookings: number; billed: number };

const summarizeCohorts = (records: UnifiedReportingRecord[], getLabel: (record: UnifiedReportingRecord) => string): CohortRow[] => {
  const grouped = records.reduce<Record<string, CohortRow>>((acc, record) => {
    const label = getLabel(record);
    const row = acc[label] || { label, bookings: 0, billed: 0, collected: 0, avgTicket: 0 };
    row.bookings += record.job_count;
    row.billed += record.total_billed;
    row.collected += record.net_collected;
    row.avgTicket = row.bookings ? row.billed / row.bookings : 0;
    acc[label] = row;
    return acc;
  }, {});
  return Object.values(grouped).sort((a, b) => b.bookings - a.bookings || b.billed - a.billed);
};

const getCustomerZip = (customer: LocationDemographicCustomer) => customer.postal_code?.trim() || customer.address?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5) || "Unknown ZIP";
const getCustomerCity = (customer: LocationDemographicCustomer) => {
  const parts = (customer.address || "").split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "Unknown city";
};

function StatCard({ label, value, detail, tone = "default", trend }: { label: string; value: string; detail: string; tone?: "default" | "success" | "warning" | "danger"; trend?: number | null }) {
  const tones = { default: "border-l-primary", success: "border-l-emerald-500", warning: "border-l-amber-500", danger: "border-l-destructive" };
  return <Card density="compact" className={`border-l-4 ${tones[tone]}`}><CardContent><p className="text-xs font-medium text-muted-foreground">{label}</p><div className="mt-1 flex items-end justify-between gap-2"><p className="text-xl font-semibold tabular-nums">{value}</p>{trend != null && <span className={`flex items-center text-xs font-medium ${trend >= 0 ? "text-[hsl(var(--intent-success))]" : "text-destructive"}`}>{trend >= 0 ? <TrendingUp className="mr-1 h-3.5 w-3.5" /> : <TrendingDown className="mr-1 h-3.5 w-3.5" />}{Math.abs(trend).toFixed(1)}%</span>}</div><p className="mt-1 text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: string }) {
  return <Card className="border-dashed"><CardContent className="flex min-h-40 flex-col items-center justify-center p-6 text-center"><Info className="mb-3 h-6 w-6 text-muted-foreground" /><p className="font-medium">{title}</p><p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>{action && <p className="mt-3 text-xs font-medium text-primary">{action}</p>}</CardContent></Card>;
}

function AuditTable({ title, rows }: { title: string; rows: Array<{ label: string; count: number; detail: string; action?: string }> }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Check</TableHead><TableHead className="text-right">Records</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.label}><TableCell><p className="text-sm font-medium">{row.label}</p><p className="text-xs text-muted-foreground">{row.detail}</p>{row.action && <p className="mt-1 text-xs text-primary">{row.action}</p>}</TableCell><TableCell className="text-right font-semibold tabular-nums">{row.count}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>;
}

const DIMENSIONS: Array<{ key: keyof DimensionSchema; label: string }> = [
  { key: "client_type", label: "Business line" }, { key: "status", label: "Status" }, { key: "city", label: "City" }, { key: "postal_code", label: "ZIP" }, { key: "make", label: "Vehicle make" }, { key: "oil_type", label: "Oil type" }, { key: "technician_name", label: "Technician" },
];
const MEASURES: Array<{ key: keyof MeasureSchema; label: string }> = [
  { key: "total_billed", label: "Billed" }, { key: "net_collected", label: "Collected" }, { key: "balance_due", label: "Balance due" }, { key: "job_count", label: "Jobs" }, { key: "quarts_used", label: "Oil quarts" }, { key: "duration_minutes", label: "Duration" },
];

export default function Reports() {
  const { formatCurrency } = useRegionalSettings();
  const [rangeKey, setRangeKey] = useState<RangeKey>("all");
  const [dataScope, setDataScope] = useState<DataScope>("native");
  const [data, setData] = useState<ReportsKpi | null>(null);
  const [audit, setAudit] = useState<ServiceWriterAuditResult | null>(null);
  const [rawRecords, setRawRecords] = useState<UnifiedReportingRecord[]>([]);
  const [funnel, setFunnel] = useState<BookingFunnelData | null>(null);
  const [locationCustomers, setLocationCustomers] = useState<LocationDemographicCustomer[]>([]);
  const [customerAnalytics, setCustomerAnalytics] = useState<CustomerAnalytics | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianRef[]>([]);
  const [fleetReport, setFleetReport] = useState<FleetReportPageData | null>(null);
  const [earliestActivity, setEarliestActivity] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rowDimension, setRowDimension] = useState<keyof DimensionSchema>("client_type");
  const [measure, setMeasure] = useState<keyof MeasureSchema>("total_billed");
  const range = useMemo(() => buildRange(rangeKey, earliestActivity), [rangeKey, earliestActivity]);

  useEffect(() => {
    fetchEarliestActivityDate()
      .then(setEarliestActivity)
      .catch((error) => console.error("[reports] earliest activity lookup failed", error));
  }, []);

  const reload = () => {
    setLoading(true);
    setLoadError(null);
    getCurrentUserId()
      .then((userId) => Promise.all([
        fetchReportsCanonical(range, dataScope === "all"),
        fetchServiceWriterAudit(),
        fetchRawReportingRecords({ from: range.from, to: range.to, includeLegacy: dataScope === "all" }),
        fetchBookingFunnel(range),
        userId ? fetchLocationDemographicCustomers(userId) : Promise.resolve([] as LocationDemographicCustomer[]),
        userId ? fetchCustomerAnalytics(userId) : Promise.resolve(null),
        userId ? fetchTechniciansForReports(userId) : Promise.resolve([] as TechnicianRef[]),
        userId ? fetchFleetReportPageData(userId) : Promise.resolve(null),
      ]))
      .then(([nextData, nextAudit, nextRaw, nextFunnel, nextLocations, nextCustomers, nextTechs, nextFleet]) => {
        setData(nextData); setAudit(nextAudit); setRawRecords(nextRaw); setFunnel(nextFunnel);
        setLocationCustomers(nextLocations); setCustomerAnalytics(nextCustomers); setTechnicians(nextTechs); setFleetReport(nextFleet);
      })
      .catch((error) => {
        console.error("[reports] fetch failed", error);
        setLoadError(errorMessage(error, "The backend did not return report data."));
      })
      .finally(() => setLoading(false));
  };
  useEffect(reload, [range, dataScope]);

  const runGeocodeBackfill = async () => {
    setGeocoding(true);
    try {
      const result = await backfillAppointmentCoordinates(25);
      toast({ title: "Geocoding batch complete", description: `${result.geocoded} mapped, ${result.failed} failed, ${result.remaining} still missing coordinates.` });
      reload();
    } catch (error) {
      toast({ title: "Geocoding failed", description: error instanceof Error ? error.message : "Unable to geocode appointments.", variant: "destructive" });
    } finally {
      setGeocoding(false);
    }
  };

  const explorer = useMemo(() => {
    const config: DynamicReportConfig = { name: "Custom breakdown", rows: [rowDimension], columns: [], values: [{ field: measure, aggregation: "sum" }], filters: [], timeRange: { from: range.from, to: range.to }, chartType: "pivot" };
    return pivotDataset(rawRecords, config);
  }, [measure, range, rawRecords, rowDimension]);

  const exportOverview = () => {
    if (!data) return;
    const rows = [["Metric", "Value", "Period"], ["Net collected", data.collected, data.periodLabel], ["Gross billed", data.billed, data.periodLabel], ["Refunds", data.refunds, data.periodLabel], ["Tax collected", data.taxCollected, data.periodLabel], ["Outstanding A/R", data.outstanding, data.periodLabel], ["Completed jobs", data.jobsCompleted, data.periodLabel]];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `business-report-${data.periodStart}-${data.periodEnd}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const collectionRate = data ? percent(data.collected, data.billed) : 0;
  const demandInsights = useMemo(() => {
    const periodRecords = rawRecords.filter((record) => {
      if (!record.scheduled_date) return true;
      const date = new Date(`${record.scheduled_date}T12:00:00`);
      return date >= range.from && date <= range.to;
    });
    const timeOfDay = summarizeCohorts(periodRecords, (record) => record.scheduled_time_slot);
    const daysOfWeek = summarizeCohorts(periodRecords, (record) => record.scheduled_date ? WEEKDAYS[new Date(`${record.scheduled_date}T12:00:00`).getDay()] : "Unknown day");
    const serviceAreas = summarizeCohorts(periodRecords, (record) => record.postal_code !== "Unknown" ? record.postal_code : record.city);
    const spatialGroups = periodRecords.reduce<Record<string, SpatialPoint>>((acc, record) => {
      if (record.latitude == null || record.longitude == null) return acc;
      const label = record.postal_code !== "Unknown" ? record.postal_code : record.city;
      const row = acc[label] || { label, latitude: 0, longitude: 0, bookings: 0, billed: 0 };
      const nextBookings = row.bookings + record.job_count;
      row.latitude = (row.latitude * row.bookings + Number(record.latitude) * record.job_count) / nextBookings;
      row.longitude = (row.longitude * row.bookings + Number(record.longitude) * record.job_count) / nextBookings;
      row.bookings = nextBookings;
      row.billed += record.total_billed;
      acc[label] = row;
      return acc;
    }, {});
    const spatialPoints = Object.values(spatialGroups).sort((a, b) => b.billed - a.billed);
    const customerAreas = locationCustomers.reduce<Record<string, LocationBucket>>((acc, customer) => {
      const label = getCustomerZip(customer);
      const row = acc[label] || { label, customers: 0, bookings: 0, billed: 0, services: 0 };
      row.customers += 1;
      row.services += Number(customer.total_services || 0);
      acc[label] = row;
      return acc;
    }, {});
    serviceAreas.forEach((area) => { const row = customerAreas[area.label] || { label: area.label, customers: 0, bookings: 0, billed: 0, services: 0 }; row.bookings = area.bookings; row.billed = area.billed; customerAreas[area.label] = row; });
    return { timeOfDay, daysOfWeek, serviceAreas, spatialPoints, customerAreas: Object.values(customerAreas).sort((a, b) => b.bookings - a.bookings || b.customers - a.customers) };
  }, [locationCustomers, range, rawRecords]);
  const completionRate = data ? percent(data.jobsCompleted, data.jobsTotal) : 0;
  // Rate must be derived from the same source as the displayed count, otherwise
  // the customer card mixes the analytics repeat count with the period count.
  const repeatCustomerCount = customerAnalytics?.repeat ?? data?.repeatCustomers ?? 0;
  const repeatCustomerBase = customerAnalytics ? customerAnalytics.customers.length : (data?.totalCustomers ?? 0);
  const repeatRate = percent(repeatCustomerCount, repeatCustomerBase);

  const retailRecords = useMemo(() => rawRecords.filter((record) => record.client_type === "Retail"), [rawRecords]);

  const operations = useMemo(() => {
    const byTech = summarizeCohorts(rawRecords, (record) => record.technician_name);
    const withActual = rawRecords.filter((record) => record.actual_minutes > 0);
    const avgActual = withActual.length ? withActual.reduce((sum, record) => sum + record.actual_minutes, 0) / withActual.length : 0;
    const estimatedForActual = withActual.filter((record) => record.duration_minutes > 0);
    const avgEstimate = estimatedForActual.length ? estimatedForActual.reduce((sum, record) => sum + record.duration_minutes, 0) / estimatedForActual.length : 0;
    const withTravel = rawRecords.filter((record) => record.travel_minutes > 0);
    const avgTravel = withTravel.length ? withTravel.reduce((sum, record) => sum + record.travel_minutes, 0) / withTravel.length : 0;
    const unassigned = rawRecords.filter((record) => record.technician_name === "Unassigned").length;
    const laborHours = withActual.reduce((sum, record) => sum + record.actual_minutes, 0) / 60;
    const billedForActual = withActual.reduce((sum, record) => sum + record.total_billed, 0);
    return { byTech, avgActual, avgEstimate, avgTravel, unassigned, measuredJobs: withActual.length, revenuePerLaborHour: laborHours > 0 ? billedForActual / laborHours : 0 };
  }, [rawRecords]);

  const servicesInsights = useMemo(() => ({
    byService: summarizeCohorts(rawRecords, (record) => record.service_type),
    byMake: summarizeCohorts(rawRecords, (record) => (record.make === "Unknown" ? "Unknown make" : record.make)),
    byModel: summarizeCohorts(rawRecords, (record) => (record.make === "Unknown" ? "Unknown vehicle" : `${record.make} ${record.model}`)),
    byOil: summarizeCohorts(rawRecords.filter((record) => record.oil_type !== "Unknown"), (record) => record.oil_type),
    quarts: rawRecords.reduce((sum, record) => sum + record.quarts_used, 0),
  }), [rawRecords]);

  const attribution = useMemo(() => summarizeCohorts(rawRecords, (record) => record.origin_source || "direct"), [rawRecords]);

  const qualityGaps = useMemo(() => ([
    { label: "Bookings missing coordinates", count: retailRecords.filter((record) => record.latitude == null || record.longitude == null).length, detail: "Excluded from the service-area map until geocoded." },
    { label: "Bookings missing ZIP or city", count: retailRecords.filter((record) => record.postal_code === "Unknown" && record.city === "Unknown").length, detail: "No ZIP on the appointment, its address, or the customer record." },
    { label: "Bookings with no billed amount", count: retailRecords.filter((record) => record.total_billed === 0).length, detail: "No linked service record total and no estimate." },
    { label: "Bookings with no technician", count: retailRecords.filter((record) => record.technician_name === "Unassigned").length, detail: "Not dispatched, so they carry no throughput data." },
  ]), [retailRecords]);

  return <AppLayout title="Reports">
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground">Money, bookings, customers, operations, and the data behind them.</p>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Data scope" value={dataScope} onChange={(event) => setDataScope(event.target.value as DataScope)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="native">Native operations</option><option value="all">Native + imported</option></select>
          <div className="flex max-w-full overflow-x-auto rounded-md border bg-muted/30 p-0.5">{(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => <Button key={key} size="sm" variant={rangeKey === key ? "default" : "ghost"} className="h-8 shrink-0 px-2.5 text-xs" onClick={() => setRangeKey(key)}>{RANGE_LABELS[key]}</Button>)}</div>
          <Button size="sm" variant="outline" onClick={exportOverview} disabled={!data}><Download className="mr-2 h-4 w-4" />Export</Button>
          <Button size="icon" variant="ghost" onClick={reload} disabled={loading} aria-label="Refresh data"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
      </div>

      {loadError && <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Reports could not load completely.</strong> {loadError} Nothing on this page is showing a false zero — retry with Refresh.</span></div>}

      {data && <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-emerald-600" />{dataScope === "native" ? `Native operations only. ${data.legacyExcluded} imported records excluded.` : "Native and imported records included."} Financial cards label their service-date or payment-date basis.</div>}

      {loading ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-28" />)}</div> : data && <Tabs defaultValue="overview" className="space-y-4">
        <div className="overflow-x-auto pb-1"><TabsList className="h-auto min-w-max justify-start"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="revenue">Revenue</TabsTrigger><TabsTrigger value="bookings">Bookings & Funnel</TabsTrigger><TabsTrigger value="demand"><Clock3 className="mr-1 h-3.5 w-3.5" />Demand & Service Area</TabsTrigger><TabsTrigger value="customers">Customers</TabsTrigger><TabsTrigger value="operations">Operations</TabsTrigger><TabsTrigger value="services">Services & Vehicles</TabsTrigger><TabsTrigger value="marketing">Marketing & Google</TabsTrigger><TabsTrigger value="fleet">Fleet</TabsTrigger><TabsTrigger value="quality">Data Quality</TabsTrigger><TabsTrigger value="explore"><Search className="mr-1 h-3.5 w-3.5" />Explore Data</TabsTrigger></TabsList></div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Net collected" value={formatCurrency(data.collected)} detail="Payment date · after refunds" tone="success" trend={trendPercent(data.collected, data.collectedPrev)} /><StatCard label="Gross billed" value={formatCurrency(data.billed)} detail="Service date · completed work" /><StatCard label="Outstanding A/R" value={formatCurrency(data.outstanding)} detail="Unpaid and partial balances" tone={data.outstanding > 0 ? "warning" : "default"} /><StatCard label="Completed jobs" value={String(data.jobsCompleted)} detail={`${completionRate.toFixed(1)}% of scheduled jobs`} /></div>
          <div className="grid gap-4 lg:grid-cols-3"><Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Daily billed vs. collected</CardTitle><p className="text-xs text-muted-foreground">Billed uses service date. Collected uses payment date.</p></CardHeader><CardContent>{data.dailyRevenue.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No financial activity in this period.</p> : <div className="space-y-3">{data.dailyRevenue.slice(-14).map((day) => <div key={day.date} className="grid grid-cols-[84px_1fr_auto] items-center gap-3 text-xs"><span className="text-muted-foreground">{format(new Date(`${day.date}T12:00:00`), "MMM d")}</span><div className="space-y-1"><Progress value={percent(day.billed, Math.max(...data.dailyRevenue.map((item) => Math.max(item.billed, item.collected)), 1))} className="h-2" /><Progress value={percent(day.collected, Math.max(...data.dailyRevenue.map((item) => Math.max(item.billed, item.collected)), 1))} className="h-2 [&>div]:bg-emerald-500" /></div><span className="w-28 text-right tabular-nums">{formatCurrency(day.billed)} / {formatCurrency(day.collected)}</span></div>)}</div>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Attention needed</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex justify-between"><span>Outstanding A/R</span><span className="font-semibold text-amber-600">{formatCurrency(data.outstanding)}</span></div><div className="flex justify-between"><span>Cancelled jobs</span><span className="font-semibold">{data.jobsCancelled}</span></div><div className="flex justify-between"><span>No-shows</span><span className="font-semibold">{data.appointmentsNoShow}</span></div><div className="flex justify-between"><span>Refunds</span><span className="font-semibold">{formatCurrency(data.refunds)}</span></div></CardContent></Card></div>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Net collected" value={formatCurrency(data.collected)} detail="Collection timestamp" tone="success" /><StatCard label="Gross billed" value={formatCurrency(data.billed)} detail="Completed service date" /><StatCard label="Refunds" value={formatCurrency(data.refunds)} detail="Payment date" tone={data.refunds > 0 ? "danger" : "default"} /><StatCard label="Tax collected" value={formatCurrency(data.taxCollected)} detail="Receipt and pricing metadata" /></div><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Service mix</CardTitle></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Service</TableHead><TableHead className="text-right">Jobs</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="w-28">Share</TableHead></TableRow></TableHeader><TableBody>{data.revenueByServiceType.map((row) => <TableRow key={row.type}><TableCell className="font-medium">{row.type}</TableCell><TableCell className="text-right">{row.count}</TableCell><TableCell className="text-right font-medium">{formatCurrency(row.revenue)}</TableCell><TableCell><Progress value={percent(row.revenue, data.billed)} className="h-1.5" /></TableCell></TableRow>)}</TableBody></Table></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Payment mix</CardTitle></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Transactions</TableHead><TableHead className="text-right">Net collected</TableHead></TableRow></TableHeader><TableBody>{data.revenueByPaymentMethod.map((row) => <TableRow key={row.method}><TableCell className="capitalize">{row.method.replace(/_/g, " ")}</TableCell><TableCell className="text-right">{row.count}</TableCell><TableCell className="text-right font-medium">{formatCurrency(row.revenue)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></div></TabsContent>

        <TabsContent value="bookings" className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Appointments" value={String(data.appointmentsBooked)} detail="Scheduled in selected period" /><StatCard label="Completed" value={String(data.jobsCompleted)} detail={`${completionRate.toFixed(1)}% completion rate`} tone="success" /><StatCard label="Cancelled" value={String(data.jobsCancelled)} detail={`${percent(data.jobsCancelled, data.jobsTotal).toFixed(1)}% cancellation rate`} tone="warning" /><StatCard label="No-shows" value={String(data.appointmentsNoShow)} detail={`${percent(data.appointmentsNoShow, data.jobsTotal).toFixed(1)}% no-show rate`} tone="danger" /></div>{funnel?.trackingState === "no_activity" ? <EmptyState title="No booking funnel activity in this period" description="The public booking tracker is connected and writes anonymous session progress from the first step. No persisted sessions matched the selected dates, so the correct result is zero activity—not missing instrumentation." /> : funnel && <Card><CardHeader><CardTitle className="text-base">Public booking funnel</CardTitle><p className="text-xs text-muted-foreground">Real persisted sessions. Progress is upserted, so each session is counted once per stage reached.</p></CardHeader><CardContent className="space-y-3">{funnel.stages.map((stage) => <div key={stage.step} className="grid grid-cols-[150px_1fr_56px] items-center gap-3 text-sm"><span>{stage.label}</span><Progress value={percent(stage.sessions, funnel.sessions)} className="h-2" /><span className="text-right font-medium tabular-nums">{stage.sessions}</span></div>)}<div className="grid gap-3 border-t pt-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Tracked sessions</p><p className="text-xl font-semibold">{funnel.sessions}</p></div><div><p className="text-xs text-muted-foreground">Recovered into bookings</p><p className="text-xl font-semibold text-emerald-600">{funnel.recovered}</p></div><div><p className="text-xs text-muted-foreground">Confirmed abandoned</p><p className="text-xl font-semibold text-amber-600">{funnel.abandoned}</p></div></div></CardContent></Card>}</TabsContent>

        <TabsContent value="demand" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Top booking window" value={demandInsights.timeOfDay[0]?.label || "No data"} detail={demandInsights.timeOfDay[0] ? `${demandInsights.timeOfDay[0].bookings} bookings · ${formatCurrency(demandInsights.timeOfDay[0].avgTicket)} avg ticket` : "Need scheduled times"} tone="success" /><StatCard label="Top booking day" value={demandInsights.daysOfWeek[0]?.label || "No data"} detail={demandInsights.daysOfWeek[0] ? `${demandInsights.daysOfWeek[0].bookings} bookings in selected period` : "Need scheduled dates"} /><StatCard label="Service areas" value={String(demandInsights.serviceAreas.length)} detail="ZIP codes or cities with bookings" /><StatCard label="Customers with ZIP" value={String(locationCustomers.filter((customer) => getCustomerZip(customer) !== "Unknown ZIP").length)} detail={`${locationCustomers.filter((customer) => getCustomerCity(customer) !== "Unknown city").length} with a recognizable city`} /> </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4 text-primary" />Best time of day</CardTitle><p className="text-xs text-muted-foreground">Booking volume and average ticket by scheduled time window.</p></CardHeader><CardContent className="space-y-4">{demandInsights.timeOfDay.length === 0 ? <EmptyState title="No scheduled-time data yet" description="Once bookings include a scheduled time, this view will show which windows create the most demand and revenue." /> : demandInsights.timeOfDay.map((row) => <div key={row.label}><div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium">{row.label}</span><span className="tabular-nums">{row.bookings} bookings · {formatCurrency(row.billed)}</span></div><Progress value={percent(row.bookings, demandInsights.timeOfDay[0].bookings)} className="h-2" /><p className="mt-1 text-xs text-muted-foreground">{formatCurrency(row.avgTicket)} average ticket · {formatCurrency(row.collected)} collected</p></div>)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" />Best days of the week</CardTitle><p className="text-xs text-muted-foreground">Use this to plan availability, staffing, and local promotions.</p></CardHeader><CardContent className="space-y-4">{demandInsights.daysOfWeek.length === 0 ? <EmptyState title="No scheduled-date data yet" description="Day-of-week cohorts will appear once service records have scheduled dates." /> : demandInsights.daysOfWeek.map((row) => <div key={row.label}><div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium">{row.label}</span><span className="tabular-nums">{row.bookings} bookings</span></div><Progress value={percent(row.bookings, demandInsights.daysOfWeek[0].bookings)} className="h-2 [&>div]:bg-emerald-500" /><p className="mt-1 text-xs text-muted-foreground">{formatCurrency(row.billed)} billed · {formatCurrency(row.avgTicket)} average ticket</p></div>)}</CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" />Service-area performance map</CardTitle><p className="text-xs text-muted-foreground">Each bubble is a ZIP or area with coordinates. Larger bubbles have more bookings; the strongest billed areas use the deepest color.</p></CardHeader><CardContent>{demandInsights.spatialPoints.length === 0 ? <EmptyState title="No mapped service-area data yet" description="This spatial view appears when bookings include latitude and longitude. The table below still shows ZIP and area cohorts without coordinates." /> : (() => { const points = demandInsights.spatialPoints; const minLat = Math.min(...points.map((point) => point.latitude)); const maxLat = Math.max(...points.map((point) => point.latitude)); const minLng = Math.min(...points.map((point) => point.longitude)); const maxLng = Math.max(...points.map((point) => point.longitude)); const latSpan = Math.max(maxLat - minLat, 0.01); const lngSpan = Math.max(maxLng - minLng, 0.01); const maxBookings = Math.max(...points.map((point) => point.bookings), 1); const maxBilled = Math.max(...points.map((point) => point.billed), 1); return <div className="space-y-3"><div className="overflow-hidden rounded-lg border bg-muted/20"><svg viewBox="0 0 600 280" role="img" aria-label="Spatial distribution of service-area performance" className="h-[280px] w-full"><defs><linearGradient id="service-area-grid" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary) / 0.08)" /><stop offset="100%" stopColor="hsl(var(--primary) / 0.01)" /></linearGradient></defs><rect width="600" height="280" fill="url(#service-area-grid)" />{[1, 2, 3, 4].map((line) => <line key={`h-${line}`} x1="30" x2="570" y1={line * 50} y2={line * 50} stroke="hsl(var(--border))" strokeDasharray="3 5" />)}{points.map((point) => { const x = 36 + ((point.longitude - minLng) / lngSpan) * 528; const y = 244 - ((point.latitude - minLat) / latSpan) * 208; const radius = 7 + (point.bookings / maxBookings) * 18; const intensity = 35 + (point.billed / maxBilled) * 45; return <g key={`${point.label}-${point.latitude}-${point.longitude}`}><title>{`${point.label}: ${point.bookings} bookings, ${formatCurrency(point.billed)} billed`}</title><circle cx={x} cy={y} r={radius} fill={`hsl(var(--primary) / ${intensity / 100})`} stroke="hsl(var(--primary))" strokeWidth="2" /><text x={x} y={y + 3} textAnchor="middle" className="fill-primary-foreground text-[9px] font-semibold">{point.label}</text></g>; })}</svg></div><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>Left → right: west → east</span><span>Bottom → top: south → north</span><span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-md bg-primary/40" />Lower billed</span><span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-md bg-primary" />Higher billed</span></div></div>; })()}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" />Service-area cohorts</CardTitle><p className="text-xs text-muted-foreground">Where demand is coming from, combining booking performance with customer location coverage. Sorts by bookings first, then customer coverage.</p></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>ZIP / area</TableHead><TableHead className="text-right">Customers</TableHead><TableHead className="text-right">Bookings</TableHead><TableHead className="text-right">Services</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="w-32">Share</TableHead></TableRow></TableHeader><TableBody>{demandInsights.customerAreas.slice(0, 12).map((row) => <TableRow key={row.label}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right tabular-nums">{row.customers}</TableCell><TableCell className="text-right tabular-nums">{row.bookings}</TableCell><TableCell className="text-right tabular-nums">{row.services}</TableCell><TableCell className="text-right font-medium tabular-nums">{formatCurrency(row.billed)}</TableCell><TableCell><Progress value={percent(row.bookings, demandInsights.serviceAreas[0]?.bookings || 0)} className="h-1.5" /></TableCell></TableRow>)}{demandInsights.customerAreas.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No location cohorts available in this period.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
          <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-medium">Map coverage</p><p className="text-xs text-muted-foreground">{retailRecords.filter((record) => record.latitude != null && record.longitude != null).length} of {retailRecords.length} bookings in this period have coordinates. Geocoding runs in batches of 25 addresses.</p></div><Button size="sm" variant="outline" onClick={runGeocodeBackfill} disabled={geocoding}><MapPin className={`mr-2 h-4 w-4 ${geocoding ? "animate-pulse" : ""}`} />{geocoding ? "Geocoding…" : "Geocode missing addresses"}</Button></CardContent></Card>
        </TabsContent>

        <TabsContent value="customers" className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Total customers" value={String(data.totalCustomers)} detail="Current customer records" /><StatCard label="New customers" value={String(data.newCustomers)} detail={`Created during ${data.periodLabel.toLowerCase()}`} /><StatCard label="Lifetime value" value={formatCurrency(customerAnalytics?.totalLifetimeValue ?? 0)} detail="Sum of customer lifetime value" tone="success" /><StatCard label="Repeat customers" value={String(customerAnalytics?.repeat ?? data.repeatCustomers)} detail={`${repeatRate.toFixed(1)}% of customers · ${customerAnalytics?.oneTime ?? 0} one-time`} /></div>
          {!customerAnalytics ? <EmptyState title="No customer records yet" description="Customer cohorts appear as soon as customers exist on this account." /> : <div className="grid gap-4 xl:grid-cols-2">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Top customers by lifetime value</CardTitle></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Services</TableHead><TableHead className="text-right">Lifetime value</TableHead><TableHead className="text-right">Avg order</TableHead></TableRow></TableHeader><TableBody>{customerAnalytics.topByValue.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="text-right tabular-nums">{row.total_services}</TableCell><TableCell className="text-right font-medium tabular-nums">{formatCurrency(row.lifetime_value)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.average_order_value)}</TableCell></TableRow>)}{customerAnalytics.topByValue.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No customers yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Due for service (90+ days)</CardTitle></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Customer</TableHead><TableHead className="text-right">Days since</TableHead><TableHead className="text-right">Lifetime value</TableHead></TableRow></TableHeader><TableBody>{customerAnalytics.dueForService.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="text-right tabular-nums">{row.days_since_last_service ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.lifetime_value)}</TableCell></TableRow>)}{customerAnalytics.dueForService.length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">No customer is past 90 days since their last service.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
            <Card className="xl:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-sm">Churn risk watchlist</CardTitle></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Segment</TableHead><TableHead>Risk</TableHead><TableHead className="text-right">Last service</TableHead><TableHead className="text-right">Lifetime value</TableHead></TableRow></TableHeader><TableBody>{customerAnalytics.churnRisk.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="text-xs text-muted-foreground">{row.customer_segment || "Unsegmented"}</TableCell><TableCell className="capitalize">{row.churn_risk}</TableCell><TableCell className="text-right tabular-nums">{row.last_service_date ? format(new Date(`${row.last_service_date}T12:00:00`), "MMM d, yyyy") : "Never"}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.lifetime_value)}</TableCell></TableRow>)}{customerAnalytics.churnRisk.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No customer is currently flagged at medium or high churn risk.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
          </div>}
        </TabsContent>

        <TabsContent value="operations" className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Scheduled jobs" value={String(data.jobsTotal)} detail="Scheduled-date basis" /><StatCard label="Completion rate" value={`${completionRate.toFixed(1)}%`} detail={`${data.jobsCompleted} completed · ${data.jobsCancelled} cancelled`} tone="success" /><StatCard label="Average actual duration" value={operations.measuredJobs ? `${Math.round(operations.avgActual)} min` : "No timestamps"} detail={operations.measuredJobs ? `${operations.measuredJobs} jobs with start and end times · ${Math.round(operations.avgEstimate)} min estimated` : "Jobs need actual start and end times"} /><StatCard label="Revenue per labor hour" value={operations.measuredJobs ? formatCurrency(operations.revenuePerLaborHour) : "No timestamps"} detail="Billed divided by measured labor hours" tone={operations.measuredJobs ? "default" : "warning"} /></div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Technician throughput</CardTitle><p className="text-xs text-muted-foreground">{technicians.length} active technicians · {operations.unassigned} jobs with no technician assigned.</p></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Technician</TableHead><TableHead className="text-right">Jobs</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Avg ticket</TableHead></TableRow></TableHeader><TableBody>{operations.byTech.map((row) => <TableRow key={row.label}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right tabular-nums">{row.bookings}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.billed)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.avgTicket)}</TableCell></TableRow>)}{operations.byTech.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No jobs in this period.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Schedule accuracy and travel</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex justify-between"><span>Estimated duration (measured jobs)</span><span className="font-semibold tabular-nums">{Math.round(operations.avgEstimate)} min</span></div><div className="flex justify-between"><span>Actual duration</span><span className="font-semibold tabular-nums">{Math.round(operations.avgActual)} min</span></div><div className="flex justify-between"><span>Variance</span><span className={`font-semibold tabular-nums ${operations.avgActual > operations.avgEstimate ? "text-destructive" : "text-emerald-600"}`}>{operations.measuredJobs ? `${Math.round(operations.avgActual - operations.avgEstimate)} min` : "—"}</span></div><div className="flex justify-between"><span>Average travel time</span><span className="font-semibold tabular-nums">{operations.avgTravel ? `${Math.round(operations.avgTravel)} min` : "Not recorded"}</span></div><div className="flex justify-between"><span>No-shows</span><span className="font-semibold tabular-nums">{data.appointmentsNoShow}</span></div></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="services" className="space-y-4"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Jobs in range" value={String(rawRecords.length)} detail="Retail bookings plus fleet work orders" /><StatCard label="Distinct services" value={String(servicesInsights.byService.length)} detail="Service types performed" /><StatCard label="Oil quarts used" value={servicesInsights.quarts.toFixed(1)} detail="Verified quantity on completed jobs" /><StatCard label="Vehicle makes serviced" value={String(servicesInsights.byMake.filter((row) => row.label !== "Unknown make").length)} detail="Distinct makes with bookings" /></div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Service mix</CardTitle></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Service</TableHead><TableHead className="text-right">Jobs</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="w-28">Share</TableHead></TableRow></TableHeader><TableBody>{servicesInsights.byService.slice(0, 12).map((row) => <TableRow key={row.label}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right tabular-nums">{row.bookings}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.billed)}</TableCell><TableCell><Progress value={percent(row.bookings, servicesInsights.byService[0]?.bookings || 0)} className="h-1.5" /></TableCell></TableRow>)}{servicesInsights.byService.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No jobs in this period.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Top vehicles serviced</CardTitle></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Make / model</TableHead><TableHead className="text-right">Jobs</TableHead><TableHead className="text-right">Billed</TableHead></TableRow></TableHeader><TableBody>{servicesInsights.byModel.slice(0, 12).map((row) => <TableRow key={row.label}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right tabular-nums">{row.bookings}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.billed)}</TableCell></TableRow>)}{servicesInsights.byModel.length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">No vehicles attached to jobs in this period.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
            <Card className="xl:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-sm">Oil type mix</CardTitle><p className="text-xs text-muted-foreground">Only jobs whose vehicle records an oil type are counted.</p></CardHeader><CardContent className="space-y-3">{servicesInsights.byOil.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No oil type recorded on the vehicles serviced in this period.</p> : servicesInsights.byOil.map((row) => <div key={row.label}><div className="mb-1 flex justify-between text-sm"><span className="font-medium">{row.label}</span><span className="tabular-nums">{row.bookings} jobs · {formatCurrency(row.billed)}</span></div><Progress value={percent(row.bookings, servicesInsights.byOil[0].bookings)} className="h-2" /></div>)}</CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="marketing" className="space-y-4"><GoogleInsightsConnections />
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Booking source attribution</CardTitle><p className="text-xs text-muted-foreground">Booked revenue by the source recorded on the appointment. No channel revenue is inferred from clicks.</p></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Source</TableHead><TableHead className="text-right">Bookings</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Avg ticket</TableHead><TableHead className="w-28">Share</TableHead></TableRow></TableHeader><TableBody>{attribution.map((row) => <TableRow key={row.label}><TableCell className="font-medium capitalize">{row.label.replace(/_/g, " ")}</TableCell><TableCell className="text-right tabular-nums">{row.bookings}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.billed)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.avgTicket)}</TableCell><TableCell><Progress value={percent(row.bookings, attribution[0]?.bookings || 0)} className="h-1.5" /></TableCell></TableRow>)}{attribution.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No bookings in this period, so there is no attribution to report.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
          {funnel && <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Public booking sessions</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3 text-sm"><div><p className="text-xs text-muted-foreground">Tracked sessions</p><p className="text-xl font-semibold">{funnel.sessions}</p></div><div><p className="text-xs text-muted-foreground">Recovered</p><p className="text-xl font-semibold text-emerald-600">{funnel.recovered}</p></div><div><p className="text-xs text-muted-foreground">Abandoned</p><p className="text-xl font-semibold text-amber-600">{funnel.abandoned}</p></div></CardContent></Card>}
        </TabsContent>

        <TabsContent value="fleet" className="space-y-4">{!fleetReport ? <EmptyState title="No fleet data on this account" description="Fleet spend, vehicles, purchase orders and invoices appear once fleet clients, vehicles and work orders exist." /> : <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Fleet spend" value={formatCurrency(fleetReport.stats.totalSpend)} detail="Completed, invoiced and paid work orders" tone="success" /><StatCard label="Fleet vehicles" value={String(fleetReport.stats.vehicleCount)} detail={`${fleetReport.stats.locationCount} locations`} /><StatCard label="Cost per vehicle" value={formatCurrency(fleetReport.stats.avgCostPerVehicle)} detail="Spend divided by fleet vehicles" /><StatCard label="Invoices pending" value={String(fleetReport.stats.invoicesPending)} detail={`${fleetReport.stats.poOpenCount} open purchase orders`} tone={fleetReport.stats.invoicesPending > 0 ? "warning" : "default"} /></div>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Top fleet vehicles by spend</CardTitle></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Vehicle</TableHead><TableHead className="text-right">Spend</TableHead></TableRow></TableHeader><TableBody>{fleetReport.topVehicles.map((row, index) => <TableRow key={`${row.vehicle?.unit_number ?? index}`}><TableCell className="font-medium">{row.vehicle ? `${row.vehicle.year} ${row.vehicle.make} ${row.vehicle.model}${row.vehicle.unit_number ? ` · #${row.vehicle.unit_number}` : ""}` : "Unknown vehicle"}</TableCell><TableCell className="text-right font-medium tabular-nums">{formatCurrency(row.total)}</TableCell></TableRow>)}{fleetReport.topVehicles.length === 0 && <TableRow><TableCell colSpan={2} className="py-6 text-center text-sm text-muted-foreground">No completed fleet work orders yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Fleet vs. retail in this period</CardTitle></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Business line</TableHead><TableHead className="text-right">Jobs</TableHead><TableHead className="text-right">Billed</TableHead><TableHead className="text-right">Collected</TableHead></TableRow></TableHeader><TableBody>{summarizeCohorts(rawRecords, (record) => record.client_type).map((row) => <TableRow key={row.label}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right tabular-nums">{row.bookings}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.billed)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(row.collected)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </>}</TabsContent>

        <TabsContent value="quality" className="space-y-4"><Card><CardContent className="flex items-start gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">Can these reports be trusted?</p><p className="mt-1 text-sm text-muted-foreground">These checks explain missing links, invalid defaults, production cleanup, and records excluded from totals. Placeholder email open rates and simulated geography are not shown.</p></div></CardContent></Card>{audit && <div className="grid gap-4 xl:grid-cols-2"><AuditTable title="Placeholder and invalid defaults" rows={audit.placeholderBadDefaults} /><AuditTable title="Broken workflows" rows={audit.actualBugs} /><AuditTable title="Missing operational data" rows={audit.standardIssues} /><AuditTable title="Production cleanup" rows={audit.productionCleanup} /></div>}<AuditTable title="Reporting coverage gaps in this period" rows={qualityGaps} /><Card><CardHeader><CardTitle className="text-base">Metric definitions</CardTitle></CardHeader><CardContent className="p-0"><Table density="compact"><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Definition</TableHead><TableHead>Date basis</TableHead><TableHead>Source</TableHead></TableRow></TableHeader><TableBody>{REPORT_METRICS.map((metric) => <TableRow key={metric.key}><TableCell className="font-medium">{metric.label}</TableCell><TableCell><p>{metric.formula}</p>{metric.caveat && <p className="text-xs text-muted-foreground">{metric.caveat}</p>}</TableCell><TableCell className="capitalize">{metric.dateBasis.replace(/_/g, " ")}</TableCell><TableCell className="font-mono text-xs">{metric.source}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>

        <TabsContent value="explore" className="space-y-4"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4" />Custom breakdown</CardTitle><p className="text-sm text-muted-foreground">Advanced exploration is available here without blocking the core business report.</p></CardHeader><CardContent><div className="mb-4 flex flex-wrap gap-3"><label className="text-sm">Group by<select value={rowDimension} onChange={(event) => setRowDimension(event.target.value as keyof DimensionSchema)} className="ml-2 h-9 rounded-md border bg-background px-3">{DIMENSIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label className="text-sm">Measure<select value={measure} onChange={(event) => setMeasure(event.target.value as keyof MeasureSchema)} className="ml-2 h-9 rounded-md border bg-background px-3">{MEASURES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label></div><Table density="compact"><TableHeader><TableRow><TableHead>{DIMENSIONS.find((item) => item.key === rowDimension)?.label}</TableHead><TableHead className="text-right">{MEASURES.find((item) => item.key === measure)?.label}</TableHead></TableRow></TableHeader><TableBody>{explorer.allRows.map((row) => <TableRow key={row}><TableCell className="font-medium">{row}</TableCell><TableCell className="text-right tabular-nums">{measure.includes("billed") || measure.includes("collected") || measure.includes("balance") ? formatCurrency(explorer.pivotData[row]?.["Metric Value"]?.[measure] ?? 0) : (explorer.pivotData[row]?.["Metric Value"]?.[measure] ?? 0).toLocaleString()}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
      </Tabs>}
    </div>
  </AppLayout>;
}

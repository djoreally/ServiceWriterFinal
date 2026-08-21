/**
 * RetentionAnalyticsTab — charts retention_signals & service_reminders over time
 * with filters by customer segment and signal/service type.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, format, startOfDay } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import {
  fetchActiveSegmentsForFilter,
  fetchCustomerIdsInSegment,
  fetchRetentionSignalsSince,
  fetchServiceRemindersSince,
} from "@/application/queries/marketing.query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Signal, Wrench, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
}

type RangeKey = "7d" | "30d" | "90d";
const RANGES: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

const SIGNAL_PALETTE = [
  "#0a84ff",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#ec4899",
  "#6b7280",
];

interface SignalRow {
  detected_at: string;
  signal_type: string;
  customer_id: string | null;
}
interface ReminderRow {
  created_at: string;
  reminder_date: string;
  service_type: string;
  status: string;
  customer_id: string | null;
}

export function RetentionAnalyticsTab({ userId }: Props) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [segment, setSegment] = useState<string>("all");
  const [signalType, setSignalType] = useState<string>("all");
  const [serviceType, setServiceType] = useState<string>("all");

  const sinceISO = useMemo(
    () => subDays(new Date(), RANGES[range]).toISOString(),
    [range],
  );

  // Segments (for filter dropdown)
  const { data: segments = [] } = useQuery({
    queryKey: ["retention-analytics-segments", userId],
    queryFn: () => fetchActiveSegmentsForFilter(userId),
  });

  // Customers in selected segment (for membership filter)
  const { data: segmentMemberIds } = useQuery({
    queryKey: ["retention-analytics-segment-members", userId, segment],
    queryFn: async () => {
      if (segment === "all") return null;
      return fetchCustomerIdsInSegment(userId, segment);
    },
  });

  // Retention signals
  const { data: signals, isLoading: signalsLoading } = useQuery({
    queryKey: ["retention-analytics-signals", userId, sinceISO],
    queryFn: () => fetchRetentionSignalsSince(userId, sinceISO),
  });

  // Service reminders
  const { data: reminders, isLoading: remindersLoading } = useQuery({
    queryKey: ["retention-analytics-reminders", userId, sinceISO],
    queryFn: () => fetchServiceRemindersSince(userId, sinceISO),
  });

  // Filter helpers
  const matchSegment = (cid: string | null): boolean => {
    if (segment === "all") return true;
    if (!segmentMemberIds) return false;
    return cid != null && segmentMemberIds.has(cid);
  };

  const filteredSignals = useMemo(
    () =>
      (signals ?? []).filter(
        (s) =>
          (signalType === "all" || s.signal_type === signalType) &&
          matchSegment(s.customer_id),
      ),
    [signals, signalType, segment, segmentMemberIds],
  );

  const filteredReminders = useMemo(
    () =>
      (reminders ?? []).filter(
        (r) =>
          (serviceType === "all" || r.service_type === serviceType) &&
          matchSegment(r.customer_id),
      ),
    [reminders, serviceType, segment, segmentMemberIds],
  );

  // Distinct types for filter dropdowns
  const signalTypes = useMemo(() => {
    const s = new Set<string>();
    (signals ?? []).forEach((row) => s.add(row.signal_type));
    return Array.from(s).sort();
  }, [signals]);

  const serviceTypes = useMemo(() => {
    const s = new Set<string>();
    (reminders ?? []).forEach((row) => s.add(row.service_type));
    return Array.from(s).sort();
  }, [reminders]);

  // Bucket signals by day × signal_type
  const { signalSeries, signalKeys } = useMemo(() => {
    const days = RANGES[range];
    const today = startOfDay(new Date());
    const buckets: Record<string, Record<string, number>> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(today, i), "yyyy-MM-dd");
      buckets[d] = {};
    }
    const keys = new Set<string>();
    filteredSignals.forEach((row) => {
      const d = format(startOfDay(new Date(row.detected_at)), "yyyy-MM-dd");
      if (!buckets[d]) return;
      buckets[d][row.signal_type] = (buckets[d][row.signal_type] || 0) + 1;
      keys.add(row.signal_type);
    });
    const series = Object.entries(buckets).map(([date, counts]) => {
      const label = format(new Date(date), days > 30 ? "MMM d" : "MMM d");
      return { date, label, ...counts };
    });
    return { signalSeries: series, signalKeys: Array.from(keys) };
  }, [filteredSignals, range]);

  // Bucket reminders by day × service_type
  const { reminderSeries, reminderKeys } = useMemo(() => {
    const days = RANGES[range];
    const today = startOfDay(new Date());
    const buckets: Record<string, Record<string, number>> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(today, i), "yyyy-MM-dd");
      buckets[d] = {};
    }
    const keys = new Set<string>();
    filteredReminders.forEach((row) => {
      const d = format(startOfDay(new Date(row.created_at)), "yyyy-MM-dd");
      if (!buckets[d]) return;
      buckets[d][row.service_type] = (buckets[d][row.service_type] || 0) + 1;
      keys.add(row.service_type);
    });
    const series = Object.entries(buckets).map(([date, counts]) => {
      const label = format(new Date(date), "MMM d");
      return { date, label, ...counts };
    });
    return { reminderSeries: series, reminderKeys: Array.from(keys) };
  }, [filteredReminders, range]);

  const totalSignals = filteredSignals.length;
  const totalReminders = filteredReminders.length;
  const sentReminders = filteredReminders.filter((r) => r.status === "sent").length;
  const pendingReminders = filteredReminders.filter((r) => r.status === "pending").length;

  const loading = signalsLoading || remindersLoading;

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Filter className="h-3 w-3" />
                Range
              </Label>
              <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Segment</Label>
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All segments</SelectItem>
                  {segments.map((s: any) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Signal type</Label>
              <Select value={signalType} onValueChange={setSignalType}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All signal types</SelectItem>
                  {signalTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Service type</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All service types</SelectItem>
                  {serviceTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(segment !== "all" || signalType !== "all" || serviceType !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSegment("all");
                  setSignalType("all");
                  setServiceType("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Signals" value={totalSignals} icon={<Signal className="h-4 w-4" />} />
        <KpiCard label="Reminders created" value={totalReminders} icon={<Wrench className="h-4 w-4" />} />
        <KpiCard label="Reminders sent" value={sentReminders} accent="emerald" />
        <KpiCard label="Reminders pending" value={pendingReminders} accent="amber" />
      </div>

      {/* Signals chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Signal className="h-4 w-4 text-primary" />
            Retention signals over time
          </CardTitle>
          <CardDescription>
            Daily count of detected signals, grouped by type
            {signalKeys.length > 0 && (
              <span className="ml-2">
                {signalKeys.map((k, i) => (
                  <Badge key={k} variant="outline" className="mr-1" style={{ borderColor: SIGNAL_PALETTE[i % SIGNAL_PALETTE.length], color: SIGNAL_PALETTE[i % SIGNAL_PALETTE.length] }}>
                    {k}
                  </Badge>
                ))}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[280px] flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : signalKeys.length === 0 ? (
            <EmptyState text="No retention signals in this range." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={signalSeries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {signalKeys.map((k, i) => (
                  <Area
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stackId="1"
                    stroke={SIGNAL_PALETTE[i % SIGNAL_PALETTE.length]}
                    fill={SIGNAL_PALETTE[i % SIGNAL_PALETTE.length]}
                    fillOpacity={0.35}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Service reminders chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            Service reminders over time
          </CardTitle>
          <CardDescription>
            Daily count of reminders created, grouped by service type
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-[280px] flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : reminderKeys.length === 0 ? (
            <EmptyState text="No service reminders in this range." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={reminderSeries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {reminderKeys.map((k, i) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    stackId="r"
                    fill={SIGNAL_PALETTE[i % SIGNAL_PALETTE.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
  accent?: "emerald" | "amber";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>
        <div
          className={cn(
            "mt-2 text-3xl font-semibold tabular-nums",
            accent === "emerald" && "text-emerald-600",
            accent === "amber" && "text-amber-600",
          )}
        >
          {value.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-[240px] flex flex-col items-center justify-center text-sm text-muted-foreground">
      <Signal className="h-8 w-8 mb-2 opacity-40" />
      {text}
    </div>
  );
}

export default RetentionAnalyticsTab;

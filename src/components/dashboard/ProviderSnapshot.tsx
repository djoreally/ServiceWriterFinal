import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  CalendarCheck,
  CalendarClock,
  Wallet,
  Star,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import {
  fetchProviderSnapshot,
  type SnapshotData,
  type UpcomingAppt,
  type ServiceTypeRev,
} from "@/application/queries/provider-snapshot.query";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { cn } from "@/lib/utils";
import {
  format,
  startOfWeek,
  startOfMonth,
  startOfYear,
  parseISO,
  addDays,
  isAfter,
  isBefore,
} from "date-fns";

// Types re-exported from query layer

// ── Performance flag helper ────────────────────────────
type FlagColor = "green" | "yellow" | "red";

function flag(value: number, goodThreshold: number, warnThreshold: number, higherIsBetter = true): FlagColor {
  if (higherIsBetter) {
    if (value >= goodThreshold) return "green";
    if (value >= warnThreshold) return "yellow";
    return "red";
  }
  if (value <= goodThreshold) return "green";
  if (value <= warnThreshold) return "yellow";
  return "red";
}

const FLAG_CLASSES: Record<FlagColor, string> = {
  green: "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/30",
  yellow: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  red: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

const FLAG_DOT: Record<FlagColor, string> = {
  green: "bg-gray-500",
  yellow: "bg-yellow-500",
  red: "bg-amber-500",
};

// ⚡ Each card gets a distinct color derived from its icon color.
// Backgrounds/borders/text/icon tint all share the same palette entry
// so every card is visually distinct at a glance.
interface CardPalette {
  card: string;    // bg + border
  icon: string;    // icon color class
  dot: string;     // flag-dot override (replaces FLAG_DOT when set)
  text: string;    // label + value color
}

const SNAP_CARD_PALETTE: Record<string, CardPalette> = {
  // DollarSign → emerald/green (revenue feel)
  "This Week":    { card: "bg-emerald-500/10 border-emerald-500/30", icon: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", text: "text-emerald-900 dark:text-emerald-100" },
  "This Month":   { card: "bg-emerald-500/15 border-emerald-500/40", icon: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", text: "text-emerald-900 dark:text-emerald-100" },
  // TrendingUp → blue (growth)
  "Year to Date": { card: "bg-blue-500/10 border-blue-500/30",       icon: "text-blue-600 dark:text-blue-400",       dot: "bg-blue-500",    text: "text-blue-900 dark:text-blue-100" },
  // Wallet → violet (finance/payouts)
  Payouts:        { card: "bg-violet-500/10 border-violet-500/30",    icon: "text-violet-600 dark:text-violet-400",   dot: "bg-violet-500",  text: "text-violet-900 dark:text-violet-100" },
  // CalendarCheck → teal (completed jobs)
  Completed:      { card: "bg-teal-500/10 border-teal-500/30",        icon: "text-teal-600 dark:text-teal-400",       dot: "bg-teal-500",    text: "text-teal-900 dark:text-teal-100" },
  // CalendarClock → blue (upcoming scheduled)
  Upcoming:       { card: "bg-blue-500/10 border-blue-500/30",        icon: "text-blue-600 dark:text-blue-400",       dot: "bg-blue-500",    text: "text-blue-900 dark:text-blue-100" },
  // Clock → yellow (next 7 days)
  "Next 7 Days":  { card: "bg-yellow-500/10 border-yellow-500/30",    icon: "text-yellow-600 dark:text-yellow-400",   dot: "bg-yellow-500",  text: "text-yellow-900 dark:text-yellow-100" },
};

// ── Component ──────────────────────────────────────────
export function ProviderSnapshot() {
  const { formatCurrency, formatDate, formatTime } = useRegionalSettings();
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSnapshot();
  }, []);

  async function fetchSnapshot() {
    try {
      const result = await fetchProviderSnapshot();
      setData(result);
    } catch (err) {
      console.error("Snapshot fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Derived metrics ──────────────────────────────────
  const metrics = useMemo(() => {
    if (!data) return null;

    const monthTrend =
      data.revenuePrevMonth > 0
        ? ((data.revenueMonth - data.revenuePrevMonth) / data.revenuePrevMonth) * 100
        : null;

    const completionRate =
      data.bookingsCompleted + data.bookingsScheduled > 0
        ? (data.bookingsCompleted / (data.bookingsCompleted + data.bookingsScheduled)) * 100
        : 0;

    const reviewClickRate = data.reviewsSent > 0 ? (data.reviewsClicked / data.reviewsSent) * 100 : 0;

    return { monthTrend, completionRate, reviewClickRate };
  }, [data]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data || !metrics) return null;

  // ── Performance flags ────────────────────────────────
  const revenueFlag = flag(data.revenueMonth, 5000, 1000);
  const completionFlag = flag(metrics.completionRate, 70, 40);
  const upcomingFlag = flag(data.upcomingAppointments.length, 5, 2);
  const reviewFlag = flag(metrics.reviewClickRate, 30, 10);

  // ── Revenue bar colors ───────────────────────────────
  const maxServiceRev = Math.max(...data.serviceTypeRevenue.map((s) => s.revenue), 1);

  const SERVICE_COLORS = [
    "bg-primary",
    "bg-blue-500",
    "bg-[hsl(var(--warning))]",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-pink-500",
  ];

  return (
    <div className="space-y-4">
      {/* ─── Row 1: Revenue KPIs ──────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* This Week */}
        <SnapCard
          label="This Week"
          value={formatCurrency(data.revenueWeek)}
          icon={DollarSign}
          flagColor={flag(data.revenueWeek, 1000, 250)}
        />

        {/* This Month */}
        <SnapCard
          label="This Month"
          value={formatCurrency(data.revenueMonth)}
          icon={DollarSign}
          flagColor={revenueFlag}
          trend={metrics.monthTrend}
        />

        {/* YTD */}
        <SnapCard
          label="Year to Date"
          value={formatCurrency(data.revenueYTD)}
          icon={TrendingUp}
          flagColor={flag(data.revenueYTD, 30000, 10000)}
        />

      </div>

      {/* ─── Row 2: Bookings / Ratings ────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Completed Bookings */}
        <SnapCard
          label="Completed"
          value={data.bookingsCompleted}
          icon={CalendarCheck}
          flagColor={completionFlag}
          subtitle={`${metrics.completionRate.toFixed(0)}% completion`}
        />

        {/* Upcoming/Confirmed */}
        <SnapCard
          label="Upcoming"
          value={data.bookingsScheduled}
          icon={CalendarClock}
          flagColor={upcomingFlag}
          subtitle="This month"
        />

        {/* Upcoming 7 days */}
        <SnapCard
          label="Next 7 Days"
          value={data.upcomingAppointments.length}
          icon={Clock}
          flagColor={upcomingFlag}
          subtitle="Appointments"
        />

      </div>

      {/* ─── Row 3: Revenue per Service Type + Upcoming ─ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Service Revenue Breakdown */}
        <Card className="border border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Revenue by Service Type
              <span className="text-xs text-muted-foreground font-normal ml-auto">This month</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.serviceTypeRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No completed services this month
              </p>
            ) : (
              data.serviceTypeRevenue.map((s, i) => (
                <div key={s.type} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate" title={s.type}>{s.type}</span>
                    <span className="text-muted-foreground ml-2 shrink-0">
                      {formatCurrency(s.revenue)} · {s.count} jobs
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-md overflow-hidden">
                    <div
                      className={cn("h-full rounded-md transition-all", SERVICE_COLORS[i % SERVICE_COLORS.length])}
                      style={{ width: `${(s.revenue / maxServiceRev) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Upcoming Appointments */}
        <Card className="border border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Upcoming Appointments
              <Badge variant="secondary" className="ml-auto text-xs">
                Next 7 days
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcomingAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No upcoming appointments
              </p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {data.upcomingAppointments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="shrink-0 w-12 text-center">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(a.scheduled_date)}
                      </p>
                      <p className="text-sm font-semibold">
                        {formatTime(a.scheduled_time)}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" title={a.title}>{a.title}</p>
                      {a.guest_name && (
                        <p className="text-xs text-muted-foreground truncate" title={a.guest_name}>{a.guest_name}</p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs shrink-0",
                        a.status === "confirmed" && "border-green-500/50 text-gray-600",
                        a.status === "pending" && "border-amber-500/50 text-amber-600"
                      )}
                    >
                      {a.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Reusable Snap Card ─────────────────────────────────
function SnapCard({
  label,
  value,
  icon: Icon,
  flagColor,
  trend,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  flagColor: FlagColor;
  trend?: number | null;
  subtitle?: string;
}) {
  // Use per-card palette if available, otherwise fall back to flag classes
  const palette = SNAP_CARD_PALETTE[label];

  return (
    <Card
      className={cn(
        "border transition-colors",
        palette ? palette.card : FLAG_CLASSES[flagColor]
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={cn("space-y-1 min-w-0", palette ? palette.text : "")}>
            <div className="flex items-center gap-1.5">
              {/* ⚡ Dot uses card-specific color when palette is set */}
              <div className={cn("w-2 h-2 rounded-md shrink-0", palette ? palette.dot : FLAG_DOT[flagColor])} />
              <p className="text-xs font-medium opacity-80 truncate">{label}</p>
            </div>
            <p className="text-xl font-bold truncate">{value}</p>
            {trend !== undefined && trend !== null && (
              <div className="flex items-center gap-1">
                {trend >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3 opacity-70" />
                )}
                <span className="text-xs font-medium">
                  {trend >= 0 ? "+" : ""}
                  {trend.toFixed(1)}%
                </span>
                <span className="text-xs opacity-60">vs last mo</span>
              </div>
            )}
            {subtitle && !trend && <p className="text-xs opacity-70">{subtitle}</p>}
          </div>
          {/* ⚡ Icon uses card-specific color for visual identity */}
          <Icon className={cn("h-5 w-5 shrink-0", palette ? palette.icon : "opacity-60")} />
        </div>
      </CardContent>
    </Card>
  );
}

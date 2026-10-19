import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useRegionalSettings } from '@/contexts/RegionalSettingsContext';
import {
  fetchDashboardCockpit,
  type CockpitData,
} from '@/application/queries/dashboard-cockpit.query';
import { getSelectedWorkspaceId } from '@/application/queries/workspaces.selection';
import { useTeamRole } from '@/hooks/useTeamRole';
import { canAccessRoute, canWrite } from '@/domain/auth/access-policy';
import { fetchBusinessSettings } from '@/application/queries/settings.query';

const DASHBOARD_CACHE_TTL_MS = 15 * 1000;
const dashboardCache = new Map<string, { value: CockpitData | null; expiresAt: number }>();
const dashboardInFlight = new Map<string, Promise<CockpitData | null>>();

function loadDashboardCockpit(): Promise<CockpitData | null> {
  const key = getSelectedWorkspaceId() ?? 'default';
  const cached = dashboardCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);

  const existing = dashboardInFlight.get(key);
  if (existing) return existing;

  const request = fetchDashboardCockpit()
    .then((value) => {
      dashboardCache.set(key, { value, expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS });
      return value;
    })
    .finally(() => dashboardInFlight.delete(key));
  dashboardInFlight.set(key, request);
  return request;
}

/**
 * One of four KPIs. Mono numeral + label. Clickable when the role can reach
 * the target route — every KPI drills into its filtered list.
 * Signal (primary) is reserved for today's revenue, the single key metric.
 */
function Kpi({
  label,
  value,
  hint,
  to,
  accent = false,
  attention = false,
}: {
  label: string;
  value: string | number;
  hint: string;
  to?: string;
  accent?: boolean;
  attention?: boolean;
}) {
  const navigate = useNavigate();
  const { role } = useTeamRole();
  const clickable = to != null && canAccessRoute(role, to);

  const inner = (
    <div className="p-4">
      <p className="type-label text-muted-foreground">{label}</p>
      <p
        className={cn(
          'type-xl type-semibold type-tabular mt-1.5 font-mono',
          accent && 'text-primary',
          attention && 'text-attention-fg',
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  if (clickable) {
    return (
      <Card className="border-border/70 shadow-sm transition-colors hover:border-primary/40">
        <button
          type="button"
          onClick={() => navigate(to!)}
          className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`${label}: ${value}. Open details.`}
        >
          {inner}
        </button>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 shadow-sm">
      {inner}
    </Card>
  );
}

/** Pastel status pill — categorization only, one hue per status family. */
function statusPillClass(status: string): string {
  const key = status.toLowerCase().replace(/[\s-]+/g, '_');
  const map: Record<string, string> = {
    scheduled: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    confirmed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    in_progress: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    on_site: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    en_route: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    completed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    done: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    cancelled: 'bg-red-500/10 text-red-600 dark:text-red-400',
    no_show: 'bg-red-500/10 text-red-600 dark:text-red-400',
    pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    unconfirmed: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  };
  return map[key] ?? 'bg-muted text-muted-foreground';
}

function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

interface DashboardCockpitProps {
  ownerName?: string | null;
}

export function DashboardCockpit({ ownerName }: DashboardCockpitProps) {
  const navigate = useNavigate();
  const { role } = useTeamRole();
  const { formatCurrency, formatTime } = useRegionalSettings();
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [timeZone, setTimeZone] = useState<string>('America/New_York');

  const reload = () => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    let active = true;
    Promise.all([loadDashboardCockpit(), fetchBusinessSettings()])
      .then(([d, settings]) => {
        if (active) {
          setData(d);
          setTimeZone(settings?.timezone || 'America/New_York');
        }
      })
      .catch((e) => {
        console.error('Cockpit fetch error:', e);
        if (active) setError(e instanceof Error ? e.message : 'Dashboard data could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reloadKey]);

  if (loading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
        <div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-2 h-6 w-3/4 max-w-md" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-9 w-36 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-24 rounded-lg" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-5">
          <div className="flex items-center gap-2 text-destructive">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-xs font-bold">!</span>
            <p className="text-sm font-medium">Dashboard data could not be loaded.</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Check your connection and try again. Your data is safe.
          </p>
          <Button size="sm" variant="outline" onClick={reload}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          No dashboard data is available for this workspace.
        </CardContent>
      </Card>
    );
  }

  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(new Date());
  const firstName = ownerName?.split(' ')[0] || 'Shop';

  const revenueTrend = data.revenueTodayPrev > 0
    ? ((data.revenueToday - data.revenueTodayPrev) / data.revenueTodayPrev) * 100
    : 0;

  // Attention queue, ranked: money at risk first.
  const attentionItems = data.unpaidInvoices > 0
    ? [
        {
          id: 'unpaid-invoices',
          severity: 'warning' as const,
          title: `${data.unpaidInvoices} unpaid ${pluralize(data.unpaidInvoices, 'invoice')}`,
          detail: `${formatCurrency(data.outstandingAR)} outstanding`,
          to: '/invoices',
          actionLabel: 'Review invoices',
        },
      ]
    : [];

  const pulseSegments = [
    `${data.appointmentsToday} ${pluralize(data.appointmentsToday, 'appointment')} today`,
    `${data.jobsInProgress} in progress`,
    `${formatCurrency(data.revenueToday)} collected`,
    data.unpaidInvoices > 0
      ? `${data.unpaidInvoices} ${pluralize(data.unpaidInvoices, 'invoice')} outstanding`
      : 'no invoices outstanding',
  ];

  const canOpenAppointments = canAccessRoute(role, '/appointments');

  return (
    <div className="space-y-5">
      {/* Pulse — how's today going, in one sentence. The TopHeader owns the H1. */}
      <div>
        <p className="type-label text-muted-foreground">
          Today · {todayLabel}
        </p>
        <p className="mt-1.5 max-w-2xl text-base text-foreground tabular-nums">
          {firstName}, here&rsquo;s the day: {pulseSegments.join(' · ')}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {canWrite(role, 'appointments') && (
            <Button size="sm" onClick={() => navigate('/appointments', { state: { openNewAppointment: true } })}>
              New Appointment
            </Button>
          )}
          {canAccessRoute(role, '/appointments') && (
            <Button size="sm" variant="secondary" onClick={() => navigate('/appointments')}>
              Appointments
            </Button>
          )}
          {canAccessRoute(role, '/invoices') && (
            <Button size="sm" variant="secondary" onClick={() => navigate('/invoices')}>
              Invoices
            </Button>
          )}
        </div>
      </div>

      {/* KPI strip — four max, mono numerals, each drills into its list. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Today's revenue"
          value={formatCurrency(data.revenueToday)}
          hint={`Yesterday ${formatCurrency(data.revenueTodayPrev)}`}
          to="/financials"
          accent
        />
        <Kpi
          label="Appointments today"
          value={data.appointmentsToday}
          hint={`${data.jobsCompletedToday} completed`}
          to="/appointments"
        />
        <Kpi
          label="Jobs in progress"
          value={data.jobsInProgress}
          hint="Currently on the shop floor"
          to="/operations"
        />
        <Kpi
          label="Outstanding invoices"
          value={data.unpaidInvoices}
          hint={formatCurrency(data.outstandingAR)}
          to="/invoices"
          attention={data.unpaidInvoices > 0}
        />
      </div>

      {/* Attention — what needs you right now, ranked. */}
      <section aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="type-lg type-semibold">
          Needs attention
        </h2>
        <Card className="mt-2 border-border/70 shadow-sm">
          <CardContent className="p-2">
            {attentionItems.length === 0 ? (
              <div className="flex items-center gap-2.5 p-3">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 text-xs font-bold">✓</span>
                <p className="text-sm text-muted-foreground">
                  Nothing needs your attention. The day is running clean.
                </p>
              </div>
            ) : (
              attentionItems.map((item) => {
                const canOpen = canAccessRoute(role, item.to);
                const row = (
                  <div className="flex items-center justify-between gap-3 p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="font-mono text-sm text-muted-foreground tabular-nums">{item.detail}</p>
                      </div>
                    </div>
                    {canOpen && (
                      <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                        {item.actionLabel}
                        <span aria-hidden="true">›</span>
                      </span>
                    )}
                  </div>
                );
                return canOpen ? (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.to)}
                    className="block w-full rounded-lg text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {row}
                  </button>
                ) : (
                  <div key={item.id}>{row}</div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>

      {/* Today's work — summary first, tap a row to drill down. */}
      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="type-lg type-semibold">
          Today&rsquo;s work
        </h2>
        <div className="mt-2 grid gap-4 xl:grid-cols-2">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Appointments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0">
              {data.todaysAppointments.length === 0 ? (
                <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                  Nothing scheduled today. The book is open.
                </p>
              ) : data.todaysAppointments.map((a) => {
                const row = (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-transparent p-2.5 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-16 shrink-0 font-mono text-sm text-muted-foreground tabular-nums">
                        {a.scheduled_time ? formatTime(a.scheduled_time) : '—'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{a.title}</p>
                        {a.guest_name && (
                          <p className="truncate text-sm text-muted-foreground">{a.guest_name}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {a.estimated_cost != null && (
                        <span className="font-mono text-sm text-muted-foreground tabular-nums">
                          {formatCurrency(a.estimated_cost)}
                        </span>
                      )}
                      <Badge variant="outline" className={cn('border-0 text-xs font-medium', statusPillClass(a.status))}>
                        {a.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                );
                return canOpenAppointments ? (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => navigate('/appointments')}
                    className="block w-full rounded-lg text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`${a.title}, ${a.guest_name ?? ''} ${a.status.replace(/_/g, ' ')}. Open appointments.`}
                  >
                    {row}
                  </button>
                ) : (
                  <div key={a.id}>{row}</div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">On the floor now</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0">
              {data.jobsInProgressList.length === 0 ? (
                <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                  No jobs in progress. The floor is quiet.
                </p>
              ) : data.jobsInProgressList.map((job) => (
                <div key={job.id} className="rounded-lg border border-transparent p-2.5 text-sm">
                  <p className="font-medium">{job.service_type}</p>
                  <p className="text-sm text-muted-foreground">
                    {job.customer_name}{job.vehicle ? ` · ${job.vehicle}` : ''}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Revenue detail — progressive disclosure, everything else lives here. */}
      <section aria-labelledby="revenue-heading">
        <Collapsible>
          <h2 id="revenue-heading">
            <CollapsibleTrigger className="group flex w-full items-center gap-1.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <span className="text-lg font-semibold tracking-tight">Revenue detail</span>
              <span className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true">⌄</span>
            </CollapsibleTrigger>
          </h2>
          <CollapsibleContent className="pt-2">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This week</p>
                  <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums">{formatCurrency(data.revenueWeek)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This month</p>
                  <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums">{formatCurrency(data.revenueMonth)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prev month {formatCurrency(data.revenueMonthPrev)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Year to date</p>
                  <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums">{formatCurrency(data.revenueYTD)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Today vs yesterday</p>
                  <p className={cn(
                    'mt-1.5 font-mono text-lg font-semibold tabular-nums',
                    revenueTrend >= 0 ? 'text-chart-trend-up' : 'text-chart-trend-down',
                  )}>
                    {revenueTrend >= 0 ? '+' : ''}{revenueTrend.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
            </div>
            <Card className="mt-3 border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Service mix · month to date</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {data.serviceTypeRevenueMTD.length === 0 ? (
                  <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                    No completed services recorded this month.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {data.serviceTypeRevenueMTD.map((row) => (
                      <li key={row.type} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.type}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.count} {pluralize(row.count, 'job')}
                          </p>
                        </div>
                        <p className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                          {formatCurrency(row.revenue)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </section>
    </div>
  );
}

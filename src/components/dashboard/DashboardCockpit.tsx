import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  DollarSign,
  Receipt,
  Wrench,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRegionalSettings } from '@/contexts/RegionalSettingsContext';
import {
  fetchDashboardCockpit,
  type CockpitData,
} from '@/application/queries/dashboard-cockpit.query';

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  secondary = false,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ElementType;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  secondary?: boolean;
}) {
  const toneClass = {
    default: 'border-border/70 bg-card',
    warning: 'border-amber-500/40 bg-amber-500/[0.04]',
    danger: 'border-red-500/40 bg-red-500/[0.04]',
    success: 'border-emerald-500/40 bg-emerald-500/[0.04]',
  }[tone];

  return (
    <Card density="compact" tone={secondary ? 'tertiary' : 'secondary'} className={cn('border shadow-sm', toneClass)}>
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className={cn('mt-1 font-bold tabular-nums', secondary ? 'text-lg' : 'text-xl')}>{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
          <div className="rounded-lg bg-background/80 p-1.5 text-action shadow-sm">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DashboardCockpitProps {
  ownerName?: string | null;
}

export function DashboardCockpit({ ownerName }: DashboardCockpitProps) {
  const navigate = useNavigate();
  const { formatCurrency, formatTime } = useRegionalSettings();
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchDashboardCockpit()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => console.error('Cockpit fetch error:', e))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const firstName = ownerName?.split(' ')[0] || 'Shop';

  const revenueTrend = data.revenueTodayPrev > 0
    ? ((data.revenueToday - data.revenueTodayPrev) / data.revenueTodayPrev) * 100
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-gradient-to-r from-slate-950 to-slate-800 p-4 text-white shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Shop Dashboard · {todayLabel}
          </p>
          <h2 className="mt-1 text-xl font-bold">{firstName} command center</h2>
          <p className="mt-1 text-sm text-slate-300">
            Today's revenue, appointments, jobs in progress, and outstanding invoices.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => navigate('/appointments')}>
            <CalendarDays className="mr-1 h-4 w-4" /> Appointments
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/quick-service')}>
            <Wrench className="mr-1 h-4 w-4" /> New Service
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/invoices')}>
            <Receipt className="mr-1 h-4 w-4" /> Invoices
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Today's Revenue"
          value={formatCurrency(data.revenueToday)}
          hint={`Yesterday ${formatCurrency(data.revenueTodayPrev)}`}
          icon={DollarSign}
          tone="success"
        />
        <Kpi
          label="Appointments Today"
          value={data.appointmentsToday}
          hint={`${data.jobsCompletedToday} completed`}
          icon={CalendarDays}
        />
        <Kpi
          label="Jobs In Progress"
          value={data.jobsInProgress}
          hint="Currently on the shop floor"
          icon={Wrench}
          tone={data.jobsInProgress > 0 ? 'success' : 'default'}
        />
        <Kpi
          label="Outstanding Invoices"
          value={data.unpaidInvoices}
          hint={formatCurrency(data.outstandingAR)}
          icon={Receipt}
          tone={data.unpaidInvoices ? 'warning' : 'default'}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Revenue Week"
          value={formatCurrency(data.revenueWeek)}
          hint="Rolling 7 days"
          icon={TrendingUp}
          secondary
        />
        <Kpi
          label="Revenue Month"
          value={formatCurrency(data.revenueMonth)}
          hint={`Prev ${formatCurrency(data.revenueMonthPrev)}`}
          icon={TrendingUp}
          secondary
        />
        <Kpi
          label="Revenue YTD"
          value={formatCurrency(data.revenueYTD)}
          hint="Year to date"
          icon={TrendingUp}
          secondary
        />
        <Kpi
          label="Today vs Yesterday"
          value={`${revenueTrend >= 0 ? '+' : ''}${revenueTrend.toFixed(1)}%`}
          hint="Revenue trend"
          icon={TrendingUp}
          tone={revenueTrend >= 0 ? 'success' : 'warning'}
          secondary
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card density="compact">
          <CardHeader>
            <CardTitle className="text-base">Today's Appointments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.todaysAppointments.length === 0 ? (
              <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
                No appointments scheduled today.
              </p>
            ) : (
              data.todaysAppointments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <b className="tabular-nums">{a.scheduled_time ? formatTime(a.scheduled_time) : '—'}</b>
                    <span className="font-medium">{a.title}</span>
                    {a.guest_name && (
                      <span className="text-muted-foreground">· {a.guest_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {a.estimated_cost != null && (
                      <span className="text-muted-foreground">
                        {formatCurrency(a.estimated_cost)}
                      </span>
                    )}
                    <Badge variant="outline">{a.status.replace(/_/g, ' ')}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card density="compact">
          <CardHeader>
            <CardTitle className="text-base">Jobs In Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.jobsInProgressList.length === 0 ? (
              <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
                No jobs currently in progress.
              </p>
            ) : (
              data.jobsInProgressList.map((job) => (
                <div key={job.id} className="rounded-xl border p-3 text-sm">
                  <p className="font-semibold">{job.service_type}</p>
                  <p className="text-muted-foreground">
                    {job.customer_name}
                    {job.vehicle ? ` · ${job.vehicle}` : ''}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card density="compact">
        <CardHeader>
          <CardTitle className="text-base">Service Revenue (Month to Date)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.serviceTypeRevenueMTD.length === 0 ? (
            <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
              No completed services recorded this month.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {data.serviceTypeRevenueMTD.map((row) => (
                <div key={row.type} className="rounded-xl border p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {row.type}
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums">
                    {formatCurrency(row.revenue)}
                  </p>
                  <p className="text-xs text-muted-foreground">{row.count} jobs</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

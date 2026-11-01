import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useRegionalSettings } from '@/contexts/RegionalSettingsContext';
import { useTerminology } from '@/contexts/TerminologyContext';
import {
  fetchDashboardCockpit,
  type CockpitData,
  type CockpitJob,
} from '@/application/queries/dashboard-cockpit.query';
import { getSelectedWorkspaceId } from '@/application/queries/workspaces.selection';
import { useTeamRole } from '@/hooks/useTeamRole';
import { canAccessRoute, canWrite } from '@/domain/auth/access-policy';
import { StatCard } from '@/components/dashboard/StatCard';
import { AttentionQueue } from '@/components/dashboard/AttentionQueue';
import { JobRow } from '@/components/appointments/JobRow';

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

function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/**
 * Home (Total Redesign Part A) — the day screen, composed only from the
 * canonical component set over ONE server-composed payload:
 * S1 day header (header-card pattern) · S2 money strip (StatCard) ·
 * S3 Needs Attention (AttentionQueue, absent when the server composes
 * nothing) · S4 Today's Jobs (JobRow) · S5 Week Ahead (server per-day
 * aggregates) · S6 Money detail (financial-summary rows, collapsed).
 * No section fetches on its own; no number is assembled client-side.
 */
export function DashboardCockpit() {
  const navigate = useNavigate();
  const { role } = useTeamRole();
  const { terms } = useTerminology();
  const { formatCurrency } = useRegionalSettings();
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [doneOpen, setDoneOpen] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);

  const reload = () => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    let active = true;
    loadDashboardCockpit()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        console.error('Cockpit fetch error:', e);
        if (active) setError(e instanceof Error ? e.message : 'Home data could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reloadKey]);

  if (loading) {
    // Home-shaped skeleton (spec P-2): S1 band, four stat blocks, the
    // attention strip, then the two-column body — never a spinner.
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading home">
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
        <div className="grid gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
          <Skeleton className="h-40 rounded-lg" />
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
            <p className="text-sm font-medium">Home data could not be loaded.</p>
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
          No home data is available for this workspace.
        </CardContent>
      </Card>
    );
  }

  const timeZone = data.timeZone;
  const todayLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(new Date());

  // S1 greeting: the signed-in user (payload), shop name as fallback —
  // never the business-settings owner name (H-13).
  const greetingName = data.userDisplayName?.split(' ')[0] || data.shopName || null;

  // S1 pulse: T-19 day aggregates as one sentence. When the attention
  // queue is empty, the pulse carries the clean-day line (S3's empty
  // state renders no card at all).
  const pulseSegments = [
    `${data.jobsToday} ${pluralize(data.jobsToday, 'appointment')} today`,
    `${data.jobsInProgress} in progress`,
    `${formatCurrency(data.collectedToday)} collected`,
    `${formatCurrency(data.bookedToday)} booked`,
  ];
  if (data.attention.length === 0) pulseSegments.push('Nothing needs your attention');

  const canOpenAppointments = canAccessRoute(role, '/appointments');
  const openJob = (job: CockpitJob) => navigate(`/appointments/${job.id}`);
  const newAppointment = () => navigate('/appointments', { state: { openNewAppointment: true } });

  // S4 groups, in urgency order: running now, the rest of the day by
  // start time, then what is done (collapsed below).
  const nowJobs = data.todaysJobs.filter((job) => job.status === 'in_progress');
  const doneJobs = data.todaysJobs.filter((job) => job.status === 'completed');
  const upNextJobs = data.todaysJobs.filter(
    (job) => job.status !== 'in_progress' && job.status !== 'completed',
  );

  const collectedLine = (label: string, value: number, sub?: string) => (
    <li key={label} className="flex items-baseline justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(value)}</p>
    </li>
  );

  return (
    <div className="space-y-5">
      {/* S1 · Day header — date, greeting + pulse, the ONE primary action. */}
      <div>
        <p className="type-label text-muted-foreground">
          Today · {todayLabel}
        </p>
        <p className="mt-1.5 max-w-2xl text-base text-foreground tabular-nums">
          {greetingName ? `${greetingName}, here’s the day: ` : 'Here’s the day: '}
          {pulseSegments.join(' · ')}.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {canWrite(role, 'appointments') && (
            <Button className="bg-primary-action shadow-button" onClick={newAppointment}>
              New Appointment
            </Button>
          )}
          {canWrite(role, 'quotes') && (
            <Button variant="ghost" onClick={() => navigate('/quotes')}>
              New {terms.quote}
            </Button>
          )}
          {canWrite(role, 'customers') && (
            <Button variant="ghost" onClick={() => navigate('/customers')}>
              Add {terms.customer}
            </Button>
          )}
        </div>
      </div>

      {/* S2 · Money strip — four facts, each drilling into its own screen. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Collected today"
          value={formatCurrency(data.collectedToday)}
          hint={`Yesterday ${formatCurrency(data.collectedYesterday)}`}
          tone="accent"
          href={canAccessRoute(role, '/financials') ? '/financials' : undefined}
        />
        <StatCard
          label="Booked today"
          value={formatCurrency(data.bookedToday)}
          href={canOpenAppointments ? '/appointments' : undefined}
        />
        <StatCard
          label="Jobs today"
          value={String(data.jobsToday)}
          hint={`${data.jobsCompletedToday} completed · ${data.jobsToGo} to go`}
          href={canOpenAppointments ? '/appointments' : undefined}
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(data.outstandingTotal)}
          hint={`${data.outstandingCount} open ${pluralize(data.outstandingCount, 'invoice')}`}
          tone={data.outstandingTotal > 0 ? 'attention' : 'default'}
          href={canAccessRoute(role, '/invoices') ? '/invoices' : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          {/* S3 · Needs Attention — absent entirely when nothing composes. */}
          <AttentionQueue items={data.attention} />

          {/* S4 · Today's Jobs — one card, Now / Up next / Done. */}
          <Card aria-label="Today's jobs">
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Today&rsquo;s jobs</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                  {data.jobsToday} {pluralize(data.jobsToday, 'job')} · {formatCurrency(data.bookedToday)} booked · {formatCurrency(data.collectedToday)} collected
                </p>
              </div>
              {canOpenAppointments && (
                <Link
                  to="/appointments"
                  className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-primary transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  View all
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {data.todaysJobs.length === 0 ? (
                <div className="rounded-lg bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Nothing scheduled today. The book is open.</p>
                  {canWrite(role, 'appointments') && (
                    <Button size="sm" className="mt-3 bg-primary-action shadow-button" onClick={newAppointment}>
                      New Appointment
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {nowJobs.length > 0 && (
                    <div>
                      <p className="type-label mb-2 text-muted-foreground">Now</p>
                      <div className="space-y-2">
                        {nowJobs.map((job) => (
                          <JobRow key={job.id} appointment={job} onClick={openJob} />
                        ))}
                      </div>
                    </div>
                  )}
                  {upNextJobs.length > 0 && (
                    <div>
                      <p className="type-label mb-2 text-muted-foreground">Up next</p>
                      <div className="space-y-2">
                        {upNextJobs.map((job) => (
                          <JobRow key={job.id} appointment={job} onClick={openJob} />
                        ))}
                      </div>
                    </div>
                  )}
                  {doneJobs.length > 0 && (
                    <Collapsible open={doneOpen} onOpenChange={setDoneOpen}>
                      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-lg py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="type-label text-muted-foreground">
                          Done · {doneJobs.length} {pluralize(doneJobs.length, 'job')}
                        </span>
                        <span className={cn('text-muted-foreground transition-transform', doneOpen && 'rotate-180')} aria-hidden="true">⌄</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2">
                        <div className="space-y-2">
                          {doneJobs.map((job) => (
                            <JobRow key={job.id} appointment={job} onClick={openJob} />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          {/* S5 · Week Ahead — server per-day aggregates, rendered verbatim. */}
          <Card aria-label="Week ahead">
            <CardHeader className="pb-0">
              <CardTitle>Week ahead</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1">
                {data.weekAhead.map((dayCell) => {
                  // Noon pin keeps weekday/day rendering stable around DST shifts.
                  const day = new Date(`${dayCell.date}T12:00:00`);
                  const cell = (
                    <>
                      <span className="type-label text-muted-foreground">
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className="text-base font-semibold tabular-nums">{day.getDate()}</span>
                      <span
                        className={
                          dayCell.jobs > 0
                            ? 'text-sm font-semibold leading-tight tabular-nums'
                            : 'text-sm leading-tight text-muted-foreground/50 tabular-nums'
                        }
                      >
                        {dayCell.jobs > 0 ? dayCell.jobs : '—'}
                      </span>
                      <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">
                        {dayCell.booked > 0 ? formatCurrency(dayCell.booked) : ''}
                      </span>
                    </>
                  );
                  const cellClass = 'flex flex-col items-center gap-0.5 rounded-md px-1 py-2 text-center';
                  return canOpenAppointments ? (
                    <button
                      key={dayCell.date}
                      type="button"
                      onClick={() => navigate('/appointments')}
                      className={`${cellClass} transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                      aria-label={`${day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}: ${dayCell.jobs} ${pluralize(dayCell.jobs, 'job')}, ${formatCurrency(dayCell.booked)} booked. Open appointments.`}
                    >
                      {cell}
                    </button>
                  ) : (
                    <div key={dayCell.date} className={cellClass}>
                      {cell}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* S6 · Money detail — collapsed; collected cash + labeled mix. */}
          <Collapsible open={moneyOpen} onOpenChange={setMoneyOpen}>
            <Card>
              <CardHeader className="pb-0">
                <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <CardTitle>Money</CardTitle>
                  <span className={cn('text-muted-foreground transition-transform', moneyOpen && 'rotate-180')} aria-hidden="true">⌄</span>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <ul className="divide-y divide-border">
                    {collectedLine('Collected this week', data.collectedWeek)}
                    {collectedLine(
                      'Collected this month',
                      data.collectedMonth,
                      `Prev month to date ${formatCurrency(data.collectedPrevMonthMTD)}`,
                    )}
                    {collectedLine('Collected year to date', data.collectedYTD)}
                  </ul>
                  <p className="type-label mt-4 text-muted-foreground">Service mix · month to date</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Completed work — what the shop did, not cash collected.</p>
                  {data.serviceMixMTD.length === 0 ? (
                    <p className="mt-2 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                      No completed services recorded this month.
                    </p>
                  ) : (
                    <ul className="mt-1 divide-y divide-border">
                      {data.serviceMixMTD.map((row) => (
                        <li key={row.type} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{row.type}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.count} {pluralize(row.count, 'job')}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatCurrency(row.revenue)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}

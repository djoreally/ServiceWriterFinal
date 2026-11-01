/**
 * Home Cockpit Query (Total Redesign Part A)
 *
 * Home is fed by ONE payload: the extended cockpit-rows endpoint composes
 * the day's canonical job rows (with server-composed T-14 job money), the
 * day aggregates, the week-ahead aggregates, the outstanding-invoice
 * facts, and the Needs Attention queue server-side. This module adds only
 * the collected-cash series (payments net_collected_cents, bucketed from
 * one YTD fetch) and maps job rows into the canonical Appointment shape
 * the shared JobRow renders. It never assembles attention items, day
 * counts, or week buckets from raw facts — that composition is the
 * server's (truth table T-14/T-19, friction M-1).
 */
import { apiClient } from '@/lib/api-client';
import { fetchBusinessSettings, resolveCurrentWorkspace } from '@/application/queries/settings.query';
import { zonedDateTimeParts, zonedLocalDateTimeToUtc } from '@/server/scheduling/timezone';
import { fetchCanonicalCashReceipts } from '@/application/queries/canonical-cash-receipts.query';
import { safeParseDate } from '@/lib/datetime';
import { appointmentStatusView } from '@/lib/status-vocabulary';
import type { Appointment, Customer, Vehicle } from '@/shared/types';
import {
  format,
  addDays,
  startOfWeek,
  startOfMonth,
  startOfYear,
} from 'date-fns';

/** One server-composed Needs Attention item (see AttentionQueue). */
export interface AttentionItem {
  id: string;
  tone: 'warning' | 'danger';
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
}

/** One server-aggregated week-ahead day cell (S5). */
export interface WeekAheadDay {
  /** Local date, yyyy-MM-dd, in the workspace timezone. */
  date: string;
  jobs: number;
  booked: number;
}

export interface CockpitServiceTypeRev {
  type: string;
  revenue: number;
  count: number;
}

/** A canonical appointment row for Home's job list (rendered by JobRow). */
export interface CockpitJob extends Appointment {
  starts_at: string;
  vehicles?: Vehicle[] | null;
}

export interface CockpitData {
  /** Signed-in user's display name (server payload); null when unset. */
  userDisplayName: string | null;
  /** Shop name from business settings — the greeting's fallback. */
  shopName: string | null;
  timeZone: string;
  collectedToday: number;
  collectedYesterday: number;
  collectedWeek: number;
  collectedMonth: number;
  collectedYTD: number;
  collectedPrevMonthMTD: number;
  bookedToday: number;
  jobsToday: number;
  jobsInProgress: number;
  jobsToGo: number;
  jobsCompletedToday: number;
  outstandingCount: number;
  outstandingTotal: number;
  attention: AttentionItem[];
  todaysJobs: CockpitJob[];
  weekAhead: WeekAheadDay[];
  serviceMixMTD: CockpitServiceTypeRev[];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sumNetCollectedDollars(rows: Array<{ net_collected_cents: number | null }> | null): number {
  return (rows || []).reduce((sum, row) => sum + (Number(row.net_collected_cents) || 0), 0) / 100;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

interface CockpitRowPayload {
  id: string;
  starts_at: string;
  ends_at?: string | null;
  duration_minutes?: number | null;
  status: string;
  source?: string | null;
  metadata?: unknown;
  confirmation_code?: string | null;
  customer_id?: string | null;
  vehicle_id?: string | null;
  assigned_user_id?: string | null;
  location_address?: string | null;
  estimated_cost?: number | string | null;
  display_title?: string | null;
  primary_service_name?: string | null;
  status_label?: string | null;
  status_tone?: Appointment['status_tone'];
  job_total?: number | null;
  job_due?: number | null;
  customers?: {
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
    phone?: string | null;
  } | Array<{
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
    phone?: string | null;
  }> | null;
  vehicles?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
  } | Array<{
    year?: number | null;
    make?: string | null;
    model?: string | null;
  }> | null;
}

/**
 * Map a server-composed cockpit row into the canonical Appointment shape
 * — the same mapping discipline as the appointments list mapper: titles
 * and status presentation come from the server's composed fields, never
 * from client-side synthesis.
 */
function mapJobRow(row: CockpitRowPayload, timeZone: string): CockpitJob {
  const metadata = object(row.metadata);
  const customerRel = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const customer: Customer | null = customerRel
    ? {
        id: row.customer_id ?? '',
        name: [customerRel.first_name, customerRel.last_name].filter(Boolean).join(' ')
          || customerRel.company_name
          || 'Customer',
        phone: customerRel.phone ?? '',
        email: '',
      }
    : null;
  const vehicleRel = Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles;
  const vehicle: Vehicle | null = vehicleRel
    ? {
        id: row.vehicle_id ?? '',
        make: vehicleRel.make || 'Unknown',
        model: vehicleRel.model || 'Unknown',
        year: Number(vehicleRel.year || new Date().getFullYear()),
      }
    : null;
  const startsAt = safeParseDate(row.starts_at);
  const local = startsAt ? zonedDateTimeParts(startsAt, timeZone) : null;
  const duration = row.duration_minutes
    ?? (startsAt && row.ends_at
      ? Math.max(15, Math.round((Date.parse(row.ends_at) - startsAt.getTime()) / 60000))
      : 60);
  const statusView = appointmentStatusView(row.status);
  const title = optionalString(row.display_title) ?? 'Appointment';
  const estimatedCost = metadata.estimated_cost == null
    ? (row.estimated_cost == null ? undefined : Number(row.estimated_cost))
    : Number(metadata.estimated_cost);
  return {
    id: row.id,
    title,
    display_title: title,
    primary_service_name: optionalString(row.primary_service_name) ?? null,
    confirmation_code: optionalString(row.confirmation_code) ?? null,
    status_label: optionalString(row.status_label) ?? statusView.status_label,
    status_tone: row.status_tone ?? statusView.status_tone,
    scheduled_date: local ? `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}` : '',
    scheduled_time: local ? `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}` : '',
    duration_minutes: duration,
    status: row.status,
    customer,
    vehicle,
    vehicles: vehicle ? [vehicle] : [],
    guest_name: optionalString(metadata.guest_name) ?? customer?.name ?? null,
    guest_email: optionalString(metadata.guest_email),
    guest_phone: optionalString(metadata.guest_phone) ?? customer?.phone ?? null,
    location_address: optionalString(row.location_address),
    notes: optionalString(metadata.notes),
    description: optionalString(metadata.description),
    estimated_cost: Number.isFinite(estimatedCost) ? estimatedCost : undefined,
    assigned_technician_id: row.assigned_user_id ?? null,
    source: row.source ?? undefined,
    intake_responses: metadata,
    job_total: row.job_total == null ? undefined : Number(row.job_total),
    job_due: row.job_due == null ? undefined : Number(row.job_due),
    starts_at: row.starts_at,
  };
}

export async function fetchDashboardCockpit(): Promise<CockpitData | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const workspaceId = context.workspaceId;
  const settings = await fetchBusinessSettings();
  const timeZone = settings?.timezone || 'America/New_York';
  const now = new Date();
  const zoned = zonedDateTimeParts(now, timeZone);
  const localToday = new Date(zoned.year, zoned.month - 1, zoned.day);
  const localIso = (date: Date) => format(date, 'yyyy-MM-dd');
  const boundary = (date: Date, end = false) => zonedLocalDateTimeToUtc(localIso(date), end ? '23:59:59' : '00:00:00', timeZone).toISOString();
  const todayStart = boundary(localToday);
  const todayEnd = boundary(localToday, true);
  const yesterday = addDays(localToday, -1);
  const yesterdayStart = boundary(yesterday);
  const yesterdayEnd = boundary(yesterday, true);
  const weekStart = boundary(startOfWeek(localToday, { weekStartsOn: 1 }));
  const monthStart = boundary(startOfMonth(localToday));
  const yearStart = boundary(startOfYear(localToday));
  const next7End = boundary(addDays(localToday, 7), true);

  const dayOfMonth = localToday.getDate();
  const prevMonth = new Date(localToday.getFullYear(), localToday.getMonth() - 1, 1);
  const prevMonthStart = boundary(startOfMonth(prevMonth));
  const prevMonthLastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
  const prevMonthMtdEnd = boundary(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), Math.min(dayOfMonth, prevMonthLastDay)), true);

  const [
    allReceipts,
    cockpitRows,
  ] = await Promise.all([
    fetchCanonicalCashReceipts({ workspaceId, from: yearStart }),
    apiClient.get<{
      todayApptRows: CockpitRowPayload[];
      inProgressRows: CockpitRowPayload[];
      completedTodayRows: Array<{ appointment_id?: string | null }>;
      completedMonthRows: Array<{ total_amount?: number | null; metadata?: unknown }>;
      attention: AttentionItem[];
      weekAhead: WeekAheadDay[];
      day: { jobsToday: number; jobsInProgress: number; jobsToGo: number; bookedToday: number };
      outstanding: { count: number; total: number };
      userDisplayName: string | null;
    }>('/v1/platform/dashboard/cockpit-rows', {
      query: {
        selected_workspace_id: workspaceId,
        today_start: todayStart,
        today_end: todayEnd,
        yesterday_start: yesterdayStart,
        yesterday_end: yesterdayEnd,
        week_start: weekStart,
        month_start: monthStart,
        year_start: yearStart,
        next7_end: next7End,
        prev_month_start: prevMonthStart,
        prev_month_mtd_end: prevMonthMtdEnd,
      },
    }),
  ]);

  if (allReceipts.error) throw allReceipts.error;

  // Bucket the single YTD fetch into the date ranges Home needs.
  const receipts = allReceipts.data;
  const inRange = (from: string, to?: string) =>
    receipts.filter((r) => {
      const t = r.collected_at;
      return t >= from && (to == null || t <= to);
    });

  const {
    todayApptRows, inProgressRows, completedTodayRows, completedMonthRows,
    attention, weekAhead, day, outstanding, userDisplayName,
  } = cockpitRows;

  const todayJobs = (todayApptRows ?? []).map((row) => mapJobRow(row, timeZone));
  const inProgressJobs = (inProgressRows ?? []).map((row) => mapJobRow(row, timeZone));
  // The day list is today's rows plus any still-running job that started
  // earlier (it belongs to the Now group), merged by id and time-ordered.
  const todayIds = new Set(todayJobs.map((job) => job.id));
  const todaysJobs = [...inProgressJobs.filter((job) => !todayIds.has(job.id)), ...todayJobs]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const serviceTypeMap = new Map<string, { revenue: number; count: number }>();
  for (const row of completedMonthRows ?? []) {
    const metadata = object(row.metadata);
    const type = String(metadata.service_type ?? metadata.service_name ?? 'Service');
    const current = serviceTypeMap.get(type) ?? { revenue: 0, count: 0 };
    current.revenue += Number(row.total_amount ?? 0);
    current.count += 1;
    serviceTypeMap.set(type, current);
  }
  const serviceMixMTD = Array.from(serviceTypeMap.entries())
    .map(([type, values]) => ({ type, ...values }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  return {
    userDisplayName: userDisplayName ?? null,
    shopName: settings?.business_name || null,
    timeZone,
    collectedToday: sumNetCollectedDollars(inRange(todayStart, todayEnd)),
    collectedYesterday: sumNetCollectedDollars(inRange(yesterdayStart, yesterdayEnd)),
    collectedWeek: sumNetCollectedDollars(inRange(weekStart)),
    collectedMonth: sumNetCollectedDollars(inRange(monthStart)),
    collectedYTD: sumNetCollectedDollars(receipts),
    collectedPrevMonthMTD: sumNetCollectedDollars(inRange(prevMonthStart, prevMonthMtdEnd)),
    bookedToday: Number(day?.bookedToday ?? 0),
    jobsToday: Number(day?.jobsToday ?? todayJobs.length),
    jobsInProgress: Number(day?.jobsInProgress ?? inProgressJobs.length),
    jobsToGo: Number(day?.jobsToGo ?? 0),
    jobsCompletedToday: new Set((completedTodayRows ?? []).map((row) => row.appointment_id).filter(Boolean)).size,
    outstandingCount: Number(outstanding?.count ?? 0),
    outstandingTotal: Number(outstanding?.total ?? 0),
    attention: attention ?? [],
    todaysJobs,
    weekAhead: weekAhead ?? [],
    serviceMixMTD,
  };
}

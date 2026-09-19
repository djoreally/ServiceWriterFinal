/**
 * Dashboard Cockpit Query
 *
 * Owner dashboard data from canonical production tables only:
 * payments -> collected cash, invoices -> A/R, service_records -> completed/in-progress work,
 * appointments -> schedule. All reads are explicitly workspace scoped.
 */
import { productionSupabase } from '@/integrations/supabase/client';
import { fetchBusinessSettings, resolveCurrentWorkspace } from '@/application/queries/settings.query';
import { zonedDateTimeParts, zonedLocalDateTimeToUtc } from '@/server/scheduling/timezone';
import { fetchCanonicalCashReceipts } from '@/application/queries/canonical-cash-receipts.query';
import {
  format,
  addDays,
  parseISO,
} from 'date-fns';

export interface CockpitAppointment {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  guest_name: string | null;
  estimated_cost: number | null;
}

export interface CockpitJobInProgress {
  id: string;
  service_type: string;
  customer_name: string;
  vehicle: string | null;
  started_at: string | null;
}

export interface CockpitServiceTypeRev {
  type: string;
  revenue: number;
  count: number;
}

export interface CockpitData {
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  revenueYTD: number;
  revenueTodayPrev: number;
  revenueMonthPrev: number;
  outstandingAR: number;
  jobsInProgress: number;
  jobsCompletedToday: number;
  appointmentsToday: number;
  unpaidInvoices: number;
  todaysAppointments: CockpitAppointment[];
  upcomingNext7: CockpitAppointment[];
  jobsInProgressList: CockpitJobInProgress[];
  serviceTypeRevenueMTD: CockpitServiceTypeRev[];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sumNetCollectedDollars(rows: Array<{ net_collected_cents: number | null }> | null): number {
  return (rows || []).reduce((sum, row) => sum + (Number(row.net_collected_cents) || 0), 0) / 100;
}

function mapAppointment(row: {
  id: string;
  starts_at: string;
  status: string;
  metadata: unknown;
}): CockpitAppointment {
  const metadata = object(row.metadata);
  const startsAt = new Date(row.starts_at);
  const validDate = !Number.isNaN(startsAt.getTime());
  return {
    id: row.id,
    title: String(metadata.title ?? metadata.service_name ?? 'Appointment'),
    scheduled_date: validDate ? format(startsAt, 'yyyy-MM-dd') : '',
    scheduled_time: validDate ? format(startsAt, 'HH:mm') : null,
    status: row.status,
    guest_name: metadata.guest_name == null ? null : String(metadata.guest_name),
    estimated_cost: metadata.estimated_cost == null ? null : Number(metadata.estimated_cost),
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
    payToday,
    payYesterday,
    payWeek,
    payMonth,
    payYtd,
    payPrevMonth,
    todayAppts,
    upcoming7,
    inProgress,
    completedToday,
    completedMonth,
    invoices,
  ] = await Promise.all([
    fetchCanonicalCashReceipts({ workspaceId, from: todayStart, to: todayEnd }),
    fetchCanonicalCashReceipts({ workspaceId, from: yesterdayStart, to: yesterdayEnd }),
    fetchCanonicalCashReceipts({ workspaceId, from: weekStart }),
    fetchCanonicalCashReceipts({ workspaceId, from: monthStart }),
    fetchCanonicalCashReceipts({ workspaceId, from: yearStart }),
    fetchCanonicalCashReceipts({ workspaceId, from: prevMonthStart, to: prevMonthMtdEnd }),
    productionSupabase
      .from('appointments')
      .select('id,starts_at,status,metadata')
      .eq('workspace_id', workspaceId)
      .gte('starts_at', todayStart)
      .lt('starts_at', todayEnd)
      .in('status', ['confirmed', 'in_progress'])
      .order('starts_at', { ascending: true }),
    productionSupabase
      .from('appointments')
      .select('id,starts_at,status,metadata')
      .eq('workspace_id', workspaceId)
      .gt('starts_at', todayEnd)
      .lt('starts_at', next7End)
      .eq('status', 'confirmed')
      .order('starts_at', { ascending: true })
      .limit(10),
    productionSupabase
      .from('appointments')
      .select('id,starts_at,customer_id,vehicle_id,metadata')
      .eq('workspace_id', workspaceId)
      .eq('status', 'in_progress')
      .order('starts_at', { ascending: false })
      .limit(20),
    productionSupabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'completed')
      .gte('updated_at', todayStart)
      .lt('updated_at', todayEnd),
    productionSupabase
      .from('service_records')
      .select('id,total_amount,completed_at,metadata')
      .eq('workspace_id', workspaceId)
      .eq('status', 'completed')
      .gte('completed_at', monthStart)
      .order('completed_at', { ascending: true }),
    productionSupabase
      .from('invoices')
      .select('id,total,amount_paid,status')
      .eq('workspace_id', workspaceId)
      .in('status', ['issued', 'partially_paid', 'past_due']),
  ]);

  for (const result of [payToday, payYesterday, payWeek, payMonth, payYtd, payPrevMonth]) {
    if (result.error) throw result.error;
  }
  if (todayAppts.error) throw todayAppts.error;
  if (upcoming7.error) throw upcoming7.error;
  if (inProgress.error) throw inProgress.error;
  if (completedToday.error) throw completedToday.error;
  if (completedMonth.error) throw completedMonth.error;
  if (invoices.error) throw invoices.error;

  const outstandingRows = invoices.data ?? [];
  const outstandingAR = outstandingRows.reduce(
    (sum, invoice) => sum + Math.max(Number(invoice.total ?? 0) - Number(invoice.amount_paid ?? 0), 0),
    0,
  );

  const jobsInProgressList: CockpitJobInProgress[] = (inProgress.data ?? []).map((row) => {
    const metadata = object(row.metadata);
    const vehicleParts = [metadata.vehicle_year, metadata.vehicle_make, metadata.vehicle_model]
      .filter((value) => value != null && String(value).trim())
      .map(String);
    return {
      id: row.id,
      service_type: String(metadata.service_type ?? metadata.service_name ?? 'Service'),
      customer_name: String(metadata.customer_name ?? 'Customer'),
      vehicle: vehicleParts.length ? vehicleParts.join(' ') : null,
      started_at: row.starts_at ?? null,
    };
  });

  const serviceTypeMap = new Map<string, { revenue: number; count: number }>();
  for (const row of completedMonth.data ?? []) {
    const metadata = object(row.metadata);
    const type = String(metadata.service_type ?? metadata.service_name ?? 'Service');
    const current = serviceTypeMap.get(type) ?? { revenue: 0, count: 0 };
    current.revenue += Number(row.total_amount ?? 0);
    current.count += 1;
    serviceTypeMap.set(type, current);
  }
  const serviceTypeRevenueMTD = Array.from(serviceTypeMap.entries())
    .map(([type, values]) => ({ type, ...values }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const todaysAppointments = (todayAppts.data ?? []).map(mapAppointment);
  const upcomingNext7 = (upcoming7.data ?? [])
    .map(mapAppointment)
    .map((appointment) => ({
      appointment,
      startsAt: parseISO(`${appointment.scheduled_date}T${appointment.scheduled_time || '00:00'}`),
    }))
    .filter(({ startsAt }) => !Number.isNaN(startsAt.getTime()))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map(({ appointment }) => appointment);

  return {
    revenueToday: sumNetCollectedDollars(payToday.data),
    revenueWeek: sumNetCollectedDollars(payWeek.data),
    revenueMonth: sumNetCollectedDollars(payMonth.data),
    revenueYTD: sumNetCollectedDollars(payYtd.data),
    revenueTodayPrev: sumNetCollectedDollars(payYesterday.data),
    revenueMonthPrev: sumNetCollectedDollars(payPrevMonth.data),
    outstandingAR,
    jobsInProgress: jobsInProgressList.length,
    jobsCompletedToday: completedToday.count || 0,
    appointmentsToday: todaysAppointments.length,
    unpaidInvoices: outstandingRows.length,
    todaysAppointments,
    upcomingNext7,
    jobsInProgressList,
    serviceTypeRevenueMTD,
  };
}

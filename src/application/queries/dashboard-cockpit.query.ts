/**
 * Dashboard Cockpit Query
 *
 * Owner dashboard data from canonical production tables only:
 * payments -> collected cash, invoices -> A/R, service_records -> completed/in-progress work,
 * appointments -> schedule. All reads are explicitly workspace scoped.
 */
import { productionSupabase } from '@/integrations/supabase/client';
import { resolveCurrentWorkspace } from '@/application/queries/settings.query';
import { fetchCanonicalCashReceipts } from '@/application/queries/canonical-cash-receipts.query';
import {
  format,
  startOfWeek,
  startOfMonth,
  startOfYear,
  startOfDay,
  endOfDay,
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

  const now = new Date();
  const todayStart = format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss");
  const todayEnd = format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss");
  const yesterdayStart = format(addDays(startOfDay(now), -1), "yyyy-MM-dd'T'HH:mm:ss");
  const yesterdayEnd = format(addDays(endOfDay(now), -1), "yyyy-MM-dd'T'HH:mm:ss");
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ss");
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd'T'HH:mm:ss");
  const yearStart = format(startOfYear(now), "yyyy-MM-dd'T'HH:mm:ss");
  const next7End = format(endOfDay(addDays(now, 7)), "yyyy-MM-dd'T'HH:mm:ss");

  const dayOfMonth = now.getDate();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStart = format(startOfMonth(prevMonth), "yyyy-MM-dd'T'HH:mm:ss");
  const prevMonthLastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
  const prevMonthMtdEnd = format(
    endOfDay(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), Math.min(dayOfMonth, prevMonthLastDay))),
    "yyyy-MM-dd'T'HH:mm:ss",
  );

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
      .lte('starts_at', todayEnd)
      .in('status', ['confirmed', 'in_progress', 'requested'])
      .order('starts_at', { ascending: true }),
    productionSupabase
      .from('appointments')
      .select('id,starts_at,status,metadata')
      .eq('workspace_id', workspaceId)
      .gt('starts_at', todayEnd)
      .lte('starts_at', next7End)
      .in('status', ['confirmed', 'requested'])
      .order('starts_at', { ascending: true })
      .limit(10),
    productionSupabase
      .from('service_records')
      .select('id,started_at,customer_id,vehicle_id,metadata')
      .eq('workspace_id', workspaceId)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(20),
    productionSupabase
      .from('service_records')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'completed')
      .gte('completed_at', todayStart)
      .lte('completed_at', todayEnd),
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
      started_at: row.started_at ?? null,
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

/** Provider Snapshot Query — canonical workspace-scoped dashboard KPIs. */
import { apiClient } from "@/lib/api-client";
import {
  format,
  startOfWeek,
  startOfMonth,
  startOfYear,
  addDays,
  parseISO,
} from "date-fns";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { fetchCanonicalCashReceipts } from "@/application/queries/canonical-cash-receipts.query";

export interface UpcomingAppt {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  guest_name: string | null;
}

export interface ServiceTypeRev {
  type: string;
  revenue: number;
  count: number;
}

export interface SnapshotData {
  revenueWeek: number;
  revenueMonth: number;
  revenueYTD: number;
  revenuePrevMonth: number;
  bookingsCompleted: number;
  bookingsScheduled: number;
  pendingPayoutAmount: number;
  payoutsEnabled: boolean | null;
  upcomingAppointments: UpcomingAppt[];
  reviewsSent: number;
  reviewsClicked: number;
  serviceTypeRevenue: ServiceTypeRev[];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sumCollectedNet(rows: Array<{ net_collected_cents: number | null }> | null): number {
  return (rows || []).reduce((sum, row) => sum + (Number(row.net_collected_cents) || 0), 0) / 100;
}

export async function fetchProviderSnapshot(): Promise<SnapshotData | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const workspaceId = context.workspaceId;

  const now = new Date();
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const yearStart = format(startOfYear(now), "yyyy-MM-dd");
  const today = format(now, "yyyy-MM-dd");
  const next7 = format(addDays(now, 7), "yyyy-MM-dd");
  const prevMonthStart = format(startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1)), "yyyy-MM-dd");
  const prevMonthEnd = format(new Date(now.getFullYear(), now.getMonth(), 0), "yyyy-MM-dd");

  const [weekPayRes, monthPayRes, ytdPayRes, prevMonthPayRes, snapshotRows] = await Promise.all([
    fetchCanonicalCashReceipts({ workspaceId, from: `${weekStart}T00:00:00` }),
    fetchCanonicalCashReceipts({ workspaceId, from: `${monthStart}T00:00:00` }),
    fetchCanonicalCashReceipts({ workspaceId, from: `${yearStart}T00:00:00` }),
    fetchCanonicalCashReceipts({ workspaceId, from: `${prevMonthStart}T00:00:00`, to: `${prevMonthEnd}T23:59:59` }),
    apiClient.get<{
      completedCount: number;
      scheduledCount: number;
      upcomingRows: Array<{ id: string; starts_at: string; status: string; metadata: unknown }>;
      serviceRows: Array<{ id: string; total_amount: number | null; completed_at: string; metadata: unknown }>;
      settingsRow: { operational_settings: unknown } | null;
    }>("/v1/platform/provider-snapshot/rows", {
      query: { selected_workspace_id: workspaceId, month_start: monthStart, today, next7 },
    }),
  ]);

  for (const result of [weekPayRes, monthPayRes, ytdPayRes, prevMonthPayRes]) {
    if (result.error) throw result.error;
  }

  const completedRes = { count: snapshotRows.completedCount, data: null as null, error: null as null };
  const scheduledRes = { count: snapshotRows.scheduledCount, data: null as null, error: null as null };
  const upcomingRes = { data: snapshotRows.upcomingRows, error: null as null };
  const servicesRes = { data: snapshotRows.serviceRows, error: null as null };
  const settingsRes = { data: snapshotRows.settingsRow, error: null as null };

  const typeMap = new Map<string, { revenue: number; count: number }>();
  for (const row of servicesRes.data ?? []) {
    const metadata = object(row.metadata);
    const type = String(metadata.service_type ?? metadata.service_name ?? "Service");
    const current = typeMap.get(type) ?? { revenue: 0, count: 0 };
    current.revenue += Number(row.total_amount ?? 0);
    current.count += 1;
    typeMap.set(type, current);
  }
  const serviceTypeRevenue = Array.from(typeMap.entries())
    .map(([type, values]) => ({ type, ...values }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const upcomingAppointments: UpcomingAppt[] = (upcomingRes.data ?? [])
    .map((row) => {
      const metadata = object(row.metadata);
      const start = new Date(row.starts_at);
      return {
        id: row.id,
        title: String(metadata.title ?? metadata.service_name ?? "Appointment"),
        scheduled_date: Number.isNaN(start.getTime()) ? "" : format(start, "yyyy-MM-dd"),
        scheduled_time: Number.isNaN(start.getTime()) ? "" : format(start, "HH:mm"),
        status: row.status,
        guest_name: metadata.guest_name == null ? null : String(metadata.guest_name),
      };
    })
    .map((appt) => ({ appt, startsAt: parseISO(`${appt.scheduled_date}T${appt.scheduled_time || "00:00"}`) }))
    .filter(({ startsAt }) => !Number.isNaN(startsAt.getTime()) && startsAt >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 10)
    .map(({ appt }) => appt);

  const operational = object(settingsRes.data?.operational_settings);
  const payoutsEnabled = operational.stripe_payouts_enabled == null
    ? null
    : operational.stripe_payouts_enabled === true || operational.stripe_payouts_enabled === "true";

  return {
    revenueWeek: sumCollectedNet(weekPayRes.data),
    revenueMonth: sumCollectedNet(monthPayRes.data),
    revenueYTD: sumCollectedNet(ytdPayRes.data),
    revenuePrevMonth: sumCollectedNet(prevMonthPayRes.data),
    bookingsCompleted: completedRes.count || 0,
    bookingsScheduled: scheduledRes.count || 0,
    pendingPayoutAmount: 0,
    payoutsEnabled,
    upcomingAppointments,
    reviewsSent: 0,
    reviewsClicked: 0,
    serviceTypeRevenue,
  };
}

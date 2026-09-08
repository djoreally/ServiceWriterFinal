/**
 * Provider Snapshot Query
 * Fetches all dashboard KPI data for the provider snapshot widget.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  format,
  startOfWeek,
  startOfMonth,
  startOfYear,
  addDays,
  parseISO,
} from "date-fns";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
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

export async function fetchProviderSnapshot(): Promise<SnapshotData | null> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;
  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  const now = new Date();
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const yearStart = format(startOfYear(now), "yyyy-MM-dd");
  const today = format(now, "yyyy-MM-dd");
  const next7 = format(addDays(now, 7), "yyyy-MM-dd");
  const prevMonthStart = format(startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1)), "yyyy-MM-dd");
  const prevMonthEnd = format(new Date(now.getFullYear(), now.getMonth(), 0), "yyyy-MM-dd");

  const [
    weekPayRes, monthPayRes, ytdPayRes, prevMonthPayRes,
    completedRes, scheduledRes, upcomingRes, reviewsRes,
    servicesRes, profileRes, apptServicesRes,
  ] = await Promise.all([
    fetchCanonicalCashReceipts({ workspaceId: context.workspaceId, from: `${weekStart}T00:00:00` }),
    fetchCanonicalCashReceipts({ workspaceId: context.workspaceId, from: `${monthStart}T00:00:00` }),
    fetchCanonicalCashReceipts({ workspaceId: context.workspaceId, from: `${yearStart}T00:00:00` }),
    fetchCanonicalCashReceipts({ workspaceId: context.workspaceId, from: `${prevMonthStart}T00:00:00`, to: `${prevMonthEnd}T23:59:59` }),
    supabase.from("appointments").select("id", { count: "exact", head: true }).gte("scheduled_date", monthStart).eq("status", "completed"),
    supabase.from("appointments").select("id", { count: "exact", head: true }).gte("scheduled_date", monthStart).in("status", ["confirmed", "pending"]),
    supabase.from("appointments").select("id, title, scheduled_date, scheduled_time, status, guest_name").gte("scheduled_date", today).lte("scheduled_date", next7).in("status", ["confirmed", "pending"]).order("scheduled_date").order("scheduled_time").limit(25),
    supabase.from("review_requests").select("status, clicked_at"),
    supabase.from("services").select("service_type, total_cost, service_date, appointment_id").gte("service_date", monthStart).eq("status", "completed"),
    supabase.from("business_profiles").select("stripe_payouts_enabled, stripe_account_id").eq("user_id", user.id).single(),
    supabase.from("appointment_services").select("appointment_id, name, price, quantity"),
  ]);

  const sumCollectedNet = (
    rows: Array<{ net_collected_cents: number | null }> | null,
  ) => (rows || []).reduce((sum, row) => sum + (Number(row.net_collected_cents) || 0), 0) / 100;

  const apptLineItems = (apptServicesRes.data || []) as Array<{
    appointment_id: string;
    name: string;
    price: number;
    quantity: number;
  }>;
  const apptRevenueMap = new Map<string, number>();
  for (const item of apptLineItems) {
    const current = apptRevenueMap.get(item.appointment_id) || 0;
    apptRevenueMap.set(item.appointment_id, current + (Number(item.price) || 0) * (item.quantity || 1));
  }

  const typeMap: Record<string, { revenue: number; count: number }> = {};
  const monthServices = (servicesRes.data || []) as Array<{
    service_type: string;
    total_cost: number;
    appointment_id: string | null;
  }>;
  for (const s of monthServices) {
    const t = s.service_type || "Other";
    if (!typeMap[t]) typeMap[t] = { revenue: 0, count: 0 };
    let rev = Number(s.total_cost) || 0;
    if (rev === 0 && s.appointment_id) {
      rev = apptRevenueMap.get(s.appointment_id) || 0;
    }
    typeMap[t].revenue += rev;
    typeMap[t].count += 1;
  }
  const serviceTypeRevenue = Object.entries(typeMap)
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const reviews = reviewsRes.data || [];

  return {
    revenueWeek: sumCollectedNet(weekPayRes.data),
    revenueMonth: sumCollectedNet(monthPayRes.data),
    revenueYTD: sumCollectedNet(ytdPayRes.data),
    revenuePrevMonth: sumCollectedNet(prevMonthPayRes.data),
    bookingsCompleted: completedRes.count || 0,
    bookingsScheduled: scheduledRes.count || 0,
    pendingPayoutAmount: 0,
    payoutsEnabled: profileRes.data?.stripe_payouts_enabled ?? null,
    upcomingAppointments: ((upcomingRes.data || []) as UpcomingAppt[])
      .map((appt) => ({
        appt,
        startsAt: parseISO(`${appt.scheduled_date}T${appt.scheduled_time || "00:00"}`),
      }))
      .filter(({ startsAt }) => !Number.isNaN(startsAt.getTime()) && startsAt >= now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, 10)
      .map(({ appt }) => appt),
    reviewsSent: reviews.filter((r) => r.status === "sent" || r.status === "completed").length,
    reviewsClicked: reviews.filter((r) => r.clicked_at).length,
    serviceTypeRevenue,
  };
}

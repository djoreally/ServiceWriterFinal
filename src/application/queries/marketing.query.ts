/**
 * Marketing Queries - Read operations for testimonials, reviews, analytics, and LTV.
 */

import { supabase } from "@/integrations/supabase/client";
import { format, subMonths, parseISO } from "date-fns";

// ── Helpers ──

async function requireUser() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

// ── Testimonials ──

export interface TestimonialRow {
  id: string;
  customer_name: string;
  customer_email: string | null;
  content: string | null;
  video_url: string | null;
  rating: number | null;
  status: string;
  featured: boolean;
  created_at: string;
}

export async function fetchTestimonials(): Promise<TestimonialRow[]> {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("testimonials")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function fetchBusinessSlug(): Promise<string | null> {
  const user = await requireUser();
  const { data } = await supabase
    .from("business_profiles")
    .select("booking_slug")
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.booking_slug ?? null;
}

// ── Review Dashboard ──

export interface ReviewRequestRow {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  platform: string;
  status: string;
  sent_at: string | null;
  clicked_at: string | null;
  created_at: string;
  services?: { service_type: string; description: string } | null;
}

export interface ReviewAnalyticsData {
  total_requests_sent: number;
  total_requests_clicked: number;
  click_through_rate: number;
  requests_by_platform: { platform: string; count: number }[];
  requests_by_status: { status: string; count: number }[];
  daily_trend: { date: string; sent: number }[];
}

export async function fetchReviewDashboardData(): Promise<{
  analytics: ReviewAnalyticsData | null;
  requests: ReviewRequestRow[];
}> {
  const user = await requireUser();

  const [analyticsRes, requestsRes] = await Promise.all([
    (supabase.rpc as any)("get_review_analytics", { p_days: 30 }),
    supabase
      .from("review_requests")
      .select("*, services:service_id (service_type, description)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    analytics: analyticsRes.data?.[0] ?? null,
    requests: (requestsRes.data as ReviewRequestRow[]) ?? [],
  };
}

// ── Marketing Analytics ──

export interface MarketingAnalyticsResult {
  emailsSent: number;
  /** Null until provider-measured open events are connected. */
  emailsOpened: number | null;
  reviewRequestsSent: number;
  reviewRequestsClicked: number;
  testimonials: number;
  approvedTestimonials: number;
  campaigns: number;
  subscribers: number;
  emailQueueStats: { email_type: string; count: number }[];
}

export async function fetchMarketingAnalytics(): Promise<MarketingAnalyticsResult> {
  const user = await requireUser();

  // Parallel fetch all marketing data
  const [emailQueueRes, reviewRes, testimonialRes, campaignRes, subscriberRes] =
    await Promise.all([
      supabase
        .from("email_queue")
        .select("email_type, status")
        .eq("user_id", user.id),
      supabase
        .from("review_requests")
        .select("status, clicked_at")
        .eq("user_id", user.id),
      supabase
        .from("testimonials")
        .select("status")
        .eq("user_id", user.id),
      supabase
        .from("email_marketing_campaigns")
        .select("id")
        .eq("user_id", user.id),
      supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .not("email", "is", null),
    ]);

  const emailQueue = emailQueueRes.data ?? [];
  const reviewRequests = reviewRes.data ?? [];
  const testimonials = testimonialRes.data ?? [];

  const emailsSent = emailQueue.filter((e) => e.status === "sent").length;

  // Calculate email type distribution
  const emailTypeCount = emailQueue.reduce((acc, email) => {
    acc[email.email_type] = (acc[email.email_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const emailQueueStats: { email_type: string; count: number }[] = Object.entries(emailTypeCount).map(
    ([type, count]) => ({
      email_type: type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase()),
      count: Number(count),
    })
  );

  return {
    emailsSent,
    emailsOpened: null,
    reviewRequestsSent: reviewRequests.filter((r) => r.status === "sent").length,
    reviewRequestsClicked: reviewRequests.filter((r) => r.clicked_at).length,
    testimonials: testimonials.length,
    approvedTestimonials: testimonials.filter((t) => t.status === "approved").length,
    campaigns: campaignRes.data?.length ?? 0,
    subscribers: subscriberRes.count ?? 0,
    emailQueueStats,
  };
}

// ── Customer Lifetime Value ──

export interface LTVCustomer {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  lifetime_value: number;
  total_services: number;
  average_order_value: number;
  first_service_date: string | null;
  last_service_date: string | null;
  days_since_last_service: number | null;
  visit_frequency_days: number | null;
  customer_segment: string;
  churn_risk: string;
}

export interface MonthlyRevenuePoint {
  month: string;
  revenue: number;
  services: number;
}

export interface LTVDataResult {
  customers: LTVCustomer[];
  monthlyRevenue: MonthlyRevenuePoint[];
}

export async function fetchLTVData(): Promise<LTVDataResult> {
  const user = await requireUser();

  const twelveMonthsAgo = format(subMonths(new Date(), 12), "yyyy-MM-dd");

  // Parallel: customers + payment/service data for monthly revenue
  const [customerRes, paymentRes, serviceRes] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("user_id", user.id)
      .not("lifetime_value", "is", null)
      .order("lifetime_value", { ascending: false }),
    supabase
      .from("payments")
      .select("created_at, amount, status, appointment_id")
      .eq("user_id", user.id)
      .eq("status", "succeeded")
      .gte("created_at", `${twelveMonthsAgo}T00:00:00`)
      .order("created_at"),
    supabase
      .from("services")
      .select("service_date, total_cost")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("service_date", twelveMonthsAgo)
      .order("service_date"),
  ]);

  if (customerRes.error) throw customerRes.error;

  const customers = (customerRes.data ?? []) as unknown as LTVCustomer[];

  // Build monthly revenue map
  const monthlyMap = new Map<string, { revenue: number; services: number }>();

  if (paymentRes.data && paymentRes.data.length > 0) {
    paymentRes.data.forEach((p) => {
      const month = format(parseISO(p.created_at), "MMM yyyy");
      const existing = monthlyMap.get(month) || { revenue: 0, services: 0 };
      monthlyMap.set(month, {
        revenue: existing.revenue + (p.amount || 0) / 100,
        services: existing.services + 1,
      });
    });
  }

  if (serviceRes.data && serviceRes.data.length > 0) {
    serviceRes.data.forEach((s) => {
      const month = format(parseISO(s.service_date), "MMM yyyy");
      const existing = monthlyMap.get(month) || { revenue: 0, services: 0 };
      monthlyMap.set(month, {
        revenue: existing.revenue,
        services: existing.services + 1,
      });
    });
  }

  const monthlyRevenue = Array.from(monthlyMap.entries()).map(
    ([month, data]) => ({ month, ...data })
  );

  return { customers, monthlyRevenue };
}

// ── Additional marketing UI queries (segmentation, abandoned bookings, retention analytics, live visitors) ──
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface AbandonedBookingRow {
  id: string;
  guest_email: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  last_step: number;
  session_id: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  service_catalog_id: string | null;
  recovered: boolean | null;
  recovery_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchAbandonedBookings(userId: string) {
  return supabase
    .from("abandoned_bookings")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);
}

export async function fetchActiveSegmentNames(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("customer_segments")
    .select("name")
    .eq("user_id", userId)
    .eq("is_active", true);
  return (data ?? []).map((d) => d.name as string);
}

export async function fetchActiveSegmentsForFilter(userId: string) {
  const { data, error } = await supabase
    .from("customer_segments")
    .select("id, name, color")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("priority", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface SegmentCustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  lifetime_value: number | null;
  total_services: number | null;
  last_service_date: string | null;
}

export async function fetchSegmentCustomers(userId: string, segmentName: string) {
  return supabase
    .from("customers")
    .select("id, name, email, phone, lifetime_value, total_services, last_service_date")
    .eq("user_id", userId)
    .eq("customer_segment", segmentName)
    .order("lifetime_value", { ascending: false, nullsFirst: false })
    .limit(500);
}

export async function fetchCustomerIdsInSegment(userId: string, segmentName: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_segment", segmentName);
  if (error) throw error;
  return new Set((data ?? []).map((c) => c.id as string));
}

export interface RetentionSignalRow {
  detected_at: string;
  signal_type: string;
  customer_id: string | null;
}

export async function fetchRetentionSignalsSince(userId: string, sinceISO: string) {
  const { data, error } = await supabase
    .from("retention_signals")
    .select("detected_at, signal_type, customer_id")
    .eq("user_id", userId)
    .gte("detected_at", sinceISO)
    .order("detected_at", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as RetentionSignalRow[];
}

export interface ServiceReminderRow {
  created_at: string;
  reminder_date: string;
  service_type: string;
  status: string;
  customer_id: string | null;
}

export async function fetchServiceRemindersSince(userId: string, sinceISO: string) {
  const { data, error } = await supabase
    .from("service_reminders")
    .select("created_at, reminder_date, service_type, status, customer_id")
    .eq("user_id", userId)
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as ServiceReminderRow[];
}

export async function fetchCurrentAuthUser() {
  const { data } = await getCurrentAuthUser();
  return data.user;
}

export function subscribeCustomerSegmentUpdates(
  onUpdate: (row: { id: string; [k: string]: unknown }) => void,
): { unsubscribe: () => void; channel: RealtimeChannel } {
  const channel = supabase
    .channel("segment_counts")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "customer_segments" },
      (payload) => onUpdate(payload.new as { id: string; [k: string]: unknown }),
    )
    .subscribe();
  return { channel, unsubscribe: () => void supabase.removeChannel(channel) };
}

export function subscribeLiveVisitorsChannel(
  onChange: () => void,
): { unsubscribe: () => void; channel: RealtimeChannel } {
  const channel = supabase
    .channel("live_presence")
    .on("postgres_changes", { event: "*", schema: "public", table: "visitor_presence" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "analytics_events" }, onChange)
    .subscribe();
  return { channel, unsubscribe: () => void supabase.removeChannel(channel) };
}

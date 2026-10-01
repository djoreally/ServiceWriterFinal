/**
 * Marketing Queries - Read operations for testimonials, reviews, analytics, and LTV.
 */

import { apiClient } from "@/lib/api-client";
import { format, subMonths, parseISO } from "date-fns";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

// Realtime subscriptions stay on the browser client (HTTP-only apiClient cannot
// subscribe); re-exported here so existing imports keep working.
export { subscribeCustomerSegmentUpdates, subscribeLiveVisitorsChannel } from "@/lib/crm-realtime";

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
  await requireUser();
  const { data } = await apiClient.get<{ data: TestimonialRow[] }>("/v1/crm/marketing/testimonials");
  return data ?? [];
}

export async function fetchBusinessSlug(): Promise<string | null> {
  await requireUser();
  const { data } = await apiClient.get<{ data: { booking_slug: string | null } }>("/v1/crm/marketing/business-slug");
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
  await requireUser();
  const { data } = await apiClient.get<{ data: { analytics: ReviewAnalyticsData | null; requests: ReviewRequestRow[] } }>(
    "/v1/crm/marketing/review-dashboard",
  );
  return data;
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
  await requireUser();
  const { data } = await apiClient.get<{ data: MarketingAnalyticsResult }>("/v1/crm/marketing/analytics");
  return data;
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

interface LTVRawPayment { created_at: string; amount: number | null; status: string; appointment_id: string | null; }
interface LTVRawService { service_date: string; total_cost: number | null; }

export async function fetchLTVData(): Promise<LTVDataResult> {
  await requireUser();
  const { data } = await apiClient.get<{ data: { customers: LTVCustomer[]; payments: LTVRawPayment[]; services: LTVRawService[] } }>(
    "/v1/crm/marketing/ltv",
  );

  const customers = data.customers ?? [];

  // Build monthly revenue map
  const monthlyMap = new Map<string, { revenue: number; services: number }>();

  (data.payments ?? []).forEach((p) => {
    const month = format(parseISO(p.created_at), "MMM yyyy");
    const existing = monthlyMap.get(month) || { revenue: 0, services: 0 };
    monthlyMap.set(month, {
      revenue: existing.revenue + (p.amount || 0) / 100,
      services: existing.services + 1,
    });
  });

  (data.services ?? []).forEach((s) => {
    const month = format(parseISO(s.service_date), "MMM yyyy");
    const existing = monthlyMap.get(month) || { revenue: 0, services: 0 };
    monthlyMap.set(month, {
      revenue: existing.revenue,
      services: existing.services + 1,
    });
  });

  const monthlyRevenue = Array.from(monthlyMap.entries()).map(
    ([month, point]) => ({ month, ...point })
  );

  return { customers, monthlyRevenue };
}

// ── Additional marketing UI queries (segmentation, abandoned bookings, retention analytics, live visitors) ──

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
  const { data } = await apiClient.get<{ data: AbandonedBookingRow[] }>("/v1/crm/marketing/abandoned-bookings");
  return { data, error: null };
}

export async function fetchActiveSegmentNames(userId: string): Promise<string[]> {
  const { data } = await apiClient.get<{ data: string[] }>("/v1/crm/marketing/segment-names");
  return data ?? [];
}

export async function fetchActiveSegmentsForFilter(userId: string) {
  const { data } = await apiClient.get<{ data: Array<{ id: string; name: string; color: string | null }> }>(
    "/v1/crm/marketing/segments",
  );
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
  const { data } = await apiClient.get<{ data: SegmentCustomerRow[] }>(
    `/v1/crm/marketing/legacy-segments/${encodeURIComponent(segmentName)}/customers`,
  );
  return { data: data ?? [], error: null };
}

export async function fetchCustomerIdsInSegment(userId: string, segmentName: string): Promise<Set<string>> {
  const { data } = await apiClient.get<{ data: string[] }>(
    `/v1/crm/marketing/legacy-segments/${encodeURIComponent(segmentName)}/customer-ids`,
  );
  return new Set(data ?? []);
}

export interface RetentionSignalRow {
  detected_at: string;
  signal_type: string;
  customer_id: string | null;
}

export async function fetchRetentionSignalsSince(userId: string, sinceISO: string) {
  const { data } = await apiClient.get<{ data: RetentionSignalRow[] }>("/v1/crm/marketing/retention-signals-since", {
    query: { since: sinceISO },
  });
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
  const { data } = await apiClient.get<{ data: ServiceReminderRow[] }>("/v1/crm/marketing/service-reminders-since", {
    query: { since: sinceISO },
  });
  return (data ?? []) as ServiceReminderRow[];
}

export async function fetchCurrentAuthUser() {
  const { data } = await getCurrentAuthUser();
  return data.user;
}

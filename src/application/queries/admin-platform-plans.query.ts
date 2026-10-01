/**
 * Admin Platform Plans Query — fetch and mutate platform plan data for the admin panel.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

type QueryResult<T> = { data: T | null; error: unknown };

async function result<T>(work: () => Promise<T>): Promise<QueryResult<T>> {
  try {
    return { data: await work(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof ApiClientError ? new Error(error.message) : error,
    };
  }
}

export interface PlatformPlanRow {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  price_cents: number;
  billing_interval: string;
  max_appointments_per_month: number | null;
  max_technician_seats: number | null;
  max_customers: number | null;
  has_public_booking: boolean;
  has_invoicing_basic: boolean;
  has_invoicing_full: boolean;
  has_stripe_payments: boolean;
  has_dispatch_engine: boolean;
  has_ai_routing: boolean;
  has_fleet_os: boolean;
  has_technician_os: boolean;
  has_marketing_automation: boolean;
  has_quickbooks_sync: boolean;
  has_carfax_integration: boolean;
  has_pwa_offline: boolean;
  has_ai_assistant: boolean;
  tax_compliance_level: string;
  support_level: string;
  is_active: boolean;
  display_order: number;
  badge_label: string | null;
  badge_color: string | null;
  highlight: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchPlatformPlans() {
  return result(async () => {
    const { data } = await apiClient.get<{ data: PlatformPlanRow[] }>(
      "/v1/platform/plans",
    );
    return data ?? [];
  });
}

export async function fetchSubscriptionStats() {
  return result(async () => {
    const { data } = await apiClient.get<{ data: Record<string, unknown>[] }>(
      "/v1/platform/plans/subscription-stats",
    );
    return data ?? [];
  });
}

export async function togglePlatformPlanActive(planId: string, isActive: boolean) {
  return result(async () => {
    await apiClient.patch(`/v1/platform/plans/${planId}`, {
      updates: { is_active: isActive, updated_at: new Date().toISOString() },
    });
    return null;
  });
}

export async function updatePlatformPlan(planId: string, updates: Record<string, unknown>) {
  return result(async () => {
    await apiClient.patch(`/v1/platform/plans/${planId}`, {
      updates: { ...updates, updated_at: new Date().toISOString() },
    });
    return null;
  });
}

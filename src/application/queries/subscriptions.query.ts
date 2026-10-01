/**
 * Subscription Queries
 *
 * Read operations for subscription plans and customer subscriptions.
 * Uses `subscription_plans` table — customer-facing plans that shop owners sell.
 * Served via the Hono billing API; pure row mapping stays client-side.
 */

import { apiClient, ApiClientError } from '@/lib/api-client';
import type { SubscriptionPlan, CustomerSubscription, SubscriptionPlanTemplate, SubscriptionTier } from '@/shared/types';

// ── Fetch user's subscription plans ──

async function fetchPlanRows(activeOnly: boolean): Promise<Record<string, unknown>[]> {
  const { data } = await apiClient.get<{ data: Record<string, unknown>[] }>('/v1/billing/subscription-plans', {
    query: activeOnly ? { active_only: 'true' } : {},
  });
  return data ?? [];
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  try {
    return (await fetchPlanRows(false)).map(mapSubscriptionPlanRow);
  } catch (error) {
    throw queryError(error, 'Failed to fetch subscription plans');
  }
}

// ── Fetch plans by tier ──

export async function fetchSubscriptionPlansByTier(tier: SubscriptionTier): Promise<SubscriptionPlan[]> {
  try {
    return (await fetchPlanRows(true)).map(mapSubscriptionPlanRow).filter((p) => p.tier === tier);
  } catch (error) {
    throw queryError(error, 'Failed to fetch plans');
  }
}

// ── Fetch core plans (non-addon) ──

export async function fetchCorePlans(): Promise<SubscriptionPlan[]> {
  try {
    return (await fetchPlanRows(false)).map(mapSubscriptionPlanRow).filter((p) => p.tier !== 'addon');
  } catch (error) {
    throw queryError(error, 'Failed to fetch core plans');
  }
}

// ── Fetch add-on plans ──

export async function fetchAddonPlans(): Promise<SubscriptionPlan[]> {
  try {
    return (await fetchPlanRows(true)).map(mapSubscriptionPlanRow).filter((p) => p.tier === 'addon');
  } catch (error) {
    throw queryError(error, 'Failed to fetch add-on plans');
  }
}

// ── Fetch single plan ──

export async function fetchSubscriptionPlan(planId: string): Promise<SubscriptionPlan> {
  try {
    const { data } = await apiClient.get<{ data: Record<string, unknown> }>(`/v1/billing/subscription-plans/${planId}`);
    return mapSubscriptionPlanRow(data);
  } catch (error) {
    throw queryError(error, 'Failed to fetch plan');
  }
}

// ── Fetch plan templates ──

export async function fetchPlanTemplates(): Promise<SubscriptionPlanTemplate[]> {
  try {
    const { data } = await apiClient.get<{ data: Record<string, unknown>[] }>('/v1/billing/plan-templates');
    return (data ?? []).map((t) => ({
      ...t,
      tier: t.tier as SubscriptionTier,
      billing_cycle: t.billing_cycle as 'monthly' | 'quarterly' | 'yearly',
      features: Array.isArray(t.features) ? t.features as string[] : [],
      included_services_description: Array.isArray(t.included_services_description)
        ? t.included_services_description as string[]
        : [],
      tagline: (t.description as string | null) ?? null,
      default_price: t.price,
      updated_at: (t.updated_at as string) ?? (t.created_at as string),
    })) as SubscriptionPlanTemplate[];
  } catch (error) {
    throw queryError(error, 'Failed to fetch templates');
  }
}

// ── Fetch customer subscriptions ──

function mapCustomerSubscriptionRow(s: Record<string, unknown>): CustomerSubscription {
  return {
    ...s,
    status: s.status as CustomerSubscription['status'],
  } as CustomerSubscription;
}

export async function fetchCustomerSubscriptions(): Promise<CustomerSubscription[]> {
  try {
    const { data } = await apiClient.get<{ data: Record<string, unknown>[] }>('/v1/billing/customer-subscriptions');
    return (data ?? []).map(mapCustomerSubscriptionRow);
  } catch (error) {
    throw queryError(error, 'Failed to fetch subscriptions');
  }
}

// ── Fetch subscriptions for a specific customer ──

export async function fetchCustomerSubscriptionsByCustomer(
  customerId: string
): Promise<CustomerSubscription[]> {
  try {
    const { data } = await apiClient.get<{ data: Record<string, unknown>[] }>('/v1/billing/customer-subscriptions', {
      query: { customer_id: customerId },
    });
    return (data ?? []).map(mapCustomerSubscriptionRow);
  } catch (error) {
    throw queryError(error, 'Failed to fetch customer subscriptions');
  }
}

// ── Fetch public plans for booking page ──

export async function fetchPublicSubscriptionPlans(
  businessUserId: string
): Promise<SubscriptionPlan[]> {
  try {
    const { data } = await apiClient.get<{ data: Record<string, unknown>[] }>('/v1/billing/subscription-plans/public', {
      query: { business_user_id: businessUserId },
    });
    return (data ?? []).map(mapSubscriptionPlanRow);
  } catch (error) {
    throw queryError(error, 'Failed to fetch plans');
  }
}

// ── Subscription stats ──

export interface SubscriptionStats {
  totalPlans: number;
  activePlans: number;
  totalSubscribers: number;
  estimatedMRR: number;
  plansWithStripe: number;
  plansWithoutStripe: number;
}

export async function fetchSubscriptionStats(): Promise<SubscriptionStats> {
  try {
    const { data } = await apiClient.get<{ data: SubscriptionStats }>('/v1/billing/subscription-stats');
    return data;
  } catch (error) {
    throw queryError(error, 'Failed to fetch subscription stats');
  }
}

// ── Helpers ──

function queryError(error: unknown, fallback: string): Error {
  if (error instanceof ApiClientError && error.status === 401) return new Error('Not authenticated');
  return new Error(error instanceof ApiClientError ? error.message : fallback);
}

function mapSubscriptionPlanRow(row: Record<string, unknown>): SubscriptionPlan {
  return {
    id: row.id as string,
    user_id: (row.user_id as string) || '',
    name: (row.name as string) || '',
    description: (row.description as string) || null,
    price: (row.price as number) || 0,
    billing_cycle: ((row.billing_cycle as string) || 'monthly') as SubscriptionPlan['billing_cycle'],
    features: Array.isArray(row.features) ? row.features as string[] : [],
    included_services: Array.isArray(row.included_services) ? row.included_services as string[] : [],
    max_services_per_cycle: (row.max_services_per_cycle as number) || null,
    is_active: (row.is_active as boolean) ?? true,
    display_order: (row.display_order as number) || 0,
    tier: (row.tier as SubscriptionTier) || null,
    stripe_product_id: (row.stripe_product_id as string) || null,
    stripe_price_id: (row.stripe_price_id as string) || null,
    price_min: (row.price_min as number) || null,
    price_max: (row.price_max as number) || null,
    is_template: (row.is_template as boolean) || false,
    badge_label: (row.badge_label as string) || null,
    badge_color: (row.badge_color as string) || null,
    highlight: (row.highlight as boolean) || false,
    cta_label: (row.cta_label as string) || 'Subscribe Now',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    _subscriber_count: (row._subscriber_count as number) || 0,
  };
}

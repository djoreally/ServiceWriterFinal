/**
 * Subscription Commands
 *
 * Write operations for subscription plans and customer subscriptions.
 * Uses `subscription_plans` table — customer-facing plans that shop owners sell.
 * All Stripe operations go through the Hono billing API — never client-side.
 */

import { apiClient, ApiClientError } from '@/lib/api-client';
import type { SubscriptionPlan, BillingCycle } from '@/shared/types';

// ── Types ──

export interface CreatePlanPayload {
  name: string;
  description?: string;
  price: number;
  billing_cycle: BillingCycle;
  features: string[];
  included_services: string[];
  max_services_per_cycle?: number | null;
  is_active: boolean;
  display_order: number;
  tier?: string;
  price_min?: number;
  price_max?: number;
  badge_label?: string;
  badge_color?: string;
  highlight?: boolean;
  cta_label?: string;
}

export interface UpdatePlanPayload extends Partial<CreatePlanPayload> {
  id: string;
}

export interface SyncPlanResult {
  success: boolean;
  plan_id: string;
  stripe_product_id?: string;
  stripe_price_id?: string;
  error?: string;
}

export interface SyncAllResult {
  success: boolean;
  results: Array<{
    plan_id: string;
    name: string;
    status: 'synced' | 'error';
    stripe_product_id?: string;
    stripe_price_id?: string;
    error?: string;
  }>;
}

export interface SubscriptionCheckoutRequest {
  plan_id: string;
  business_user_id: string;
  customer_email: string;
  customer_name?: string;
  customer_id?: string;
  vehicle_id?: string;
  addon_plan_ids?: string[];
  success_url?: string;
  cancel_url?: string;
}

export interface SubscriptionCheckoutResult {
  url: string;
  session_id: string;
  plan_name: string;
  plan_price: number;
  addons: string[];
}

export interface ManageSubscriptionRequest {
  subscription_id: string;
  action: 'cancel' | 'cancel_immediately' | 'pause' | 'resume';
}

export interface ManageSubscriptionResult {
  success: boolean;
  status: string;
  message: string;
}

function apiError(error: unknown, fallback: string): Error {
  if (error instanceof ApiClientError && error.status === 401) return new Error('Not authenticated');
  return new Error(error instanceof ApiClientError ? error.message : fallback);
}

// ── Plan CRUD ──

export async function createSubscriptionPlan(
  payload: CreatePlanPayload
): Promise<SubscriptionPlan> {
  try {
    const { data } = await apiClient.post<{ data: SubscriptionPlan }>('/v1/billing/subscription-plans', payload);
    return data;
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : apiError(error, 'Failed to create plan');
  }
}

export async function updateSubscriptionPlan(
  payload: UpdatePlanPayload
): Promise<void> {
  const { id, ...updates } = payload;
  try {
    await apiClient.put(`/v1/billing/subscription-plans/${id}`, updates);
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : apiError(error, 'Failed to update plan');
  }
}

export async function deleteSubscriptionPlan(planId: string): Promise<void> {
  try {
    await apiClient.delete(`/v1/billing/subscription-plans/${planId}`);
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : apiError(error, 'Failed to delete plan');
  }
}

export async function togglePlanActive(
  planId: string,
  isActive: boolean
): Promise<void> {
  try {
    await apiClient.patch(`/v1/billing/subscription-plans/${planId}`, { is_active: isActive });
  } catch (error) {
    throw error instanceof ApiClientError ? new Error(error.message) : apiError(error, 'Failed to toggle plan');
  }
}

// ── Stripe Sync ──

export async function syncPlanToStripe(planId: string): Promise<SyncPlanResult> {
  try {
    return await apiClient.post<SyncPlanResult>('/v1/billing/subscription-plans/sync', { plan_id: planId });
  } catch (error) {
    throw new Error(error instanceof ApiClientError ? `Failed to sync plan: ${error.message}` : 'Failed to sync plan');
  }
}

export async function syncAllPlansToStripe(): Promise<SyncAllResult> {
  try {
    return await apiClient.post<SyncAllResult>('/v1/billing/subscription-plans/sync', { sync_all: true });
  } catch (error) {
    throw new Error(error instanceof ApiClientError ? `Failed to sync plans: ${error.message}` : 'Failed to sync plans');
  }
}

// ── Customer Subscription Checkout (public) ──

export async function createSubscriptionCheckout(
  request: SubscriptionCheckoutRequest
): Promise<SubscriptionCheckoutResult> {
  try {
    return await apiClient.post<SubscriptionCheckoutResult>('/v1/billing/subscription-checkout', request);
  } catch (error) {
    throw new Error(error instanceof ApiClientError ? `Failed to create checkout: ${error.message}` : 'Failed to create checkout');
  }
}

// ── Manage Subscription (authenticated) ──

export async function manageSubscription(
  request: ManageSubscriptionRequest
): Promise<ManageSubscriptionResult> {
  try {
    return await apiClient.post<ManageSubscriptionResult>('/v1/billing/subscriptions/manage', request);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) throw new Error('Not authenticated');
    throw new Error(error instanceof ApiClientError ? `Failed to ${request.action} subscription: ${error.message}` : `Failed to ${request.action} subscription`);
  }
}

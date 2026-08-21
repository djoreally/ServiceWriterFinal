/**
 * Subscription Commands
 * 
 * Write operations for subscription plans and customer subscriptions.
 * Uses `subscription_plans` table — customer-facing plans that shop owners sell.
 * All Stripe operations go through edge functions — never client-side.
 */

import { supabase } from '@/integrations/supabase/client';
import type { SubscriptionPlan, BillingCycle } from '@/shared/types';

import { getCurrentAuthUser } from "@/lib/auth/current-user";
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

// ── Plan CRUD ──

export async function createSubscriptionPlan(
  payload: CreatePlanPayload
): Promise<SubscriptionPlan> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('subscription_plans')
    .insert({
      user_id: user.id,
      name: payload.name,
      description: payload.description || null,
      price: payload.price,
      billing_cycle: payload.billing_cycle,
      features: payload.features || [],
      included_services: payload.included_services || [],
      max_services_per_cycle: payload.max_services_per_cycle ?? null,
      is_active: payload.is_active,
      display_order: payload.display_order,
      tier: payload.tier || null,
      price_min: payload.price_min ?? null,
      price_max: payload.price_max ?? null,
      badge_label: payload.badge_label ?? null,
      badge_color: payload.badge_color ?? null,
      highlight: payload.highlight ?? false,
      cta_label: payload.cta_label ?? 'Subscribe Now',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create plan: ${error.message}`);
  return data as unknown as SubscriptionPlan;
}

export async function updateSubscriptionPlan(
  payload: UpdatePlanPayload
): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');

  const { id, ...updates } = payload;

  const { error } = await supabase
    .from('subscription_plans')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(`Failed to update plan: ${error.message}`);
}

export async function deleteSubscriptionPlan(planId: string): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('subscription_plans')
    .delete()
    .eq('id', planId)
    .eq('user_id', user.id);

  if (error) throw new Error(`Failed to delete plan: ${error.message}`);
}

export async function togglePlanActive(
  planId: string,
  isActive: boolean
): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('subscription_plans')
    .update({ is_active: isActive })
    .eq('id', planId)
    .eq('user_id', user.id);

  if (error) throw new Error(`Failed to toggle plan: ${error.message}`);
}

// ── Stripe Sync ──

export async function syncPlanToStripe(planId: string): Promise<SyncPlanResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke(
    'sync-subscription-plan',
    {
      body: { plan_id: planId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    }
  );

  if (error) throw new Error(`Failed to sync plan: ${error.message}`);
  return data as SyncPlanResult;
}

export async function syncAllPlansToStripe(): Promise<SyncAllResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke(
    'sync-subscription-plan',
    {
      body: { sync_all: true },
      headers: { Authorization: `Bearer ${session.access_token}` },
    }
  );

  if (error) throw new Error(`Failed to sync plans: ${error.message}`);
  return data as SyncAllResult;
}

// ── Customer Subscription Checkout (public) ──

export async function createSubscriptionCheckout(
  request: SubscriptionCheckoutRequest
): Promise<SubscriptionCheckoutResult> {
  const { data, error } = await supabase.functions.invoke(
    'create-subscription-checkout',
    { body: request }
  );

  if (error) throw new Error(`Failed to create checkout: ${error.message}`);
  return data as SubscriptionCheckoutResult;
}

// ── Manage Subscription (authenticated) ──

export async function manageSubscription(
  request: ManageSubscriptionRequest
): Promise<ManageSubscriptionResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const { data, error } = await supabase.functions.invoke(
    'manage-subscription',
    {
      body: request,
      headers: { Authorization: `Bearer ${session.access_token}` },
    }
  );

  if (error) throw new Error(`Failed to ${request.action} subscription: ${error.message}`);
  return data as ManageSubscriptionResult;
}

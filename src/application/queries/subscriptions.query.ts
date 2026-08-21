/**
 * Subscription Queries
 * 
 * Read operations for subscription plans and customer subscriptions.
 * Uses `subscription_plans` table — customer-facing plans that shop owners sell.
 */

import { supabase } from '@/integrations/supabase/client';
import type { SubscriptionPlan, CustomerSubscription, SubscriptionPlanTemplate, SubscriptionTier } from '@/shared/types';

import { getCurrentAuthUser } from "@/lib/auth/current-user";
// ── Fetch user's subscription plans ──

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('user_id', user.id)
    .order('display_order', { ascending: true })
    .order('price', { ascending: true });

  if (error) throw new Error(`Failed to fetch subscription plans: ${error.message}`);
  
  return (data || []).map(mapSubscriptionPlanRow);
}

// ── Fetch plans by tier ──

export async function fetchSubscriptionPlansByTier(tier: SubscriptionTier): Promise<SubscriptionPlan[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw new Error(`Failed to fetch plans: ${error.message}`);
  
  return (data || []).map(mapSubscriptionPlanRow).filter((p) => p.tier === tier);
}

// ── Fetch core plans (non-addon) ──

export async function fetchCorePlans(): Promise<SubscriptionPlan[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('user_id', user.id)
    .order('display_order', { ascending: true });

  if (error) throw new Error(`Failed to fetch core plans: ${error.message}`);
  
  return (data || []).map(mapSubscriptionPlanRow).filter((p) => p.tier !== 'addon');
}

// ── Fetch add-on plans ──

export async function fetchAddonPlans(): Promise<SubscriptionPlan[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw new Error(`Failed to fetch add-on plans: ${error.message}`);
  
  return (data || []).map(mapSubscriptionPlanRow).filter((p) => p.tier === 'addon');
}

// ── Fetch single plan ──

export async function fetchSubscriptionPlan(planId: string): Promise<SubscriptionPlan> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error) throw new Error(`Failed to fetch plan: ${error.message}`);
  
  return mapSubscriptionPlanRow(data);
}

// ── Fetch plan templates ──

export async function fetchPlanTemplates(): Promise<SubscriptionPlanTemplate[]> {
  const { data, error } = await supabase
    .from('subscription_plan_templates')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw new Error(`Failed to fetch templates: ${error.message}`);

  return (data || []).map((t) => ({
    ...t,
    tier: t.tier as SubscriptionTier,
    billing_cycle: t.billing_cycle as 'monthly' | 'quarterly' | 'yearly',
    features: Array.isArray(t.features) ? t.features as string[] : [],
    included_services_description: Array.isArray(t.included_services_description)
      ? t.included_services_description as string[]
      : [],
    tagline: t.description ?? null,
    default_price: t.price,
    updated_at: t.updated_at ?? t.created_at,
  }));
}

// ── Fetch customer subscriptions ──

export async function fetchCustomerSubscriptions(): Promise<CustomerSubscription[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('customer_subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch subscriptions: ${error.message}`);

  return (data || []).map((s) => ({
    ...s,
    status: s.status as CustomerSubscription['status'],
  }));
}

// ── Fetch subscriptions for a specific customer ──

export async function fetchCustomerSubscriptionsByCustomer(
  customerId: string
): Promise<CustomerSubscription[]> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('customer_subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch customer subscriptions: ${error.message}`);

  return (data || []).map((s) => ({
    ...s,
    status: s.status as CustomerSubscription['status'],
  }));
}

// ── Fetch public plans for booking page ──

export async function fetchPublicSubscriptionPlans(
  businessUserId: string
): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('user_id', businessUserId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw new Error(`Failed to fetch plans: ${error.message}`);

  return (data || []).map(mapSubscriptionPlanRow);
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
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');

  const [plansResult, subsResult] = await Promise.all([
    supabase
      .from('subscription_plans')
      .select('id, price, billing_cycle, is_active, stripe_price_id')
      .eq('user_id', user.id),
    supabase
      .from('customer_subscriptions')
      .select('id, plan_id, status')
      .eq('user_id', user.id)
      .eq('status', 'active'),
  ]);

  const plans = plansResult.data || [];
  const subs = subsResult.data || [];

  const activePlans = plans.filter((p) => p.is_active);
  const plansWithStripe = plans.filter((p) => p.stripe_price_id).length;

  const mrr = subs.reduce((sum, sub) => {
    const plan = plans.find((p) => p.id === sub.plan_id);
    if (!plan) return sum;
    const multiplier =
      plan.billing_cycle === 'yearly'
        ? 1 / 12
        : plan.billing_cycle === 'quarterly'
        ? 1 / 3
        : 1;
    return sum + (plan.price || 0) * multiplier;
  }, 0);

  return {
    totalPlans: plans.length,
    activePlans: activePlans.length,
    totalSubscribers: subs.length,
    estimatedMRR: mrr,
    plansWithStripe,
    plansWithoutStripe: plans.length - plansWithStripe,
  };
}

// ── Helper ──

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

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@packages/auth';

export type CanonicalPlanName = 'basic' | 'pro' | 'fleet';
export type PlanName = CanonicalPlanName | 'free' | 'payg' | 'business' | 'enterprise';
export type TaxComplianceLevel = 'none' | 'basic' | 'full' | 'multi_state';
export type SupportLevel = 'email' | 'priority_email' | 'phone_priority';

export interface PlanFeatures {
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
  tax_compliance_level: TaxComplianceLevel;
  support_level: SupportLevel;
}

export interface UsageStats { appointments_this_month: number; technician_count: number; customer_count: number; }
export interface UsageLimits { appointments_remaining: number | null; technicians_remaining: number | null; customers_remaining: number | null; }
export interface SubscriptionState {
  subscribed: boolean;
  plan: CanonicalPlanName;
  plan_display_name: string;
  features: PlanFeatures;
  usage: UsageStats;
  limits: UsageLimits;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  grace_period_ends_at: string | null;
  is_trialing: boolean;
  trial_ends_at: string | null;
  trial_days_remaining: number | null;
  workspace_id?: string | null;
  billing_interval?: 'monthly' | 'annual';
  payments_addon_active?: boolean;
  additional_technician_quantity?: number;
}

type BillingCheckoutOptions = {
  billingInterval?: 'monthly' | 'annual';
  paymentsAddonActive?: boolean;
  additionalTechnicianQuantity?: number;
};

interface SubscriptionContextType {
  subscription: SubscriptionState | null;
  loading: boolean;
  error: string | null;
  hasFeature: (feature: keyof PlanFeatures) => boolean;
  canUse: (resource: 'appointments' | 'technicians' | 'customers') => boolean;
  isAtLimit: (resource: 'appointments' | 'technicians' | 'customers') => boolean;
  isOverLimit: (resource: 'appointments' | 'technicians' | 'customers') => boolean;
  refresh: () => Promise<void>;
  upgrade: (planName: PlanName, options?: BillingCheckoutOptions) => Promise<string | null>;
  manageSubscription: () => Promise<string | null>;
  trackUsage: (metric: 'appointments' | 'customers') => Promise<void>;
}

const SUPER_ADMIN_EMAIL = 'djoreally@gmail.com';
export function isSuperAdmin(email?: string | null): boolean { return email?.toLowerCase() === SUPER_ADMIN_EMAIL; }

const allInclusiveFeatures: PlanFeatures = {
  max_appointments_per_month: null, max_technician_seats: null, max_customers: null,
  has_public_booking: true, has_invoicing_basic: true, has_invoicing_full: true, has_stripe_payments: true,
  has_dispatch_engine: true, has_ai_routing: true, has_fleet_os: true, has_technician_os: true,
  has_marketing_automation: true, has_quickbooks_sync: true, has_carfax_integration: true, has_pwa_offline: true,
  has_ai_assistant: true, tax_compliance_level: 'multi_state', support_level: 'phone_priority',
};

function canonicalPlan(planName: PlanName): CanonicalPlanName {
  if (planName === 'fleet' || planName === 'enterprise') return 'fleet';
  if (planName === 'pro' || planName === 'business') return 'pro';
  return 'basic';
}

function featuresFor(plan: CanonicalPlanName, paymentsAddonActive: boolean, technicianLimit: number): PlanFeatures {
  if (plan === 'basic') {
    return {
      max_appointments_per_month: null, max_technician_seats: 0, max_customers: null,
      has_public_booking: true, has_invoicing_basic: true, has_invoicing_full: false, has_stripe_payments: paymentsAddonActive,
      has_dispatch_engine: false, has_ai_routing: false, has_fleet_os: false, has_technician_os: false,
      has_marketing_automation: false, has_quickbooks_sync: false, has_carfax_integration: false, has_pwa_offline: true,
      has_ai_assistant: false, tax_compliance_level: 'none', support_level: 'email',
    };
  }

  return {
    max_appointments_per_month: null, max_technician_seats: technicianLimit, max_customers: null,
    has_public_booking: true, has_invoicing_basic: true, has_invoicing_full: true, has_stripe_payments: paymentsAddonActive,
    has_dispatch_engine: true, has_ai_routing: true, has_fleet_os: plan === 'fleet', has_technician_os: true,
    has_marketing_automation: true, has_quickbooks_sync: true, has_carfax_integration: true, has_pwa_offline: true,
    has_ai_assistant: true, tax_compliance_level: plan === 'fleet' ? 'multi_state' : 'full', support_level: plan === 'fleet' ? 'phone_priority' : 'priority_email',
  };
}

const superAdminState: SubscriptionState = {
  subscribed: true, plan: 'fleet', plan_display_name: 'Super Admin', features: allInclusiveFeatures,
  usage: { appointments_this_month: 0, technician_count: 0, customer_count: 0 },
  limits: { appointments_remaining: null, technicians_remaining: null, customers_remaining: null },
  status: 'active', current_period_end: null, cancel_at_period_end: false, grace_period_ends_at: null,
  is_trialing: false, trial_ends_at: null, trial_days_remaining: null,
};

const basicState: SubscriptionState = {
  subscribed: true, plan: 'basic', plan_display_name: 'Basic', features: featuresFor('basic', false, 0),
  usage: { appointments_this_month: 0, technician_count: 0, customer_count: 0 },
  limits: { appointments_remaining: null, technicians_remaining: 0, customers_remaining: null },
  status: 'active', current_period_end: null, cancel_at_period_end: false, grace_period_ends_at: null,
  is_trialing: false, trial_ends_at: null, trial_days_remaining: null,
};

const SUBSCRIPTION_CACHE_TTL_MS = 5 * 60 * 1000;
const SUBSCRIPTION_TIMEOUT_MS = 6_000;
let cachedSubscriptionDecision: { userId: string; checkedAt: number; subscription: SubscriptionState } | null = null;

function getFreshCachedSubscription(userId: string | null) {
  if (!userId || !cachedSubscriptionDecision || cachedSubscriptionDecision.userId !== userId) return null;
  if (Date.now() - cachedSubscriptionDecision.checkedAt > SUBSCRIPTION_CACHE_TTL_MS) return null;
  return cachedSubscriptionDecision.subscription;
}

function normalizeWorkspaceBilling(data: unknown): SubscriptionState {
  const payload = data as {
    workspace?: { id?: string };
    billing?: {
      plan_tier?: CanonicalPlanName;
      billing_interval?: 'monthly' | 'annual';
      payments_addon_active?: boolean;
      additional_technician_quantity?: number;
      subscription_status?: string;
      current_period_end?: string | null;
      cancel_at_period_end?: boolean;
    };
    entitlements?: { entitled_technicians?: number };
    usage?: { technician_count?: number; technicians_remaining?: number };
  } | null;

  if (!payload?.billing) return basicState;
  const plan = payload.billing.plan_tier === 'pro' || payload.billing.plan_tier === 'fleet' ? payload.billing.plan_tier : 'basic';
  const technicianLimit = payload.entitlements?.entitled_technicians ?? 0;
  const technicianCount = payload.usage?.technician_count ?? 0;
  const paymentsAddonActive = Boolean(payload.billing.payments_addon_active);
  const status = payload.billing.subscription_status ?? 'active';

  return {
    subscribed: ['active', 'trialing'].includes(status) || plan === 'basic',
    plan,
    plan_display_name: plan === 'basic' ? 'Basic' : plan === 'pro' ? 'Pro' : 'Fleet',
    features: featuresFor(plan, paymentsAddonActive, technicianLimit),
    usage: { appointments_this_month: 0, technician_count: technicianCount, customer_count: 0 },
    limits: { appointments_remaining: null, technicians_remaining: payload.usage?.technicians_remaining ?? Math.max(0, technicianLimit - technicianCount), customers_remaining: null },
    status,
    current_period_end: payload.billing.current_period_end ?? null,
    cancel_at_period_end: Boolean(payload.billing.cancel_at_period_end),
    grace_period_ends_at: null,
    is_trialing: status === 'trialing',
    trial_ends_at: null,
    trial_days_remaining: null,
    workspace_id: payload.workspace?.id ?? null,
    billing_interval: payload.billing.billing_interval ?? 'monthly',
    payments_addon_active: paymentsAddonActive,
    additional_technician_quantity: payload.billing.additional_technician_quantity ?? 0,
  };
}

async function withSubscriptionTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('Subscription check timed out')), SUBSCRIPTION_TIMEOUT_MS))]);
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { error?: { message?: string } })?.error?.message ?? 'Billing request failed';
    throw new Error(message);
  }
  return data;
}

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: null, loading: true, error: null, hasFeature: () => false, canUse: () => true,
  isAtLimit: () => false, isOverLimit: () => false, refresh: async () => {}, upgrade: async () => null,
  manageSubscription: async () => null, trackUsage: async () => {},
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { session, user, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const subscriptionUserIdRef = useRef<string | null>(null);

  const fetchSubscription = useCallback(async (force = false) => {
    if (authLoading) return;
    if (!session?.access_token || !user) {
      cachedSubscriptionDecision = null;
      subscriptionUserIdRef.current = null;
      setSubscription(null);
      setError(null);
      setLoading(false);
      return;
    }

    const same = subscriptionUserIdRef.current === user.id;
    if (!same) {
      subscriptionUserIdRef.current = user.id;
      setSubscription(null);
      setLoading(true);
    }

    if (isSuperAdmin(user.email)) {
      cachedSubscriptionDecision = { userId: user.id, checkedAt: Date.now(), subscription: superAdminState };
      setSubscription(superAdminState);
      setError(null);
      setLoading(false);
      return;
    }

    const cached = getFreshCachedSubscription(user.id);
    if (cached && !force) {
      setSubscription(cached);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      const response = await withSubscriptionTimeout(fetch('/api/v1/billing/subscription', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      }));
      const normalized = normalizeWorkspaceBilling(await readJson(response));
      cachedSubscriptionDecision = { userId: user.id, checkedAt: Date.now(), subscription: normalized };
      setSubscription(normalized);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
      setSubscription((previous) => previous ?? basicState);
      setError(err instanceof Error ? err.message : 'Failed to fetch subscription');
    } finally {
      setLoading(false);
    }
  }, [user, session, authLoading]);

  useEffect(() => { void Promise.resolve().then(() => fetchSubscription()); }, [fetchSubscription]);
  useEffect(() => { if (!session) return; const interval = setInterval(fetchSubscription, 5 * 60 * 1000); return () => clearInterval(interval); }, [session, fetchSubscription]);

  const hasFeature = useCallback((feature: keyof PlanFeatures) => {
    if (!subscription) return false;
    const value = subscription.features[feature];
    return typeof value === 'boolean' ? value : true;
  }, [subscription]);

  const canUse = useCallback((resource: 'appointments'|'technicians'|'customers') => {
    if (!subscription) return true;
    const remaining = resource === 'appointments' ? subscription.limits.appointments_remaining : resource === 'technicians' ? subscription.limits.technicians_remaining : subscription.limits.customers_remaining;
    return remaining === null || remaining > 0;
  }, [subscription]);

  const isAtLimit = useCallback((resource: 'appointments'|'technicians'|'customers') => {
    if (!subscription) return false;
    const remaining = resource === 'appointments' ? subscription.limits.appointments_remaining : resource === 'technicians' ? subscription.limits.technicians_remaining : subscription.limits.customers_remaining;
    return remaining !== null && remaining <= 0;
  }, [subscription]);

  const isOverLimit = useCallback((resource: 'appointments'|'technicians'|'customers') => {
    if (!subscription) return false;
    const remaining = resource === 'appointments' ? subscription.limits.appointments_remaining : resource === 'technicians' ? subscription.limits.technicians_remaining : subscription.limits.customers_remaining;
    return remaining !== null && remaining < 0;
  }, [subscription]);

  const refresh = useCallback(async () => { await fetchSubscription(true); }, [fetchSubscription]);

  const upgrade = useCallback(async (planName: PlanName, options: BillingCheckoutOptions = {}): Promise<string | null> => {
    if (!session?.access_token) {
      setError('You must be signed in to choose a plan.');
      return null;
    }

    try {
      const planTier = canonicalPlan(planName);
      const response = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: subscription?.workspace_id ?? undefined,
          plan_tier: planTier,
          billing_interval: options.billingInterval ?? subscription?.billing_interval ?? 'monthly',
          payments_addon_active: options.paymentsAddonActive ?? false,
          additional_technician_quantity: options.additionalTechnicianQuantity ?? 0,
        }),
      });
      const data = await readJson(response) as { url?: string; redirect_url?: string; free?: boolean };
      setError(null);
      if (data.free) await fetchSubscription(true);
      return data.url ?? data.redirect_url ?? null;
    } catch (err) {
      console.error('Failed to create checkout session:', err);
      setError(err instanceof Error ? err.message : 'Failed to create checkout session');
      return null;
    }
  }, [session, subscription, fetchSubscription]);

  const manageSubscription = useCallback(async (): Promise<string | null> => {
    if (!session?.access_token) return null;
    try {
      const response = await fetch('/api/v1/billing/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: subscription?.workspace_id ?? undefined }),
      });
      const data = await readJson(response) as { url?: string };
      setError(null);
      return data.url ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open subscription management');
      return null;
    }
  }, [session, subscription?.workspace_id]);

  const trackUsage = useCallback(async () => { await fetchSubscription(true); }, [fetchSubscription]);

  return <SubscriptionContext.Provider value={{ subscription, loading, error, hasFeature, canUse, isAtLimit, isOverLimit, refresh, upgrade, manageSubscription, trackUsage }}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() { return useContext(SubscriptionContext); }
export function useFeatureGate(feature: keyof PlanFeatures) {
  const { hasFeature, subscription, loading } = useSubscription();
  return { hasAccess: hasFeature(feature), planRequired: !hasFeature(feature) ? getPlanForFeature(feature) : null, loading, currentPlan: subscription?.plan || 'basic' };
}

function getPlanForFeature(feature: keyof PlanFeatures): CanonicalPlanName {
  if (feature === 'has_fleet_os') return 'fleet';
  if (feature === 'has_stripe_payments') return 'basic';
  const proFeatures: (keyof PlanFeatures)[] = ['has_invoicing_full','has_dispatch_engine','has_ai_routing','has_technician_os','has_marketing_automation','has_quickbooks_sync','has_carfax_integration','has_ai_assistant'];
  if (proFeatures.includes(feature)) return 'pro';
  return 'basic';
}

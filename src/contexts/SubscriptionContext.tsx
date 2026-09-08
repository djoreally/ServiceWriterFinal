/**
 * Platform Subscription Context
 * 
 * Provides subscription state, feature gating, usage tracking,
 * and trial lifecycle management across the application.
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@packages/auth';

export type PlanName = 'free' | 'payg' | 'pro' | 'business' | 'enterprise';
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
  subscribed: boolean; plan: PlanName; plan_display_name: string; features: PlanFeatures; usage: UsageStats; limits: UsageLimits;
  status: string; current_period_end: string | null; cancel_at_period_end: boolean; grace_period_ends_at: string | null;
  is_trialing: boolean; trial_ends_at: string | null; trial_days_remaining: number | null;
}
interface SubscriptionContextType {
  subscription: SubscriptionState | null; loading: boolean; error: string | null;
  hasFeature: (feature: keyof PlanFeatures) => boolean;
  canUse: (resource: 'appointments' | 'technicians' | 'customers') => boolean;
  isAtLimit: (resource: 'appointments' | 'technicians' | 'customers') => boolean;
  isOverLimit: (resource: 'appointments' | 'technicians' | 'customers') => boolean;
  refresh: () => Promise<void>; upgrade: (planName: PlanName) => Promise<string | null>; manageSubscription: () => Promise<string | null>;
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
const freeFeatures: PlanFeatures = {
  max_appointments_per_month: null, max_technician_seats: 1, max_customers: null,
  has_public_booking: true, has_invoicing_basic: true, has_invoicing_full: false, has_stripe_payments: false,
  has_dispatch_engine: false, has_ai_routing: false, has_fleet_os: false, has_technician_os: false,
  has_marketing_automation: false, has_quickbooks_sync: false, has_carfax_integration: false, has_pwa_offline: true,
  has_ai_assistant: false, tax_compliance_level: 'none', support_level: 'email',
};
const noAccessFeatures: PlanFeatures = { ...freeFeatures, max_appointments_per_month: 0, max_technician_seats: 0, max_customers: 0, has_public_booking: false, has_invoicing_basic: false, has_pwa_offline: false };
const superAdminState: SubscriptionState = {
  subscribed: true, plan: 'business', plan_display_name: 'Super Admin', features: allInclusiveFeatures,
  usage: { appointments_this_month: 0, technician_count: 0, customer_count: 0 }, limits: { appointments_remaining: null, technicians_remaining: null, customers_remaining: null },
  status: 'active', current_period_end: null, cancel_at_period_end: false, grace_period_ends_at: null, is_trialing: false, trial_ends_at: null, trial_days_remaining: null,
};
const planRequiredState: SubscriptionState = {
  subscribed: false, plan: 'free', plan_display_name: 'Plan Required', features: noAccessFeatures,
  usage: { appointments_this_month: 0, technician_count: 0, customer_count: 0 }, limits: { appointments_remaining: 0, technicians_remaining: 0, customers_remaining: 0 },
  status: 'requires_plan', current_period_end: null, cancel_at_period_end: false, grace_period_ends_at: null, is_trialing: false, trial_ends_at: null, trial_days_remaining: null,
};
const freeState: SubscriptionState = {
  subscribed: true, plan: 'free', plan_display_name: 'Free', features: freeFeatures,
  usage: { appointments_this_month: 0, technician_count: 0, customer_count: 0 }, limits: { appointments_remaining: null, technicians_remaining: 1, customers_remaining: null },
  status: 'active', current_period_end: null, cancel_at_period_end: false, grace_period_ends_at: null, is_trialing: false, trial_ends_at: null, trial_days_remaining: null,
};

const SUBSCRIPTION_CACHE_TTL_MS = 5 * 60 * 1000;
const SUBSCRIPTION_TIMEOUT_MS = 4_500;
let cachedSubscriptionDecision: { userId: string; checkedAt: number; subscription: SubscriptionState } | null = null;
function getFreshCachedSubscription(userId: string | null) { if (!userId || !cachedSubscriptionDecision || cachedSubscriptionDecision.userId !== userId) return null; if (Date.now() - cachedSubscriptionDecision.checkedAt > SUBSCRIPTION_CACHE_TTL_MS) return null; return cachedSubscriptionDecision.subscription; }
function normalizeSubscriptionState(data: unknown): SubscriptionState {
  const raw = data as Partial<SubscriptionState> | null | undefined;
  if (!raw || raw.status === 'requires_plan') return freeState;
  const trialEndsAt = raw.trial_ends_at ?? null;
  const trialDaysRemaining = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000)) : null;
  const plan = (['payg','pro','business','enterprise','free'] as const).includes(raw.plan as PlanName) ? raw.plan as PlanName : 'free';
  if (plan === 'free') return { ...freeState, ...raw, plan: 'free', features: { ...freeFeatures, ...(raw.features ?? {}), has_stripe_payments: false }, trial_days_remaining: trialDaysRemaining };
  return { ...planRequiredState, ...raw, plan, features: raw.features ?? planRequiredState.features, usage: raw.usage ?? planRequiredState.usage, limits: raw.limits ?? planRequiredState.limits, trial_days_remaining: trialDaysRemaining };
}
async function withSubscriptionTimeout<T>(promise: Promise<T>): Promise<T> { return Promise.race([promise, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('Subscription check timed out')), SUBSCRIPTION_TIMEOUT_MS))]); }

const SubscriptionContext = createContext<SubscriptionContextType>({ subscription: null, loading: true, error: null, hasFeature: () => false, canUse: () => true, isAtLimit: () => false, isOverLimit: () => false, refresh: async () => {}, upgrade: async () => null, manageSubscription: async () => null, trackUsage: async () => {} });

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { session, user, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const subscriptionUserIdRef = useRef<string | null>(null);
  const fetchSubscription = useCallback(async (force = false) => {
    if (authLoading) return;
    if (!session?.access_token || !user) { cachedSubscriptionDecision = null; subscriptionUserIdRef.current = null; setSubscription(null); setError(null); setLoading(false); return; }
    const same = subscriptionUserIdRef.current === user.id; if (!same) { subscriptionUserIdRef.current = user.id; setSubscription(null); setLoading(true); }
    if (isSuperAdmin(user.email)) { cachedSubscriptionDecision = { userId: user.id, checkedAt: Date.now(), subscription: superAdminState }; setSubscription(superAdminState); setError(null); setLoading(false); return; }
    const cached = getFreshCachedSubscription(user.id); if (cached && !force) { setSubscription(cached); setError(null); setLoading(false); return; }
    try {
      const { data, error: fnError } = await withSubscriptionTimeout<{ data: unknown; error: unknown }>(supabase.functions.invoke('check-platform-subscription', { headers: { Authorization: `Bearer ${session.access_token}` } }));
      if (fnError) throw fnError; const normalized = normalizeSubscriptionState(data); cachedSubscriptionDecision = { userId: user.id, checkedAt: Date.now(), subscription: normalized }; setSubscription(normalized); setError(null);
    } catch (err) { console.error('Failed to fetch subscription:', err); setSubscription(prev => prev ?? freeState); setError(err instanceof Error ? err.message : 'Failed to fetch subscription'); }
    finally { setLoading(false); }
  }, [user, session, authLoading]);
  useEffect(() => { void Promise.resolve().then(() => fetchSubscription()); }, [fetchSubscription]);
  useEffect(() => { if (!session) return; const interval = setInterval(fetchSubscription, 5 * 60 * 1000); return () => clearInterval(interval); }, [session, fetchSubscription]);

  const hasFeature = useCallback((feature: keyof PlanFeatures) => { if (!subscription) return false; const value = subscription.features[feature]; return typeof value === 'boolean' ? value : true; }, [subscription]);
  const canUse = useCallback((r: 'appointments'|'technicians'|'customers') => { if (!subscription) return true; const x = r === 'appointments' ? subscription.limits.appointments_remaining : r === 'technicians' ? subscription.limits.technicians_remaining : subscription.limits.customers_remaining; return x === null || x > 0; }, [subscription]);
  const isAtLimit = useCallback((r: 'appointments'|'technicians'|'customers') => { if (!subscription) return false; const x = r === 'appointments' ? subscription.limits.appointments_remaining : r === 'technicians' ? subscription.limits.technicians_remaining : subscription.limits.customers_remaining; return x !== null && x <= 0; }, [subscription]);
  const isOverLimit = useCallback((r: 'appointments'|'technicians'|'customers') => { if (!subscription) return false; const x = r === 'appointments' ? subscription.limits.appointments_remaining : r === 'technicians' ? subscription.limits.technicians_remaining : subscription.limits.customers_remaining; return x !== null && x < 0; }, [subscription]);
  const refresh = useCallback(async () => { await fetchSubscription(true); }, [fetchSubscription]);
  const upgrade = useCallback(async (planName: PlanName): Promise<string | null> => {
    if (!session?.access_token) { setError('You must be signed in to choose a plan.'); return null; }
    if (planName === 'free') { cachedSubscriptionDecision = user ? { userId: user.id, checkedAt: Date.now(), subscription: freeState } : null; setSubscription(freeState); setError(null); return '/'; }
    try { const { data, error: fnError } = await supabase.functions.invoke('create-platform-checkout', { headers: { Authorization: `Bearer ${session.access_token}` }, body: { plan_name: planName } }); if (fnError) throw fnError; setError(null); return (data as { url?: string } | null)?.url ?? null; }
    catch (err) { console.error('Failed to create checkout session:', err); setError(err instanceof Error ? err.message : 'Failed to create checkout session'); return null; }
  }, [session, user]);
  const manageSubscription = useCallback(async () => { setError('Subscription management portal is not configured yet.'); return null; }, []);
  const trackUsage = useCallback(async (metric: 'appointments'|'customers') => { if (!user?.id) return; try { await supabase.rpc('increment_usage', { p_user_id: user.id, p_metric: metric }); await fetchSubscription(); } catch (err) { console.error('Failed to track usage:', err); } }, [user, fetchSubscription]);
  return <SubscriptionContext.Provider value={{ subscription, loading, error, hasFeature, canUse, isAtLimit, isOverLimit, refresh, upgrade, manageSubscription, trackUsage }}>{children}</SubscriptionContext.Provider>;
}
export function useSubscription() { return useContext(SubscriptionContext); }
export function useFeatureGate(feature: keyof PlanFeatures) { const { hasFeature, subscription, loading } = useSubscription(); return { hasAccess: hasFeature(feature), planRequired: !hasFeature(feature) ? getPlanForFeature(feature) : null, loading, currentPlan: subscription?.plan || 'free' }; }
function getPlanForFeature(feature: keyof PlanFeatures): PlanName {
  if (feature === 'has_stripe_payments') return 'business';
  const businessFeatures: (keyof PlanFeatures)[] = ['has_invoicing_full','has_dispatch_engine','has_ai_routing','has_fleet_os','has_technician_os','has_marketing_automation','has_quickbooks_sync','has_carfax_integration','has_ai_assistant'];
  if (businessFeatures.includes(feature)) return 'business';
  return 'free';
}

/**
 * Feature Gate Component
 * 
 * Conditionally renders content based on subscription features.
 * Shows upgrade prompt when feature is not available.
 */

import React from 'react';
import { useFeatureGate, type PlanFeatures, type PlanName } from '@/contexts/SubscriptionContext';
import { SubscriptionEnforcementState, type EnforcementScenario } from './SubscriptionEnforcementState';

interface FeatureGateProps {
  feature: keyof PlanFeatures;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showUpgradePrompt?: boolean;
  upgradeMessage?: string;
  scenario?: EnforcementScenario;
}

const planLabels: Record<PlanName, string> = {
  free: 'Free',
  payg: 'Pay As You Go',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
};

export function FeatureGate({
  feature,
  children,
  fallback,
  showUpgradePrompt = true,
  upgradeMessage,
  scenario = 'upgrade_required',
}: FeatureGateProps) {
  const { hasAccess, planRequired, loading } = useFeatureGate(feature);

  if (loading) {
    return (
      <div className="animate-pulse bg-muted rounded-lg h-32" />
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (!showUpgradePrompt) {
    return null;
  }

  const requiredPlanLabel = planRequired ? planLabels[planRequired] : 'Pro';
  const featureLabel = formatFeatureLabel(feature);

  return <SubscriptionEnforcementState
    feature={feature}
    requiredPlanLabel={requiredPlanLabel}
    scenario={scenario}
    titleOverride={upgradeMessage || `Unlock ${featureLabel}`}
  />;
}

// Helper to format feature keys into readable labels
function formatFeatureLabel(feature: keyof PlanFeatures): string {
  const labels: Record<keyof PlanFeatures, string> = {
    max_appointments_per_month: 'Unlimited Appointments',
    max_technician_seats: 'More Technician Seats',
    max_customers: 'Unlimited Customers',
    has_public_booking: 'Public Booking Page',
    has_invoicing_basic: 'Basic Invoicing',
    has_invoicing_full: 'Full Invoicing',
    has_stripe_payments: 'Payment Processing',
    has_dispatch_engine: 'Dispatch Engine',
    has_ai_routing: 'AI Routing',
    has_fleet_os: 'Fleet OS',
    has_technician_os: 'Technician OS',
    has_marketing_automation: 'Marketing Automation',
    has_quickbooks_sync: 'QuickBooks Sync',
    has_carfax_integration: 'Carfax Integration',
    has_pwa_offline: 'Offline Mode',
    has_ai_assistant: 'AI Assistant',
    tax_compliance_level: 'Advanced Tax Compliance',
    support_level: 'Priority Support',
  };
  return labels[feature] || feature;
}

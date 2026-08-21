import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, ArrowRight, Lock, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PlanFeatures } from '@/contexts/SubscriptionContext';

export type EnforcementScenario = 'upgrade_required' | 'downgraded' | 'forbidden';

interface SubscriptionEnforcementStateProps {
  feature: keyof PlanFeatures;
  requiredPlanLabel: string;
  scenario?: EnforcementScenario;
  titleOverride?: string;
  bodyOverride?: string;
}

interface EnforcementCopy {
  title: string;
  body: string;
  downgradeBody: string;
}

const featureCopy: Partial<Record<keyof PlanFeatures, EnforcementCopy>> = {
  has_ai_assistant: {
    title: 'AI Assistant requires plan access',
    body: 'Upgrade to continue with AI-guided diagnostics, estimates, and draft messaging.',
    downgradeBody: 'Your plan changed and AI Assistant is no longer included. Upgrade to restore access without losing your existing workflow.',
  },
  has_pwa_offline: {
    title: 'Offline mode is included with platform access',
    body: 'Offline queueing and sync replay are included for every active platform plan.',
    downgradeBody: 'Offline sync pauses when platform access is inactive. Restore an active plan to keep disconnected operations enabled.',
  },
  has_marketing_automation: {
    title: 'Marketing automation is plan-gated',
    body: 'Automated follow-ups and campaign scheduling are available on higher tiers.',
    downgradeBody: 'Your plan changed and automated marketing is no longer active. Upgrade to restore scheduled follow-ups.',
  },
  has_quickbooks_sync: {
    title: 'QuickBooks sync requires an upgraded plan',
    body: 'Enable accounting sync and reconciliation by upgrading your subscription.',
    downgradeBody: 'Your plan changed and QuickBooks sync has been paused. Upgrade to resume finance sync.',
  },
  has_carfax_integration: {
    title: 'Carfax integration is unavailable on this plan',
    body: 'Upgrade to unlock vehicle history enrichment directly in your workflow.',
    downgradeBody: 'Your plan changed and Carfax lookups are no longer included. Upgrade to restore history checks.',
  },
  has_ai_routing: {
    title: 'AI routing requires plan access',
    body: 'Upgrade to enable predictive dispatch optimization and routing recommendations.',
    downgradeBody: 'Your plan changed and AI routing has been disabled. Upgrade to regain optimized route suggestions.',
  },
};

export function SubscriptionEnforcementState({
  feature,
  requiredPlanLabel,
  scenario = 'upgrade_required',
  titleOverride,
  bodyOverride,
}: SubscriptionEnforcementStateProps) {
  const navigate = useNavigate();
  const copy = featureCopy[feature];

  const title = titleOverride || copy?.title || 'Feature requires a higher plan';
  const body = bodyOverride || (
    scenario === 'downgraded'
      ? copy?.downgradeBody || `Your plan changed and this feature is no longer included. Upgrade to ${requiredPlanLabel} to restore access.`
      : copy?.body || `This capability is available on ${requiredPlanLabel} and above.`
  );

  const isForbidden = scenario === 'forbidden';

  return (
    <Card className="border-dashed border-2 border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
        <div className="rounded-md bg-primary/10 p-3 mb-4">
          {isForbidden ? (
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          ) : (
            <Lock className="h-6 w-6 text-primary" />
          )}
        </div>

        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        <p className="text-muted-foreground mb-4 max-w-sm">{body}</p>

        <div className="flex gap-2">
          <Button onClick={() => navigate('/plans')} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Upgrade to {requiredPlanLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

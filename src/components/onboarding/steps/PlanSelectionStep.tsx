/**
 * Paid plan selection step.
 *
 * Used by legacy onboarding flows to direct owners into PAYG activation or
 * Stripe checkout before app access is granted.
 * Used by legacy onboarding flows to direct owners into Stripe checkout before
 * app access is granted.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlanCards, PLANS } from '@/components/subscription/PlanCards';
import { ArrowLeft, CreditCard } from 'lucide-react';
import type { PlanName } from '@/contexts/SubscriptionContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { toast } from 'sonner';

interface PlanSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  preSelectedPlan?: PlanName;
}

export function PlanSelectionStep({ onBack, preSelectedPlan }: PlanSelectionStepProps) {
  const { upgrade } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<PlanName>(
    preSelectedPlan && preSelectedPlan !== 'free' ? preSelectedPlan : PLANS[0].name,
  );
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    const url = await upgrade(selectedPlan);
    setLoading(false);
    if (url) {
      window.location.href = url;
      return;
    }
    toast.error('Unable to start Stripe checkout. Please try again.');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-md text-primary text-sm font-medium mb-2">
          <CreditCard className="h-4 w-4" />
          Paid Platform Access
        </div>
        <h2 className="text-3xl font-bold">Select your plan</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Choose Pay As You Grow to start with no monthly fee, or choose Pro/Business and complete Stripe checkout.
          Choose a paid plan and complete Stripe checkout to activate the features and limits included with that plan.
        </p>
      </div>

      <div className="mt-8">
        <PlanCards selectedPlan={selectedPlan} onSelect={setSelectedPlan} showTrialBadge />
      </div>

      <div className="flex justify-between items-center pt-6">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <Button onClick={handleCheckout} className="gap-2 min-w-[180px]" disabled={loading}>
          {loading ? 'Activating...' : selectedPlan === 'payg' ? 'Activate Pay As You Grow' : 'Continue to Stripe'}
          {loading ? 'Opening Stripe...' : 'Continue to Stripe'}
          <CreditCard className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

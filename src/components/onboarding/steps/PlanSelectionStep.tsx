import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlanCards, PLANS } from '@/components/subscription/PlanCards';
import { ArrowLeft, CreditCard } from 'lucide-react';
import type { PlanName } from '@/contexts/SubscriptionContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { toast } from '@/components/ui/sonner';

interface PlanSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  preSelectedPlan?: PlanName;
}

export function PlanSelectionStep({ onNext, onBack, preSelectedPlan }: PlanSelectionStepProps) {
  const { upgrade } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<PlanName>(preSelectedPlan ?? PLANS[0].name);
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (selectedPlan === 'free') {
      onNext();
      return;
    }
    setLoading(true);
    const url = await upgrade(selectedPlan);
    setLoading(false);
    if (url) {
      window.location.href = url;
      return;
    }
    toast.error('Unable to start plan checkout. Please try again.');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-md text-primary text-sm font-medium mb-2">
          <CreditCard className="h-4 w-4" />
          Choose Your Plan
        </div>
        <h2 className="text-3xl font-bold">Start free or plug in payments</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Free includes the core Service Writer workflow without payment processing. The Stripe plan adds direct payments to your own Stripe account for a flat monthly software fee — Service Writer takes 0% of your shop transactions.
        </p>
      </div>

      <div className="mt-8">
        <PlanCards selectedPlan={selectedPlan} onSelect={setSelectedPlan} showTrialBadge />
      </div>

      <div className="flex justify-between items-center pt-6">
        <Button variant="ghost" onClick={onBack} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
        <Button onClick={handleContinue} className="gap-2 min-w-[180px]" disabled={loading}>
          {loading ? 'Opening checkout...' : selectedPlan === 'free' ? 'Continue Free' : selectedPlan === 'enterprise' ? 'Continue' : 'Choose Stripe Plan'}
          <CreditCard className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Plans Page
 *
 * Paid platform plan selection. New business-owner signups land here before
 * they receive feature access; Stripe checkout activates the selected plan.
 * Super admins bypass this entirely and are sent to the dashboard.
 */

import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@packages/auth';
import { isSuperAdmin, useSubscription } from '@/contexts/SubscriptionContext';
import { PlanCards } from '@/components/subscription/PlanCards';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CreditCard } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function Plans() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { subscription, loading: subLoading } = useSubscription();

  const superAdmin = isSuperAdmin(user?.email);

  // Super admins never need a plan — send them to the dashboard immediately.
  useEffect(() => {
    if (!authLoading && superAdmin) {
      navigate('/dashboard', { replace: true });
    }
  }, [authLoading, superAdmin, navigate]);

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
      </div>
    );
  }

  if (superAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // If the user already has an active paid subscription, don't force them
  // to re-pick a plan — just send them to the dashboard.
  if (subscription?.subscribed && subscription.status === 'active') {
    return <Navigate to="/dashboard" replace />;
  }

  const currentPlan = subscription?.subscribed ? subscription.plan : undefined;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mb-6 gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="text-center space-y-2 mb-10">
          <h1 className="text-3xl font-bold">Choose your Service Writer plan</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Service Writer is a paid platform. Select a plan and complete checkout to unlock
            the features, limits, and access associated with that plan.
          </p>
        </div>

        <Alert className="mb-8 border-primary/50 bg-primary/5">
          <CreditCard className="h-4 w-4" />
          <AlertDescription>
            After checkout, your dashboard, Fleet OS, Technician OS, and integrations unlock
            according to your plan.
          </AlertDescription>
        </Alert>

        <PlanCards currentPlan={currentPlan} showUpgradeButtons showTrialBadge />
      </div>
    </div>
  );
}

/**
 * Usage Limit Warning
 * 
 * Shows soft warnings when approaching or at usage limits.
 */

import React from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface UsageLimitWarningProps {
  resource: 'appointments' | 'technicians' | 'customers';
  showProgress?: boolean;
}

const resourceLabels = {
  appointments: 'appointments this month',
  technicians: 'technician seats',
  customers: 'customers',
};

export function UsageLimitWarning({ resource, showProgress = true }: UsageLimitWarningProps) {
  const { subscription, isAtLimit, isOverLimit } = useSubscription();
  const navigate = useNavigate();

  if (!subscription) return null;

  const { usage, limits, features, plan } = subscription;

  // Get current and max values
  let current = 0;
  let max: number | null = null;
  let remaining: number | null = null;

  switch (resource) {
    case 'appointments':
      current = usage.appointments_this_month;
      max = features.max_appointments_per_month;
      remaining = limits.appointments_remaining;
      break;
    case 'technicians':
      current = usage.technician_count;
      max = features.max_technician_seats;
      remaining = limits.technicians_remaining;
      break;
    case 'customers':
      current = usage.customer_count;
      max = features.max_customers;
      remaining = limits.customers_remaining;
      break;
  }

  // No limit = unlimited
  if (max === null) return null;

  const percentage = Math.min(100, (current / max) * 100);
  const isNearLimit = percentage >= 80;
  const atLimit = isAtLimit(resource);
  const overLimit = isOverLimit(resource);

  // Don't show warning if well under limit
  if (!isNearLimit && !atLimit && !overLimit) return null;

  const variant = overLimit ? 'destructive' : atLimit ? 'default' : 'default';

  return (
    <Alert variant={variant} className={overLimit ? 'border-destructive' : atLimit ? 'border-warning bg-warning/10' : 'border-warning/50 bg-warning/5'}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>
          {overLimit
            ? `Over ${resourceLabels[resource]} limit`
            : atLimit
            ? `${resourceLabels[resource].charAt(0).toUpperCase() + resourceLabels[resource].slice(1)} limit reached`
            : `Approaching ${resourceLabels[resource]} limit`}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/plans')}
          className="ml-4"
        >
          <TrendingUp className="h-4 w-4 mr-1" />
          Upgrade
        </Button>
      </AlertTitle>
      <AlertDescription>
        <div className="mt-2">
          <p className="text-sm mb-2">
            {overLimit
              ? `You've used ${current} of ${max} ${resourceLabels[resource]}. Some features may be limited.`
              : atLimit
              ? `You've reached your limit of ${max} ${resourceLabels[resource]}. Upgrade to continue.`
              : `You've used ${current} of ${max} ${resourceLabels[resource]} (${remaining} remaining).`}
          </p>
          {showProgress && (
            <Progress 
              value={percentage} 
              className={`h-2 ${overLimit ? '[&>div]:bg-destructive' : atLimit ? '[&>div]:bg-warning' : ''}`}
            />
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Compact usage indicator for headers/sidebars
 */
export function UsageIndicator({ resource }: { resource: 'appointments' | 'technicians' | 'customers' }) {
  const { subscription } = useSubscription();

  if (!subscription) return null;

  const { usage, features } = subscription;

  let current = 0;
  let max: number | null = null;

  switch (resource) {
    case 'appointments':
      current = usage.appointments_this_month;
      max = features.max_appointments_per_month;
      break;
    case 'technicians':
      current = usage.technician_count;
      max = features.max_technician_seats;
      break;
    case 'customers':
      current = usage.customer_count;
      max = features.max_customers;
      break;
  }

  if (max === null) {
    return <span className="text-xs text-muted-foreground">{current} (unlimited)</span>;
  }

  const percentage = (current / max) * 100;
  const colorClass = percentage >= 100 ? 'text-destructive' : percentage >= 80 ? 'text-warning' : 'text-muted-foreground';

  return (
    <span className={`text-xs ${colorClass}`}>
      {current}/{max}
    </span>
  );
}

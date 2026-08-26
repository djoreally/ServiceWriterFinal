/**
 * Shared Plan Cards Component
 *
 * Three-tier paid platform lineup:
 *  - Pay As You Go: $0/mo, 3% platform fee ($10 minimum), no Fleet OS/Tech OS.
 *  - Business: $149/mo subscription with 14-day free trial (no card required),
 *    zero platform fee, includes Fleet OS + Technician OS + all integrations.
 *  - Enterprise: custom pricing / contact sales.
 */

import { type PlanName, useSubscription } from '@/contexts/SubscriptionContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Check, Sparkles, Building2, Wallet } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

export interface PlanInfo {
  name: PlanName;
  displayName: string;
  price: number | null;
  priceSuffix?: string;
  description: string;
  features: string[];
  limits: { appointments: number | null; technicians: number | null; customers: number | null };
  highlight?: boolean;
  contactSales?: boolean;
  trialDays?: number;
  icon: typeof Sparkles;
}

/** Canonical paid platform plans. */
export const PLANS: PlanInfo[] = [
  {
    name: 'payg',
    displayName: 'Pay As You Go',
    price: 0,
    description:
      'No monthly bill. Pay a 3% platform fee (minimum $10) only when a payment runs through Service Writer.',
    features: [
      '$0/month subscription',
      '3% platform fee — $10 minimum per transaction',
      'Public booking, invoicing, customers & vehicles',
      'Stripe & Square payments included',
      'Offline / PWA support',
      'Does not include Fleet OS or Technician OS',
    ],
    limits: { appointments: null, technicians: 1, customers: null },
    icon: Wallet,
  },
  {
    name: 'business',
    displayName: 'Business',
    price: 149,
    description:
      'Everything included, no platform fee. 14-day free trial — no credit card required to start.',
    features: [
      '14-day free trial (no card required)',
      '0% platform fee on all payments',
      'Fleet OS — contracts, work orders, SLAs',
      'Technician OS — offline field app',
      'Dispatch engine, AI routing & assistant',
      'Marketing automation & retention tools',
      'QuickBooks + Carfax integrations',
    ],
    limits: { appointments: null, technicians: null, customers: null },
    highlight: true,
    trialDays: 14,
    icon: Sparkles,
  },
  {
    name: 'enterprise',
    displayName: 'Enterprise',
    price: null,
    description:
      'Custom pricing for multi-location operators and large fleets. Dedicated onboarding, SLAs, and premium support.',
    features: [
      'Everything in Business',
      'Volume pricing & custom contracts',
      'Dedicated onboarding & success manager',
      'Priority phone support & SLAs',
      'Security & compliance reviews',
      'Custom integrations',
    ],
    limits: { appointments: null, technicians: null, customers: null },
    contactSales: true,
    icon: Building2,
  },
];

interface PlanCardsProps {
  selectedPlan?: PlanName;
  onSelect?: (plan: PlanName) => void;
  showUpgradeButtons?: boolean;
  currentPlan?: PlanName;
  /** Legacy prop — trial badging is now rendered per-plan from PlanInfo.trialDays. */
  showTrialBadge?: boolean;
}

const CONTACT_SALES_MAILTO =
  'mailto:sales@servicewriter.com?subject=Enterprise%20plan%20inquiry';

export function PlanCards({
  selectedPlan,
  onSelect,
  showUpgradeButtons = false,
  currentPlan,
}: PlanCardsProps) {
  const { upgrade } = useSubscription();
  const effectiveCurrentPlan = currentPlan;

  const startCheckout = async (plan: PlanInfo) => {
    if (plan.contactSales) {
      window.location.href = CONTACT_SALES_MAILTO;
      return;
    }
    const url = await upgrade(plan.name);
    if (url) {
      window.location.href = url;
      return;
    }
    toast.error('Unable to start checkout. Please try again.');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
      {PLANS.map((plan) => {
        const Icon = plan.icon;
        const isSelected = selectedPlan === plan.name;
        const isCurrent = effectiveCurrentPlan === plan.name;
        return (
          <Card
            key={plan.name}
            onClick={onSelect ? () => onSelect(plan.name) : undefined}
            className={`relative flex flex-col transition-all duration-200 ${
              onSelect ? 'cursor-pointer' : ''
            } ${plan.highlight ? 'border-primary shadow-lg md:scale-[1.03]' : ''} ${
              isSelected
                ? 'ring-2 ring-primary border-primary bg-primary/5'
                : isCurrent
                  ? 'bg-muted/30'
                  : onSelect
                    ? 'hover:border-primary/50'
                    : ''
            }`}
          >
            {plan.highlight && (
              <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary px-3">
                Most Popular
              </Badge>
            )}
            {plan.contactSales && !plan.highlight && (
              <Badge
                variant="outline"
                className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-background px-3"
              >
                Contact Sales
              </Badge>
            )}

            {isSelected && (
              <div className="absolute top-3 right-3">
                <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
                  <Check className="h-4 w-4 text-primary-foreground" />
                </div>
              </div>
            )}

            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                {plan.displayName}
                {isCurrent && <Badge variant="secondary">Current</Badge>}
              </CardTitle>
              <div className="flex items-baseline gap-1 mt-2 min-h-[3rem]">
                {plan.price === null ? (
                  <span className="text-2xl font-semibold">Let's talk</span>
                ) : (
                  <>
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-muted-foreground">/mo</span>
                  </>
                )}
              </div>
              <CardDescription className="mt-1">
                {plan.description}
                {plan.trialDays ? (
                  <span className="block mt-2 text-primary font-medium">
                    {plan.trialDays}-day free trial — no credit card required
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col">
              <Separator className="mb-4" />
              <ul className="space-y-2.5 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {showUpgradeButtons && (
                <div className="mt-6">
                  <Button
                    className="w-full"
                    variant={plan.contactSales ? 'outline' : 'default'}
                    disabled={isCurrent}
                    onClick={(e) => {
                      e.stopPropagation();
                      startCheckout(plan);
                    }}
                  >
                    {isCurrent
                      ? 'Current Plan'
                      : plan.contactSales
                        ? 'Contact Sales'
                        : plan.trialDays
                          ? `Start ${plan.trialDays}-day free trial`
                          : `Choose ${plan.displayName}`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

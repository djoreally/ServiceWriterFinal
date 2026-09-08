/**
 * Canonical Service Writer platform plans.
 *
 * Commercial boundary:
 *  - Free: core service-writing workflow, no payment processing.
 *  - Business: flat monthly software fee with direct merchant Stripe payments.
 *    Service Writer takes 0% of shop-owned transactions.
 *  - Enterprise: custom pricing for larger fleet/multi-location operators.
 *
 * Stripe Connect is reserved for Service Writer Marketplace transactions and is
 * not part of normal shop payment routing.
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

export const PLANS: PlanInfo[] = [
  {
    name: 'free',
    displayName: 'Free',
    price: 0,
    description: 'Run the core Service Writer workflow for free. Payment processing is not included.',
    features: [
      '$0/month',
      'Appointments, customers & vehicles',
      'Public booking',
      'Basic invoicing',
      'No Stripe or card payment processing',
      'Upgrade when you are ready to accept payments',
    ],
    limits: { appointments: null, technicians: 1, customers: null },
    icon: Wallet,
  },
  {
    name: 'business',
    displayName: 'Stripe',
    price: 149,
    description: 'Connect your own Stripe account for one flat software fee. Service Writer takes 0% of your shop payments.',
    features: [
      '14-day free trial — no card required to start',
      'Connect your own Stripe account',
      '0% Service Writer transaction fee',
      'Payments settle to your Stripe account',
      'Full invoicing & payment reconciliation',
      'Fleet OS + Technician OS',
      'Dispatch, automation & integrations',
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
    description: 'Custom flat-rate software pricing for multi-location operators and large fleets. Your Stripe account remains yours.',
    features: [
      'Everything in Stripe',
      '0% Service Writer transaction fee',
      'Volume pricing & custom contracts',
      'Dedicated onboarding & success manager',
      'Priority support & SLAs',
      'Security reviews & custom integrations',
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
  showTrialBadge?: boolean;
}

const CONTACT_SALES_MAILTO = 'mailto:sales@servicewriter.com?subject=Enterprise%20plan%20inquiry';

export function PlanCards({ selectedPlan, onSelect, showUpgradeButtons = false, currentPlan }: PlanCardsProps) {
  const { upgrade } = useSubscription();
  const effectiveCurrentPlan = currentPlan;

  const startCheckout = async (plan: PlanInfo) => {
    if (plan.contactSales) {
      window.location.assign(CONTACT_SALES_MAILTO);
      return;
    }
    const url = await upgrade(plan.name);
    if (url) {
      window.location.assign(url);
      return;
    }
    toast.error('Unable to activate this plan. Please try again.');
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
            className={`relative flex flex-col transition-all duration-200 ${onSelect ? 'cursor-pointer' : ''} ${plan.highlight ? 'border-primary shadow-lg md:scale-[1.03]' : ''} ${isSelected ? 'ring-2 ring-primary border-primary bg-primary/5' : isCurrent ? 'bg-muted/30' : onSelect ? 'hover:border-primary/50' : ''}`}
          >
            {plan.highlight && <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary px-3">Most Popular</Badge>}
            {plan.contactSales && !plan.highlight && <Badge variant="outline" className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-background px-3">Contact Sales</Badge>}
            {isSelected && <div className="absolute top-3 right-3"><div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center"><Check className="h-4 w-4 text-primary-foreground" /></div></div>}

            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary" />{plan.displayName}{isCurrent && <Badge variant="secondary">Current</Badge>}</CardTitle>
              <div className="flex items-baseline gap-1 mt-2 min-h-[3rem]">
                {plan.price === null ? <span className="text-2xl font-semibold">Let's talk</span> : <><span className="text-4xl font-bold">${plan.price}</span><span className="text-muted-foreground">/mo</span></>}
              </div>
              <CardDescription className="mt-1">
                {plan.description}
                {plan.trialDays ? <span className="block mt-2 text-primary font-medium">{plan.trialDays}-day free trial — no credit card required</span> : null}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col">
              <Separator className="mb-4" />
              <ul className="space-y-2.5 flex-1">
                {plan.features.map((feature, i) => <li key={i} className="flex items-start gap-2 text-sm"><Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" /><span>{feature}</span></li>)}
              </ul>
              {showUpgradeButtons && <div className="mt-6"><Button className="w-full" variant={plan.contactSales ? 'outline' : 'default'} disabled={isCurrent} onClick={(e) => { e.stopPropagation(); startCheckout(plan); }}>{isCurrent ? 'Current Plan' : plan.contactSales ? 'Contact Sales' : plan.price === 0 ? 'Choose Free' : plan.trialDays ? `Start ${plan.trialDays}-day free trial` : `Choose ${plan.displayName}`}</Button></div>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

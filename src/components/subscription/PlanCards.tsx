import { useState } from 'react';
import { type PlanName, useSubscription } from '@/contexts/SubscriptionContext';
import { SERVICE_WRITER_PRICING } from '@/domain/billing/canonical-pricing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Check, Sparkles, Building2, Wallet, CreditCard } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

export interface PlanInfo {
  name: PlanName;
  displayName: string;
  monthlyPrice: number;
  annualPrice: number;
  description: string;
  features: string[];
  limits: { appointments: number | null; technicians: number | null; customers: number | null };
  highlight?: boolean;
  icon: typeof Sparkles;
}

export const PLANS: PlanInfo[] = [
  {
    name: 'basic',
    displayName: 'Basic',
    monthlyPrice: SERVICE_WRITER_PRICING.basic.monthlyPrice,
    annualPrice: SERVICE_WRITER_PRICING.basic.annualPrice,
    description: 'Core Service Writer for operators who need customers, vehicles, booking, scheduling, and basic invoicing.',
    features: ['Customers & vehicles', 'Appointments & scheduling', 'Public booking', 'Service catalog', 'Basic invoicing & service records', 'No Technician OS', 'No Fleet OS'],
    limits: { appointments: null, technicians: 0, customers: null },
    icon: Wallet,
  },
  {
    name: 'pro',
    displayName: 'Pro',
    monthlyPrice: SERVICE_WRITER_PRICING.pro.monthlyPrice,
    annualPrice: SERVICE_WRITER_PRICING.pro.annualPrice,
    description: 'The full normal shop platform for growing service businesses and field teams.',
    features: ['Everything in Basic', 'Technician OS', 'Dispatch & field workflows', 'Automation & integrations', '3 technicians included', '$9.99/month per additional technician'],
    limits: { appointments: null, technicians: SERVICE_WRITER_PRICING.pro.includedTechnicians, customers: null },
    highlight: true,
    icon: Sparkles,
  },
  {
    name: 'fleet',
    displayName: 'Fleet',
    monthlyPrice: SERVICE_WRITER_PRICING.fleet.monthlyPrice,
    annualPrice: SERVICE_WRITER_PRICING.fleet.annualPrice,
    description: 'Everything in Pro plus Fleet OS for commercial service and recurring fleet operations.',
    features: ['Everything in Pro', 'Fleet OS', 'Fleet accounts & vehicle operations', 'Commercial scheduling workflows', '5 technicians included', '$7.99/month per additional technician'],
    limits: { appointments: null, technicians: SERVICE_WRITER_PRICING.fleet.includedTechnicians, customers: null },
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

export function PlanCards({ selectedPlan, onSelect, showUpgradeButtons = false, currentPlan }: PlanCardsProps) {
  const { upgrade } = useSubscription();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [paymentsAddonActive, setPaymentsAddonActive] = useState(false);

  const startCheckout = async (plan: PlanInfo) => {
    const url = await upgrade(plan.name, { billingInterval, paymentsAddonActive });
    if (url) {
      window.location.assign(url);
      return;
    }
    toast.error('Unable to activate this plan. Please try again.');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div>
          <div className="font-semibold">Billing interval</div>
          <div className="text-sm text-muted-foreground">Annual billing is exactly 20% off the locked monthly rates.</div>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={billingInterval === 'monthly' ? 'default' : 'outline'} onClick={() => setBillingInterval('monthly')}>Monthly</Button>
          <Button type="button" size="sm" variant={billingInterval === 'annual' ? 'default' : 'outline'} onClick={() => setBillingInterval('annual')}>Annual · 20% off</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isSelected = selectedPlan === plan.name;
          const isCurrent = currentPlan === plan.name;
          const price = billingInterval === 'annual' ? plan.annualPrice : plan.monthlyPrice;
          return (
            <Card
              key={plan.name}
              onClick={onSelect ? () => onSelect(plan.name) : undefined}
              className={`relative flex flex-col transition-all duration-200 ${onSelect ? 'cursor-pointer' : ''} ${plan.highlight ? 'border-primary shadow-lg md:scale-[1.03]' : ''} ${isSelected ? 'ring-2 ring-primary border-primary bg-primary/5' : isCurrent ? 'bg-muted/30' : onSelect ? 'hover:border-primary/50' : ''}`}
            >
              {plan.highlight && <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary px-3">Most Popular</Badge>}
              {isSelected && <div className="absolute top-3 right-3"><div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center"><Check className="h-4 w-4 text-primary-foreground" /></div></div>}
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary" />{plan.displayName}{isCurrent && <Badge variant="secondary">Current</Badge>}</CardTitle>
                <div className="flex items-baseline gap-1 mt-2 min-h-[3rem]">
                  <span className="text-4xl font-bold">${price.toFixed(price % 1 ? 2 : 0)}</span>
                  <span className="text-muted-foreground">/{billingInterval === 'annual' ? 'yr' : 'mo'}</span>
                </div>
                <CardDescription className="mt-1">{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <Separator className="mb-4" />
                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((feature) => <li key={feature} className="flex items-start gap-2 text-sm"><Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" /><span>{feature}</span></li>)}
                </ul>
                {showUpgradeButtons && <div className="mt-6"><Button className="w-full" disabled={isCurrent && !paymentsAddonActive} onClick={(event) => { event.stopPropagation(); void startCheckout(plan); }}>{isCurrent && !paymentsAddonActive ? 'Current Plan' : plan.name === 'basic' ? 'Choose Basic' : `Choose ${plan.displayName}`}</Button></div>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className={paymentsAddonActive ? 'border-primary ring-1 ring-primary' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" />Payments add-on</CardTitle>
          <CardDescription>Connect merchant-owned Stripe payment workflows for a flat software fee. Service Writer takes 0% of ordinary shop-owned transactions.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-bold">${(billingInterval === 'annual' ? SERVICE_WRITER_PRICING.payments.annualPrice : SERVICE_WRITER_PRICING.payments.monthlyPrice).toFixed(billingInterval === 'annual' ? 2 : 0)}<span className="text-sm font-normal text-muted-foreground">/{billingInterval === 'annual' ? 'yr' : 'mo'}</span></div>
            <div className="text-sm text-muted-foreground">0% Service Writer transaction fee</div>
          </div>
          <Button type="button" variant={paymentsAddonActive ? 'default' : 'outline'} onClick={() => setPaymentsAddonActive((value) => !value)}>{paymentsAddonActive ? 'Payments added' : 'Add Payments'}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

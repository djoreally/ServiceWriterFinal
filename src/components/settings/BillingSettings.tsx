/**
 * Billing Settings Component
 * 
 * Displays current subscription, usage, and link to plans page.
 */

import { useSubscription } from '@/contexts/SubscriptionContext';
import { fetchMessagingStats, type MessagingStats } from '@/application/queries/billing-settings.query';
import { startMessagingAddonCheckout } from '@/application/commands/billing-settings.command';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  CreditCard, 
  Users,
  Calendar,
  Loader2,
  ArrowRight,
  MessageSquare,
  Mail
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

interface MessagingEntitlements {
  sms_enabled: boolean;
  sms_segments_remaining: number;
  sms_monthly_included_segments: number;
  sms_marketing_enabled: boolean;
  marketing_email_enabled: boolean;
  marketing_email_sent_this_period: number;
  marketing_email_monthly_limit: number;
}

type BillingMessagingStats = MessagingStats;


const planMeta: Record<string, { icon: typeof CreditCard; price: number; description: string }> = {
  free: { icon: Users, price: 0, description: 'Complete platform access for every signup' },
  pro: { icon: Users, price: 0, description: 'Complete platform access for every signup' },
  business: { icon: Users, price: 0, description: 'Complete platform access for every signup' },
};

export function BillingSettings() {
  const { subscription, loading } = useSubscription();
  const navigate = useNavigate();
  const [messaging, setMessaging] = useState<MessagingEntitlements | null>(null);
  const [messagingStats, setMessagingStats] = useState<BillingMessagingStats>({
    outbound: 0,
    failed: 0,
    replies: 0,
    optOuts: 0,
  });
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadMessagingEntitlements() {
      // Messaging entitlement columns are not present on business_profiles yet.
      if (active) {
        setMessaging({
          sms_enabled: false,
          sms_segments_remaining: 0,
          sms_monthly_included_segments: 0,
          sms_marketing_enabled: false,
          marketing_email_enabled: false,
          marketing_email_sent_this_period: 0,
          marketing_email_monthly_limit: 0,
        });
      }

      const stats = await fetchMessagingStats();
      if (active) setMessagingStats(stats);
    }

    loadMessagingEntitlements();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentPlan = subscription?.plan || 'free';
  const meta = planMeta[currentPlan] || planMeta.free;
  const PlanIcon = meta.icon;

  const startMessagingCheckout = async (bundleKey: string) => {
    setCheckoutLoading(bundleKey);
    try {
      const data = await startMessagingAddonCheckout(bundleKey);
      if (data?.url) {
        window.location.href = data.url;
      }
    } finally {
      setCheckoutLoading(null);
    }
  };


  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <CardDescription>
                Billing is disabled — all features are included for free
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => navigate('/plans')} className="gap-2">
                View Included Features
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="p-3 bg-primary/10 rounded-md">
              <PlanIcon className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold">{subscription?.plan_display_name || 'Free'}</h3>
                <Badge variant="secondary">Free</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{meta.description}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">${meta.price}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Paid Messaging Add-ons */}
      <Card>
        <CardHeader>
          <CardTitle>Messaging Add-ons</CardTitle>
          <CardDescription>Track paid SMS bundle and marketing email usage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <UsageBar
            label="SMS Segments Remaining"
            current={messaging?.sms_segments_remaining ?? 0}
            max={messaging?.sms_monthly_included_segments ?? 0}
            icon={<MessageSquare className="h-4 w-4" />}
          />
          <UsageBar
            label="Marketing Emails Used"
            current={messaging?.marketing_email_sent_this_period ?? 0}
            max={messaging?.marketing_email_monthly_limit ?? 0}
            icon={<Mail className="h-4 w-4" />}
          />
          <div className="flex flex-wrap gap-2">
            <Badge variant={messaging?.sms_enabled ? "default" : "secondary"}>
              SMS {messaging?.sms_enabled ? "enabled" : "not enabled"}
            </Badge>
            <Badge variant={messaging?.sms_marketing_enabled ? "default" : "secondary"}>
              Marketing SMS {messaging?.sms_marketing_enabled ? "enabled" : "off"}
            </Badge>
            <Badge variant={messaging?.marketing_email_enabled ? "default" : "secondary"}>
              Marketing email {messaging?.marketing_email_enabled ? "enabled" : "not enabled"}
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <MessagingMetric label="Sent/Delivered" value={messagingStats.outbound} />
            <MessagingMetric label="Failed" value={messagingStats.failed} />
            <MessagingMetric label="Replies" value={messagingStats.replies} />
            <MessagingMetric label="Opt-outs" value={messagingStats.optOuts} />
          </div>
          <p className="text-xs text-muted-foreground">
            Bundle purchasing is driven by Stripe messaging add-on prices configured by the platform administrator.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => startMessagingCheckout('sms_starter')}
              disabled={checkoutLoading !== null}
            >
              {checkoutLoading === 'sms_starter' ? 'Opening…' : 'Buy SMS Starter'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => startMessagingCheckout('sms_growth')}
              disabled={checkoutLoading !== null}
            >
              {checkoutLoading === 'sms_growth' ? 'Opening…' : 'Buy SMS Growth'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => startMessagingCheckout('marketing_email')}
              disabled={checkoutLoading !== null}
            >
              {checkoutLoading === 'marketing_email' ? 'Opening…' : 'Add Marketing Email'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Usage This Month</CardTitle>
          <CardDescription>Track your resource consumption</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <UsageBar 
            label="Appointments"
            current={subscription?.usage.appointments_this_month || 0}
            max={subscription?.features.max_appointments_per_month}
            icon={<Calendar className="h-4 w-4" />}
          />
          <UsageBar 
            label="Technician Seats"
            current={subscription?.usage.technician_count || 0}
            max={subscription?.features.max_technician_seats}
            icon={<Users className="h-4 w-4" />}
          />
          <UsageBar 
            label="Customers"
            current={subscription?.usage.customer_count || 0}
            max={subscription?.features.max_customers}
            icon={<Users className="h-4 w-4" />}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function MessagingMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function UsageBar({ 
  label, 
  current, 
  max, 
  icon 
}: { 
  label: string; 
  current: number; 
  max: number | null; 
  icon: React.ReactNode;
}) {
  const percentage = max ? Math.min(100, (current / max) * 100) : 0;
  const isNearLimit = max && percentage >= 80;
  const isAtLimit = max && percentage >= 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        <span className={`text-sm ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-warning' : 'text-muted-foreground'}`}>
          {current} / {max === null ? '∞' : max}
        </span>
      </div>
      {max !== null && (
        <Progress 
          value={percentage} 
          className={`h-2 ${isAtLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-warning' : ''}`}
        />
      )}
      {max === null && (
        <div className="text-xs text-muted-foreground">Unlimited on your current plan</div>
      )}
    </div>
  );
}

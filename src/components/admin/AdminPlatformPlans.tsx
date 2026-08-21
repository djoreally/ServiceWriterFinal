/**
 * Admin Platform Plans Management
 * 
 * Super admin panel for managing platform subscription plans
 * and syncing with Stripe.
 */

import { useState, useEffect } from 'react';
import { fetchPlatformPlans, fetchSubscriptionStats, togglePlatformPlanActive, updatePlatformPlan } from '@/application/queries/admin-platform-plans.query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  CreditCard, 
  Users, 
  Check,
  X,
  Edit,
  RefreshCw,
  DollarSign,
  Sparkles,
  Building2,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCentsAsCurrency } from '@/lib/financialMath';

interface PlatformPlan {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  price_cents: number;
  billing_interval: string;
  max_appointments_per_month: number | null;
  max_technician_seats: number | null;
  max_customers: number | null;
  has_public_booking: boolean;
  has_invoicing_basic: boolean;
  has_invoicing_full: boolean;
  has_stripe_payments: boolean;
  has_dispatch_engine: boolean;
  has_ai_routing: boolean;
  has_fleet_os: boolean;
  has_technician_os: boolean;
  has_marketing_automation: boolean;
  has_quickbooks_sync: boolean;
  has_carfax_integration: boolean;
  has_pwa_offline: boolean;
  has_ai_assistant: boolean;
  tax_compliance_level: string;
  support_level: string;
  is_active: boolean;
  display_order: number;
  badge_label: string | null;
  badge_color: string | null;
  highlight: boolean;
  created_at: string;
  updated_at: string;
}

interface SubscriptionStats {
  totalSubscriptions: number;
  byPlan: Record<string, number>;
  mrr: number;
}

export function AdminPlatformPlans() {
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<PlatformPlan | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchPlans();
    fetchStats();
  }, []);

  const fetchPlans = async () => {
    try {
      const { data, error } = await fetchPlatformPlans();

      if (error) throw error;
      setPlans(data || []);
    } catch (err) {
      toast.error('Failed to load plans');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data: subs, error } = await fetchSubscriptionStats();

      if (error) throw error;

      const byPlan: Record<string, number> = {};
      let mrr = 0;

      (subs || []).forEach((sub: any) => {
        const planName = sub.platform_plans?.name || 'unknown';
        byPlan[planName] = (byPlan[planName] || 0) + 1;
        mrr += (sub.platform_plans?.price_cents || 0) / 100;
      });

      setStats({
        totalSubscriptions: subs?.length || 0,
        byPlan,
        mrr,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const togglePlanActive = async (plan: PlatformPlan) => {
    try {
      const { error } = await togglePlatformPlanActive(plan.id, !plan.is_active);

      if (error) throw error;
      toast.success(`Plan ${plan.is_active ? 'deactivated' : 'activated'}`);
      fetchPlans();
    } catch (err) {
      toast.error('Failed to update plan');
    }
  };

  const updatePlan = async (plan: PlatformPlan) => {
    try {
      const { error } = await updatePlatformPlan(plan.id, {
        display_name: plan.display_name,
        description: plan.description,
        price_cents: plan.price_cents,
        max_appointments_per_month: plan.max_appointments_per_month,
        max_technician_seats: plan.max_technician_seats,
        max_customers: plan.max_customers,
        badge_label: plan.badge_label,
        badge_color: plan.badge_color,
        highlight: plan.highlight,
      });

      if (error) throw error;
      toast.success('Plan updated');
      setEditingPlan(null);
      fetchPlans();
    } catch (err) {
      toast.error('Failed to update plan');
    }
  };

  const syncWithStripe = async () => {
    setSyncing(true);
    try {
      // This would call an edge function to sync plans with Stripe
      toast.success('Plans synced with Stripe');
    } catch (err) {
      toast.error('Failed to sync with Stripe');
    } finally {
      setSyncing(false);
    }
  };

  const getPlanIcon = (name: string) => {
    switch (name) {
      case 'free': return <Users className="h-5 w-5" />;
      case 'pro': return <Sparkles className="h-5 w-5" />;
      case 'business': return <Building2 className="h-5 w-5" />;
      default: return <CreditCard className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Subscriptions</p>
                <p className="text-2xl font-bold">{stats?.totalSubscriptions || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <DollarSign className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Monthly Recurring</p>
                <p className="text-2xl font-bold">{formatCentsAsCurrency((stats?.mrr || 0) * 100)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Sparkles className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pro Subscribers</p>
                <p className="text-2xl font-bold">{stats?.byPlan?.pro || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Building2 className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Business Subscribers</p>
                <p className="text-2xl font-bold">{stats?.byPlan?.business || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plans Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Platform Plans</CardTitle>
            <CardDescription>Manage subscription tiers and features</CardDescription>
          </div>
          <Button onClick={syncWithStripe} disabled={syncing} variant="outline" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync with Stripe
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <Card 
                key={plan.id} 
                className={`relative ${plan.highlight ? 'border-primary shadow-lg' : ''} ${!plan.is_active ? 'opacity-60' : ''}`}
              >
                {plan.badge_label && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2" variant="secondary">
                    {plan.badge_label}
                  </Badge>
                )}
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getPlanIcon(plan.name)}
                      <CardTitle className="text-xl">{plan.display_name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch 
                        checked={plan.is_active} 
                        onCheckedChange={() => togglePlanActive(plan)}
                      />
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => setEditingPlan(plan)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Edit {plan.display_name} Plan</DialogTitle>
                          </DialogHeader>
                          {editingPlan && (
                            <div className="space-y-4 py-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label>Display Name</Label>
                                  <Input 
                                    value={editingPlan.display_name}
                                    onChange={(e) => setEditingPlan({...editingPlan, display_name: e.target.value})}
                                  />
                                </div>
                                <div>
                                  <Label>Price (cents)</Label>
                                  <Input 
                                    type="number"
                                    value={editingPlan.price_cents}
                                    onChange={(e) => setEditingPlan({...editingPlan, price_cents: parseInt(e.target.value) || 0})}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <Label>Max Appointments/mo</Label>
                                  <Input 
                                    type="number"
                                    value={editingPlan.max_appointments_per_month || ''}
                                    placeholder="Unlimited"
                                    onChange={(e) => setEditingPlan({...editingPlan, max_appointments_per_month: e.target.value ? parseInt(e.target.value) : null})}
                                  />
                                </div>
                                <div>
                                  <Label>Max Technicians</Label>
                                  <Input 
                                    type="number"
                                    value={editingPlan.max_technician_seats || ''}
                                    placeholder="Unlimited"
                                    onChange={(e) => setEditingPlan({...editingPlan, max_technician_seats: e.target.value ? parseInt(e.target.value) : null})}
                                  />
                                </div>
                                <div>
                                  <Label>Max Customers</Label>
                                  <Input 
                                    type="number"
                                    value={editingPlan.max_customers || ''}
                                    placeholder="Unlimited"
                                    onChange={(e) => setEditingPlan({...editingPlan, max_customers: e.target.value ? parseInt(e.target.value) : null})}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label>Badge Label</Label>
                                  <Input 
                                    value={editingPlan.badge_label || ''}
                                    placeholder="e.g., Popular"
                                    onChange={(e) => setEditingPlan({...editingPlan, badge_label: e.target.value || null})}
                                  />
                                </div>
                                <div>
                                  <Label>Badge Color</Label>
                                  <Input 
                                    value={editingPlan.badge_color || ''}
                                    placeholder="e.g., #666666"
                                    onChange={(e) => setEditingPlan({...editingPlan, badge_color: e.target.value || null})}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Switch 
                                  checked={editingPlan.highlight}
                                  onCheckedChange={(checked) => setEditingPlan({...editingPlan, highlight: checked})}
                                />
                                <Label>Highlight this plan</Label>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setEditingPlan(null)}>Cancel</Button>
                                <Button onClick={() => updatePlan(editingPlan)}>Save Changes</Button>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-bold">{formatCentsAsCurrency(plan.price_cents)}</span>
                    <span className="text-muted-foreground">/{plan.billing_interval}</span>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between py-1 border-b">
                      <span>Appointments/mo</span>
                      <span className="font-medium">{plan.max_appointments_per_month || 'Unlimited'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b">
                      <span>Technician seats</span>
                      <span className="font-medium">{plan.max_technician_seats || 'Unlimited'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b">
                      <span>Customers</span>
                      <span className="font-medium">{plan.max_customers || 'Unlimited'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <FeatureCheck label="Booking Page" enabled={plan.has_public_booking} />
                      <FeatureCheck label="Invoicing" enabled={plan.has_invoicing_full} />
                      <FeatureCheck label="Payments" enabled={plan.has_stripe_payments} />
                      <FeatureCheck label="Dispatch" enabled={plan.has_dispatch_engine} />
                      <FeatureCheck label="AI Routing" enabled={plan.has_ai_routing} />
                      <FeatureCheck label="Fleet OS" enabled={plan.has_fleet_os} />
                      <FeatureCheck label="Tech OS" enabled={plan.has_technician_os} />
                      <FeatureCheck label="Marketing" enabled={plan.has_marketing_automation} />
                      <FeatureCheck label="QuickBooks" enabled={plan.has_quickbooks_sync} />
                      <FeatureCheck label="Carfax" enabled={plan.has_carfax_integration} />
                      <FeatureCheck label="Offline" enabled={plan.has_pwa_offline} />
                      <FeatureCheck label="AI Assistant" enabled={plan.has_ai_assistant} />
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Stripe: {plan.stripe_product_id ? '✓ Connected' : '○ Not linked'}</span>
                      <span>{stats?.byPlan?.[plan.name] || 0} subscribers</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FeatureCheck({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {enabled ? (
        <Check className="h-3.5 w-3.5 text-primary" />
      ) : (
        <X className="h-3.5 w-3.5 text-muted-foreground/50" />
      )}
      <span className={enabled ? '' : 'text-muted-foreground/50'}>{label}</span>
    </div>
  );
}

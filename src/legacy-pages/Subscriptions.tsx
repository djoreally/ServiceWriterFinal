import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { bankersRound } from '@/lib/financialMath';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  BadgeDollarSign,
  Users,
  Crown,
  Star,
  Zap,
  Check,
  MoreVertical,
  Copy,
  Eye,
  Package,
  TrendingUp,
  RefreshCw,
  CloudOff,
  Link as LinkIcon,
  Shield,
  Car,
  Battery,
  Sparkles,
  Building2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BillingCycle, SubscriptionPlan } from "@/shared/types";
import {
  fetchSubscriptionPlans,
  fetchSubscriptionStats,
  type SubscriptionStats,
} from "@/application/queries/subscriptions.query";
import {
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  togglePlanActive,
  syncPlanToStripe,
  syncAllPlansToStripe,
} from "@/application/commands/subscriptions.command";
import { fetchActiveServiceCatalog, type SubscriptionServiceCatalogItem } from "@/application/queries/subscriptions-helpers.query";

// ── Local types ──

type ServiceCatalogItem = SubscriptionServiceCatalogItem;

interface PlanFormData {
  name: string;
  description: string;
  price: string;
  billing_cycle: BillingCycle;
  features: string;
  included_services: string[];
  max_services_per_cycle: string;
  is_active: boolean;
  display_order: string;
  tier: string;
  price_min: string;
  price_max: string;
  badge_label: string;
  badge_color: string;
  highlight: boolean;
  cta_label: string;
}

const EMPTY_FORM: PlanFormData = {
  name: "",
  description: "",
  price: "",
  billing_cycle: "monthly",
  features: "",
  included_services: [],
  max_services_per_cycle: "",
  is_active: true,
  display_order: "0",
  tier: "custom",
  price_min: "",
  price_max: "",
  badge_label: "",
  badge_color: "",
  highlight: false,
  cta_label: "Subscribe Now",
};

const BILLING_SHORT: Record<BillingCycle, string> = {
  monthly: "/mo",
  quarterly: "/qtr",
  yearly: "/yr",
};

// ── Tier display config ──

const TIER_CONFIG: Record<string, {
  icon: React.ReactNode;
  gradient: string;
  badge: string;
  ring: string;
}> = {
  essentials: {
    icon: <Shield className="h-6 w-6" />,
    gradient: "from-slate-500/20 to-slate-600/5",
    badge: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-300",
    ring: "ring-slate-300",
  },
  performance: {
    icon: <Star className="h-6 w-6" />,
    gradient: "from-blue-500/20 to-blue-600/5",
    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-300",
    ring: "ring-blue-400",
  },
  elite: {
    icon: <Crown className="h-6 w-6" />,
    gradient: "from-amber-500/20 to-amber-600/5",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300",
    ring: "ring-amber-400",
  },
  addon: {
    icon: <Zap className="h-5 w-5" />,
    gradient: "from-green-500/20 to-green-600/5",
    badge: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-green-300",
    ring: "ring-green-300",
  },
  custom: {
    icon: <Package className="h-5 w-5" />,
    gradient: "from-purple-500/20 to-purple-600/5",
    badge: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-300",
    ring: "ring-purple-300",
  },
};

const ADDON_ICONS: Record<string, React.ReactNode> = {
  "Tire Protection Plan": <Car className="h-5 w-5" />,
  "Battery Protection Plan": <Battery className="h-5 w-5" />,
  "Detailing Club": <Sparkles className="h-5 w-5" />,
  "Fleet Plan": <Building2 className="h-5 w-5" />,
};

function getTierConfig(tier: string | null) {
  return TIER_CONFIG[tier || "custom"] || TIER_CONFIG.custom;
}

// ── Component ───────────────────────────────────────────────

const Subscriptions = () => {
  const { formatCurrency } = useRegionalSettings();

  // Data
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  // UI
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [previewPlan, setPreviewPlan] = useState<SubscriptionPlan | null>(null);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<SubscriptionPlan | null>(null);
  const [activeTab, setActiveTab] = useState<"plans" | "addons">("plans");
  const [formData, setFormData] = useState<PlanFormData>(EMPTY_FORM);

  // ── Data fetching ──

  const loadData = useCallback(async () => {
    try {
      const [plansData, statsData] = await Promise.all([
        fetchSubscriptionPlans(),
        fetchSubscriptionStats(),
      ]);
      setPlans(plansData);
      setStats(statsData);
    } catch (err) {
      toast({
        title: "Error loading subscriptions",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadServices = useCallback(async () => {
    const data = await fetchActiveServiceCatalog();
    setServices(data);
  }, []);

  useEffect(() => {
    loadData();
    loadServices();
  }, [loadData, loadServices]);

  // ── Helpers ──

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingPlan(null);
  };

  const corePlans = plans.filter((p) => p.tier !== "addon");
  const addonPlans = plans.filter((p) => p.tier === "addon");

  const displayPlans = activeTab === "plans" ? corePlans : addonPlans;
  const filteredPlans = displayPlans.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── CRUD ──

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({ title: "Plan name is required", variant: "destructive" });
      return;
    }
    if (!formData.price || Number(formData.price) <= 0) {
      toast({ title: "Price must be greater than zero", variant: "destructive" });
      return;
    }

    const features = formData.features
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      price: bankersRound(Number(formData.price) || 0, 2),
      billing_cycle: formData.billing_cycle,
      features,
      included_services: formData.included_services,
      max_services_per_cycle: formData.max_services_per_cycle
        ? parseInt(formData.max_services_per_cycle)
        : null,
      is_active: formData.is_active,
      display_order: parseInt(formData.display_order) || 0,
      tier: formData.tier || "custom",
      price_min: formData.price_min ? bankersRound(Number(formData.price_min) || 0, 2) : undefined,
      price_max: formData.price_max ? bankersRound(Number(formData.price_max) || 0, 2) : undefined,
      badge_label: formData.badge_label || undefined,
      badge_color: formData.badge_color || undefined,
      highlight: formData.highlight,
      cta_label: formData.cta_label || "Subscribe Now",
    };

    try {
      if (editingPlan) {
        await updateSubscriptionPlan({ id: editingPlan.id, ...payload });
        toast({ title: "Plan updated successfully" });
      } else {
        await createSubscriptionPlan(payload);
        toast({ title: "Plan created successfully" });
      }
      loadData();
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      toast({
        title: editingPlan ? "Error updating plan" : "Error creating plan",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || "",
      price: plan.price.toString(),
      billing_cycle: plan.billing_cycle,
      features: (plan.features || []).join("\n"),
      included_services: plan.included_services || [],
      max_services_per_cycle: plan.max_services_per_cycle?.toString() || "",
      is_active: plan.is_active,
      display_order: plan.display_order?.toString() || "0",
      tier: plan.tier || "custom",
      price_min: plan.price_min?.toString() || "",
      price_max: plan.price_max?.toString() || "",
      badge_label: plan.badge_label || "",
      badge_color: plan.badge_color || "",
      highlight: plan.highlight || false,
      cta_label: plan.cta_label || "Subscribe Now",
    });
    setDialogOpen(true);
  };

  const handleDuplicate = (plan: SubscriptionPlan) => {
    setEditingPlan(null);
    setFormData({
      name: `${plan.name} (Copy)`,
      description: plan.description || "",
      price: plan.price.toString(),
      billing_cycle: plan.billing_cycle,
      features: (plan.features || []).join("\n"),
      included_services: plan.included_services || [],
      max_services_per_cycle: plan.max_services_per_cycle?.toString() || "",
      is_active: false,
      display_order: ((plan.display_order || 0) + 1).toString(),
      tier: plan.tier || "custom",
      price_min: plan.price_min?.toString() || "",
      price_max: plan.price_max?.toString() || "",
      badge_label: plan.badge_label || "",
      badge_color: plan.badge_color || "",
      highlight: false,
      cta_label: plan.cta_label || "Subscribe Now",
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingPlan) return;
    try {
      await deleteSubscriptionPlan(deletingPlan.id);
      toast({ title: "Plan deleted" });
      loadData();
    } catch (err) {
      toast({
        title: "Error deleting plan",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
    setDeleteDialogOpen(false);
    setDeletingPlan(null);
  };

  const handleToggleActive = async (plan: SubscriptionPlan) => {
    try {
      await togglePlanActive(plan.id, !plan.is_active);
      loadData();
    } catch (err) {
      toast({
        title: "Error updating plan",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  // ── Stripe sync ──

  const handleSyncPlan = async (planId: string) => {
    setSyncing(planId);
    try {
      const result = await syncPlanToStripe(planId);
      toast({
        title: "Plan synced to Stripe",
        description: `Product: ${result.stripe_product_id?.slice(0, 15)}...`,
      });
      loadData();
    } catch (err) {
      toast({
        title: "Stripe sync failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const result = await syncAllPlansToStripe();
      const synced = result.results.filter((r) => r.status === "synced").length;
      const errors = result.results.filter((r) => r.status === "error").length;
      toast({
        title: "Stripe sync complete",
        description: `${synced} plans synced${errors > 0 ? `, ${errors} errors` : ""}`,
        variant: errors > 0 ? "destructive" : "default",
      });
      loadData();
    } catch (err) {
      toast({
        title: "Stripe sync failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncingAll(false);
    }
  };

  const toggleServiceInPlan = (serviceId: string) => {
    setFormData((prev) => ({
      ...prev,
      included_services: prev.included_services.includes(serviceId)
        ? prev.included_services.filter((id) => id !== serviceId)
        : [...prev.included_services, serviceId],
    }));
  };

  // ── Share link state ──
  const [bookingSlug, setBookingSlug] = useState<string | null>(null);

  useEffect(() => {
    const fetchSlug = async () => {
      try {
        const { fetchBusinessSlug } = await import("@/application/queries/marketing.query");
        const slug = await fetchBusinessSlug();
        if (slug) setBookingSlug(slug);
      } catch { /* ignore */ }
    };
    fetchSlug();
  }, []);

  const subscriptionUrl = bookingSlug
    ? `${window.location.origin}/subscribe/${bookingSlug}`
    : null;

  const handleCopySubscriptionLink = () => {
    if (!subscriptionUrl) return;
    navigator.clipboard.writeText(subscriptionUrl);
    toast({ title: "Subscription link copied to clipboard!" });
  };

  // ── Render ──

  return (
    <AppLayout title="Subscriptions">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <BadgeDollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Plans</p>
              <p className="text-2xl font-bold">{stats?.totalPlans ?? plans.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 bg-gray-500/10 rounded-xl">
              <Check className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Plans</p>
              <p className="text-2xl font-bold">{stats?.activePlans ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 bg-blue-500/10 rounded-xl">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Subscribers</p>
              <p className="text-2xl font-bold">{stats?.totalSubscribers ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="p-3 bg-amber-500/10 rounded-xl">
              <TrendingUp className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Est. MRR</p>
              <p className="text-2xl font-bold">{formatCurrency(stats?.estimatedMRR ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Share Link */}
      {subscriptionUrl && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-3 bg-primary/10 rounded-xl shrink-0">
                <LinkIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">Subscription Signup Link</p>
                <code className="text-sm text-muted-foreground font-mono truncate block">
                  {subscriptionUrl}
                </code>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleCopySubscriptionLink} className="gap-2">
                <Copy className="h-4 w-4" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: "Subscribe to our service plans", url: subscriptionUrl! });
                  } else {
                    handleCopySubscriptionLink();
                  }
                }}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Share
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(subscriptionUrl!, "_blank")}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                Preview
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {stats && stats.plansWithoutStripe > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4">
            <div className="flex items-center gap-3 flex-1">
              <CloudOff className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  {stats.plansWithoutStripe} plan{stats.plansWithoutStripe !== 1 ? "s" : ""} not synced to Stripe
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Sync your plans to Stripe to enable customer subscriptions and recurring billing.
                </p>
              </div>
            </div>
            <Button
              onClick={handleSyncAll}
              disabled={syncingAll}
              variant="outline"
              className="border-amber-400 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 whitespace-nowrap"
            >
              {syncingAll ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync All to Stripe
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between mb-6">
        <div className="flex items-center gap-4 flex-1">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "plans" | "addons")}>
            <TabsList>
              <TabsTrigger value="plans" className="gap-2">
                <Package className="h-4 w-4" />
                Plans ({corePlans.length})
              </TabsTrigger>
              <TabsTrigger value="addons" className="gap-2">
                <Zap className="h-4 w-4" />
                Add-Ons ({addonPlans.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search plans..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSyncAll} disabled={syncingAll} size="sm">
            {syncingAll ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync Stripe
          </Button>
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Plan
              </Button>
            </DialogTrigger>

            {/* ── Create / Edit Dialog ── */}
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingPlan ? "Edit" : "Create"} Subscription Plan</DialogTitle>
                <DialogDescription>
                  {editingPlan
                    ? "Update the plan details. Changes to price will create a new Stripe price on next sync."
                    : "Define a new subscription plan. After creating, sync to Stripe to accept payments."}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Row 1: Name + Tier */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="plan-name">Plan Name *</Label>
                    <Input
                      id="plan-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Performance Plan"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan-tier">Tier</Label>
                    <Select
                      value={formData.tier}
                      onValueChange={(v) => setFormData({ ...formData, tier: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="essentials">Essentials</SelectItem>
                        <SelectItem value="performance">Performance</SelectItem>
                        <SelectItem value="elite">Elite VIP</SelectItem>
                        <SelectItem value="addon">Add-On</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row 2: Price + Billing Cycle */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="plan-price">Price *</Label>
                    <Input
                      id="plan-price"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="29.99"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billing-cycle">Billing</Label>
                    <Select
                      value={formData.billing_cycle}
                      onValueChange={(v) =>
                        setFormData({ ...formData, billing_cycle: v as BillingCycle })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-services">Max Services/Cycle</Label>
                    <Input
                      id="max-services"
                      type="number"
                      min="1"
                      value={formData.max_services_per_cycle}
                      onChange={(e) =>
                        setFormData({ ...formData, max_services_per_cycle: e.target.value })
                      }
                      placeholder="Unlimited"
                    />
                  </div>
                </div>

                {/* Price Range */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-up-2">
                    <Label>Price Range (optional)</Label>
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.price_min}
                        onChange={(e) => setFormData({ ...formData, price_min: e.target.value })}
                        placeholder="Min"
                        className="flex-1"
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.price_max}
                        onChange={(e) => setFormData({ ...formData, price_max: e.target.value })}
                        placeholder="Max"
                        className="flex-1"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Shown as a range on the public page (e.g., $29–$39/mo)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Badge & CTA</Label>
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        value={formData.badge_label}
                        onChange={(e) => setFormData({ ...formData, badge_label: e.target.value })}
                        placeholder="Badge text"
                        className="flex-1"
                      />
                      <Input
                        value={formData.cta_label}
                        onChange={(e) => setFormData({ ...formData, cta_label: e.target.value })}
                        placeholder="CTA text"
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="plan-desc">Description</Label>
                  <Textarea
                    id="plan-desc"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief customer-facing description"
                    rows={2}
                  />
                </div>

                {/* Features */}
                <div className="space-y-2">
                  <Label htmlFor="plan-features">Features (one per line)</Label>
                  <Textarea
                    id="plan-features"
                    value={formData.features}
                    onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                    placeholder={`2 Full Synthetic Oil Changes per year\nMulti-point inspection\n5% off additional services`}
                    rows={5}
                  />
                </div>

                {/* Included Services */}
                <div className="space-y-2">
                  <Label>Included Services</Label>
                  <div className="border rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                    {services.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2 text-center">
                        No active services in your catalog
                      </p>
                    ) : (
                      services.map((svc) => (
                        <label
                          key={svc.id}
                          className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formData.included_services.includes(svc.id)}
                            onChange={() => toggleServiceInPlan(svc.id)}
                            className="rounded border-input"
                          />
                          <span className="flex-1 text-sm">{svc.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatCurrency(svc.default_price)}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Toggles + order */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                    <Label>Active</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={formData.highlight}
                      onCheckedChange={(checked) => setFormData({ ...formData, highlight: checked })}
                    />
                    <Label>Highlight (featured)</Label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="display-order">Display order</Label>
                    <Input
                      id="display-order"
                      type="number"
                      min="0"
                      value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setDialogOpen(false); resetForm(); }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">{editingPlan ? "Save Changes" : "Create Plan"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Empty state ── */}
      {!loading && filteredPlans.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 bg-primary/10 rounded-md mb-4">
              <BadgeDollarSign className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {plans.length === 0
                  ? "No plans yet"
                : `No ${activeTab === "addons" ? "add-on" : ""} plans match your search`}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              {plans.length === 0
                  ? "Create a plan to start recurring revenue."
                : "Try adjusting your search terms."}
            </p>
            {plans.length === 0 && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create plan
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Plan Cards ── */}
      {!loading && filteredPlans.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredPlans.map((plan) => {
            const cfg = getTierConfig(plan.tier);
            const isSynced = !!plan.stripe_price_id;
            const isSyncing = syncing === plan.id;
            return (
              <Card
                key={plan.id}
                className={`relative overflow-hidden transition-all hover:shadow-lg ${
                  plan.highlight ? `ring-2 ${cfg.ring}` : ""
                } ${!plan.is_active ? "opacity-60" : ""}`}
              >
                {/* Gradient header */}
                <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${cfg.gradient}`} />

                {/* Actions */}
                <div className="absolute top-3 right-3 z-10">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(plan)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(plan)}>
                        <Copy className="h-4 w-4 mr-2" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPreviewPlan(plan)}>
                        <Eye className="h-4 w-4 mr-2" /> Preview
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleSyncPlan(plan.id)} disabled={isSyncing}>
                        {isSyncing ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <LinkIcon className="h-4 w-4 mr-2" />
                        )}
                        {isSynced ? "Re-sync Stripe" : "Sync to Stripe"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => { setDeletingPlan(plan); setDeleteDialogOpen(true); }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <CardHeader className="pb-2 pt-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className={`p-2.5 rounded-xl ${cfg.badge}`}>
                      {plan.tier === "addon" ? (ADDON_ICONS[plan.name] || cfg.icon) : cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg truncate">{plan.name}</CardTitle>
                        {plan.badge_label && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {plan.badge_label}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {!plan.is_active && (
                          <Badge variant="outline" className="text-[10px]">Inactive</Badge>
                        )}
                        {isSynced ? (
                          <Badge variant="outline" className="text-[10px] text-gray-600 border-green-300">
                            <Check className="h-3 w-3 mr-1" /> Stripe
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                            <CloudOff className="h-3 w-3 mr-1" /> Not Synced
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {plan.description && (
                    <CardDescription className="line-clamp-2 mt-1">{plan.description}</CardDescription>
                  )}
                </CardHeader>

                <CardContent className="pb-2">
                  {/* Price */}
                  <div className="mb-4">
                    {plan.price_min && plan.price_max && plan.price_min !== plan.price_max ? (
                      <>
                        <span className="text-2xl font-bold">
                          {formatCurrency(plan.price_min)}–{formatCurrency(plan.price_max)}
                        </span>
                        <span className="text-muted-foreground text-sm">
                          {BILLING_SHORT[plan.billing_cycle]}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">{formatCurrency(plan.price)}</span>
                        <span className="text-muted-foreground text-sm">
                          {BILLING_SHORT[plan.billing_cycle]}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Features */}
                  {plan.features && plan.features.length > 0 && (
                    <ul className="space-y-1.5 mb-3">
                      {plan.features.slice(0, 6).map((feat, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                      {plan.features.length > 6 && (
                        <li className="text-xs text-muted-foreground pl-6">
                          +{plan.features.length - 6} more
                        </li>
                      )}
                    </ul>
                  )}

                  {/* Services count */}
                  {plan.included_services && plan.included_services.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {plan.included_services.length} included service
                      {plan.included_services.length !== 1 ? "s" : ""}
                      {plan.max_services_per_cycle
                        ? ` · Max ${plan.max_services_per_cycle}/cycle`
                        : " · Unlimited"}
                    </p>
                  )}
                </CardContent>

                <CardFooter className="pt-2 flex items-center justify-between border-t">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {plan._subscriber_count || 0} subscribers
                    </span>
                  </div>
                  <Switch checked={plan.is_active} onCheckedChange={() => handleToggleActive(plan)} />
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deletingPlan?.name}</strong>? This action
              cannot be undone. Active Stripe subscriptions must be cancelled separately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Preview Dialog ── */}
      <Dialog open={!!previewPlan} onOpenChange={(open) => !open && setPreviewPlan(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Plan Preview</DialogTitle>
            <DialogDescription>How this plan appears to customers</DialogDescription>
          </DialogHeader>
          {previewPlan && (() => {
            const cfg = getTierConfig(previewPlan.tier);
            return (
              <div className={`border rounded-xl p-6 bg-card ${previewPlan.highlight ? `ring-2 ${cfg.ring}` : ""}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2.5 rounded-xl ${cfg.badge}`}>{cfg.icon}</div>
                  <div>
                    <h3 className="text-xl font-bold">{previewPlan.name}</h3>
                    {previewPlan.badge_label && (
                      <Badge variant="secondary" className="text-xs mt-0.5">{previewPlan.badge_label}</Badge>
                    )}
                  </div>
                </div>
                {previewPlan.description && (
                  <p className="text-sm text-muted-foreground mb-4">{previewPlan.description}</p>
                )}
                <div className="mb-6">
                  {previewPlan.price_min && previewPlan.price_max && previewPlan.price_min !== previewPlan.price_max ? (
                    <>
                      <span className="text-3xl font-bold">
                        {formatCurrency(previewPlan.price_min)}–{formatCurrency(previewPlan.price_max)}
                      </span>
                      <span className="text-muted-foreground">{BILLING_SHORT[previewPlan.billing_cycle]}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-4xl font-bold">{formatCurrency(previewPlan.price)}</span>
                      <span className="text-muted-foreground">{BILLING_SHORT[previewPlan.billing_cycle]}</span>
                    </>
                  )}
                </div>
                {previewPlan.features && previewPlan.features.length > 0 && (
                  <ul className="space-y-2 mb-6">
                    {previewPlan.features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button className="w-full" disabled>{previewPlan.cta_label || "Subscribe Now"}</Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 w-32 bg-muted rounded" />
                <div className="h-4 w-48 bg-muted rounded mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-24 bg-muted rounded mb-4" />
                <div className="space-y-2">
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-3/4 bg-muted rounded" />
                  <div className="h-4 w-5/6 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
};

export default Subscriptions;

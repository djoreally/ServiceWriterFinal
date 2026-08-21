import { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { fetchBusinessBySlug, type PublicBusinessProfile } from "@/application/queries/public-business.query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Check,
  Crown,
  Star,
  Shield,
  Zap,
  Package,
  Car,
  Battery,
  Sparkles,
  Building2,
  Loader2,
  ArrowRight,
  Phone,
  Mail,
  MapPin,
  ChevronDown,
} from "lucide-react";
import type { SubscriptionPlan, BillingCycle } from "@/shared/types";
import { fetchPublicSubscriptionPlans } from "@/application/queries/subscriptions.query";
import { createSubscriptionCheckout } from "@/application/commands/subscriptions.command";
import { ProgressiveImage } from "@/components/media/ProgressiveImage";

// ── Types ──

// Type imported from application layer
// ── Tier display config ──

const TIER_CONFIG: Record<string, {
  icon: React.ReactNode;
  gradient: string;
  bgGradient: string;
  badge: string;
  ring: string;
  buttonClass: string;
}> = {
  essentials: {
    icon: <Shield className="h-7 w-7" />,
    gradient: "from-slate-400 to-slate-600",
    bgGradient: "from-slate-50 to-white dark:from-slate-900/30 dark:to-slate-950/10",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    ring: "ring-slate-300",
    buttonClass: "bg-slate-600 hover:bg-slate-700 text-white",
  },
  performance: {
    icon: <Star className="h-7 w-7" />,
    gradient: "from-blue-500 to-blue-700",
    bgGradient: "from-blue-50 to-white dark:from-blue-900/20 dark:to-blue-950/10",
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    ring: "ring-blue-400",
    buttonClass: "bg-blue-600 hover:bg-blue-700 text-white",
  },
  elite: {
    icon: <Crown className="h-7 w-7" />,
    gradient: "from-amber-400 to-amber-600",
    bgGradient: "from-amber-50 to-white dark:from-amber-900/20 dark:to-amber-950/10",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    ring: "ring-amber-400",
    buttonClass: "bg-amber-600 hover:bg-amber-700 text-white",
  },
  addon: {
    icon: <Zap className="h-6 w-6" />,
    gradient: "from-green-400 to-green-600",
    bgGradient: "from-green-50 to-white dark:from-green-900/20 dark:to-green-950/10",
    badge: "bg-gray-100 text-gray-700 border-gray-200",
    ring: "ring-green-300",
    buttonClass: "bg-gray-600 hover:bg-gray-700 text-white",
  },
  custom: {
    icon: <Package className="h-6 w-6" />,
    gradient: "from-purple-400 to-purple-600",
    bgGradient: "from-purple-50 to-white dark:from-purple-900/20 dark:to-purple-950/10",
    badge: "bg-purple-100 text-purple-700 border-purple-200",
    ring: "ring-purple-300",
    buttonClass: "bg-purple-600 hover:bg-purple-700 text-white",
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

const BILLING_LABELS: Record<BillingCycle, string> = {
  monthly: "/month",
  quarterly: "/quarter",
  yearly: "/year",
};

function formatPrice(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ── Component ──

interface PublicSubscriptionsProps {
  tenantSlug?: string;
  embedded?: boolean;
}

const PublicSubscriptions = ({ tenantSlug, embedded = false }: PublicSubscriptionsProps = {}) => {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const slug = tenantSlug || routeSlug;
  const isEmbed = embedded || searchParams.get("embed") === "true";

  // Data
  const [business, setBusiness] = useState<PublicBusinessProfile | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Selection
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  // Checkout
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Force light theme
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("dark");
    html.classList.add("light");
    return () => {
      html.classList.remove("light");
    };
  }, []);

  // ── Data loading ──

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        // Resolve business by slug
        const profileData = await fetchBusinessBySlug(slug);

        if (!profileData) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setBusiness(profileData);

        // Fetch public plans
        const plansData = await fetchPublicSubscriptionPlans(profileData.user_id);
        setPlans(plansData);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [slug]);

  // ── Derived data ──

  const corePlans = useMemo(() =>
    plans.filter((p) => p.tier !== "addon").sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
    [plans]
  );

  const addonPlans = useMemo(() =>
    plans.filter((p) => p.tier === "addon").sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
    [plans]
  );

  const selectedAddonObjects = useMemo(() =>
    addonPlans.filter((a) => selectedAddons.includes(a.id)),
    [addonPlans, selectedAddons]
  );

  const monthlyTotal = useMemo(() => {
    let total = selectedPlan?.price || 0;
    selectedAddonObjects.forEach((a) => {
      total += a.price;
    });
    return total;
  }, [selectedPlan, selectedAddonObjects]);

  const currency = business?.currency || "USD";

  // ── Handlers ──

  const toggleAddon = (addonId: string) => {
    setSelectedAddons((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]
    );
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setCheckoutOpen(true);
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || !business || !customerEmail.trim()) return;

    setSubmitting(true);
    setCheckoutError(null);

    try {
      const result = await createSubscriptionCheckout({
        plan_id: selectedPlan.id,
        business_user_id: business.user_id,
        customer_email: customerEmail.trim(),
        customer_name: customerName.trim() || undefined,
        addon_plan_ids: selectedAddons.length > 0 ? selectedAddons : undefined,
        success_url: `${window.location.origin}/subscribe/${slug}/success`,
        cancel_url: window.location.href,
      });

      if (result.url) {
        window.location.href = result.url;
      } else {
        setCheckoutError("Unable to create checkout session. Please try again.");
      }
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Scroll to add-ons ──

  const scrollToAddons = () => {
    document.getElementById("addons-section")?.scrollIntoView({ behavior: "smooth" });
  };

  // ── Render: Loading ──

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading plans...</p>
        </div>
      </div>
    );
  }

  // ── Render: Not Found ──

  if (notFound || !business) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
          <p className="text-muted-foreground">
            This subscription page doesn't exist or is no longer available.
          </p>
        </div>
      </div>
    );
  }

  // ── Render: No Stripe ──

  if (!business.stripe_charges_enabled) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <h1 className="text-2xl font-bold mb-2">{business.business_name}</h1>
          <p className="text-muted-foreground">
            Online subscriptions are not yet available. Please contact us directly to sign up for a plan.
          </p>
          {business.phone && (
            <a
              href={`tel:${business.phone}`}
              className="inline-flex items-center gap-2 mt-4 text-primary hover:underline"
            >
              <Phone className="h-4 w-4" />
              {business.phone}
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Main ──

  return (
    <div className={isEmbed ? "bg-gradient-to-b from-slate-50 to-white" : "min-h-screen bg-gradient-to-b from-slate-50 to-white"}>
      {/* Header */}
      {!isEmbed && <header className="bg-white border-b sticky top-0 z-20">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {business.logo_url && (
              <ProgressiveImage
                src={business.logo_url}
                alt={business.business_name}
                className="h-10 w-10 rounded-full object-cover"
                placeholderClassName="h-10 w-10 rounded-full"
              />
            )}
            <div>
              <h1 className="font-semibold text-lg">{business.business_name}</h1>
              <p className="text-xs text-muted-foreground">Subscription Plans</p>
            </div>
          </div>
          {business.phone && (
            <a
              href={`tel:${business.phone}`}
              className="hidden sm:inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Phone className="h-4 w-4" />
              {business.phone}
            </a>
          )}
        </div>
      </header>}

      {/* Hero */}
      <section className={isEmbed ? "mx-auto px-4 pt-6 pb-6 text-center max-w-3xl" : "container mx-auto px-4 pt-12 pb-8 text-center max-w-3xl"}>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
          Maintenance Plans That Save You Money
        </h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Choose a plan and never worry about your vehicle's maintenance schedule again.
          We come to you — no shop visit required.
        </p>
        {addonPlans.length > 0 && (
          <button
            onClick={scrollToAddons}
            className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            See add-on options <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </section>

      {/* ── Core Plans Grid ── */}
      {corePlans.length > 0 && (
        <section className="container mx-auto px-4 pb-12 max-w-6xl">
          <div className={`grid gap-6 ${
            corePlans.length === 1
              ? "max-w-md mx-auto"
              : corePlans.length === 2
                ? "grid-cols-1 md:grid-cols-2 max-w-3xl mx-auto"
                : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          }`}>
            {corePlans.map((plan) => {
              const cfg = getTierConfig(plan.tier);
              const isSelected = selectedPlan?.id === plan.id;
              return (
                <Card
                  key={plan.id}
                  className={`relative overflow-hidden flex flex-col transition-all hover:shadow-xl ${
                    plan.highlight ? `ring-2 ${cfg.ring} shadow-lg scale-[1.02]` : "hover:shadow-lg"
                  } ${isSelected ? "ring-2 ring-primary" : ""}`}
                >
                  {/* Tier accent */}
                  <div className={`h-1.5 bg-gradient-to-r ${cfg.gradient}`} />

                  {plan.badge_label && (
                    <div className="absolute top-4 right-4">
                      <Badge className={`${cfg.badge} text-xs font-medium`}>
                        {plan.badge_label}
                      </Badge>
                    </div>
                  )}

                  <CardHeader className={`bg-gradient-to-b ${cfg.bgGradient} pb-4`}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${cfg.gradient} text-white`}>
                        {cfg.icon}
                      </div>
                      <div>
                        <CardTitle className="text-xl">{plan.name}</CardTitle>
                      </div>
                    </div>
                    {plan.description && (
                      <CardDescription className="text-sm">{plan.description}</CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="flex-1 pt-4">
                    {/* Price */}
                    <div className="mb-6">
                      {plan.price_min && plan.price_max && plan.price_min !== plan.price_max ? (
                        <div>
                          <span className="text-3xl font-bold">
                            {formatPrice(plan.price_min, currency)}–{formatPrice(plan.price_max, currency)}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            {BILLING_LABELS[plan.billing_cycle]}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-4xl font-bold">{formatPrice(plan.price, currency)}</span>
                          <span className="text-muted-foreground text-sm ml-1">
                            {BILLING_LABELS[plan.billing_cycle]}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    {plan.features && plan.features.length > 0 && (
                      <ul className="space-y-2.5">
                        {plan.features.map((feat, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm">
                            <Check className="h-4 w-4 text-gray-600 mt-0.5 shrink-0" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>

                  <CardFooter className="pt-4 pb-6">
                    <Button
                      className={`w-full h-12 text-base font-semibold ${cfg.buttonClass}`}
                      onClick={() => handleSelectPlan(plan)}
                    >
                      {plan.cta_label || "Get Started"}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Add-Ons Section ── */}
      {addonPlans.length > 0 && (
        <section id="addons-section" className="bg-slate-50/80 border-t border-b py-12">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold mb-2">Boost Your Protection</h3>
              <p className="text-muted-foreground">
                Add these optional plans to any subscription for extra coverage.
              </p>
            </div>

            <div className={`grid gap-4 ${
              addonPlans.length <= 2
                ? "grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            }`}>
              {addonPlans.map((addon) => {
                const isSelected = selectedAddons.includes(addon.id);
                const addonIcon = ADDON_ICONS[addon.name] || <Zap className="h-5 w-5" />;
                return (
                  <Card
                    key={addon.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/30"
                    }`}
                    onClick={() => toggleAddon(addon.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg shrink-0 ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {addonIcon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm">{addon.name}</h4>
                          {addon.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {addon.description}
                            </p>
                          )}
                          <div className="mt-2">
                            {addon.price_min && addon.price_max && addon.price_min !== addon.price_max ? (
                              <span className="text-sm font-bold">
                                {formatPrice(addon.price_min, currency)}–{formatPrice(addon.price_max, currency)}
                                <span className="text-xs font-normal text-muted-foreground">
                                  {BILLING_LABELS[addon.billing_cycle]}
                                </span>
                              </span>
                            ) : (
                              <span className="text-sm font-bold">
                                {formatPrice(addon.price, currency)}
                                <span className="text-xs font-normal text-muted-foreground">
                                  {BILLING_LABELS[addon.billing_cycle]}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Checkbox indicator */}
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                        }`}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>

                      {/* Features */}
                      {addon.features && addon.features.length > 0 && (
                        <ul className="mt-3 space-y-1 pl-11">
                          {addon.features.slice(0, 3).map((feat, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <Check className="h-3 w-3 text-gray-600 mt-0.5 shrink-0" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Selected summary */}
            {selectedAddons.length > 0 && (
              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {selectedAddons.length} add-on{selectedAddons.length !== 1 ? "s" : ""} selected
                  {selectedPlan && (
                    <span className="font-medium ml-1">
                      · Total: {formatPrice(monthlyTotal, currency)}{BILLING_LABELS[selectedPlan.billing_cycle]}
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Trust / FAQ section ── */}
      <section className="container mx-auto px-4 py-12 max-w-3xl text-center">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="p-3 bg-gray-100 rounded-full">
              <Check className="h-5 w-5 text-gray-700" />
            </div>
            <h4 className="font-semibold text-sm">Cancel Anytime</h4>
            <p className="text-xs text-muted-foreground">No contracts, no penalties</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="p-3 bg-blue-100 rounded-full">
              <Car className="h-5 w-5 text-blue-700" />
            </div>
            <h4 className="font-semibold text-sm">We Come to You</h4>
            <p className="text-xs text-muted-foreground">Service at your home or office</p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="p-3 bg-amber-100 rounded-full">
              <Shield className="h-5 w-5 text-amber-700" />
            </div>
            <h4 className="font-semibold text-sm">Expert Technicians</h4>
            <p className="text-xs text-muted-foreground">Certified and insured</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      {!isEmbed && <footer className="bg-white border-t py-8">
        <div className="container mx-auto px-4 max-w-3xl text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-2">{business.business_name}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {business.address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {business.address}
              </span>
            )}
            {business.phone && (
              <a href={`tel:${business.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Phone className="h-3.5 w-3.5" />
                {business.phone}
              </a>
            )}
            {business.email && (
              <a href={`mailto:${business.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Mail className="h-3.5 w-3.5" />
                {business.email}
              </a>
            )}
          </div>
          <p className="mt-4 text-xs">Powered by ServiceWriter</p>
        </div>
      </footer>}

      {/* ── Checkout Dialog ── */}
      <Dialog open={checkoutOpen} onOpenChange={(open) => {
        setCheckoutOpen(open);
        if (!open) setCheckoutError(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Your Subscription</DialogTitle>
            <DialogDescription>
              Enter your details to proceed to secure checkout.
            </DialogDescription>
          </DialogHeader>

          {selectedPlan && (
            <div className="rounded-lg border p-4 bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{selectedPlan.name}</span>
                <span className="font-bold">{formatPrice(selectedPlan.price, currency)}{BILLING_LABELS[selectedPlan.billing_cycle]}</span>
              </div>
              {selectedAddonObjects.length > 0 && (
                <>
                  {selectedAddonObjects.map((addon) => (
                    <div key={addon.id} className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>+ {addon.name}</span>
                      <span>{formatPrice(addon.price, currency)}{BILLING_LABELS[addon.billing_cycle]}</span>
                    </div>
                  ))}
                  <div className="border-t mt-2 pt-2 flex items-center justify-between font-semibold">
                    <span>Total</span>
                    <span>{formatPrice(monthlyTotal, currency)}{BILLING_LABELS[selectedPlan.billing_cycle]}</span>
                  </div>
                </>
              )}
            </div>
          )}

          <form onSubmit={handleCheckout} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="checkout-name">Full Name</Label>
              <Input
                id="checkout-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkout-email">Email *</Label>
              <Input
                id="checkout-email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="john@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkout-phone">Phone</Label>
              <Input
                id="checkout-phone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>

            {checkoutError && (
              <p className="text-sm text-destructive">{checkoutError}</p>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setCheckoutOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Proceed to Checkout
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicSubscriptions;

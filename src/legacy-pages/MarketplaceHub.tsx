import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { toast } from "@/components/ui/sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Store } from "lucide-react";
import {
  fetchMarketplaceListing,
  fetchMarketplaceMetrics,
  fetchMarketplaceLeads,
  fetchMarketplaceServices,
  fetchMarketplaceReviews,
  type MarketplaceListing,
  type MarketplaceMetrics,
  type MarketplaceLead,
  type MarketplaceService,
  type MarketplaceReview,
} from "@/application/queries/marketplace-provider.query";
import {
  saveMarketplaceListing,
  replyToReview,
  type MarketplaceListingUpdate,
} from "@/application/commands/marketplace-provider.command";
import { MarketplaceOverview } from "@/components/marketplace/MarketplaceOverview";
import { MarketplaceListingForm } from "@/components/marketplace/MarketplaceListingForm";
import { MarketplaceServices } from "@/components/marketplace/MarketplaceServices";
import { MarketplaceAvailability } from "@/components/marketplace/MarketplaceAvailability";
import { MarketplaceLeads } from "@/components/marketplace/MarketplaceLeads";
import { MarketplaceReviews } from "@/components/marketplace/MarketplaceReviews";
import { MarketplaceAnalytics } from "@/components/marketplace/MarketplaceAnalytics";
import { MarketplaceSettings } from "@/components/marketplace/MarketplaceSettings";

const TABS = ["overview", "listing", "services", "availability", "leads", "reviews", "analytics", "settings"] as const;
type MarketplaceTab = (typeof TABS)[number];

export default function MarketplaceHub() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const activeTab: MarketplaceTab = TABS.includes(tab as MarketplaceTab) ? (tab as MarketplaceTab) : "overview";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [monthMetrics, setMonthMetrics] = useState<MarketplaceMetrics | null>(null);
  const [allTimeMetrics, setAllTimeMetrics] = useState<MarketplaceMetrics | null>(null);
  const [leads, setLeads] = useState<MarketplaceLead[]>([]);
  const [services, setServices] = useState<MarketplaceService[]>([]);
  const [reviews, setReviews] = useState<MarketplaceReview[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [listingData, month, allTime, leadRows, serviceRows, reviewRows] = await Promise.all([
      fetchMarketplaceListing(userId),
      fetchMarketplaceMetrics(userId, "month"),
      fetchMarketplaceMetrics(userId, "all"),
      fetchMarketplaceLeads(userId),
      fetchMarketplaceServices(userId),
      fetchMarketplaceReviews(userId),
    ]);
    setListing(listingData);
    setMonthMetrics(month);
    setAllTimeMetrics(allTime);
    setLeads(leadRows);
    setServices(serviceRows);
    setReviews(reviewRows);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (updates: MarketplaceListingUpdate) => {
    if (!userId) return;
    setSaving(true);
    try {
      await saveMarketplaceListing(userId, updates);
      setListing((prev) => (prev ? { ...prev, ...(updates as Partial<MarketplaceListing>) } : prev));
      toast.success("Marketplace settings saved");
    } catch {
      toast.error("Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleReply = async (reviewId: string, reply: string) => {
    try {
      await replyToReview(reviewId, reply);
      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId ? { ...r, provider_reply: reply, provider_replied_at: new Date().toISOString() } : r,
        ),
      );
      toast.success("Reply posted");
    } catch {
      toast.error("Could not post reply");
    }
  };

  const goToTab = (next: string) => navigate(`/marketplace/${next}`);

  return (
    <AppLayout title="Marketplace">
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-md bg-primary/10 p-3">
          <Store className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Marketplace</h1>
          <p className="text-sm text-muted-foreground">
            Manage how customers find, book, and review your business.
          </p>
        </div>
      </header>


      {loading || !listing ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={goToTab}>
          <TabsList className="flex w-full flex-wrap justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="listing">Listing</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="availability">Area &amp; availability</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="pt-6">
            <MarketplaceOverview listing={listing} metrics={monthMetrics} onNavigateTab={goToTab} />
          </TabsContent>
          <TabsContent value="listing" className="pt-6">
            <MarketplaceListingForm key={listing.booking_slug ?? "listing"} listing={listing} saving={saving} onSave={handleSave} />
          </TabsContent>
          <TabsContent value="services" className="pt-6">
            <MarketplaceServices services={services} />
          </TabsContent>
          <TabsContent value="availability" className="pt-6">
            <MarketplaceAvailability listing={listing} saving={saving} onSave={handleSave} />
          </TabsContent>
          <TabsContent value="leads" className="pt-6">
            <MarketplaceLeads leads={leads} />
          </TabsContent>
          <TabsContent value="reviews" className="pt-6">
            <MarketplaceReviews reviews={reviews} onReply={handleReply} />
          </TabsContent>
          <TabsContent value="analytics" className="pt-6">
            <MarketplaceAnalytics monthMetrics={monthMetrics} allTimeMetrics={allTimeMetrics} leads={leads} />
          </TabsContent>
          <TabsContent value="settings" className="pt-6">
            <MarketplaceSettings listing={listing} saving={saving} onSave={handleSave} />
          </TabsContent>
        </Tabs>
      )}
    </div>
    </AppLayout>
  );
}

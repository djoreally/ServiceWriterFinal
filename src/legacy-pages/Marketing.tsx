import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Mail,
  Star,
  MessageSquare,
  BarChart3,
  TestTube,
  Users,
  XCircle,
  Workflow,
  Building2,
  Search,
  FolderOpen,
} from "lucide-react";
const AssetsPage = lazy(() =>
  import("@/components/assets/AssetsPage").then((m) => ({ default: m.AssetsPage })),
);
import { AssetsErrorBoundary } from "@/components/assets/AssetsErrorBoundary";
import { AssetsLoading } from "@/components/assets/AssetsLoading";
import { CampaignManager } from "@/components/marketing/CampaignManager";
import { ReviewDashboard } from "@/components/marketing/ReviewDashboard";
import { TestimonialManager } from "@/components/marketing/TestimonialManager";
import { MarketingAnalytics } from "@/components/marketing/MarketingAnalytics";
import { EmailTesting } from "@/components/marketing/EmailTesting";
import { CustomerSegmentation } from "@/components/marketing/CustomerSegmentation";
import { DeclinedServicesTracker } from "@/components/marketing/DeclinedServicesTracker";
import { FollowUpAutomation } from "@/components/marketing/FollowUpAutomation";
import { GoogleMyBusinessPanel } from "@/components/marketing/GoogleMyBusinessPanel";

type GrowthTabId =
  | "segments"
  | "declined"
  | "automation"
  | "campaigns"
  | "email-testing"
  | "reviews"
  | "testimonials"
  | "analytics"
  | "google-business"
  | "assets";

const GROWTH_TABS: Array<{
  id: GrowthTabId;
  label: string;
  icon: typeof Users;
  description: string;
  keywords: string[];
}> = [
  {
    id: "segments",
    label: "Customer Segments",
    icon: Users,
    description: "Group customers by behavior, status, and lifecycle stage",
    keywords: ["segments", "audience", "groups", "customers", "lifecycle"],
  },
  {
    id: "declined",
    label: "Declined Services",
    icon: XCircle,
    description: "Track and re-engage customers who passed on recommended work",
    keywords: ["declined", "follow up", "lost", "recommendations"],
  },
  {
    id: "automation",
    label: "Follow-Up Automation",
    icon: Workflow,
    description: "Automated workflows for retention, reminders, and win-backs",
    keywords: ["automation", "workflow", "follow up", "reminders", "drip"],
  },
  {
    id: "campaigns",
    label: "Campaigns",
    icon: Mail,
    description: "Create and send email and SMS marketing campaigns",
    keywords: ["campaigns", "email", "sms", "blast", "promotions"],
  },
  {
    id: "email-testing",
    label: "Email Testing",
    icon: TestTube,
    description: "Diagnostics, preview, and deliverability testing",
    keywords: ["testing", "diagnostics", "deliverability", "preview"],
  },
  {
    id: "reviews",
    label: "Reviews",
    icon: Star,
    description: "Request, monitor, and respond to customer reviews",
    keywords: ["reviews", "ratings", "google", "feedback"],
  },
  {
    id: "testimonials",
    label: "Testimonials",
    icon: MessageSquare,
    description: "Curate testimonials for your booking and marketing pages",
    keywords: ["testimonials", "quotes", "social proof"],
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    description: "Performance metrics for campaigns, reviews, and retention",
    keywords: ["analytics", "metrics", "reports", "performance"],
  },
  {
    id: "google-business",
    label: "Google My Business",
    icon: Building2,
    description: "Manage your local Google profile, posts, and visibility",
    keywords: ["google", "gmb", "local seo", "business profile"],
  },
  {
    id: "assets",
    label: "Assets",
    icon: FolderOpen,
    description: "Upload and manage images, videos, audio, and files in your private library",
    keywords: ["assets", "media", "files", "images", "videos", "audio", "uploads", "library"],
  },
];

const VALID_TAB_IDS = new Set(GROWTH_TABS.map((t) => t.id));

const Marketing = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<GrowthTabId>(
    VALID_TAB_IDS.has((initialTab || "") as GrowthTabId) ? (initialTab as GrowthTabId) : "campaigns"
  );
  const [sectionSearch, setSectionSearch] = useState("");

  const handleTabChange = (value: GrowthTabId) => {
    setActiveTab(value);
    const next = new URLSearchParams(searchParams);
    if (next.get("tab") !== value) {
      next.set("tab", value);
      setSearchParams(next, { replace: true });
    }
  };

  // Keep activeTab in sync with URL changes (back/forward, external nav)
  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab && VALID_TAB_IDS.has(urlTab as GrowthTabId) && urlTab !== activeTab) {
      setActiveTab(urlTab as GrowthTabId);
    }
  }, [searchParams, activeTab]);

  const filteredTabs = useMemo(() => {
    const q = sectionSearch.trim().toLowerCase();
    if (!q) return GROWTH_TABS;
    return GROWTH_TABS.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [sectionSearch]);

  return (
    <div className="min-h-screen bg-background">
      <MarketingSiteHeader />
      <AppLayout title="Growth Tools">
        <div className="space-y-6 pb-24">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-3xl font-bold mb-2">Growth Tools</h2>
              <p className="text-muted-foreground">
                Find and manage every growth, retention, and reputation tool in one place.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTabChange("email-testing")}
              className="gap-2 self-start"
            >
              <TestTube className="h-4 w-4" />
              Email Diagnostics
            </Button>
          </div>

          {/* Quick Access Dashboard — matches Settings tile grid */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search growth tools (e.g. reviews, campaigns, automation)…"
                  value={sectionSearch}
                  onChange={(e) => setSectionSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {filteredTabs.map((t) => {
                  const Icon = t.icon;
                  const isActive = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        handleTabChange(t.id);
                        setSectionSearch("");
                      }}
                      className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                        isActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div
                        className={`rounded-md p-2 ${
                          isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-none">{t.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                      </div>
                    </button>
                  );
                })}
                {filteredTabs.length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground py-2">
                    No growth tools match "{sectionSearch}".
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as GrowthTabId)} className="space-y-6">
            <TabsContent value="segments">
              <CustomerSegmentation />
            </TabsContent>
            <TabsContent value="declined">
              <DeclinedServicesTracker />
            </TabsContent>
            <TabsContent value="automation">
              <FollowUpAutomation />
            </TabsContent>
            <TabsContent value="campaigns">
              <CampaignManager />
            </TabsContent>
            <TabsContent value="email-testing">
              <EmailTesting />
            </TabsContent>
            <TabsContent value="reviews">
              <ReviewDashboard />
            </TabsContent>
            <TabsContent value="testimonials">
              <TestimonialManager />
            </TabsContent>
            <TabsContent value="analytics">
              <MarketingAnalytics />
            </TabsContent>
            <TabsContent value="google-business">
              <GoogleMyBusinessPanel />
            </TabsContent>
            <TabsContent value="assets">
              <AssetsErrorBoundary>
                <Suspense fallback={<AssetsLoading />}>
                  <AssetsPage />
                </Suspense>
              </AssetsErrorBoundary>
            </TabsContent>

          </Tabs>
        </div>
      </AppLayout>
      <MarketingSiteFooter />
    </div>
  );
};

export default Marketing;

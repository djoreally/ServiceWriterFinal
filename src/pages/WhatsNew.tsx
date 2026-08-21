import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, Bug, Star, Rocket } from "lucide-react";
import { type ReactNode } from "react";

interface Release {
  version: string;
  date: string;
  tag: "new" | "improvement" | "fix";
  title: string;
  description: string;
  icon?: ReactNode;
}

const TAG_STYLES: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-gray-500/10 text-gray-600 border-gray-200" },
  improvement: { label: "Improvement", className: "bg-blue-500/10 text-blue-600 border-blue-200" },
  fix: { label: "Fix", className: "bg-amber-500/10 text-amber-600 border-amber-200" },
};

const TAG_ICON: Record<string, ReactNode> = {
  new: <Sparkles className="h-4 w-4" />,
  improvement: <Zap className="h-4 w-4" />,
  fix: <Bug className="h-4 w-4" />,
};

const RELEASES: Release[] = [
  {
    version: "3.0.0",
    date: "April 2026",
    tag: "new",
    title: "Fleet OS Architecture",
    description:
      "Full multi-tenant and multi-location support, real-time Mapbox tracking, automated VIN decoding, and multi-technician assignment for high-scale operations.",
  },
  {
    version: "2.9.0",
    date: "April 2026",
    tag: "improvement",
    title: "Performance & UI Redesign",
    description:
      "Significant performance gains with O(1) lookup optimizations across key views, a fresh 'Split Hero' marketing UI, and new Fleet PM subscription tiers.",
  },
  {
    version: "2.8.0",
    date: "June 2025",
    tag: "new",
    title: "Subscription Plans & Recurring Billing",
    description:
      "Offer preconfigured subscription tiers (Essentials, Performance, Elite VIP) with Stripe-powered recurring billing. Manage plans, add-ons, and subscriber lifecycle from a single dashboard.",
  },
  {
    version: "2.7.0",
    date: "June 2025",
    tag: "new",
    title: "Training & Support Hub",
    description:
      "New sidebar section with Knowledge Base, Video Tutorials, What's New page, and Onboarding Guide — everything your team needs to ramp up fast.",
  },
  {
    version: "2.6.1",
    date: "May 2025",
    tag: "improvement",
    title: "AI Assistant Context Improvements",
    description:
      "The AI assistant now surfaces richer shop context including today's appointments and service history when answering questions.",
  },
  {
    version: "2.6.0",
    date: "May 2025",
    tag: "new",
    title: "Fleet Management (Beta)",
    description:
      "Manage fleet accounts, track vehicles across organizations, and handle bulk scheduling for commercial customers.",
  },
  {
    version: "2.5.2",
    date: "April 2025",
    tag: "fix",
    title: "Booking Calendar Timezone Fix",
    description:
      "Resolved an issue where public booking slots could show incorrect times for shops in non-US timezones.",
  },
  {
    version: "2.5.0",
    date: "April 2025",
    tag: "new",
    title: "Quote & Estimate Builder",
    description:
      "Create professional quotes with line items pulled from your service catalog, then convert approved quotes directly into appointments.",
  },
  {
    version: "2.4.0",
    date: "March 2025",
    tag: "improvement",
    title: "Mobile Experience Overhaul",
    description:
      "Redesigned mobile navigation, pull-to-refresh on key pages, and improved touch interactions across the entire app.",
  },
  {
    version: "2.3.0",
    date: "February 2025",
    tag: "new",
    title: "Inventory Tracking",
    description:
      "Track parts and supplies with low-stock alerts, auto-populated templates for common oil types, and usage-per-service linking.",
  },
];

const WhatsNew = () => {
  return (
    <AppLayout title="What's New">
      <div className="max-w-3xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-md px-4 py-1.5 text-sm font-medium mb-4">
            <Rocket className="h-4 w-4" />
            Changelog
          </div>
          <h2 className="text-2xl font-bold mb-2">Product Updates</h2>
          <p className="text-muted-foreground">
            See what's new, improved, and fixed in Service Writer.
          </p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-6">
            {RELEASES.map((release, idx) => (
              <div key={release.version} className="relative flex gap-4">
                {/* Dot */}
                <div className="relative z-10 flex-none">
                  <div
                    className={`mt-1 w-10 h-10 rounded-md flex items-center justify-center border ${
                      idx === 0
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground"
                    }`}
                  >
                    {TAG_ICON[release.tag]}
                  </div>
                </div>

                {/* Content */}
                <Card className="flex-1">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge
                        variant="outline"
                        className={TAG_STYLES[release.tag].className + " text-[10px]"}
                      >
                        {TAG_STYLES[release.tag].label}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">
                        v{release.version}
                      </span>
                      <span className="text-xs text-muted-foreground">· {release.date}</span>
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{release.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {release.description}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-10 py-6 border-t">
          <div className="flex items-center justify-center gap-1 text-muted-foreground text-sm">
            <Star className="h-4 w-4" />
            You're all caught up!
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default WhatsNew;

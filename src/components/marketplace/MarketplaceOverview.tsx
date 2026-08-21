import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, CalendarCheck, CheckCircle2, DollarSign, ExternalLink, PencilLine, Clock, Settings2 } from "lucide-react";
import type { MarketplaceMetrics, MarketplaceListing } from "@/application/queries/marketplace-provider.query";

interface Props {
  listing: MarketplaceListing;
  metrics: MarketplaceMetrics | null;
  onNavigateTab: (tab: string) => void;
}

const currency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function MarketplaceOverview({ listing, metrics, onNavigateTab }: Props) {
  const publicUrl = listing.booking_slug ? `/find-provider/${listing.booking_slug}` : null;

  const stats = [
    { label: "Profile views", sub: "this month", value: String(metrics?.views ?? 0), icon: Eye },
    { label: "Booking requests", sub: "this month", value: String(metrics?.bookings ?? 0), icon: CalendarCheck },
    { label: "Completed jobs", sub: "this month", value: String(metrics?.completed ?? 0), icon: CheckCircle2 },
    { label: "Revenue generated", sub: "this month", value: currency(metrics?.revenue ?? 0), icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-md ${listing.marketplace_opt_in ? "bg-emerald-500" : "bg-muted-foreground"}`}
              aria-hidden
            />
            <div>
              <p className="font-semibold text-foreground">
                {listing.marketplace_opt_in ? "Listed on the Service Writer Marketplace" : "Not listed"}
              </p>
              <p className="text-sm text-muted-foreground">
                {listing.marketplace_opt_in
                  ? "Customers can find and book you from the public directory."
                  : "Turn your listing on to start receiving marketplace bookings."}
              </p>
            </div>
          </div>
          <Badge variant="secondary">0 bps platform fee on marketplace bookings</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                  <p className="pt-1 text-xs text-muted-foreground">{stat.sub}</p>
                </div>
                <div className="rounded-xl bg-primary/10 p-3">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onNavigateTab("listing")}>
          <PencilLine className="mr-2 h-4 w-4" /> Edit listing
        </Button>
        {publicUrl && (
          <Button variant="outline" asChild>
            <a href={publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" /> View public profile
            </a>
          </Button>
        )}
        <Button variant="outline" onClick={() => onNavigateTab("availability")}>
          <Clock className="mr-2 h-4 w-4" /> Manage availability
        </Button>
        <Button variant="outline" onClick={() => onNavigateTab("settings")}>
          <Settings2 className="mr-2 h-4 w-4" /> Marketplace settings
        </Button>
      </div>
    </div>
  );
}

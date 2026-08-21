import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MarketplaceMetrics, MarketplaceLead } from "@/application/queries/marketplace-provider.query";

interface Props {
  monthMetrics: MarketplaceMetrics | null;
  allTimeMetrics: MarketplaceMetrics | null;
  leads: MarketplaceLead[];
}

const currency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function MarketplaceAnalytics({ monthMetrics, allTimeMetrics, leads }: Props) {
  const rows = [
    { label: "Directory impressions", month: monthMetrics?.impressions ?? 0, all: allTimeMetrics?.impressions ?? 0 },
    { label: "Profile views", month: monthMetrics?.views ?? 0, all: allTimeMetrics?.views ?? 0 },
    { label: "Book Now clicks", month: monthMetrics?.bookingClicks ?? 0, all: allTimeMetrics?.bookingClicks ?? 0 },
    { label: "Quote requests started", month: monthMetrics?.quoteClicks ?? 0, all: allTimeMetrics?.quoteClicks ?? 0 },
    { label: "Booking requests", month: monthMetrics?.bookings ?? 0, all: allTimeMetrics?.bookings ?? 0 },
    { label: "Completed jobs", month: monthMetrics?.completed ?? 0, all: allTimeMetrics?.completed ?? 0 },
  ];

  const statusCounts = leads.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.status] = (acc[lead.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Funnel performance</CardTitle>
          <p className="text-sm text-muted-foreground">
            Views to booking conversion: {(monthMetrics?.conversionRate ?? 0).toFixed(1)}% this month
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className="text-sm text-foreground">
                <strong>{row.month}</strong> this month · {row.all} all time
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-muted-foreground">Revenue from marketplace</span>
            <span className="text-sm text-foreground">
              <strong>{currency(monthMetrics?.revenue ?? 0)}</strong> this month ·{" "}
              {currency(allTimeMetrics?.revenue ?? 0)} all time
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lead outcomes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.keys(statusCounts).length === 0 && (
            <p className="text-sm text-muted-foreground">No marketplace leads recorded yet.</p>
          )}
          {Object.entries(statusCounts).map(([status, count]) => (
            <Badge key={status} variant="secondary">
              {status}: {count}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Percent, Info } from "lucide-react";

type FeeScopeRow = {
  source: string;
  label: string;
  feeBps: number;
  note: string;
};

const FEE_SCOPES: FeeScopeRow[] = [
  {
    source: "provider_directory",
    label: "Marketplace directory booking",
    feeBps: 0,
    note: "Service Writer platform fee waived — shop keeps 100% (minus card processing).",
  },
  {
    source: "online_public_booking",
    label: "Shop-owned booking page",
    feeBps: -1,
    note: "Uses the provider's configured platform fee (platform_fee_bps).",
  },
];

const formatBps = (bps: number) =>
  bps < 0 ? "Plan rate" : `${bps} bps (${(bps / 100).toFixed(2)}%)`;

export function AdminFeeScopeIndicator() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="h-4 w-4" />
          Fee scope by booking source
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <Globe className="mt-0.5 h-4 w-4 text-primary" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Marketplace bookings are fee-free</span>
              <Badge className="font-mono">0 bps</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Any booking attributed to the provider directory carries a 0 bps Service
              Writer platform fee on both Stripe and Square checkouts.
            </p>
          </div>
        </div>

        <div className="divide-y rounded-lg border">
          {FEE_SCOPES.map((row) => (
            <div
              key={row.source}
              className="flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <div>
                <p className="text-sm font-medium">{row.label}</p>
                <code className="text-xs text-muted-foreground">{row.source}</code>
              </div>
              <div className="flex items-center gap-3">
                <p className="max-w-xs text-xs text-muted-foreground">{row.note}</p>
                <Badge
                  variant={row.feeBps === 0 ? "default" : "secondary"}
                  className="font-mono"
                >
                  {formatBps(row.feeBps)}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Fee scope is resolved server-side from the payment record's booking source, so
          it cannot be overridden from the client.
        </p>
      </CardContent>
    </Card>
  );
}

export default AdminFeeScopeIndicator;

import { useEffect, useState } from "react";
import {
  fetchOwnPaymentMethodMirror,
  stripePaymentMethodsDashboardUrl,
  type PaymentMethodMirror,
  type PaymentMethodMirrorResponse,
} from "@/application/queries/stripe-payment-methods.query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, MinusCircle, ExternalLink, Loader2, Wallet, RefreshCw } from "lucide-react";

const statusBadge = (status: PaymentMethodMirror["status"]) => {
  switch (status) {
    case "active":
      return <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Active</Badge>;
    case "pending":
      return <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" /> Pending</Badge>;
    case "inactive":
      return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Inactive</Badge>;
    default:
      return <Badge variant="outline" className="gap-1 text-muted-foreground"><MinusCircle className="h-3 w-3" /> Off</Badge>;
  }
};

export const StripePaymentMethodsCard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<PaymentMethodMirrorResponse | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetchOwnPaymentMethodMirror();
      setData(res);
    } catch (e) {
      console.error("Failed to load payment method mirror", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Payment Methods
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Read-only view of which payment methods your Stripe account currently accepts. Manage them in the Stripe Dashboard.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={loading || refreshing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !data?.connected ? (
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            Connect your Stripe account first to see your enabled payment methods.
          </div>
        ) : (
          <>
            <div className="rounded-lg border divide-y">
              {data.methods.map((m) => (
                <div key={m.key} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">{m.label}</span>
                  {statusBadge(m.status)}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => window.open(stripePaymentMethodsDashboardUrl(), "_blank")}
              >
                <ExternalLink className="h-4 w-4" />
                Manage in Stripe Dashboard
              </Button>
              <p className="text-xs text-muted-foreground">
                Standard Connect accounts manage payment methods directly in Stripe.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

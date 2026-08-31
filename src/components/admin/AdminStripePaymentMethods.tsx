import { useEffect, useState, useMemo } from "react";
import { fetchAllShopPaymentMethods, type ShopPaymentMethodSummary } from "@/application/queries/stripe-payment-methods.query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, ExternalLink, RefreshCw, Wallet, AlertCircle, CheckCircle2, MinusCircle } from "lucide-react";

const stripeAccountUrl = (acctId: string) => `https://dashboard.stripe.com/connect/accounts/${acctId}`;

const dot = (status: string) => {
  if (status === "active") return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
  if (status === "pending") return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === "inactive") return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  return <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;
};

export const AdminStripePaymentMethods = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shops, setShops] = useState<ShopPaymentMethodSummary[]>([]);
  const [search, setSearch] = useState("");

  const load = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const data = await fetchAllShopPaymentMethods();
      setShops(data);
    } catch (e) {
      console.error("Failed to load shop payment methods", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void Promise.resolve().then(() => load()); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shops;
    return shops.filter((s) =>
      (s.businessName || "").toLowerCase().includes(q) ||
      (s.accountId || "").toLowerCase().includes(q)
    );
  }, [shops, search]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Connected Account Payment Methods
            </CardTitle>
            <CardDescription>
              Read-only mirror of every connected shop's enabled Stripe payment methods. Click a shop to open its Stripe Connect dashboard.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={loading || refreshing} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <Input
              placeholder="Search shops or account IDs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />

            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No connected shops found.</p>
            ) : (
              <div className="space-y-3">
                {filtered.map((shop) => (
                  <div key={shop.userId} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="font-medium">{shop.businessName || "Unnamed shop"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{shop.accountId}</div>
                        <div className="flex gap-2 mt-2">
                          <Badge variant={shop.chargesEnabled ? "default" : "secondary"}>
                            {shop.chargesEnabled ? "Charges enabled" : "Charges disabled"}
                          </Badge>
                          {!shop.detailsSubmitted && <Badge variant="outline">Onboarding pending</Badge>}
                        </div>
                      </div>
                      {shop.accountId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => window.open(stripeAccountUrl(shop.accountId!), "_blank")}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open in Stripe
                        </Button>
                      )}
                    </div>

                    {shop.error ? (
                      <p className="text-sm text-destructive">{shop.error}</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {shop.methods.map((m) => (
                          <div key={m.key} className="flex items-center gap-2 text-sm rounded-md bg-muted/40 px-2.5 py-1.5">
                            {dot(m.status)}
                            <span className="truncate">{m.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

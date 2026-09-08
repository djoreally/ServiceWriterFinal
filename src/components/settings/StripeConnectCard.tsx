import { useEffect, useState } from "react";
import { CreditCard, CheckCircle2, AlertCircle, ExternalLink, Loader2, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { configureStripeDirect, disconnectStripeDirect, fetchStripeDirectStatus, type StripeDirectStatus } from "@/application/queries/stripe-direct.query";
import { useSubscription } from "@/contexts/SubscriptionContext";

const emptyDirect: StripeDirectStatus = {
  mode: "connect", configured: false, accountId: null, keyLast4: null,
  chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false,
  webhookConfigured: false, checkedAt: null,
};

export const StripeConnectCard = () => {
  const { hasFeature } = useSubscription();
  const paymentsEnabled = hasFeature("has_stripe_payments");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [directStatus, setDirectStatus] = useState<StripeDirectStatus>(emptyDirect);
  const [accountId, setAccountId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const refresh = async () => {
    setLoading(true);
    try { setDirectStatus(await fetchStripeDirectStatus()); }
    catch { setDirectStatus(emptyDirect); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const handleDirectSave = async () => {
    if (!accountId.trim() || !secretKey.trim() || !webhookSecret.trim()) {
      toast.error("Enter the Stripe account ID, secret API key, and webhook signing secret");
      return;
    }
    setSaving(true);
    try {
      const status = await configureStripeDirect(accountId.trim(), secretKey.trim(), webhookSecret.trim());
      setDirectStatus(status);
      setAccountId(""); setSecretKey(""); setWebhookSecret("");
      toast.success("Stripe connected. Shop payments will run directly through your Stripe account.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to configure Stripe");
    } finally { setSaving(false); }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      const status = await disconnectStripeDirect();
      setDirectStatus(status);
      toast.success("Stripe disconnected from shop payments");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disconnect Stripe");
    } finally { setSaving(false); }
  };

  if (loading) return <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Stripe Payments</CardTitle></CardHeader><CardContent className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>;

  if (!paymentsEnabled) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Stripe Payments</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Badge variant="secondary">Stripe plan required</Badge>
          <p className="text-sm text-muted-foreground">The Free plan does not include payment processing. Upgrade to the Stripe plan to connect your own Stripe account. Service Writer takes 0% of your shop transactions.</p>
          <Button variant="outline" onClick={() => { window.location.href = "/plans"; }}>View Stripe Plan</Button>
        </CardContent>
      </Card>
    );
  }

  const directActive = directStatus.mode === "direct" && directStatus.configured;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Stripe Payments</CardTitle><p className="mt-1 text-sm text-muted-foreground">Connect your Stripe account. Payments settle directly to you; Service Writer takes 0% per transaction.</p></div>
          <Badge variant={directActive ? "default" : "secondary"}>{directActive ? "Connected" : "Not connected"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {directActive ? (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-2">
              <div className="flex justify-between gap-3"><span>Stripe account</span><span className="font-mono">{directStatus.accountId}</span></div>
              <div className="flex justify-between gap-3"><span>API key</span><span className="font-mono">••••{directStatus.keyLast4}</span></div>
              <div className="flex items-center gap-2">{directStatus.chargesEnabled ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}<span>Charges {directStatus.chargesEnabled ? "enabled" : "not enabled"}</span></div>
              <div className="flex items-center gap-2">{directStatus.webhookConfigured ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}<span>Payment reconciliation {directStatus.webhookConfigured ? "ready" : "needs webhook secret"}</span></div>
            </div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => window.open("https://dashboard.stripe.com", "_blank")}><ExternalLink className="mr-2 h-4 w-4" />Open Stripe</Button><Button variant="outline" onClick={handleDisconnect} disabled={saving}>Disconnect</Button></div>
          </div>
        ) : (
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-start gap-3"><KeyRound className="h-5 w-5 mt-0.5" /><div><p className="font-medium">Connect your Stripe account</p><p className="text-sm text-muted-foreground">Your credentials are validated server-side and encrypted. They are never returned to the browser after saving.</p></div></div>
            <div className="space-y-2"><Label htmlFor="stripe-account-id">Stripe account ID</Label><Input id="stripe-account-id" autoComplete="off" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="acct_…" /></div>
            <div className="space-y-2"><Label htmlFor="stripe-secret-key">Stripe secret API key</Label><Input id="stripe-secret-key" type="password" autoComplete="off" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="sk_live_…" /></div>
            <div className="space-y-2"><Label htmlFor="stripe-webhook-secret">Webhook signing secret</Label><Input id="stripe-webhook-secret" type="password" autoComplete="off" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="whsec_…" /></div>
            <Button onClick={handleDirectSave} disabled={saving} className="w-full sm:w-auto">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Connect Stripe</Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Service Writer Marketplace payments use separate marketplace infrastructure and are not routed through this shop connection.</p>
      </CardContent>
    </Card>
  );
};

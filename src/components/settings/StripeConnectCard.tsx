import { useEffect, useState } from "react";
import { CreditCard, CheckCircle2, AlertCircle, ExternalLink, Loader2, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import {
  fetchStripeConnectStatus,
  startStripeConnectOnboarding,
  type StripeConnectStatus,
} from "@/application/queries/stripe-connect.query";
import {
  configureStripeDirect,
  disconnectStripeDirect,
  fetchStripeDirectStatus,
  type StripeDirectStatus,
} from "@/application/queries/stripe-direct.query";

const emptyConnect: StripeConnectStatus = {
  connected: false,
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
};

const emptyDirect: StripeDirectStatus = {
  mode: "connect",
  configured: false,
  accountId: null,
  keyLast4: null,
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  webhookConfigured: false,
  checkedAt: null,
};

export const StripeConnectCard = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectStatus, setConnectStatus] = useState<StripeConnectStatus>(emptyConnect);
  const [directStatus, setDirectStatus] = useState<StripeDirectStatus>(emptyDirect);
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const [connect, direct] = await Promise.allSettled([
        fetchStripeConnectStatus(),
        fetchStripeDirectStatus(),
      ]);
      if (connect.status === "fulfilled") setConnectStatus(connect.value);
      if (direct.status === "fulfilled") setDirectStatus(direct.value);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleConnectStripe = async (mode: "create" | "oauth" = "create") => {
    setConnecting(true);
    try {
      const url = await startStripeConnectOnboarding(mode);
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect Stripe");
    } finally {
      setConnecting(false);
    }
  };

  const handleDirectSave = async () => {
    if (!secretKey.trim() || !webhookSecret.trim()) {
      toast.error("Enter both the Stripe secret key and webhook signing secret");
      return;
    }
    setSaving(true);
    try {
      const status = await configureStripeDirect(secretKey.trim(), webhookSecret.trim());
      setDirectStatus(status);
      setSecretKey("");
      setWebhookSecret("");
      toast.success("Your Stripe account is now the active payment processor for this workspace");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to configure Stripe");
    } finally {
      setSaving(false);
    }
  };

  const handleDirectDisconnect = async () => {
    setSaving(true);
    try {
      const status = await disconnectStripeDirect();
      setDirectStatus(status);
      toast.success("Workspace switched back to Stripe Connect mode");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to switch payment mode");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Payment Processing</CardTitle></CardHeader>
        <CardContent className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></CardContent>
      </Card>
    );
  }

  const directActive = directStatus.mode === "direct";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Payment Processing</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Choose Service Writer Connect or bring your own Stripe account.</p>
          </div>
          <Badge variant={directActive ? "default" : "secondary"}>{directActive ? "BYO Stripe" : "Stripe Connect"}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-start gap-3">
            <KeyRound className="h-5 w-5 mt-0.5" />
            <div>
              <p className="font-medium">Bring Your Own Stripe</p>
              <p className="text-sm text-muted-foreground">Best for Fleet, Enterprise, and power users. Payments run directly through your Stripe account with no Service Writer transaction platform fee.</p>
            </div>
          </div>

          {directActive && directStatus.configured ? (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-2">
                <div className="flex justify-between gap-3"><span>Stripe account</span><span className="font-mono">{directStatus.accountId}</span></div>
                <div className="flex justify-between gap-3"><span>API key</span><span className="font-mono">••••{directStatus.keyLast4}</span></div>
                <div className="flex items-center gap-2">{directStatus.chargesEnabled ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}<span>Charges {directStatus.chargesEnabled ? "enabled" : "not enabled"}</span></div>
                <div className="flex items-center gap-2">{directStatus.webhookConfigured ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}<span>Webhook signing {directStatus.webhookConfigured ? "configured" : "missing"}</span></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => window.open("https://dashboard.stripe.com", "_blank")}><ExternalLink className="mr-2 h-4 w-4" />Open Stripe</Button>
                <Button variant="outline" onClick={handleDirectDisconnect} disabled={saving}>Switch to Connect</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="stripe-secret-key">Stripe secret API key</Label>
                <Input id="stripe-secret-key" type="password" autoComplete="off" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} placeholder="sk_live_…" />
                <p className="text-xs text-muted-foreground">The key is sent only to the server, validated with Stripe, encrypted, and never shown again.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stripe-webhook-secret">Webhook signing secret</Label>
                <Input id="stripe-webhook-secret" type="password" autoComplete="off" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} placeholder="whsec_…" />
              </div>
              <Button onClick={handleDirectSave} disabled={saving} className="w-full sm:w-auto">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Use My Stripe Account
              </Button>
            </div>
          )}
        </div>

        {!directActive && (
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <p className="font-medium">Service Writer Stripe Connect</p>
              <p className="text-sm text-muted-foreground">Use the platform-managed connection for marketplace and plans that participate in payment routing.</p>
            </div>
            {connectStatus.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4" /><span>Connected account {connectStatus.accountId || "ready"}</span></div>
                <Button variant="outline" onClick={() => window.open("https://dashboard.stripe.com", "_blank")}><ExternalLink className="mr-2 h-4 w-4" />Open Stripe Dashboard</Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={() => handleConnectStripe("create")} disabled={connecting}>{connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create & Connect Stripe Account</Button>
                <Button variant="outline" onClick={() => handleConnectStripe("oauth")} disabled={connecting}>Connect Existing Stripe Account</Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

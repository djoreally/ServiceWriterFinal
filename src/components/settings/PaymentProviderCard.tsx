import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { fetchPaymentProvider } from "@/application/queries/payment-provider.query";
import {
  completeSquareCallback,
  completeStripeCallback,
  initiateSquareOnboarding,
  initiateStripeOnboarding,
  refreshStripeConnection,
  updatePaymentProvider,
} from "@/application/commands/payment-provider.command";

type PaymentProvider = "stripe" | "square" | "none";
type StripeStatus = { connected: boolean; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; accountId?: string };
type SquareStatus = { connected: boolean; chargesEnabled: boolean; merchantId: string | null; locationId: string | null; onboardingComplete: boolean; accountStatus?: string; tokenExpiringSoon?: boolean };

const EMPTY_STRIPE: StripeStatus = { connected: false, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false };
const EMPTY_SQUARE: SquareStatus = { connected: false, chargesEnabled: false, merchantId: null, locationId: null, onboardingComplete: false };

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const PaymentProviderCard = () => {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [activeProvider, setActiveProvider] = useState<PaymentProvider>("none");
  const [stripeStatus, setStripeStatus] = useState<StripeStatus>(EMPTY_STRIPE);
  const [squareStatus, setSquareStatus] = useState<SquareStatus>(EMPTY_SQUARE);

  const load = useCallback(async () => {
    try {
      const result = await fetchPaymentProvider();
      if (!result) return;
      setActiveProvider((result.provider ?? "none") as PaymentProvider);
      setStripeStatus(result.stripeStatus ?? EMPTY_STRIPE);
      setSquareStatus(result.squareStatus ?? EMPTY_SQUARE);
    } catch (error) {
      toast.error(message(error, "Unable to load payment provider status"));
    } finally {
      setLoading(false);
    }
  }, []);

  const finishStripeOAuth = useCallback(async (code: string, state: string) => {
    setWorking(true);
    try {
      await completeStripeCallback(code, state);
      toast.success("Stripe connected successfully");
      await load();
    } catch (error) {
      toast.error(message(error, "Failed to complete Stripe authorization"));
    } finally {
      setWorking(false);
    }
  }, [load]);

  const finishSquareOAuth = useCallback(async (code: string, state: string) => {
    setWorking(true);
    try {
      await completeSquareCallback(code, state);
      toast.success("Square connected successfully");
      await load();
    } catch (error) {
      toast.error(message(error, "Failed to complete Square authorization"));
    } finally {
      setWorking(false);
    }
  }, [load]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const clean = () => window.history.replaceState({}, "", window.location.pathname);

    if (params.get("stripe_success") === "true") {
      clean();
      void (async () => {
        setWorking(true);
        try {
          await refreshStripeConnection();
          toast.success("Stripe account connected");
          await load();
        } catch (error) {
          toast.error(message(error, "Stripe setup returned but account verification failed"));
        } finally { setWorking(false); }
      })();
      return;
    }

    if (params.get("stripe_refresh") === "true") {
      clean();
      toast.info("Finish the Stripe onboarding steps, then return here.");
      return;
    }

    if (params.get("stripe_callback") === "true") {
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");
      clean();
      if (error) toast.error(`Stripe authorization failed: ${error}`);
      else if (code && state) queueMicrotask(() => { void finishStripeOAuth(code, state); });
      else toast.error("Stripe returned without a valid authorization code and state");
      return;
    }

    if (params.get("square_callback") === "true") {
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");
      clean();
      if (error) toast.error(`Square authorization failed: ${error}`);
      else if (code && state) void finishSquareOAuth(code, state);
      else toast.error("Square returned without a valid authorization code and state");
    }
  }, [finishSquareOAuth, finishStripeOAuth, load]);

  const connectStripe = async () => {
    setWorking(true);
    try {
      const response = await initiateStripeOnboarding();
      const url = response.data?.url;
      if (!url) throw new Error("Stripe did not return an onboarding URL");
      window.location.assign(url);
    } catch (error) {
      toast.error(message(error, "Failed to start Stripe onboarding"));
      setWorking(false);
    }
  };

  const connectSquare = async () => {
    setWorking(true);
    try {
      const response = await initiateSquareOnboarding();
      const url = response.data?.url;
      if (!url) throw new Error("Square did not return an authorization URL");
      window.location.assign(url);
    } catch (error) {
      toast.error(message(error, "Failed to start Square onboarding"));
      setWorking(false);
    }
  };

  const selectProvider = async (provider: PaymentProvider) => {
    if (provider === "stripe" && !stripeStatus.chargesEnabled) {
      toast.error("Connect an active Stripe account before selecting Stripe.");
      return;
    }
    if (provider === "square" && !squareStatus.chargesEnabled) {
      toast.error("Connect an active Square account before selecting Square.");
      return;
    }
    try {
      await updatePaymentProvider(provider);
      setActiveProvider(provider);
      toast.success(provider === "none" ? "Online payments disabled" : `${provider === "stripe" ? "Stripe" : "Square"} selected`);
      await load();
    } catch (error) {
      toast.error(message(error, "Failed to update payment provider"));
    }
  };

  if (loading) return <Card><CardContent className="flex min-h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Payment Processing</CardTitle>
        <p className="text-sm text-muted-foreground">Connect the merchant account this workspace owns. Provider authorization is isolated per workspace.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium">Active payment provider</p>
          <RadioGroup value={activeProvider} onValueChange={(value) => void selectProvider(value as PaymentProvider)}>
            <div className="grid grid-cols-3 gap-2">
              {(["stripe", "square", "none"] as PaymentProvider[]).map((provider) => (
                <label key={provider} className={cn("flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-3 text-center", activeProvider === provider && "border-primary bg-primary/5 ring-2 ring-primary/20")}>
                  <RadioGroupItem value={provider} className="sr-only" />
                  <CreditCard className="h-5 w-5" />
                  <span className="text-sm font-medium">{provider === "none" ? "None" : provider === "stripe" ? "Stripe" : "Square"}</span>
                </label>
              ))}
            </div>
          </RadioGroup>
        </div>

        <ProviderPanel title="Stripe" connected={stripeStatus.connected} active={stripeStatus.chargesEnabled} detail={stripeStatus.connected ? `${stripeStatus.chargesEnabled ? "Charges enabled" : "Setup incomplete"}${stripeStatus.payoutsEnabled ? " · Payouts enabled" : ""}` : "No verified Stripe connection is recorded for this workspace."} button="Connect Stripe" working={working} onConnect={connectStripe} />
        <ProviderPanel title="Square" connected={squareStatus.connected} active={squareStatus.chargesEnabled} detail={squareStatus.connected ? `${squareStatus.chargesEnabled ? "Payments enabled" : "Setup incomplete"}${squareStatus.locationId ? " · Location selected" : ""}` : "No verified Square connection is recorded for this workspace."} button="Connect Square" working={working} onConnect={connectSquare} />

        <div className="flex justify-end"><Button variant="outline" size="sm" disabled={working} onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh status</Button></div>
      </CardContent>
    </Card>
  );
};

function ProviderPanel({ title, connected, active, detail, button, working, onConnect }: { title: string; connected: boolean; active: boolean; detail: string; button: string; working: boolean; onConnect: () => void }) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
        <Badge variant={active ? "default" : connected ? "secondary" : "outline"}>{active ? "Active" : connected ? "Pending" : "Not connected"}</Badge>
      </div>
      <Button size="sm" onClick={onConnect} disabled={working}>{working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{connected ? `Reconnect ${title}` : button}</Button>
    </div>
  );
}

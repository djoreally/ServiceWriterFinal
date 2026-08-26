import { useState, useEffect, useCallback } from "react";
import {
  fetchPaymentProvider,
} from "@/application/queries/payment-provider.query";
import {
  updatePaymentProvider,
  initiateStripeOnboarding,
  initiateSquareOnboarding,
  completeSquareCallback,
} from "@/application/commands/payment-provider.command";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, CheckCircle2, AlertCircle, ExternalLink, ArrowLeft } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

type PaymentProvider = "stripe" | "square" | "none";

interface StripeStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  accountId?: string;
}

interface SquareStatus {
  connected: boolean;
  chargesEnabled: boolean;
  merchantId: string | null;
  locationId: string | null;
  onboardingComplete: boolean;
  accountStatus?: string;
  tokenExpiringSoon?: boolean;
}

export const PaymentProviderCard = () => {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [activeProvider, setActiveProvider] = useState<PaymentProvider>("none");
  const [stripeStatus, setStripeStatus] = useState<StripeStatus>({
    connected: false,
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
  });
  const [squareStatus, setSquareStatus] = useState<SquareStatus>({
    connected: false,
    chargesEnabled: false,
    merchantId: null,
    locationId: null,
    onboardingComplete: false,
  });

  const fetchStatuses = useCallback(async () => {
    try {
      const result = await fetchPaymentProvider();
      if (!result) return;

      if (result.provider) {
        setActiveProvider(result.provider as PaymentProvider);
      }
      if (result.stripeStatus) {
        setStripeStatus(result.stripeStatus);
      }
      if (result.squareStatus) {
        setSquareStatus(result.squareStatus);
      }
    } catch (error) {
      console.error("Error fetching payment status:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();

    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);

        // Handle Stripe return
        if (params.get("stripe_success") === "true") {
          toast.success("Stripe account setup in progress! Status will update shortly.");
          window.history.replaceState({}, "", window.location.pathname);
          setTimeout(fetchStatuses, 2000);
        } else if (params.get("stripe_refresh") === "true") {
          toast.info("Please complete your Stripe account setup.");
          window.history.replaceState({}, "", window.location.pathname);
        }

        // Handle Square OAuth callback
        if (params.get("square_callback") === "true") {
          const code = params.get("code");
          const error = params.get("error");
          window.history.replaceState({}, "", window.location.pathname);

          if (error) {
            toast.error("Square authorization was cancelled or failed.");
          } else if (code) {
            // Exchange code for tokens via edge function
            handleSquareCallback(code);
          }
        }
      } catch {
        // ignore URL parsing errors
      }
    }
  }, [fetchStatuses]);

  const handleSquareCallback = async (code: string) => {
    try {
      setConnecting(true);
      const response = await completeSquareCallback(code);

      if (response.error) {
        throw new Error(response.error.message || "Failed to complete Square authorization");
      }

      toast.success("Square account connected successfully!");
      setActiveProvider("square");
      setTimeout(fetchStatuses, 1000);
    } catch (error) {
      console.error("Error completing Square OAuth:", error);
      toast.error(error instanceof Error ? error.message : "Failed to connect Square");
    } finally {
      setConnecting(false);
    }
  };

  const handleConnectStripe = async () => {
    setConnecting(true);
    try {
      const response = await initiateStripeOnboarding();

      if (response.error) {
        throw new Error(response.error.message || "Failed to start Stripe onboarding");
      }

      if (response.data?.url) {
        if (typeof window !== "undefined") {
          window.location.href = response.data.url;
        }
      } else {
        throw new Error("No onboarding URL received");
      }
    } catch (error) {
      console.error("Error connecting to Stripe:", error);
      toast.error(error instanceof Error ? error.message : "Failed to connect to Stripe");
    } finally {
      setConnecting(false);
    }
  };

  const handleConnectSquare = async () => {
    setConnecting(true);
    try {
      const response = await initiateSquareOnboarding();

      if (response.error) {
        throw new Error(response.error.message || "Failed to start Square onboarding");
      }

      if (response.data?.url) {
        if (typeof window !== "undefined") {
          window.location.href = response.data.url;
        }
      } else {
        throw new Error("No onboarding URL received");
      }
    } catch (error) {
      console.error("Error connecting to Square:", error);
      toast.error(error instanceof Error ? error.message : "Failed to connect to Square");
    } finally {
      setConnecting(false);
    }
  };

  const handleProviderChange = async (provider: PaymentProvider) => {
    // Validate that the selected provider is fully configured
    if (provider === "stripe" && !stripeStatus.chargesEnabled) {
      toast.error("Please complete Stripe setup before selecting it as your active provider.");
      return;
    }
    if (provider === "square" && !squareStatus.chargesEnabled) {
      toast.error("Please complete Square setup before selecting it as your active provider.");
      return;
    }

    try {
      await updatePaymentProvider(provider);
      setActiveProvider(provider);
      toast.success(`Payment provider set to ${provider === "none" ? "None" : provider === "stripe" ? "Stripe" : "Square"}`);
      // Re-fetch to ensure UI reflects the persisted state
      await fetchStatuses();
    } catch (error) {
      console.error("Error updating provider:", error);
      toast.error("Failed to update payment provider");
      // Re-fetch to revert UI to actual DB state
      await fetchStatuses();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Processing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Processing
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose a payment provider to accept deposits and payments from customers
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Active Provider Selection */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Active Payment Provider</p>
          <RadioGroup
            value={activeProvider}
            onValueChange={(v) => handleProviderChange(v as PaymentProvider)}
          >
            <div className="grid grid-cols-3 gap-2">
              <label
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-lg border cursor-pointer transition-colors text-center",
                  activeProvider === "stripe" && "border-primary bg-primary/5 ring-2 ring-primary/20"
                )}
              >
                <RadioGroupItem value="stripe" className="sr-only" />
                <CreditCard className="h-5 w-5" />
                <span className="font-medium text-sm">Stripe</span>
                {stripeStatus.connected && (
                  <Badge variant={stripeStatus.chargesEnabled ? "default" : "secondary"} className="text-[10px] px-1.5">
                    {stripeStatus.chargesEnabled ? "Active" : "Pending"}
                  </Badge>
                )}
              </label>

              <label
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-lg border cursor-pointer transition-colors text-center",
                  activeProvider === "square" && "border-primary bg-primary/5 ring-2 ring-primary/20"
                )}
              >
                <RadioGroupItem value="square" className="sr-only" />
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M4.01 2C2.9 2 2 2.9 2 4.01v15.98C2 21.1 2.9 22 4.01 22h15.98C21.1 22 22 21.1 22 19.99V4.01C22 2.9 21.1 2 19.99 2H4.01zm11.13 13.26c-.25.25-.58.39-.93.39H9.8c-.35 0-.68-.14-.93-.39a1.32 1.32 0 0 1-.39-.93V9.67c0-.35.14-.68.39-.93s.58-.39.93-.39h4.41c.35 0 .68.14.93.39s.39.58.39.93v4.66c0 .35-.14.68-.39.93z"/></svg>
                <span className="font-medium text-sm">Square</span>
                {squareStatus.connected && (
                  <Badge variant={squareStatus.chargesEnabled ? "default" : "secondary"} className="text-[10px] px-1.5">
                    {squareStatus.chargesEnabled ? "Active" : "Pending"}
                  </Badge>
                )}
              </label>

              <label
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-lg border cursor-pointer transition-colors text-center",
                  activeProvider === "none" && "border-primary bg-primary/5 ring-2 ring-primary/20"
                )}
              >
                <RadioGroupItem value="none" className="sr-only" />
                <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-sm">None</span>
              </label>
            </div>
          </RadioGroup>
        </div>

        {/* Stripe Setup — always visible */}
        <div className={cn(
          "rounded-lg border p-4 space-y-4 transition-colors",
          activeProvider === "stripe" ? "border-primary/30 bg-primary/[0.02]" : "border-border"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Stripe Connect</h3>
            </div>
            {activeProvider === "stripe" && (
              <Badge variant="outline" className="text-[10px] border-primary text-primary">ACTIVE</Badge>
            )}
          </div>
          <StripeSetupSection
            status={stripeStatus}
            connecting={connecting}
            onConnect={handleConnectStripe}
          />
        </div>

        {/* Square Setup — always visible */}
        <div className={cn(
          "rounded-lg border p-4 space-y-4 transition-colors",
          activeProvider === "square" ? "border-primary/30 bg-primary/[0.02]" : "border-border"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M4.01 2C2.9 2 2 2.9 2 4.01v15.98C2 21.1 2.9 22 4.01 22h15.98C21.1 22 22 21.1 22 19.99V4.01C22 2.9 21.1 2 19.99 2H4.01zm11.13 13.26c-.25.25-.58.39-.93.39H9.8c-.35 0-.68-.14-.93-.39a1.32 1.32 0 0 1-.39-.93V9.67c0-.35.14-.68.39-.93s.58-.39.93-.39h4.41c.35 0 .68.14.93.39s.39.58.39.93v4.66c0 .35-.14.68-.39.93z"/></svg>
              <h3 className="text-sm font-semibold">Square Connect</h3>
            </div>
            {activeProvider === "square" && (
              <Badge variant="outline" className="text-[10px] border-primary text-primary">ACTIVE</Badge>
            )}
          </div>
          <SquareSetupSection
            status={squareStatus}
            connecting={connecting}
            onConnect={handleConnectSquare}
          />
        </div>

        {activeProvider === "none" && (
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            Online payments are disabled. Customers will only see the "Pay at Time of Service" option when booking.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Stripe Setup Sub-Section ─────────────────────────────────────────

function StripeSetupSection({
  status,
  connecting,
  onConnect,
}: {
  status: StripeStatus;
  connecting: boolean;
  onConnect: () => void;
}) {
  if (!status.connected) {
    return (
      <div className="space-y-4">
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <p className="text-sm">Connect with Stripe to:</p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Accept deposits when customers book appointments</li>
            <li>Process payments securely</li>
            <li>Get paid directly to your bank account</li>
          </ul>
        </div>
        <Button onClick={onConnect} disabled={connecting} className="gap-2">
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Connect with Stripe
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Stripe Account</span>
          <Badge variant={status.detailsSubmitted ? "default" : "secondary"}>
            {status.detailsSubmitted ? "Active" : "Pending Setup"}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {status.chargesEnabled
              ? <CheckCircle2 className="h-4 w-4 text-gray-600" />
              : <AlertCircle className="h-4 w-4 text-amber-500" />}
            <span className={status.chargesEnabled ? "text-foreground" : "text-muted-foreground"}>
              Accept Payments
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {status.payoutsEnabled
              ? <CheckCircle2 className="h-4 w-4 text-gray-600" />
              : <AlertCircle className="h-4 w-4 text-amber-500" />}
            <span className={status.payoutsEnabled ? "text-foreground" : "text-muted-foreground"}>
              Receive Payouts
            </span>
          </div>
        </div>
      </div>

      {!status.detailsSubmitted && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Complete Your Setup</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Finish setting up your Stripe account to start accepting payments.
              </p>
            </div>
          </div>
          <Button onClick={onConnect} disabled={connecting} variant="outline" className="gap-2">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Continue Setup
          </Button>
        </div>
      )}

      {status.detailsSubmitted && status.chargesEnabled && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-gray-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-gray-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-green-200">Ready to Accept Payments</p>
              <p className="text-sm text-gray-700 dark:text-green-300">
                Your account is fully set up. Customers can now pay deposits when booking.
              </p>
            </div>
          </div>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => window.open("https://dashboard.stripe.com", "_blank")}
        className="gap-2"
      >
        <ExternalLink className="h-4 w-4" />
        Open Stripe Dashboard
      </Button>
    </div>
  );
}

// ─── Square Setup Sub-Section ─────────────────────────────────────────

function SquareSetupSection({
  status,
  connecting,
  onConnect,
}: {
  status: SquareStatus;
  connecting: boolean;
  onConnect: () => void;
}) {
  if (!status.connected) {
    return (
      <div className="space-y-4">
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <p className="text-sm">Connect with Square to:</p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Accept card payments through Square</li>
            <li>Sync with your Square POS system</li>
            <li>Manage everything from one dashboard</li>
          </ul>
        </div>
        <Button onClick={onConnect} disabled={connecting} className="gap-2">
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Connect with Square
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Square Account</span>
          <Badge variant={status.chargesEnabled ? "default" : "secondary"}>
            {status.chargesEnabled ? "Active" : "Pending"}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {status.chargesEnabled
              ? <CheckCircle2 className="h-4 w-4 text-gray-600" />
              : <AlertCircle className="h-4 w-4 text-amber-500" />}
            <span className={status.chargesEnabled ? "text-foreground" : "text-muted-foreground"}>
              Accept Payments
            </span>
          </div>
          {status.merchantId && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-gray-600" />
              <span className="text-foreground">
                Merchant ID: {status.merchantId.substring(0, 8)}...
              </span>
            </div>
          )}
          {status.locationId && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-gray-600" />
              <span className="text-foreground">
                Location: {status.locationId.substring(0, 8)}...
              </span>
            </div>
          )}
        </div>
      </div>

      {status.tokenExpiringSoon && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Token Expiring Soon</p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Your Square access token is expiring soon. Please re-authorize to continue accepting payments.
              </p>
            </div>
          </div>
          <Button onClick={onConnect} disabled={connecting} variant="outline" className="gap-2">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Re-authorize Square
          </Button>
        </div>
      )}

      {status.chargesEnabled && !status.tokenExpiringSoon && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-gray-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-gray-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-green-200">Ready to Accept Payments</p>
              <p className="text-sm text-gray-700 dark:text-green-300">
                Your Square account is connected. Customers can now pay when booking.
              </p>
            </div>
          </div>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => window.open("https://squareup.com/dashboard", "_blank")}
        className="gap-2"
      >
        <ExternalLink className="h-4 w-4" />
        Manage Square Account
      </Button>
    </div>
  );
}
